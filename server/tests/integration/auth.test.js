const request = require('supertest');
const bcrypt = require('bcryptjs');
const { sequelize } = require('../../src/config/database');
const { createMigrator } = require('../../src/config/migrator');
const { Usuario, Rol, RolPermiso, Auditoria } = require('../../src/models');
const seedRolesPermisos = require('../../src/scripts/seedRolesPermisos');
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
  beforeAll(async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: 'admin', password: process.env.SEED_PASSWORD_ADMIN || 'CambiarAhora123!' });
    token = res.body.data.token;
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
});
