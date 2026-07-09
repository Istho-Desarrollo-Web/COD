const request = require('supertest');
const bcrypt = require('bcryptjs');
const { sequelize } = require('../../src/config/database');
const { createMigrator } = require('../../src/config/migrator');
const seedRolesPermisos = require('../../src/scripts/seedRolesPermisos');
const seedRequisitosProveedor = require('../../src/scripts/seedRequisitosProveedor');
const { Rol, Usuario } = require('../../src/models');
const { invalidarCachePermisos } = require('../../src/middlewares/roles');
const { app } = require('../../server');

let token;
let financieraToken;
let solicitanteToken;

beforeAll(async () => {
  await sequelize.authenticate();
  await createMigrator(sequelize).up();
  await seedRolesPermisos();
  await seedRequisitosProveedor();
  invalidarCachePermisos();

  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ username: 'admin', password: process.env.SEED_PASSWORD_ADMIN || 'CambiarAhora123!' });
  token = res.body.data.token;

  const financieraRol = await Rol.findOne({ where: { nombre: 'financiera' } });
  const financieraUsername = `financiera_prov_${Date.now()}`;
  await Usuario.create({
    username: financieraUsername,
    email: `${financieraUsername}@istho.com.co`,
    passwordHash: await bcrypt.hash('ClaveFinanciera123!', 10),
    nombre: 'Financiera',
    apellido: 'Prueba',
    rolId: financieraRol.id,
  });
  const financieraLogin = await request(app)
    .post('/api/v1/auth/login')
    .send({ username: financieraUsername, password: 'ClaveFinanciera123!' });
  financieraToken = financieraLogin.body.data.token;

  const solicitanteRol = await Rol.findOne({ where: { nombre: 'solicitante' } });
  const solicitanteUsername = `solicitante_prov_${Date.now()}`;
  await Usuario.create({
    username: solicitanteUsername,
    email: `${solicitanteUsername}@istho.com.co`,
    passwordHash: await bcrypt.hash('ClaveSolicitante123!', 10),
    nombre: 'Solicitante',
    apellido: 'Prueba',
    rolId: solicitanteRol.id,
  });
  const solicitanteLogin = await request(app)
    .post('/api/v1/auth/login')
    .send({ username: solicitanteUsername, password: 'ClaveSolicitante123!' });
  solicitanteToken = solicitanteLogin.body.data.token;
});

afterAll(async () => {
  await sequelize.close();
});

describe('Proveedores API', () => {
  it('creates and lists a proveedor, defaulting estado to en_evaluacion', async () => {
    const documentoIdentificacion = `900${Date.now()}`;
    const createRes = await request(app)
      .post('/api/v1/proveedores')
      .set('Authorization', `Bearer ${token}`)
      .send({ tipo: 'proveedor', documentoIdentificacion, razonSocial: 'Insumos ABC SAS', criticidad: 'media' });
    expect(createRes.status).toBe(201);
    expect(createRes.body.data.estado).toBe('en_evaluacion');

    const listRes = await request(app).get('/api/v1/proveedores').set('Authorization', `Bearer ${token}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.data.some((p) => p.documentoIdentificacion === documentoIdentificacion)).toBe(true);
  });

  it('returns 409 (not a hang) when documentoIdentificacion already exists', async () => {
    const documentoIdentificacion = `901${Date.now()}`;
    const first = await request(app)
      .post('/api/v1/proveedores')
      .set('Authorization', `Bearer ${token}`)
      .send({ tipo: 'proveedor', documentoIdentificacion, razonSocial: 'Duplicado SAS' });
    expect(first.status).toBe(201);

    const second = await request(app)
      .post('/api/v1/proveedores')
      .set('Authorization', `Bearer ${token}`)
      .send({ tipo: 'proveedor', documentoIdentificacion, razonSocial: 'Duplicado Otra Vez SAS' });
    expect(second.status).toBe(409);
  });

  it('returns 400 when razonSocial is missing', async () => {
    const res = await request(app)
      .post('/api/v1/proveedores')
      .set('Authorization', `Bearer ${token}`)
      .send({ tipo: 'proveedor', documentoIdentificacion: `902${Date.now()}` });
    expect(res.status).toBe(400);
  });

  it('allows financiera to create a proveedor', async () => {
    const res = await request(app)
      .post('/api/v1/proveedores')
      .set('Authorization', `Bearer ${financieraToken}`)
      .send({ tipo: 'contratista', documentoIdentificacion: `903${Date.now()}`, razonSocial: 'Contratista Financiera SAS' });
    expect(res.status).toBe(201);
  });

  it('returns 403 when solicitante tries to create a proveedor', async () => {
    const res = await request(app)
      .post('/api/v1/proveedores')
      .set('Authorization', `Bearer ${solicitanteToken}`)
      .send({ tipo: 'proveedor', documentoIdentificacion: `904${Date.now()}`, razonSocial: 'No autorizado SAS' });
    expect(res.status).toBe(403);
  });

  it('edits a proveedor and gives it a logical baja on delete', async () => {
    const createRes = await request(app)
      .post('/api/v1/proveedores')
      .set('Authorization', `Bearer ${token}`)
      .send({ tipo: 'proveedor', documentoIdentificacion: `905${Date.now()}`, razonSocial: 'Editable SAS' });
    const id = createRes.body.data.id;

    const editRes = await request(app)
      .put(`/api/v1/proveedores/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ razonSocial: 'Editable SAS Modificada' });
    expect(editRes.status).toBe(200);
    expect(editRes.body.data.razonSocial).toBe('Editable SAS Modificada');

    const deleteRes = await request(app).delete(`/api/v1/proveedores/${id}`).set('Authorization', `Bearer ${token}`);
    expect(deleteRes.status).toBe(200);

    const obtenerRes = await request(app).get(`/api/v1/proveedores/${id}`).set('Authorization', `Bearer ${token}`);
    expect(obtenerRes.body.data.estado).toBe('inactivo');
  });
});

describe('Requisitos de Proveedor API', () => {
  it('lists the seeded requisitos', async () => {
    const res = await request(app).get('/api/v1/requisitos-proveedor').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(5);
    expect(res.body.data.some((r) => r.nombre === 'Certificado SARLAFT')).toBe(true);
  });
});
