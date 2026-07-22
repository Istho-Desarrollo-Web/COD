const request = require('supertest');
const path = require('path');
const bcrypt = require('bcryptjs');
const { sequelize } = require('../../src/config/database');
const { createMigrator } = require('../../src/config/migrator');
const seedRolesPermisos = require('../../src/scripts/seedRolesPermisos');
const seedRequisitosProveedor = require('../../src/scripts/seedRequisitosProveedor');
const seedTiposDocumento = require('../../src/scripts/seedTiposDocumento');
const { Rol, Usuario, Area, RequisitoProveedor } = require('../../src/models');
const { invalidarCachePermisos } = require('../../src/middlewares/roles');
const { app } = require('../../server');

let token;
let gestorComprasToken;
let solicitanteToken;
let aprobadorAreaToken;
let area;
let requisitoCamaraComercio;
let requisitoRut;

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

  const gestorComprasRol = await Rol.findOne({ where: { nombre: 'gestor_compras' } });
  const gestorComprasUsername = `gestor_compras_prov_${Date.now()}`;
  const gestorComprasUsuario = await Usuario.create({
    username: gestorComprasUsername,
    email: `${gestorComprasUsername}@istho.com.co`,
    passwordHash: await bcrypt.hash('ClaveGestorCompras123!', 10),
    nombre: 'Gestor',
    apellido: 'Compras',
  });
  await gestorComprasUsuario.setRoles([gestorComprasRol.id]);
  const gestorComprasLogin = await request(app)
    .post('/api/v1/auth/login')
    .send({ username: gestorComprasUsername, password: 'ClaveGestorCompras123!' });
  gestorComprasToken = gestorComprasLogin.body.data.token;

  const solicitanteRol = await Rol.findOne({ where: { nombre: 'solicitante' } });
  const solicitanteUsername = `solicitante_prov_${Date.now()}`;
  const solicitanteUsuario = await Usuario.create({
    username: solicitanteUsername,
    email: `${solicitanteUsername}@istho.com.co`,
    passwordHash: await bcrypt.hash('ClaveSolicitante123!', 10),
    nombre: 'Solicitante',
    apellido: 'Prueba',
  });
  await solicitanteUsuario.setRoles([solicitanteRol.id]);
  const solicitanteLogin = await request(app)
    .post('/api/v1/auth/login')
    .send({ username: solicitanteUsername, password: 'ClaveSolicitante123!' });
  solicitanteToken = solicitanteLogin.body.data.token;

  const aprobadorAreaRol = await Rol.findOne({ where: { nombre: 'aprobador_area' } });
  const aprobadorAreaUsername = `aprobador_area_prov_${Date.now()}`;
  const aprobadorAreaUsuario = await Usuario.create({
    username: aprobadorAreaUsername,
    email: `${aprobadorAreaUsername}@istho.com.co`,
    passwordHash: await bcrypt.hash('ClaveAprobadorArea123!', 10),
    nombre: 'Aprobador',
    apellido: 'Area',
  });
  await aprobadorAreaUsuario.setRoles([aprobadorAreaRol.id]);
  const aprobadorAreaLogin = await request(app)
    .post('/api/v1/auth/login')
    .send({ username: aprobadorAreaUsername, password: 'ClaveAprobadorArea123!' });
  aprobadorAreaToken = aprobadorAreaLogin.body.data.token;

  requisitoCamaraComercio = await RequisitoProveedor.findOne({ where: { nombre: 'Cámara de Comercio' } });
  requisitoRut = await RequisitoProveedor.findOne({ where: { nombre: 'RUT' } });
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
      .send({ tipo: 'proveedor', documentoIdentificacion, razonSocial: 'Insumos ABC SAS', criticidad: 'relevante', areaSolicitanteId: area.id });
    expect(createRes.status).toBe(201);
    expect(createRes.body.data.estado).toBe('en_evaluacion');

    const listRes = await request(app).get('/api/v1/proveedores').set('Authorization', `Bearer ${token}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.data.some((p) => p.documentoIdentificacion === documentoIdentificacion)).toBe(true);
  });

  it('defaults criticidad to relevante when not provided (regression: stale "media" default corrupted the ENUM)', async () => {
    const documentoIdentificacion = `909${Date.now()}`;
    const createRes = await request(app)
      .post('/api/v1/proveedores')
      .set('Authorization', `Bearer ${token}`)
      .send({ tipo: 'proveedor', documentoIdentificacion, razonSocial: 'Sin Criticidad SAS', areaSolicitanteId: area.id });
    expect(createRes.status).toBe(201);
    expect(createRes.body.data.criticidad).toBe('relevante');
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

  it('allows gestor_compras to create a proveedor', async () => {
    const res = await request(app)
      .post('/api/v1/proveedores')
      .set('Authorization', `Bearer ${gestorComprasToken}`)
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
  it('aprueba el registro y luego los requisitos de un proveedor en_evaluacion, crea su carpeta y refleja los documentos del expediente', async () => {
    const createRes = await request(app)
      .post('/api/v1/proveedores')
      .set('Authorization', `Bearer ${token}`)
      .send({ tipo: 'proveedor', documentoIdentificacion: `940${Date.now()}`, razonSocial: 'Aprobación Ruta SAS', criticidad: 'basico', areaSolicitanteId: area.id });
    const id = createRes.body.data.id;

    await request(app)
      .post(`/api/v1/proveedores/${id}/documentos`)
      .set('Authorization', `Bearer ${token}`)
      .field('requisitoId', String(requisitoCamaraComercio.id))
      .attach('archivo', path.join(__dirname, '../fixtures/documento-prueba.pdf'));
    await request(app)
      .post(`/api/v1/proveedores/${id}/documentos`)
      .set('Authorization', `Bearer ${token}`)
      .field('requisitoId', String(requisitoRut.id))
      .attach('archivo', path.join(__dirname, '../fixtures/documento-prueba.pdf'));

    const registroRes = await request(app).post(`/api/v1/proveedores/${id}/aprobar-registro`).set('Authorization', `Bearer ${token}`);
    expect(registroRes.status).toBe(200);
    expect(registroRes.body.data.estado).toBe('registro_aprobado');

    const requisitosRes = await request(app).post(`/api/v1/proveedores/${id}/aprobar-requisitos`).set('Authorization', `Bearer ${token}`);
    expect(requisitosRes.status).toBe(200);
    expect(requisitosRes.body.data.proveedor.estado).toBe('activo');
    expect(requisitosRes.body.data.documentosReflejados).toBe(2);
    expect(requisitosRes.body.data.carpeta.nombre).toBe('Aprobación Ruta SAS');
  });

  it('returns 400 when aprobando requisitos con checklist obligatorio incompleto', async () => {
    const createRes = await request(app)
      .post('/api/v1/proveedores')
      .set('Authorization', `Bearer ${token}`)
      .send({ tipo: 'proveedor', documentoIdentificacion: `949${Date.now()}`, razonSocial: 'Checklist Incompleto SAS', criticidad: 'basico', areaSolicitanteId: area.id });
    const id = createRes.body.data.id;

    await request(app).post(`/api/v1/proveedores/${id}/aprobar-registro`).set('Authorization', `Bearer ${token}`);
    const res = await request(app).post(`/api/v1/proveedores/${id}/aprobar-requisitos`).set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('Cámara de Comercio');
    expect(res.body.message).toContain('RUT');

    const obtenerRes = await request(app).get(`/api/v1/proveedores/${id}`).set('Authorization', `Bearer ${token}`);
    expect(obtenerRes.body.data.estado).toBe('registro_aprobado');
  });

  it('returns 400 when aprobando registro de un proveedor que no está en_evaluacion', async () => {
    const createRes = await request(app)
      .post('/api/v1/proveedores')
      .set('Authorization', `Bearer ${token}`)
      .send({ tipo: 'proveedor', documentoIdentificacion: `941${Date.now()}`, razonSocial: 'Doble Aprobación SAS', areaSolicitanteId: area.id });
    const id = createRes.body.data.id;

    await request(app).post(`/api/v1/proveedores/${id}/aprobar-registro`).set('Authorization', `Bearer ${token}`);
    const segundaRes = await request(app).post(`/api/v1/proveedores/${id}/aprobar-registro`).set('Authorization', `Bearer ${token}`);
    expect(segundaRes.status).toBe(400);
  });

  it('returns 400 when aprobando requisitos de un proveedor cuyo registro no ha sido aprobado', async () => {
    const createRes = await request(app)
      .post('/api/v1/proveedores')
      .set('Authorization', `Bearer ${token}`)
      .send({ tipo: 'proveedor', documentoIdentificacion: `950${Date.now()}`, razonSocial: 'Sin Registro Aprobado SAS', areaSolicitanteId: area.id });
    const id = createRes.body.data.id;

    const res = await request(app).post(`/api/v1/proveedores/${id}/aprobar-requisitos`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  it('returns 400 when approving a proveedor without areaSolicitanteId', async () => {
    const proveedorSinArea = await require('../../src/models').Proveedor.create({
      tipo: 'proveedor', documentoIdentificacion: `942${Date.now()}`, razonSocial: 'Sin Área Aprobación SAS',
    });
    const res = await request(app).post(`/api/v1/proveedores/${proveedorSinArea.id}/aprobar-registro`).set('Authorization', `Bearer ${token}`);
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

  it('rechaza un proveedor con registro_aprobado con motivo', async () => {
    const createRes = await request(app)
      .post('/api/v1/proveedores')
      .set('Authorization', `Bearer ${token}`)
      .send({ tipo: 'proveedor', documentoIdentificacion: `951${Date.now()}`, razonSocial: 'Rechazo Post Registro SAS', areaSolicitanteId: area.id });
    const id = createRes.body.data.id;
    await request(app).post(`/api/v1/proveedores/${id}/aprobar-registro`).set('Authorization', `Bearer ${token}`);

    const rechazarRes = await request(app)
      .post(`/api/v1/proveedores/${id}/rechazar`)
      .set('Authorization', `Bearer ${token}`)
      .send({ motivo: 'No cumple requisitos' });
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

    const res = await request(app).post(`/api/v1/proveedores/${id}/aprobar-registro`).set('Authorization', `Bearer ${solicitanteToken}`);
    expect(res.status).toBe(403);
  });

  it('returns 403 when gestor_compras (has gestionar, not aprobar) tries to approve either gate', async () => {
    const createRes = await request(app)
      .post('/api/v1/proveedores')
      .set('Authorization', `Bearer ${token}`)
      .send({ tipo: 'proveedor', documentoIdentificacion: `946${Date.now()}`, razonSocial: 'Sin Aprobar Gestor SAS', areaSolicitanteId: area.id });
    const id = createRes.body.data.id;

    const registroRes = await request(app).post(`/api/v1/proveedores/${id}/aprobar-registro`).set('Authorization', `Bearer ${gestorComprasToken}`);
    expect(registroRes.status).toBe(403);

    await request(app).post(`/api/v1/proveedores/${id}/aprobar-registro`).set('Authorization', `Bearer ${token}`);
    const requisitosRes = await request(app).post(`/api/v1/proveedores/${id}/aprobar-requisitos`).set('Authorization', `Bearer ${gestorComprasToken}`);
    expect(requisitosRes.status).toBe(403);
  });

  it('allows aprobador_area to approve both gates of a proveedor', async () => {
    const createRes = await request(app)
      .post('/api/v1/proveedores')
      .set('Authorization', `Bearer ${token}`)
      .send({ tipo: 'proveedor', documentoIdentificacion: `947${Date.now()}`, razonSocial: 'Aprobador Area SAS', criticidad: 'basico', areaSolicitanteId: area.id });
    const id = createRes.body.data.id;

    await request(app)
      .post(`/api/v1/proveedores/${id}/documentos`)
      .set('Authorization', `Bearer ${token}`)
      .field('requisitoId', String(requisitoCamaraComercio.id))
      .attach('archivo', path.join(__dirname, '../fixtures/documento-prueba.pdf'));
    await request(app)
      .post(`/api/v1/proveedores/${id}/documentos`)
      .set('Authorization', `Bearer ${token}`)
      .field('requisitoId', String(requisitoRut.id))
      .attach('archivo', path.join(__dirname, '../fixtures/documento-prueba.pdf'));

    const registroRes = await request(app).post(`/api/v1/proveedores/${id}/aprobar-registro`).set('Authorization', `Bearer ${aprobadorAreaToken}`);
    expect(registroRes.status).toBe(200);

    const requisitosRes = await request(app).post(`/api/v1/proveedores/${id}/aprobar-requisitos`).set('Authorization', `Bearer ${aprobadorAreaToken}`);
    expect(requisitosRes.status).toBe(200);
    expect(requisitosRes.body.data.proveedor.estado).toBe('activo');
  });

  it('ignores estado sent via PUT /:id, even from gestor_compras — cannot bypass proveedores:aprobar', async () => {
    const createRes = await request(app)
      .post('/api/v1/proveedores')
      .set('Authorization', `Bearer ${token}`)
      .send({ tipo: 'proveedor', documentoIdentificacion: `948${Date.now()}`, razonSocial: 'Sin Bypass SAS', areaSolicitanteId: area.id });
    const id = createRes.body.data.id;

    const editRes = await request(app)
      .put(`/api/v1/proveedores/${id}`)
      .set('Authorization', `Bearer ${gestorComprasToken}`)
      .send({ estado: 'activo' });
    expect(editRes.status).toBe(200);
    expect(editRes.body.data.estado).toBe('en_evaluacion');

    const obtenerRes = await request(app).get(`/api/v1/proveedores/${id}`).set('Authorization', `Bearer ${token}`);
    expect(obtenerRes.body.data.estado).toBe('en_evaluacion');
  });
});
