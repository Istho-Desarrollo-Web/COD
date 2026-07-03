const request = require('supertest');
const { sequelize } = require('../../src/config/database');
const { createMigrator } = require('../../src/config/migrator');
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

describe('POST /api/v1/auth/login rate limiting', () => {
  it('returns 429 after exceeding the login attempt limit for an IP', async () => {
    // This test file gets its own module registry (and therefore its own
    // in-memory rate-limit store), so no other test's login attempts count
    // toward this limit.
    let lastStatus;
    for (let i = 0; i < 10; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const res = await request(app).post('/api/v1/auth/login').send({ username: 'admin', password: 'incorrecta' });
      lastStatus = res.status;
      expect(lastStatus).toBe(401);
    }

    const throttled = await request(app).post('/api/v1/auth/login').send({ username: 'admin', password: 'incorrecta' });
    expect(throttled.status).toBe(429);
    expect(throttled.body.success).toBe(false);
  });
});
