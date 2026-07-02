const request = require('supertest');
const bcrypt = require('bcryptjs');
const { sequelize } = require('../../src/config/database');
const { createMigrator } = require('../../src/config/migrator');
const { Usuario, Rol, RolPermiso, Auditoria } = require('../../src/models');
const seedRolesPermisos = require('../../src/scripts/seedRolesPermisos');
const { verificarToken } = require('../../src/middlewares/auth');
const { app } = require('../../server');

beforeAll(async () => {
  await sequelize.authenticate();
  await createMigrator(sequelize).up();
  await seedRolesPermisos();
});

afterAll(async () => {
  await sequelize.close();
});

describe('POST /api/v1/auth/login', () => {
  it('rejects wrong credentials with 401', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ username: 'admin', password: 'incorrecta' });
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('rejects a nonexistent username with the same 401 shape (timing-safe login)', async () => {
    const wrongPassword = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: 'admin', password: 'incorrecta' });
    const nonexistentUser = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: 'usuario_que_no_existe', password: 'cualquiera' });

    expect(nonexistentUser.status).toBe(401);
    expect(nonexistentUser.body.success).toBe(false);
    expect(nonexistentUser.status).toBe(wrongPassword.status);
    expect(nonexistentUser.body.message).toBe(wrongPassword.body.message);
  });

  it('returns a token for correct credentials and logs an audit entry', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: 'admin', password: process.env.SEED_PASSWORD_ADMIN || 'CambiarAhora123!' });
    expect(res.status).toBe(200);
    expect(res.body.data.token).toEqual(expect.any(String));
    const log = await Auditoria.findOne({ where: { accion: 'login', usuarioNombre: 'Administrador COD' } });
    expect(log).not.toBeNull();
  });
});

describe('protected routes', () => {
  let token;
  let refreshToken;
  beforeAll(async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: 'admin', password: process.env.SEED_PASSWORD_ADMIN || 'CambiarAhora123!' });
    token = res.body.data.token;
    refreshToken = res.body.data.refreshToken;
  });

  it('rejects requests with no token with 401', async () => {
    const res = await request(app).get('/api/v1/auth/me');
    expect(res.status).toBe(401);
  });

  it('accepts requests with a valid token', async () => {
    const res = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.username).toBe('admin');
  });

  it('rejects a refresh token used as an access token with 401', async () => {
    const res = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${refreshToken}`);
    expect(res.status).toBe(401);
  });
});

describe('req.user.tienePermiso', () => {
  let token;
  beforeAll(async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: 'admin', password: process.env.SEED_PASSWORD_ADMIN || 'CambiarAhora123!' });
    token = res.body.data.token;
  });

  function buildFakeReqRes(authToken) {
    const req = { get: (name) => (name === 'Authorization' ? `Bearer ${authToken}` : undefined) };
    const res = {
      statusCode: null,
      body: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        this.body = payload;
        return this;
      },
    };
    return { req, res };
  }

  it('resolves true for a permission the admin role has, and false for one it does not', async () => {
    const { req, res } = buildFakeReqRes(token);
    let nextCalled = false;
    await verificarToken(req, res, () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(true);
    expect(req.user).toBeDefined();
    expect(typeof req.user.tienePermiso).toBe('function');

    await expect(req.user.tienePermiso('documentos', 'ver')).resolves.toBe(true);
    await expect(req.user.tienePermiso('documentos', 'accion_inexistente')).resolves.toBe(false);
  });
});
