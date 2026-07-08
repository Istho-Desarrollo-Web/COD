const request = require('supertest');
const bcrypt = require('bcryptjs');
const { sequelize } = require('../../src/config/database');
const { createMigrator } = require('../../src/config/migrator');
const seedRolesPermisos = require('../../src/scripts/seedRolesPermisos');
const { Usuario, Rol } = require('../../src/models');
const { app } = require('../../server');

let token;
let solicitanteToken;
let rolLiderAreaId;

beforeAll(async () => {
  await sequelize.authenticate();
  await createMigrator(sequelize).up();
  await seedRolesPermisos();
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ username: 'admin', password: process.env.SEED_PASSWORD_ADMIN || 'CambiarAhora123!' });
  token = res.body.data.token;

  const solicitanteRol = await Rol.findOne({ where: { nombre: 'solicitante' } });
  const solicitanteUsername = `solicitante_usu_test_${Date.now()}`;
  await Usuario.create({
    username: solicitanteUsername,
    email: `${solicitanteUsername}@istho.com.co`,
    passwordHash: await bcrypt.hash('ClaveSolicitante123!', 10),
    nombre: 'Solicitante',
    apellido: 'Prueba',
    rolId: solicitanteRol.id,
  });
  const loginRes = await request(app)
    .post('/api/v1/auth/login')
    .send({ username: solicitanteUsername, password: 'ClaveSolicitante123!' });
  solicitanteToken = loginRes.body.data.token;

  const liderRol = await Rol.findOne({ where: { nombre: 'lider_area' } });
  rolLiderAreaId = liderRol.id;
});

afterAll(async () => {
  await sequelize.close();
});

function datosUsuario(sufijo) {
  return {
    username: `usuario_${sufijo}`,
    email: `usuario_${sufijo}@istho.com.co`,
    nombre: 'Ana',
    apellido: 'Gómez',
    password: 'ClaveSegura123!',
    rolId: rolLiderAreaId,
  };
}

describe('Usuarios API', () => {
  it('creates and lists a usuario, defaulting requiereCambioPassword to true and never exposing passwordHash', async () => {
    const datos = datosUsuario(`crea_${Date.now()}`);
    const createRes = await request(app).post('/api/v1/usuarios').set('Authorization', `Bearer ${token}`).send(datos);
    expect(createRes.status).toBe(201);
    expect(createRes.body.data.requiereCambioPassword).toBe(true);
    expect(createRes.body.data.passwordHash).toBeUndefined();

    const listRes = await request(app).get('/api/v1/usuarios').set('Authorization', `Bearer ${token}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.data.some((u) => u.username === datos.username)).toBe(true);
  });

  it('gets a single usuario by id', async () => {
    const datos = datosUsuario(`obt_${Date.now()}`);
    const createRes = await request(app).post('/api/v1/usuarios').set('Authorization', `Bearer ${token}`).send(datos);
    const getRes = await request(app).get(`/api/v1/usuarios/${createRes.body.data.id}`).set('Authorization', `Bearer ${token}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.data.username).toBe(datos.username);
  });

  it('returns 409 when username already exists', async () => {
    const datos = datosUsuario(`dup_${Date.now()}`);
    const first = await request(app).post('/api/v1/usuarios').set('Authorization', `Bearer ${token}`).send(datos);
    expect(first.status).toBe(201);

    const second = await request(app)
      .post('/api/v1/usuarios')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...datos, email: `otro_${Date.now()}@istho.com.co` });
    expect(second.status).toBe(409);
  });

  it('returns 400 when required fields are missing', async () => {
    const res = await request(app)
      .post('/api/v1/usuarios')
      .set('Authorization', `Bearer ${token}`)
      .send({ username: `incompleto_${Date.now()}` });
    expect(res.status).toBe(400);
  });

  it('returns 404 when rolId does not exist', async () => {
    const datos = datosUsuario(`rol404_${Date.now()}`);
    const res = await request(app)
      .post('/api/v1/usuarios')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...datos, rolId: 999999 });
    expect(res.status).toBe(404);
  });

  it('edits a usuario, allowing password reset without exposing the new hash', async () => {
    const datos = datosUsuario(`edit_${Date.now()}`);
    const createRes = await request(app).post('/api/v1/usuarios').set('Authorization', `Bearer ${token}`).send(datos);
    const id = createRes.body.data.id;

    const editRes = await request(app)
      .put(`/api/v1/usuarios/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ nombre: 'Ana Actualizada', password: 'NuevaClave123!', requiereCambioPassword: false });
    expect(editRes.status).toBe(200);
    expect(editRes.body.data.nombre).toBe('Ana Actualizada');
    expect(editRes.body.data.requiereCambioPassword).toBe(false);
    expect(editRes.body.data.passwordHash).toBeUndefined();

    const loginRes = await request(app).post('/api/v1/auth/login').send({ username: datos.username, password: 'NuevaClave123!' });
    expect(loginRes.status).toBe(200);
  });

  it('soft-deletes a usuario and excludes it from the list', async () => {
    const datos = datosUsuario(`del_${Date.now()}`);
    const createRes = await request(app).post('/api/v1/usuarios').set('Authorization', `Bearer ${token}`).send(datos);
    const id = createRes.body.data.id;

    const delRes = await request(app).delete(`/api/v1/usuarios/${id}`).set('Authorization', `Bearer ${token}`);
    expect(delRes.status).toBe(200);

    const listRes = await request(app).get('/api/v1/usuarios').set('Authorization', `Bearer ${token}`);
    expect(listRes.body.data.some((u) => u.id === id)).toBe(false);
  });

  it('returns 403 when a non-admin role without usuarios permission tries to create', async () => {
    const datos = datosUsuario(`403_${Date.now()}`);
    const res = await request(app).post('/api/v1/usuarios').set('Authorization', `Bearer ${solicitanteToken}`).send(datos);
    expect(res.status).toBe(403);
  });
});
