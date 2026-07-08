const request = require('supertest');
const { sequelize } = require('../../src/config/database');
const { createMigrator } = require('../../src/config/migrator');
const seedRolesPermisos = require('../../src/scripts/seedRolesPermisos');
const { app } = require('../../server');

let token;

beforeAll(async () => {
  await sequelize.authenticate();
  await createMigrator(sequelize).up();
  await seedRolesPermisos();
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ username: 'admin', password: process.env.SEED_PASSWORD_ADMIN || 'CambiarAhora123!' });
  token = res.body.data.token;
});

afterAll(async () => {
  await sequelize.close();
});

describe('Roles API', () => {
  it('lists the seeded roles', async () => {
    const res = await request(app).get('/api/v1/roles').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.some((r) => r.nombre === 'lider_area')).toBe(true);
    expect(res.body.data.some((r) => r.nombre === 'admin')).toBe(true);
  });

  it('returns 401 without a token', async () => {
    const res = await request(app).get('/api/v1/roles');
    expect(res.status).toBe(401);
  });
});
