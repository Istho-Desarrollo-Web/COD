const request = require('supertest');
const bcrypt = require('bcryptjs');
const { sequelize } = require('../../src/config/database');
const { createMigrator } = require('../../src/config/migrator');
const seedRolesPermisos = require('../../src/scripts/seedRolesPermisos');
const { Rol, Usuario, LogServidor } = require('../../src/models');
const { invalidarCachePermisos } = require('../../src/middlewares/roles');
const { app } = require('../../server');

let token;
let solicitanteToken;

beforeAll(async () => {
  await sequelize.authenticate();
  await createMigrator(sequelize).up();
  await seedRolesPermisos();
  invalidarCachePermisos();

  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ username: 'admin', password: process.env.SEED_PASSWORD_ADMIN || 'CambiarAhora123!' });
  token = res.body.data.token;

  const solicitanteRol = await Rol.findOne({ where: { nombre: 'solicitante' } });
  const solicitanteUsername = `solicitante_logs_${Date.now()}`;
  await Usuario.create({
    username: solicitanteUsername,
    email: `${solicitanteUsername}@istho.com.co`,
    passwordHash: await bcrypt.hash('ClaveSolicitante123!', 10),
    nombre: 'Solicitante',
    apellido: 'Logs',
    rolId: solicitanteRol.id,
  });
  const solicitanteLogin = await request(app)
    .post('/api/v1/auth/login')
    .send({ username: solicitanteUsername, password: 'ClaveSolicitante123!' });
  solicitanteToken = solicitanteLogin.body.data.token;

  await LogServidor.create({ nivel: 'info', metodo: 'GET', ruta: '/api/v1/marca-de-prueba', statusCode: 200, mensaje: 'GET /api/v1/marca-de-prueba → 200' });
  await LogServidor.create({ nivel: 'warn', metodo: 'GET', ruta: '/api/v1/marca-de-prueba', statusCode: 404, mensaje: 'GET /api/v1/marca-de-prueba → 404' });
  await LogServidor.create({ nivel: 'error', metodo: 'POST', ruta: '/api/v1/otra-marca', statusCode: null, mensaje: 'Fallo simulado de prueba', stack: 'Error: fallo\n  at test' });
});

afterAll(async () => {
  await sequelize.close();
});

describe('GET /logs-servidor', () => {
  it('lista logs paginados, admin autorizado', async () => {
    const res = await request(app).get('/api/v1/logs-servidor').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.pagination).toBeDefined();
  });

  it('filtra por nivel', async () => {
    const res = await request(app).get('/api/v1/logs-servidor?nivel=error').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.every((fila) => fila.nivel === 'error')).toBe(true);
  });

  it('filtra por ruta/mensaje con q', async () => {
    const res = await request(app).get('/api/v1/logs-servidor?q=marca-de-prueba').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(2);
    expect(res.body.data.every((fila) => fila.ruta.includes('marca-de-prueba') || fila.mensaje.includes('marca-de-prueba'))).toBe(true);
  });

  it('returns 400 when desde no es una fecha válida', async () => {
    const res = await request(app).get('/api/v1/logs-servidor?desde=no-es-fecha').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  it('returns 403 para un rol sin el permiso logs_servidor', async () => {
    const res = await request(app).get('/api/v1/logs-servidor').set('Authorization', `Bearer ${solicitanteToken}`);
    expect(res.status).toBe(403);
  });
});
