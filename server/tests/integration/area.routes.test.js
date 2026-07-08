const request = require('supertest');
const bcrypt = require('bcryptjs');
const { sequelize } = require('../../src/config/database');
const { createMigrator } = require('../../src/config/migrator');
const seedRolesPermisos = require('../../src/scripts/seedRolesPermisos');
const { RolPermiso, Usuario, Rol, Area } = require('../../src/models');
const { invalidarCachePermisos } = require('../../src/middlewares/roles');
const { app } = require('../../server');

let token;
let solicitanteToken;

beforeAll(async () => {
  await sequelize.authenticate();
  await createMigrator(sequelize).up();
  await seedRolesPermisos();
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ username: 'admin', password: process.env.SEED_PASSWORD_ADMIN || 'CambiarAhora123!' });
  token = res.body.data.token;

  const solicitanteRol = await Rol.findOne({ where: { nombre: 'solicitante' } });
  const solicitanteUsername = `solicitante_test_${Date.now()}`;
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

  it('returns 403 when a non-admin role with areas.ver tries to create an area', async () => {
    const res = await request(app)
      .post('/api/v1/areas')
      .set('Authorization', `Bearer ${solicitanteToken}`)
      .send({ nombre: 'No debería crearse', codigo: `NOPE${Date.now()}` });
    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  it('returns 500 (not a hang) when the permission cache refill rejects (simulated DB blip)', async () => {
    invalidarCachePermisos();
    const spy = jest.spyOn(RolPermiso, 'findAll').mockRejectedValueOnce(new Error('conexión perdida con la base de datos'));

    const res = await request(app).get('/api/v1/areas').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);

    spy.mockRestore();
    invalidarCachePermisos();
  });

  it('creates an area together with a new lider usuario in one transaction', async () => {
    const liderRol = await Rol.findOne({ where: { nombre: 'lider_area' } });
    const sufijo = Date.now();
    const nuevoUsuario = {
      username: `lider_${sufijo}`,
      email: `lider_${sufijo}@istho.com.co`,
      nombre: 'Carlos',
      apellido: 'Ruiz',
      password: 'ClaveLider123!',
      rolId: liderRol.id,
    };

    const res = await request(app)
      .post('/api/v1/areas')
      .set('Authorization', `Bearer ${token}`)
      .send({ nombre: 'RRHH', codigo: `RRHH${sufijo}`, nuevoUsuario });
    expect(res.status).toBe(201);

    const usuarioCreado = await Usuario.findOne({ where: { username: nuevoUsuario.username } });
    expect(usuarioCreado).not.toBeNull();
    expect(res.body.data.liderUsuarioId).toBe(usuarioCreado.id);
  });

  it('rolls back both the area and the usuario when nuevoUsuario has a duplicate username', async () => {
    const liderRol = await Rol.findOne({ where: { nombre: 'lider_area' } });
    const sufijo = Date.now();
    const usernameDuplicado = `duplicado_${sufijo}`;
    await Usuario.create({
      username: usernameDuplicado,
      email: `existente_${sufijo}@istho.com.co`,
      passwordHash: await bcrypt.hash('ClaveExistente123!', 10),
      nombre: 'Ya',
      apellido: 'Existe',
      rolId: liderRol.id,
    });

    const codigoIntento = `ROLLBACK${sufijo}`;
    const res = await request(app)
      .post('/api/v1/areas')
      .set('Authorization', `Bearer ${token}`)
      .send({
        nombre: 'No debería crearse',
        codigo: codigoIntento,
        nuevoUsuario: {
          username: usernameDuplicado,
          email: `nuevo_${sufijo}@istho.com.co`,
          nombre: 'Otro',
          apellido: 'Usuario',
          password: 'ClaveNueva123!',
          rolId: liderRol.id,
        },
      });
    expect(res.status).toBe(409);

    const areaCreada = await Area.findOne({ where: { codigo: codigoIntento } });
    expect(areaCreada).toBeNull();
  });

  it('creates an area with an existing usuario as líder (no nuevoUsuario)', async () => {
    const liderRol = await Rol.findOne({ where: { nombre: 'lider_area' } });
    const sufijo = Date.now();
    const usuarioExistente = await Usuario.create({
      username: `existente_lider_${sufijo}`,
      email: `existente_lider_${sufijo}@istho.com.co`,
      passwordHash: await bcrypt.hash('ClaveExistente123!', 10),
      nombre: 'Lider',
      apellido: 'Existente',
      rolId: liderRol.id,
    });

    const res = await request(app)
      .post('/api/v1/areas')
      .set('Authorization', `Bearer ${token}`)
      .send({ nombre: 'Financiera 2', codigo: `FIN2_${sufijo}`, liderUsuarioId: usuarioExistente.id });
    expect(res.status).toBe(201);
    expect(res.body.data.liderUsuarioId).toBe(usuarioExistente.id);
  });

  it('returns 400 when both liderUsuarioId and nuevoUsuario are sent', async () => {
    const liderRol = await Rol.findOne({ where: { nombre: 'lider_area' } });
    const sufijo = Date.now();
    const res = await request(app)
      .post('/api/v1/areas')
      .set('Authorization', `Bearer ${token}`)
      .send({
        nombre: 'Área inválida',
        codigo: `AMBOS${sufijo}`,
        liderUsuarioId: 1,
        nuevoUsuario: {
          username: `ambos_${sufijo}`,
          email: `ambos_${sufijo}@istho.com.co`,
          nombre: 'X',
          apellido: 'Y',
          password: 'Clave123!',
          rolId: liderRol.id,
        },
      });
    expect(res.status).toBe(400);
  });
});
