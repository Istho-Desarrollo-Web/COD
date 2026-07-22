const request = require('supertest');
const path = require('path');
const bcrypt = require('bcryptjs');
const { sequelize } = require('../../src/config/database');
const { createMigrator } = require('../../src/config/migrator');
const seedRolesPermisos = require('../../src/scripts/seedRolesPermisos');
const seedNivelesAprobacion = require('../../src/scripts/seedNivelesAprobacion');
const { Rol, Usuario, Area, TipoSolicitud, Proveedor } = require('../../src/models');
const { invalidarCachePermisos } = require('../../src/middlewares/roles');
const { app } = require('../../server');

let adminToken;
let gestorComprasToken;
let solicitanteToken;
let solicitanteId;
let otroSolicitanteToken;
let aprobadorAreaToken;
let aprobadorAreaOtraToken;
let aprobadorEjecutivoToken;
let area;
let otraArea;
let tipoCompra;

async function crearUsuarioConRol(rolNombre, prefijo, areaId = null) {
  const rol = await Rol.findOne({ where: { nombre: rolNombre } });
  const username = `${prefijo}_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
  const usuario = await Usuario.create({
    username, email: `${username}@istho.com.co`,
    passwordHash: await bcrypt.hash('Clave123!', 10),
    nombre: prefijo, apellido: 'Prueba', areaId,
  });
  await usuario.setRoles([rol.id]);
  const login = await request(app).post('/api/v1/auth/login').send({ username, password: 'Clave123!' });
  return { usuario, token: login.body.data.token };
}

beforeAll(async () => {
  await sequelize.authenticate();
  await createMigrator(sequelize).up();
  await seedRolesPermisos();
  await seedNivelesAprobacion();
  invalidarCachePermisos();

  area = await Area.create({ nombre: 'Compras Solicitudes', codigo: `COMPRASSOL${Date.now()}` });
  otraArea = await Area.create({ nombre: 'Otra Area Solicitudes', codigo: `OTRAAREASOL${Date.now()}` });
  tipoCompra = await TipoSolicitud.findOne({ where: { nombre: 'compra' } });

  const adminLogin = await request(app)
    .post('/api/v1/auth/login')
    .send({ username: 'admin', password: process.env.SEED_PASSWORD_ADMIN || 'CambiarAhora123!' });
  adminToken = adminLogin.body.data.token;

  const gestorCompras = await crearUsuarioConRol('gestor_compras', 'gestor_compras_sol');
  gestorComprasToken = gestorCompras.token;

  const solicitante = await crearUsuarioConRol('solicitante', 'solicitante_sol', area.id);
  solicitanteToken = solicitante.token;
  solicitanteId = solicitante.usuario.id;

  const otroSolicitante = await crearUsuarioConRol('solicitante', 'otro_solicitante_sol', area.id);
  otroSolicitanteToken = otroSolicitante.token;

  const aprobadorArea = await crearUsuarioConRol('aprobador_area', 'aprobador_area_sol', area.id);
  aprobadorAreaToken = aprobadorArea.token;

  const aprobadorAreaOtra = await crearUsuarioConRol('aprobador_area', 'aprobador_area_otra_sol', otraArea.id);
  aprobadorAreaOtraToken = aprobadorAreaOtra.token;

  const aprobadorEjecutivo = await crearUsuarioConRol('aprobador_ejecutivo', 'aprobador_ejecutivo_sol');
  aprobadorEjecutivoToken = aprobadorEjecutivo.token;
});

afterAll(async () => {
  await sequelize.close();
});

async function crearSolicitud(token, overrides = {}) {
  const datos = {
    tipoSolicitudId: tipoCompra.id, areaSolicitanteId: area.id,
    descripcion: 'Compra de equipos de oficina', montoEstimado: 800000,
    ...overrides,
  };
  return request(app).post('/api/v1/solicitudes').set('Authorization', `Bearer ${token}`).send(datos);
}

async function crearYEnviarAAprobacion(monto = 500000) {
  const creada = await crearSolicitud(solicitanteToken);
  const solicitudId = creada.body.data.id;
  const cotizacionRes = await request(app)
    .post(`/api/v1/solicitudes/${solicitudId}/cotizaciones`)
    .set('Authorization', `Bearer ${gestorComprasToken}`)
    .send({ monto });
  const cotizacionId = cotizacionRes.body.data.id;
  await request(app)
    .post(`/api/v1/solicitudes/${solicitudId}/cotizaciones/${cotizacionId}/seleccionar`)
    .set('Authorization', `Bearer ${gestorComprasToken}`);
  const envioRes = await request(app)
    .post(`/api/v1/solicitudes/${solicitudId}/enviar-aprobacion`)
    .set('Authorization', `Bearer ${gestorComprasToken}`);
  return { solicitudId, envioRes };
}

async function crearYEnviarYAprobar(monto = 500000) {
  const { solicitudId } = await crearYEnviarAAprobacion(monto);
  await request(app).post(`/api/v1/solicitudes/${solicitudId}/aprobar`).set('Authorization', `Bearer ${aprobadorAreaToken}`);
  return { solicitudId };
}

describe('Solicitudes API — catálogo de tipos', () => {
  it('lista los tipos de solicitud activos', async () => {
    const res = await request(app).get('/api/v1/solicitudes/tipos').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.some((t) => t.nombre === 'compra')).toBe(true);
  });
});

describe('Solicitudes API — CRUD y visibilidad', () => {
  it('crea una solicitud en estado cotizando, con codigo autogenerado SOL-<año>-<id>', async () => {
    const res = await crearSolicitud(solicitanteToken);
    expect(res.status).toBe(201);
    expect(res.body.data.estado).toBe('cotizando');
    expect(res.body.data.solicitanteUsuarioId).toBe(solicitanteId);
    expect(res.body.data.codigo).toMatch(new RegExp(`^SOL-${new Date().getFullYear()}-\\d+$`));
  });

  it('returns 400 when descripcion is missing', async () => {
    const res = await crearSolicitud(solicitanteToken, { descripcion: undefined });
    expect(res.status).toBe(400);
  });

  it('returns 403 when a role without solicitudes:crear tries to create one', async () => {
    const res = await crearSolicitud(aprobadorAreaToken);
    expect(res.status).toBe(403);
  });

  it('un solicitante solo ve sus propias solicitudes', async () => {
    await crearSolicitud(solicitanteToken);
    await crearSolicitud(otroSolicitanteToken);

    const res = await request(app).get('/api/v1/solicitudes').set('Authorization', `Bearer ${solicitanteToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data.every((s) => s.solicitanteUsuarioId === solicitanteId)).toBe(true);
  });

  it('gestor_compras ve todas las solicitudes, sin filtro de dueño', async () => {
    const creada = await crearSolicitud(otroSolicitanteToken);
    const res = await request(app).get('/api/v1/solicitudes').set('Authorization', `Bearer ${gestorComprasToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.some((s) => s.id === creada.body.data.id)).toBe(true);
  });

  it('filtra por estado', async () => {
    const res = await request(app).get('/api/v1/solicitudes?estado=cotizando').set('Authorization', `Bearer ${gestorComprasToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.every((s) => s.estado === 'cotizando')).toBe(true);
  });

  it('obtiene una solicitud por id', async () => {
    const creada = await crearSolicitud(solicitanteToken);
    const res = await request(app).get(`/api/v1/solicitudes/${creada.body.data.id}`).set('Authorization', `Bearer ${solicitanteToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(creada.body.data.id);
  });
});

describe('Solicitudes API — envío a aprobación, aprobar/rechazar', () => {
  it('envía a aprobación y crea una SolicitudAprobacion pendiente en aprobador_area', async () => {
    const { envioRes } = await crearYEnviarAAprobacion(500000);
    expect(envioRes.status).toBe(200);
    expect(envioRes.body.data.solicitud.estado).toBe('en_aprobacion');
    expect(envioRes.body.data.aprobacion.estado).toBe('pendiente');
  });

  it('returns 400 cuando se envía a aprobación sin ninguna cotización seleccionada', async () => {
    const creada = await crearSolicitud(solicitanteToken);
    const res = await request(app)
      .post(`/api/v1/solicitudes/${creada.body.data.id}/enviar-aprobacion`)
      .set('Authorization', `Bearer ${gestorComprasToken}`);
    expect(res.status).toBe(400);
  });

  it('aprobador_area de la misma área aprueba la solicitud', async () => {
    const { solicitudId } = await crearYEnviarAAprobacion(500000);
    const res = await request(app)
      .post(`/api/v1/solicitudes/${solicitudId}/aprobar`)
      .set('Authorization', `Bearer ${aprobadorAreaToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.estado).toBe('aprobada');
  });

  it('returns 403 cuando aprobador_area de OTRA área intenta aprobar', async () => {
    const { solicitudId } = await crearYEnviarAAprobacion(500000);
    const res = await request(app)
      .post(`/api/v1/solicitudes/${solicitudId}/aprobar`)
      .set('Authorization', `Bearer ${aprobadorAreaOtraToken}`);
    expect(res.status).toBe(403);
  });

  it('returns 403 cuando gestor_compras (sin permiso aprobar) intenta aprobar', async () => {
    const { solicitudId } = await crearYEnviarAAprobacion(500000);
    const res = await request(app)
      .post(`/api/v1/solicitudes/${solicitudId}/aprobar`)
      .set('Authorization', `Bearer ${gestorComprasToken}`);
    expect(res.status).toBe(403);
  });

  it('aprobador_ejecutivo aprueba sin restricción de área cuando la cotización escaló por criticidad crítica', async () => {
    const proveedorCritico = await Proveedor.create({
      tipo: 'proveedor', documentoIdentificacion: `970${Date.now()}`, razonSocial: 'Proveedor Crítico Solicitudes SAS',
      criticidad: 'critico', areaSolicitanteId: area.id,
    });
    const creada = await crearSolicitud(solicitanteToken);
    const solicitudId = creada.body.data.id;
    const cotizacionRes = await request(app)
      .post(`/api/v1/solicitudes/${solicitudId}/cotizaciones`)
      .set('Authorization', `Bearer ${gestorComprasToken}`)
      .send({ monto: 200000, proveedorId: proveedorCritico.id });
    await request(app)
      .post(`/api/v1/solicitudes/${solicitudId}/cotizaciones/${cotizacionRes.body.data.id}/seleccionar`)
      .set('Authorization', `Bearer ${gestorComprasToken}`);
    const envioRes = await request(app)
      .post(`/api/v1/solicitudes/${solicitudId}/enviar-aprobacion`)
      .set('Authorization', `Bearer ${gestorComprasToken}`);
    expect(envioRes.status).toBe(200);

    const aprobarRes = await request(app)
      .post(`/api/v1/solicitudes/${solicitudId}/aprobar`)
      .set('Authorization', `Bearer ${aprobadorEjecutivoToken}`);
    expect(aprobarRes.status).toBe(200);
    expect(aprobarRes.body.data.estado).toBe('aprobada');
  });

  it('rechaza una solicitud con motivo', async () => {
    const { solicitudId } = await crearYEnviarAAprobacion(500000);
    const res = await request(app)
      .post(`/api/v1/solicitudes/${solicitudId}/rechazar`)
      .set('Authorization', `Bearer ${aprobadorAreaToken}`)
      .send({ motivo: 'Presupuesto insuficiente' });
    expect(res.status).toBe(200);
    expect(res.body.data.estado).toBe('rechazada');
  });

  it('returns 400 al rechazar sin motivo', async () => {
    const { solicitudId } = await crearYEnviarAAprobacion(500000);
    const res = await request(app)
      .post(`/api/v1/solicitudes/${solicitudId}/rechazar`)
      .set('Authorization', `Bearer ${aprobadorAreaToken}`)
      .send({});
    expect(res.status).toBe(400);
  });
});

describe('Solicitudes API — confirmación', () => {
  it('confirma una solicitud aprobada subiendo número y archivo de orden formal', async () => {
    const { solicitudId } = await crearYEnviarYAprobar();
    const res = await request(app)
      .post(`/api/v1/solicitudes/${solicitudId}/confirmar`)
      .set('Authorization', `Bearer ${gestorComprasToken}`)
      .field('ordenFormalNumero', 'OF-2026-001')
      .attach('archivo', path.join(__dirname, '../fixtures/documento-prueba.pdf'));
    expect(res.status).toBe(200);
    expect(res.body.data.estado).toBe('confirmada');
    expect(res.body.data.ordenFormalNumero).toBe('OF-2026-001');
  });

  it('returns 400 cuando falta el archivo de la orden formal', async () => {
    const { solicitudId } = await crearYEnviarYAprobar();
    const res = await request(app)
      .post(`/api/v1/solicitudes/${solicitudId}/confirmar`)
      .set('Authorization', `Bearer ${gestorComprasToken}`)
      .field('ordenFormalNumero', 'OF-2026-002');
    expect(res.status).toBe(400);
  });

  it('returns 400 cuando la solicitud no está aprobada', async () => {
    const creada = await crearSolicitud(solicitanteToken);
    const res = await request(app)
      .post(`/api/v1/solicitudes/${creada.body.data.id}/confirmar`)
      .set('Authorization', `Bearer ${gestorComprasToken}`)
      .field('ordenFormalNumero', 'OF-2026-003')
      .attach('archivo', path.join(__dirname, '../fixtures/documento-prueba.pdf'));
    expect(res.status).toBe(400);
  });
});

describe('Solicitudes API — cancelación', () => {
  it('el dueño cancela su solicitud en cotizando', async () => {
    const creada = await crearSolicitud(solicitanteToken);
    const res = await request(app)
      .post(`/api/v1/solicitudes/${creada.body.data.id}/cancelar`)
      .set('Authorization', `Bearer ${solicitanteToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.estado).toBe('cancelada');
  });

  it('el dueño cancela su solicitud en_aprobacion', async () => {
    const { solicitudId } = await crearYEnviarAAprobacion(500000);
    const res = await request(app)
      .post(`/api/v1/solicitudes/${solicitudId}/cancelar`)
      .set('Authorization', `Bearer ${solicitanteToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.estado).toBe('cancelada');
  });

  it('returns 403 cuando otro usuario intenta cancelar una solicitud que no es suya', async () => {
    const creada = await crearSolicitud(solicitanteToken);
    const res = await request(app)
      .post(`/api/v1/solicitudes/${creada.body.data.id}/cancelar`)
      .set('Authorization', `Bearer ${otroSolicitanteToken}`);
    expect(res.status).toBe(403);
  });

  it('returns 400 cuando se intenta cancelar una solicitud ya confirmada', async () => {
    const { solicitudId } = await crearYEnviarYAprobar();
    await request(app)
      .post(`/api/v1/solicitudes/${solicitudId}/confirmar`)
      .set('Authorization', `Bearer ${gestorComprasToken}`)
      .field('ordenFormalNumero', 'OF-2026-004')
      .attach('archivo', path.join(__dirname, '../fixtures/documento-prueba.pdf'));

    const res = await request(app)
      .post(`/api/v1/solicitudes/${solicitudId}/cancelar`)
      .set('Authorization', `Bearer ${solicitanteToken}`);
    expect(res.status).toBe(400);
  });
});
