const request = require('supertest');
const path = require('path');
const bcrypt = require('bcryptjs');
const { sequelize } = require('../../src/config/database');
const { createMigrator } = require('../../src/config/migrator');
const seedRolesPermisos = require('../../src/scripts/seedRolesPermisos');
const seedRequisitosProveedor = require('../../src/scripts/seedRequisitosProveedor');
const seedTiposDocumento = require('../../src/scripts/seedTiposDocumento');
const { Rol, Usuario, Area } = require('../../src/models');
const { invalidarCachePermisos } = require('../../src/middlewares/roles');
const { app } = require('../../server');

let token;
let financieraToken;
let solicitanteToken;
let area;

beforeAll(async () => {
  await sequelize.authenticate();
  await createMigrator(sequelize).up();
  await seedTiposDocumento();
  await seedRolesPermisos();
  await seedRequisitosProveedor();
  invalidarCachePermisos();

  area = await Area.create({ nombre: 'Compras Proveedores', codigo: `COMPRASPROV${Date.now()}` });

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
      .send({ tipo: 'proveedor', documentoIdentificacion, razonSocial: 'Insumos ABC SAS', criticidad: 'media', areaSolicitanteId: area.id });
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
      .send({ tipo: 'proveedor', documentoIdentificacion, razonSocial: 'Duplicado SAS', areaSolicitanteId: area.id });
    expect(first.status).toBe(201);

    const second = await request(app)
      .post('/api/v1/proveedores')
      .set('Authorization', `Bearer ${token}`)
      .send({ tipo: 'proveedor', documentoIdentificacion, razonSocial: 'Duplicado Otra Vez SAS', areaSolicitanteId: area.id });
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
      .send({ tipo: 'contratista', documentoIdentificacion: `903${Date.now()}`, razonSocial: 'Contratista Financiera SAS', areaSolicitanteId: area.id });
    expect(res.status).toBe(201);
  });

  it('returns 403 when solicitante tries to create a proveedor', async () => {
    const res = await request(app)
      .post('/api/v1/proveedores')
      .set('Authorization', `Bearer ${solicitanteToken}`)
      .send({ tipo: 'proveedor', documentoIdentificacion: `904${Date.now()}`, razonSocial: 'No autorizado SAS', areaSolicitanteId: area.id });
    expect(res.status).toBe(403);
  });

  it('edits a proveedor and gives it a logical baja on delete', async () => {
    const createRes = await request(app)
      .post('/api/v1/proveedores')
      .set('Authorization', `Bearer ${token}`)
      .send({ tipo: 'proveedor', documentoIdentificacion: `905${Date.now()}`, razonSocial: 'Editable SAS', areaSolicitanteId: area.id });
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

  it('returns 400 when areaSolicitanteId is missing', async () => {
    const res = await request(app)
      .post('/api/v1/proveedores')
      .set('Authorization', `Bearer ${token}`)
      .send({ tipo: 'proveedor', documentoIdentificacion: `906${Date.now()}`, razonSocial: 'Sin Área SAS' });
    expect(res.status).toBe(400);
  });

  it('allows setting areaSolicitanteId later via edit, for a proveedor created without one', async () => {
    const proveedorSinArea = await require('../../src/models').Proveedor.create({
      tipo: 'proveedor', documentoIdentificacion: `907${Date.now()}`, razonSocial: 'Legado SAS',
    });
    const editRes = await request(app)
      .put(`/api/v1/proveedores/${proveedorSinArea.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ areaSolicitanteId: area.id });
    expect(editRes.status).toBe(200);
    expect(editRes.body.data.areaSolicitanteId).toBe(area.id);
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

describe('Aprobar y rechazar proveedor', () => {
  it('aprueba un proveedor en_evaluacion, crea su carpeta y refleja los documentos del expediente', async () => {
    const createRes = await request(app)
      .post('/api/v1/proveedores')
      .set('Authorization', `Bearer ${token}`)
      .send({ tipo: 'proveedor', documentoIdentificacion: `940${Date.now()}`, razonSocial: 'Aprobación Ruta SAS', areaSolicitanteId: area.id });
    const id = createRes.body.data.id;

    await request(app)
      .post(`/api/v1/proveedores/${id}/documentos`)
      .set('Authorization', `Bearer ${token}`)
      .attach('archivo', path.join(__dirname, '../fixtures/documento-prueba.pdf'));

    const aprobarRes = await request(app).post(`/api/v1/proveedores/${id}/aprobar`).set('Authorization', `Bearer ${token}`);
    expect(aprobarRes.status).toBe(200);
    expect(aprobarRes.body.data.proveedor.estado).toBe('activo');
    expect(aprobarRes.body.data.documentosReflejados).toBe(1);
    expect(aprobarRes.body.data.carpeta.nombre).toBe('Aprobación Ruta SAS');
  });

  it('returns 400 when approving a proveedor that is not en_evaluacion', async () => {
    const createRes = await request(app)
      .post('/api/v1/proveedores')
      .set('Authorization', `Bearer ${token}`)
      .send({ tipo: 'proveedor', documentoIdentificacion: `941${Date.now()}`, razonSocial: 'Doble Aprobación SAS', areaSolicitanteId: area.id });
    const id = createRes.body.data.id;

    await request(app).post(`/api/v1/proveedores/${id}/aprobar`).set('Authorization', `Bearer ${token}`);
    const segundaRes = await request(app).post(`/api/v1/proveedores/${id}/aprobar`).set('Authorization', `Bearer ${token}`);
    expect(segundaRes.status).toBe(400);
  });

  it('returns 400 when approving a proveedor without areaSolicitanteId', async () => {
    const proveedorSinArea = await require('../../src/models').Proveedor.create({
      tipo: 'proveedor', documentoIdentificacion: `942${Date.now()}`, razonSocial: 'Sin Área Aprobación SAS',
    });
    const res = await request(app).post(`/api/v1/proveedores/${proveedorSinArea.id}/aprobar`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  it('rechaza un proveedor en_evaluacion con motivo', async () => {
    const createRes = await request(app)
      .post('/api/v1/proveedores')
      .set('Authorization', `Bearer ${token}`)
      .send({ tipo: 'proveedor', documentoIdentificacion: `943${Date.now()}`, razonSocial: 'Rechazo SAS', areaSolicitanteId: area.id });
    const id = createRes.body.data.id;

    const rechazarRes = await request(app)
      .post(`/api/v1/proveedores/${id}/rechazar`)
      .set('Authorization', `Bearer ${token}`)
      .send({ motivo: 'Documentación incompleta' });
    expect(rechazarRes.status).toBe(200);
    expect(rechazarRes.body.data.estado).toBe('inactivo');
  });

  it('returns 400 when rechazando without motivo', async () => {
    const createRes = await request(app)
      .post('/api/v1/proveedores')
      .set('Authorization', `Bearer ${token}`)
      .send({ tipo: 'proveedor', documentoIdentificacion: `944${Date.now()}`, razonSocial: 'Sin Motivo SAS', areaSolicitanteId: area.id });
    const id = createRes.body.data.id;

    const res = await request(app).post(`/api/v1/proveedores/${id}/rechazar`).set('Authorization', `Bearer ${token}`).send({});
    expect(res.status).toBe(400);
  });

  it('returns 403 when solicitante tries to approve a proveedor', async () => {
    const createRes = await request(app)
      .post('/api/v1/proveedores')
      .set('Authorization', `Bearer ${token}`)
      .send({ tipo: 'proveedor', documentoIdentificacion: `945${Date.now()}`, razonSocial: 'No Autorizado Aprobar SAS', areaSolicitanteId: area.id });
    const id = createRes.body.data.id;

    const res = await request(app).post(`/api/v1/proveedores/${id}/aprobar`).set('Authorization', `Bearer ${solicitanteToken}`);
    expect(res.status).toBe(403);
  });
});
