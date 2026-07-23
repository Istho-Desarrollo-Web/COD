const request = require('supertest');
const path = require('path');
const bcrypt = require('bcryptjs');
const { sequelize } = require('../../src/config/database');
const { createMigrator } = require('../../src/config/migrator');
const seedRolesPermisos = require('../../src/scripts/seedRolesPermisos');
const seedNivelesAprobacion = require('../../src/scripts/seedNivelesAprobacion');
const { Rol, Usuario, Area, TipoSolicitud } = require('../../src/models');
const { invalidarCachePermisos } = require('../../src/middlewares/roles');
const { app } = require('../../server');

let adminToken;
let gestorComprasToken;
let solicitanteToken;
let otroSolicitanteToken;
let aprobadorAreaToken;
let area;
let tipoCompra;

async function crearUsuarioConRol(rolNombre, prefijo, areaId = null) {
  const rol = await Rol.findOne({ where: { nombre: rolNombre } });
  const username = `${prefijo}_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
  const usuario = await Usuario.create({
    username, email: `${username}@istho.com.co`,
    passwordHash: await bcrypt.hash('Clave123!', 10), nombre: prefijo, apellido: 'Factura', areaId,
  });
  await usuario.setRoles([rol.id]);
  const login = await request(app).post('/api/v1/auth/login').send({ username, password: 'Clave123!' });
  return login.body.data.token;
}

beforeAll(async () => {
  await sequelize.authenticate();
  await createMigrator(sequelize).up();
  await seedRolesPermisos();
  await seedNivelesAprobacion();
  invalidarCachePermisos();

  area = await Area.create({ nombre: 'Factura Area', codigo: `FACTURAAREA${Date.now()}` });
  tipoCompra = await TipoSolicitud.findOne({ where: { nombre: 'compra' } });

  const adminLogin = await request(app)
    .post('/api/v1/auth/login')
    .send({ username: 'admin', password: process.env.SEED_PASSWORD_ADMIN || 'CambiarAhora123!' });
  adminToken = adminLogin.body.data.token;

  gestorComprasToken = await crearUsuarioConRol('gestor_compras', 'gestor_compras_fac');
  solicitanteToken = await crearUsuarioConRol('solicitante', 'solicitante_fac', area.id);
  otroSolicitanteToken = await crearUsuarioConRol('solicitante', 'otro_solicitante_fac', area.id);
  aprobadorAreaToken = await crearUsuarioConRol('aprobador_area', 'aprobador_area_fac', area.id);
});

afterAll(async () => {
  await sequelize.close();
});

async function crearSolicitudConfirmada(monto = 500000) {
  const creada = await request(app)
    .post('/api/v1/solicitudes')
    .set('Authorization', `Bearer ${solicitanteToken}`)
    .send({ tipoSolicitudId: tipoCompra.id, areaSolicitanteId: area.id, descripcion: 'Solicitud para facturar', montoEstimado: monto });
  const solicitudId = creada.body.data.id;

  const cotizacionRes = await request(app)
    .post(`/api/v1/solicitudes/${solicitudId}/cotizaciones`)
    .set('Authorization', `Bearer ${gestorComprasToken}`)
    .send({ monto });
  const cotizacionId = cotizacionRes.body.data.id;
  await request(app)
    .post(`/api/v1/solicitudes/${solicitudId}/cotizaciones/${cotizacionId}/seleccionar`)
    .set('Authorization', `Bearer ${gestorComprasToken}`);
  await request(app).post(`/api/v1/solicitudes/${solicitudId}/enviar-aprobacion`).set('Authorization', `Bearer ${gestorComprasToken}`);
  await request(app).post(`/api/v1/solicitudes/${solicitudId}/aprobar`).set('Authorization', `Bearer ${aprobadorAreaToken}`);
  await request(app)
    .post(`/api/v1/solicitudes/${solicitudId}/confirmar`)
    .set('Authorization', `Bearer ${gestorComprasToken}`)
    .field('ordenFormalNumero', 'OF-2026-FAC')
    .attach('archivo', path.join(__dirname, '../fixtures/documento-prueba.pdf'));

  return solicitudId;
}

describe('Factura API', () => {
  it('registra la factura de una solicitud confirmada y la cierra', async () => {
    const solicitudId = await crearSolicitudConfirmada();
    const res = await request(app)
      .post(`/api/v1/solicitudes/${solicitudId}/facturar`)
      .set('Authorization', `Bearer ${gestorComprasToken}`)
      .field('numero', 'FAC-2026-001')
      .field('monto', 500000)
      .field('fechaPago', '2026-07-23')
      .attach('archivo', path.join(__dirname, '../fixtures/documento-prueba.pdf'));
    expect(res.status).toBe(201);
    expect(res.body.data.numero).toBe('FAC-2026-001');
    expect(res.body.data.solicitudId).toBe(solicitudId);

    const solicitudRes = await request(app)
      .get(`/api/v1/solicitudes/${solicitudId}`)
      .set('Authorization', `Bearer ${gestorComprasToken}`);
    expect(solicitudRes.body.data.estado).toBe('cerrada');
  });

  it('returns 400 cuando la solicitud no está confirmada', async () => {
    const creada = await request(app)
      .post('/api/v1/solicitudes')
      .set('Authorization', `Bearer ${solicitanteToken}`)
      .send({ tipoSolicitudId: tipoCompra.id, areaSolicitanteId: area.id, descripcion: 'Solicitud sin confirmar' });
    const res = await request(app)
      .post(`/api/v1/solicitudes/${creada.body.data.id}/facturar`)
      .set('Authorization', `Bearer ${gestorComprasToken}`)
      .field('numero', 'FAC-2026-002')
      .field('monto', 90000)
      .field('fechaPago', '2026-07-23')
      .attach('archivo', path.join(__dirname, '../fixtures/documento-prueba.pdf'));
    expect(res.status).toBe(400);
  });

  it('returns 400 cuando falta numero, monto, fechaPago o el archivo', async () => {
    const solicitudId = await crearSolicitudConfirmada();
    const res = await request(app)
      .post(`/api/v1/solicitudes/${solicitudId}/facturar`)
      .set('Authorization', `Bearer ${gestorComprasToken}`)
      .field('monto', 500000)
      .field('fechaPago', '2026-07-23')
      .attach('archivo', path.join(__dirname, '../fixtures/documento-prueba.pdf'));
    expect(res.status).toBe(400);
  });

  it('returns 403 cuando un rol sin el permiso facturar intenta registrar la factura', async () => {
    const solicitudId = await crearSolicitudConfirmada();
    const res = await request(app)
      .post(`/api/v1/solicitudes/${solicitudId}/facturar`)
      .set('Authorization', `Bearer ${aprobadorAreaToken}`)
      .field('numero', 'FAC-2026-003')
      .field('monto', 500000)
      .field('fechaPago', '2026-07-23')
      .attach('archivo', path.join(__dirname, '../fixtures/documento-prueba.pdf'));
    expect(res.status).toBe(403);
  });

  it('GET /:id/factura devuelve null antes de facturar y la factura completa después', async () => {
    const solicitudId = await crearSolicitudConfirmada();
    const antes = await request(app)
      .get(`/api/v1/solicitudes/${solicitudId}/factura`)
      .set('Authorization', `Bearer ${gestorComprasToken}`);
    expect(antes.status).toBe(200);
    expect(antes.body.data).toBeNull();

    await request(app)
      .post(`/api/v1/solicitudes/${solicitudId}/facturar`)
      .set('Authorization', `Bearer ${gestorComprasToken}`)
      .field('numero', 'FAC-2026-004')
      .field('monto', 500000)
      .field('fechaPago', '2026-07-23')
      .attach('archivo', path.join(__dirname, '../fixtures/documento-prueba.pdf'));

    const despues = await request(app)
      .get(`/api/v1/solicitudes/${solicitudId}/factura`)
      .set('Authorization', `Bearer ${gestorComprasToken}`);
    expect(despues.status).toBe(200);
    expect(despues.body.data.numero).toBe('FAC-2026-004');
  });

  it('returns 403 cuando un solicitante que no es el dueño intenta ver la factura, pero el dueño sí puede', async () => {
    const solicitudId = await crearSolicitudConfirmada();
    const resAjeno = await request(app)
      .get(`/api/v1/solicitudes/${solicitudId}/factura`)
      .set('Authorization', `Bearer ${otroSolicitanteToken}`);
    expect(resAjeno.status).toBe(403);

    const resDueño = await request(app)
      .get(`/api/v1/solicitudes/${solicitudId}/factura`)
      .set('Authorization', `Bearer ${solicitanteToken}`);
    expect(resDueño.status).toBe(200);
  });

  it('super_administrador (visibilidad amplia) puede ver la factura de una solicitud que no es suya', async () => {
    const solicitudId = await crearSolicitudConfirmada();
    const res = await request(app)
      .get(`/api/v1/solicitudes/${solicitudId}/factura`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
  });

  it('descarga el archivo de la factura', async () => {
    const solicitudId = await crearSolicitudConfirmada();
    await request(app)
      .post(`/api/v1/solicitudes/${solicitudId}/facturar`)
      .set('Authorization', `Bearer ${gestorComprasToken}`)
      .field('numero', 'FAC-2026-005')
      .field('monto', 500000)
      .field('fechaPago', '2026-07-23')
      .attach('archivo', path.join(__dirname, '../fixtures/documento-prueba.pdf'));

    const res = await request(app)
      .get(`/api/v1/solicitudes/${solicitudId}/factura/descargar`)
      .set('Authorization', `Bearer ${gestorComprasToken}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/pdf/);
  });

  it('returns 404 al descargar si la solicitud no tiene factura registrada', async () => {
    const solicitudId = await crearSolicitudConfirmada();
    const res = await request(app)
      .get(`/api/v1/solicitudes/${solicitudId}/factura/descargar`)
      .set('Authorization', `Bearer ${gestorComprasToken}`);
    expect(res.status).toBe(404);
  });

  it('returns 403 cuando un solicitante que no es el dueño intenta descargar la factura', async () => {
    const solicitudId = await crearSolicitudConfirmada();
    await request(app)
      .post(`/api/v1/solicitudes/${solicitudId}/facturar`)
      .set('Authorization', `Bearer ${gestorComprasToken}`)
      .field('numero', 'FAC-2026-006')
      .field('monto', 500000)
      .field('fechaPago', '2026-07-23')
      .attach('archivo', path.join(__dirname, '../fixtures/documento-prueba.pdf'));

    const res = await request(app)
      .get(`/api/v1/solicitudes/${solicitudId}/factura/descargar`)
      .set('Authorization', `Bearer ${otroSolicitanteToken}`);
    expect(res.status).toBe(403);
  });
});
