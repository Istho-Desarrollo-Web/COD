const request = require('supertest');
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
let solicitudId;

async function crearUsuarioConRol(rolNombre, prefijo) {
  const rol = await Rol.findOne({ where: { nombre: rolNombre } });
  const username = `${prefijo}_${Date.now()}`;
  const usuario = await Usuario.create({
    username, email: `${username}@istho.com.co`,
    passwordHash: await bcrypt.hash('Clave123!', 10), nombre: prefijo, apellido: 'Comentario',
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

  area = await Area.create({ nombre: 'Comentarios Area', codigo: `COMENTAREA${Date.now()}` });
  tipoCompra = await TipoSolicitud.findOne({ where: { nombre: 'compra' } });

  const adminLogin = await request(app)
    .post('/api/v1/auth/login')
    .send({ username: 'admin', password: process.env.SEED_PASSWORD_ADMIN || 'CambiarAhora123!' });
  adminToken = adminLogin.body.data.token;

  gestorComprasToken = await crearUsuarioConRol('gestor_compras', 'gestor_compras_com');
  solicitanteToken = await crearUsuarioConRol('solicitante', 'solicitante_com');
  otroSolicitanteToken = await crearUsuarioConRol('solicitante', 'otro_solicitante_com');
  aprobadorAreaToken = await crearUsuarioConRol('aprobador_area', 'aprobador_area_com');

  const creada = await request(app)
    .post('/api/v1/solicitudes')
    .set('Authorization', `Bearer ${solicitanteToken}`)
    .send({ tipoSolicitudId: tipoCompra.id, areaSolicitanteId: area.id, descripcion: 'Solicitud para comentar' });
  solicitudId = creada.body.data.id;
});

afterAll(async () => {
  await sequelize.close();
});

describe('Comentarios de Solicitud API', () => {
  it('el solicitante agrega un comentario', async () => {
    const res = await request(app)
      .post(`/api/v1/solicitudes/${solicitudId}/comentarios`)
      .set('Authorization', `Bearer ${solicitanteToken}`)
      .send({ texto: 'Necesitamos esto con urgencia' });
    expect(res.status).toBe(201);
    expect(res.body.data.texto).toBe('Necesitamos esto con urgencia');
    expect(res.body.data.Usuario).toBeDefined();
  });

  it('gestor_compras agrega un comentario', async () => {
    const res = await request(app)
      .post(`/api/v1/solicitudes/${solicitudId}/comentarios`)
      .set('Authorization', `Bearer ${gestorComprasToken}`)
      .send({ texto: 'Ya estamos cotizando' });
    expect(res.status).toBe(201);
  });

  it('returns 403 cuando aprobador_area (sin permiso comentar) intenta comentar', async () => {
    const res = await request(app)
      .post(`/api/v1/solicitudes/${solicitudId}/comentarios`)
      .set('Authorization', `Bearer ${aprobadorAreaToken}`)
      .send({ texto: 'No debería poder comentar' });
    expect(res.status).toBe(403);
  });

  it('returns 400 cuando falta el texto', async () => {
    const res = await request(app)
      .post(`/api/v1/solicitudes/${solicitudId}/comentarios`)
      .set('Authorization', `Bearer ${solicitanteToken}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it('lista los comentarios en orden cronológico', async () => {
    const res = await request(app).get(`/api/v1/solicitudes/${solicitudId}/comentarios`).set('Authorization', `Bearer ${gestorComprasToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(2);
    expect(new Date(res.body.data[0].createdAt).getTime()).toBeLessThanOrEqual(new Date(res.body.data[1].createdAt).getTime());
  });

  it('aprobador_area (con solicitudes:ver) puede leer los comentarios aunque no pueda escribir', async () => {
    const res = await request(app).get(`/api/v1/solicitudes/${solicitudId}/comentarios`).set('Authorization', `Bearer ${aprobadorAreaToken}`);
    expect(res.status).toBe(200);
  });

  it('super_administrador (visibilidad amplia) puede leer los comentarios de una solicitud que no es suya', async () => {
    const res = await request(app).get(`/api/v1/solicitudes/${solicitudId}/comentarios`).set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(2);
  });

  it('returns 403 cuando un solicitante que no es el dueño intenta listar los comentarios (IDOR)', async () => {
    const res = await request(app)
      .get(`/api/v1/solicitudes/${solicitudId}/comentarios`)
      .set('Authorization', `Bearer ${otroSolicitanteToken}`);
    expect(res.status).toBe(403);
  });

  it('returns 403 cuando un solicitante que no es el dueño intenta comentar (IDOR)', async () => {
    const res = await request(app)
      .post(`/api/v1/solicitudes/${solicitudId}/comentarios`)
      .set('Authorization', `Bearer ${otroSolicitanteToken}`)
      .send({ texto: 'Intento comentar en una solicitud ajena' });
    expect(res.status).toBe(403);
  });
});
