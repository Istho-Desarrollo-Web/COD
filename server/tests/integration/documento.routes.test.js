const request = require('supertest');
const bcrypt = require('bcryptjs');
const { sequelize } = require('../../src/config/database');
const { createMigrator } = require('../../src/config/migrator');
const seedRolesPermisos = require('../../src/scripts/seedRolesPermisos');
const seedTiposDocumento = require('../../src/scripts/seedTiposDocumento');
const { Area, Carpeta, TipoDocumento, Documento, Rol, Usuario } = require('../../src/models');
const { app } = require('../../server');

let token;
let operacionesToken;
let area;
let carpeta;
let tipoDocumento;

beforeAll(async () => {
  await sequelize.authenticate();
  await createMigrator(sequelize).up();
  await seedRolesPermisos();
  await seedTiposDocumento();

  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ username: 'admin', password: process.env.SEED_PASSWORD_ADMIN || 'CambiarAhora123!' });
  token = res.body.data.token;

  area = await Area.create({ nombre: 'Documentos Prueba', codigo: `DOC${Date.now()}` });
  carpeta = await Carpeta.create({ areaId: area.id, nombre: 'Raíz' });
  tipoDocumento = await TipoDocumento.findOne({ where: { nombre: 'Procedimiento' } });

  await Documento.create({ areaId: area.id, carpetaId: carpeta.id, tipoDocumentoId: tipoDocumento.id, nombre: 'Doc Vigente', estado: 'vigente' });
  await Documento.create({ areaId: area.id, carpetaId: carpeta.id, tipoDocumentoId: tipoDocumento.id, nombre: 'Doc Vencido', estado: 'vencido' });

  const operacionesRol = await Rol.findOne({ where: { nombre: 'operaciones' } });
  const operacionesUsername = `operaciones_doc_${Date.now()}`;
  await Usuario.create({
    username: operacionesUsername,
    email: `${operacionesUsername}@istho.com.co`,
    passwordHash: await bcrypt.hash('ClaveOperaciones123!', 10),
    nombre: 'Operaciones',
    apellido: 'Prueba',
    rolId: operacionesRol.id,
  });
  const loginRes = await request(app)
    .post('/api/v1/auth/login')
    .send({ username: operacionesUsername, password: 'ClaveOperaciones123!' });
  operacionesToken = loginRes.body.data.token;
});

afterAll(async () => {
  await sequelize.close();
});

describe('GET /api/v1/documentos', () => {
  it('lists documentos with pagination metadata', async () => {
    const res = await request(app).get(`/api/v1/documentos?areaId=${area.id}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(2);
    expect(res.body.pagination).toEqual({ page: 1, limit: 20, total: 2, totalPages: 1 });
  });

  it('filters by estado', async () => {
    const res = await request(app)
      .get(`/api/v1/documentos?areaId=${area.id}&estado=vencido`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].nombre).toBe('Doc Vencido');
  });

  it('returns 403 for a role without documentos.ver (operaciones)', async () => {
    const res = await request(app).get(`/api/v1/documentos?areaId=${area.id}`).set('Authorization', `Bearer ${operacionesToken}`);
    expect(res.status).toBe(403);
  });
});

describe('GET /api/v1/documentos/:id', () => {
  it('returns a single documento', async () => {
    const listRes = await request(app).get(`/api/v1/documentos?areaId=${area.id}`).set('Authorization', `Bearer ${token}`);
    const id = listRes.body.data[0].id;

    const res = await request(app).get(`/api/v1/documentos/${id}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(id);
  });

  it('returns 404 for a nonexistent documento', async () => {
    const res = await request(app).get('/api/v1/documentos/999999999').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});
