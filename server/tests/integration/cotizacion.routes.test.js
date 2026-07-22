const request = require('supertest');
const bcrypt = require('bcryptjs');
const { sequelize } = require('../../src/config/database');
const { createMigrator } = require('../../src/config/migrator');
const seedRolesPermisos = require('../../src/scripts/seedRolesPermisos');
const seedNivelesAprobacion = require('../../src/scripts/seedNivelesAprobacion');
const { Rol, Usuario, Area, TipoSolicitud, Proveedor, Cotizacion } = require('../../src/models');
const { invalidarCachePermisos } = require('../../src/middlewares/roles');
const { app } = require('../../server');

let adminToken;
let gestorComprasToken;
let solicitanteToken;
let otroSolicitanteToken;
let area;
let tipoCompra;
let proveedor;

beforeAll(async () => {
  await sequelize.authenticate();
  await createMigrator(sequelize).up();
  await seedRolesPermisos();
  await seedNivelesAprobacion();
  invalidarCachePermisos();

  area = await Area.create({ nombre: 'Cotizaciones Area', codigo: `COTIZAREA${Date.now()}` });
  tipoCompra = await TipoSolicitud.findOne({ where: { nombre: 'compra' } });
  proveedor = await Proveedor.create({
    tipo: 'proveedor', documentoIdentificacion: `980${Date.now()}`, razonSocial: 'Proveedor Cotizaciones SAS',
    criticidad: 'relevante', areaSolicitanteId: area.id,
  });

  const adminLogin = await request(app)
    .post('/api/v1/auth/login')
    .send({ username: 'admin', password: process.env.SEED_PASSWORD_ADMIN || 'CambiarAhora123!' });
  adminToken = adminLogin.body.data.token;

  const gestorRol = await Rol.findOne({ where: { nombre: 'gestor_compras' } });
  const gestorUsername = `gestor_compras_cot_${Date.now()}`;
  const gestorUsuario = await Usuario.create({
    username: gestorUsername, email: `${gestorUsername}@istho.com.co`,
    passwordHash: await bcrypt.hash('Clave123!', 10), nombre: 'Gestor', apellido: 'Cotizaciones',
  });
  await gestorUsuario.setRoles([gestorRol.id]);
  const gestorLogin = await request(app).post('/api/v1/auth/login').send({ username: gestorUsername, password: 'Clave123!' });
  gestorComprasToken = gestorLogin.body.data.token;

  const solicitanteRol = await Rol.findOne({ where: { nombre: 'solicitante' } });
  const solicitanteUsername = `solicitante_cot_${Date.now()}`;
  const solicitanteUsuario = await Usuario.create({
    username: solicitanteUsername, email: `${solicitanteUsername}@istho.com.co`,
    passwordHash: await bcrypt.hash('Clave123!', 10), nombre: 'Solicitante', apellido: 'Cotizaciones', areaId: area.id,
  });
  await solicitanteUsuario.setRoles([solicitanteRol.id]);
  const solicitanteLogin = await request(app).post('/api/v1/auth/login').send({ username: solicitanteUsername, password: 'Clave123!' });
  solicitanteToken = solicitanteLogin.body.data.token;

  const otroSolicitanteUsername = `otro_solicitante_cot_${Date.now()}`;
  const otroSolicitanteUsuario = await Usuario.create({
    username: otroSolicitanteUsername, email: `${otroSolicitanteUsername}@istho.com.co`,
    passwordHash: await bcrypt.hash('Clave123!', 10), nombre: 'OtroSolicitante', apellido: 'Cotizaciones', areaId: area.id,
  });
  await otroSolicitanteUsuario.setRoles([solicitanteRol.id]);
  const otroSolicitanteLogin = await request(app).post('/api/v1/auth/login').send({ username: otroSolicitanteUsername, password: 'Clave123!' });
  otroSolicitanteToken = otroSolicitanteLogin.body.data.token;
});

afterAll(async () => {
  await sequelize.close();
});

async function crearSolicitud() {
  const res = await request(app)
    .post('/api/v1/solicitudes')
    .set('Authorization', `Bearer ${solicitanteToken}`)
    .send({ tipoSolicitudId: tipoCompra.id, areaSolicitanteId: area.id, descripcion: 'Solicitud para cotizar', montoEstimado: 100000 });
  return res.body.data.id;
}

describe('Cotizaciones API', () => {
  it('agrega una cotización a una solicitud en cotizando', async () => {
    const solicitudId = await crearSolicitud();
    const res = await request(app)
      .post(`/api/v1/solicitudes/${solicitudId}/cotizaciones`)
      .set('Authorization', `Bearer ${gestorComprasToken}`)
      .send({ proveedorId: proveedor.id, monto: 90000, observaciones: 'Cotización inicial' });
    expect(res.status).toBe(201);
    expect(res.body.data.solicitudId).toBe(solicitudId);
    expect(res.body.data.seleccionada).toBe(false);
  });

  it('returns 400 cuando falta el monto', async () => {
    const solicitudId = await crearSolicitud();
    const res = await request(app)
      .post(`/api/v1/solicitudes/${solicitudId}/cotizaciones`)
      .set('Authorization', `Bearer ${gestorComprasToken}`)
      .send({ proveedorId: proveedor.id });
    expect(res.status).toBe(400);
  });

  it('returns 404 cuando proveedorId no existe', async () => {
    const solicitudId = await crearSolicitud();
    const res = await request(app)
      .post(`/api/v1/solicitudes/${solicitudId}/cotizaciones`)
      .set('Authorization', `Bearer ${gestorComprasToken}`)
      .send({ proveedorId: 999999999, monto: 90000 });
    expect(res.status).toBe(404);
  });

  it('permite crear una cotización sin proveedorId', async () => {
    const solicitudId = await crearSolicitud();
    const res = await request(app)
      .post(`/api/v1/solicitudes/${solicitudId}/cotizaciones`)
      .set('Authorization', `Bearer ${gestorComprasToken}`)
      .send({ monto: 50000 });
    expect(res.status).toBe(201);
    expect(res.body.data.proveedorId).toBeNull();
  });

  it('returns 403 cuando solicitante (sin permiso cotizar) intenta agregar una cotización', async () => {
    const solicitudId = await crearSolicitud();
    const res = await request(app)
      .post(`/api/v1/solicitudes/${solicitudId}/cotizaciones`)
      .set('Authorization', `Bearer ${solicitanteToken}`)
      .send({ monto: 90000 });
    expect(res.status).toBe(403);
  });

  it('lista las cotizaciones de una solicitud, con el proveedor incluido', async () => {
    const solicitudId = await crearSolicitud();
    await request(app)
      .post(`/api/v1/solicitudes/${solicitudId}/cotizaciones`)
      .set('Authorization', `Bearer ${gestorComprasToken}`)
      .send({ proveedorId: proveedor.id, monto: 90000 });

    const res = await request(app).get(`/api/v1/solicitudes/${solicitudId}/cotizaciones`).set('Authorization', `Bearer ${gestorComprasToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data[0].Proveedor.id).toBe(proveedor.id);
  });

  it('selecciona una cotización y desmarca las demás de la misma solicitud', async () => {
    const solicitudId = await crearSolicitud();
    const cot1 = await request(app)
      .post(`/api/v1/solicitudes/${solicitudId}/cotizaciones`)
      .set('Authorization', `Bearer ${gestorComprasToken}`)
      .send({ monto: 90000 });
    const cot2 = await request(app)
      .post(`/api/v1/solicitudes/${solicitudId}/cotizaciones`)
      .set('Authorization', `Bearer ${gestorComprasToken}`)
      .send({ monto: 80000 });

    await request(app)
      .post(`/api/v1/solicitudes/${solicitudId}/cotizaciones/${cot1.body.data.id}/seleccionar`)
      .set('Authorization', `Bearer ${gestorComprasToken}`);
    const seleccionarRes = await request(app)
      .post(`/api/v1/solicitudes/${solicitudId}/cotizaciones/${cot2.body.data.id}/seleccionar`)
      .set('Authorization', `Bearer ${gestorComprasToken}`);
    expect(seleccionarRes.status).toBe(200);
    expect(seleccionarRes.body.data.seleccionada).toBe(true);

    const cotizacion1Recargada = await Cotizacion.findByPk(cot1.body.data.id);
    expect(cotizacion1Recargada.seleccionada).toBe(false);
  });

  it('returns 400 cuando se intenta agregar una cotización a una solicitud que no está en cotizando', async () => {
    const solicitudId = await crearSolicitud();
    const cot = await request(app)
      .post(`/api/v1/solicitudes/${solicitudId}/cotizaciones`)
      .set('Authorization', `Bearer ${gestorComprasToken}`)
      .send({ monto: 90000 });
    await request(app)
      .post(`/api/v1/solicitudes/${solicitudId}/cotizaciones/${cot.body.data.id}/seleccionar`)
      .set('Authorization', `Bearer ${gestorComprasToken}`);
    await request(app).post(`/api/v1/solicitudes/${solicitudId}/enviar-aprobacion`).set('Authorization', `Bearer ${gestorComprasToken}`);

    const res = await request(app)
      .post(`/api/v1/solicitudes/${solicitudId}/cotizaciones`)
      .set('Authorization', `Bearer ${gestorComprasToken}`)
      .send({ monto: 70000 });
    expect(res.status).toBe(400);
  });

  it('returns 403 cuando un solicitante que no es el dueño intenta listar cotizaciones, pero el dueño sí puede', async () => {
    const solicitudId = await crearSolicitud();
    await request(app)
      .post(`/api/v1/solicitudes/${solicitudId}/cotizaciones`)
      .set('Authorization', `Bearer ${gestorComprasToken}`)
      .send({ proveedorId: proveedor.id, monto: 90000 });

    const resAjeno = await request(app)
      .get(`/api/v1/solicitudes/${solicitudId}/cotizaciones`)
      .set('Authorization', `Bearer ${otroSolicitanteToken}`);
    expect(resAjeno.status).toBe(403);

    const resDueño = await request(app)
      .get(`/api/v1/solicitudes/${solicitudId}/cotizaciones`)
      .set('Authorization', `Bearer ${solicitanteToken}`);
    expect(resDueño.status).toBe(200);
    expect(resDueño.body.data.length).toBeGreaterThan(0);
  });

  it('super_administrador (visibilidad amplia) puede listar cotizaciones de una solicitud que no es suya', async () => {
    const solicitudId = await crearSolicitud();
    await request(app)
      .post(`/api/v1/solicitudes/${solicitudId}/cotizaciones`)
      .set('Authorization', `Bearer ${gestorComprasToken}`)
      .send({ proveedorId: proveedor.id, monto: 90000 });

    const res = await request(app)
      .get(`/api/v1/solicitudes/${solicitudId}/cotizaciones`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data[0].Proveedor.id).toBe(proveedor.id);
  });
});
