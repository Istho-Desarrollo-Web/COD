const request = require('supertest');
const { sequelize } = require('../../src/config/database');
const { createMigrator } = require('../../src/config/migrator');
const seedRolesPermisos = require('../../src/scripts/seedRolesPermisos');
const seedTiposDocumento = require('../../src/scripts/seedTiposDocumento');
const { app } = require('../../server');

let token;

beforeAll(async () => {
  await sequelize.authenticate();
  await createMigrator(sequelize).up();
  await seedRolesPermisos();
  await seedTiposDocumento();
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ username: 'admin', password: process.env.SEED_PASSWORD_ADMIN || 'CambiarAhora123!' });
  token = res.body.data.token;
});

afterAll(async () => {
  await sequelize.close();
});

describe('GET /api/v1/tipos-documento', () => {
  it('lists the 11 seeded active tipos de documento', async () => {
    const res = await request(app).get('/api/v1/tipos-documento').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(11);
    expect(res.body.data.some((t) => t.nombre === 'Legal' && t.diasAlertaVencimientoDefault === 15)).toBe(true);
  });

  it('requires authentication', async () => {
    const res = await request(app).get('/api/v1/tipos-documento');
    expect(res.status).toBe(401);
  });
});
