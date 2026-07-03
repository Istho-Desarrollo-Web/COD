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

describe('Areas API', () => {
  it('creates and lists an area, defaulting salud_documental_pct to 100', async () => {
    const uniqueCode = `FIN${Date.now()}`;
    const createRes = await request(app)
      .post('/api/v1/areas')
      .set('Authorization', `Bearer ${token}`)
      .send({ nombre: 'Financiera', codigo: uniqueCode });
    expect(createRes.status).toBe(201);
    expect(Number(createRes.body.data.saludDocumentalPct)).toBe(100);

    const listRes = await request(app).get('/api/v1/areas').set('Authorization', `Bearer ${token}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.data.some((a) => a.codigo === uniqueCode)).toBe(true);
  });

  it('returns 409 (not a hang) when codigo already exists', async () => {
    const uniqueCode = `DUP${Date.now()}`;
    const first = await request(app)
      .post('/api/v1/areas')
      .set('Authorization', `Bearer ${token}`)
      .send({ nombre: 'Duplicada', codigo: uniqueCode });
    expect(first.status).toBe(201);

    const second = await request(app)
      .post('/api/v1/areas')
      .set('Authorization', `Bearer ${token}`)
      .send({ nombre: 'Duplicada Otra Vez', codigo: uniqueCode });
    expect(second.status).toBe(409);
    expect(second.body.success).toBe(false);
  });

  it('returns 400 when nombre is missing', async () => {
    const res = await request(app)
      .post('/api/v1/areas')
      .set('Authorization', `Bearer ${token}`)
      .send({ codigo: `NOM${Date.now()}` });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});
