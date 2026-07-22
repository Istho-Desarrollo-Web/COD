const request = require('supertest');
const bcrypt = require('bcryptjs');
const { sequelize } = require('../../src/config/database');
const { createMigrator } = require('../../src/config/migrator');
const seedRolesPermisos = require('../../src/scripts/seedRolesPermisos');
const { Area, Rol, Usuario } = require('../../src/models');
const { app } = require('../../server');

let token;
let solicitanteToken;
let area;

beforeAll(async () => {
  await sequelize.authenticate();
  await createMigrator(sequelize).up();
  await seedRolesPermisos();

  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ username: 'admin', password: process.env.SEED_PASSWORD_ADMIN || 'CambiarAhora123!' });
  token = res.body.data.token;

  area = await Area.create({ nombre: 'Carpetas Prueba', codigo: `CARP${Date.now()}` });

  const solicitanteRol = await Rol.findOne({ where: { nombre: 'solicitante' } });
  const solicitanteUsername = `solicitante_carpeta_${Date.now()}`;
  const solicitanteUsuario = await Usuario.create({
    username: solicitanteUsername,
    email: `${solicitanteUsername}@istho.com.co`,
    passwordHash: await bcrypt.hash('ClaveSolicitante123!', 10),
    nombre: 'Solicitante',
    apellido: 'Carpeta',
  });
  await solicitanteUsuario.setRoles([solicitanteRol.id]);
  const loginRes = await request(app)
    .post('/api/v1/auth/login')
    .send({ username: solicitanteUsername, password: 'ClaveSolicitante123!' });
  solicitanteToken = loginRes.body.data.token;
});

afterAll(async () => {
  await sequelize.close();
});

describe('Carpetas API', () => {
  it('creates a root carpeta and a nested carpeta, then lists them as a tree', async () => {
    const raizRes = await request(app)
      .post('/api/v1/carpetas')
      .set('Authorization', `Bearer ${token}`)
      .send({ areaId: area.id, nombre: 'Procesos' });
    expect(raizRes.status).toBe(201);

    const subRes = await request(app)
      .post('/api/v1/carpetas')
      .set('Authorization', `Bearer ${token}`)
      .send({ areaId: area.id, nombre: 'Formatos', carpetaPadreId: raizRes.body.data.id });
    expect(subRes.status).toBe(201);

    const listRes = await request(app).get(`/api/v1/carpetas?areaId=${area.id}`).set('Authorization', `Bearer ${token}`);
    expect(listRes.status).toBe(200);
    const raiz = listRes.body.data.find((c) => c.nombre === 'Procesos');
    expect(raiz.subcarpetas.some((s) => s.nombre === 'Formatos')).toBe(true);
  });

  it('returns 400 when areaId is missing on create', async () => {
    const res = await request(app).post('/api/v1/carpetas').set('Authorization', `Bearer ${token}`).send({ nombre: 'Sin área' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when carpetaPadreId belongs to a different area', async () => {
    const otraArea = await Area.create({ nombre: 'Otra Área', codigo: `OTRA${Date.now()}` });
    const padreRes = await request(app)
      .post('/api/v1/carpetas')
      .set('Authorization', `Bearer ${token}`)
      .send({ areaId: otraArea.id, nombre: 'Raíz otra área' });

    const res = await request(app)
      .post('/api/v1/carpetas')
      .set('Authorization', `Bearer ${token}`)
      .send({ areaId: area.id, nombre: 'Hija cruzada', carpetaPadreId: padreRes.body.data.id });
    expect(res.status).toBe(400);
  });

  it('returns 400 when areaId query param is missing on list', async () => {
    const res = await request(app).get('/api/v1/carpetas').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  it('returns 403 when a solicitante (no documentos.crear) tries to create a carpeta', async () => {
    const res = await request(app)
      .post('/api/v1/carpetas')
      .set('Authorization', `Bearer ${solicitanteToken}`)
      .send({ areaId: area.id, nombre: 'No debería crearse' });
    expect(res.status).toBe(403);
  });
});
