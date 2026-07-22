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
    expect(res.body.data.some((r) => r.nombre === 'gestor_documental')).toBe(true);
    expect(res.body.data.some((r) => r.nombre === 'super_administrador')).toBe(true);
  });

  it('returns 401 without a token', async () => {
    const res = await request(app).get('/api/v1/roles');
    expect(res.status).toBe(401);
  });
});

describe('Matriz de accesos API', () => {
  it('returns roles, modulos catalog, and permisos for the matriz de accesos panel', async () => {
    const res = await request(app).get('/api/v1/roles/matriz-accesos').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);

    expect(res.body.data.roles.some((r) => r.nombre === 'super_administrador')).toBe(true);
    expect(res.body.data.modulos.proveedores).toEqual(['ver', 'gestionar', 'aprobar', 'eliminar', 'evaluar', 'exportar']);

    const superAdminRol = res.body.data.roles.find((r) => r.nombre === 'super_administrador');
    const permisoProveedores = res.body.data.permisos.find((p) => p.rolId === superAdminRol.id && p.modulo === 'proveedores');
    expect(Array.isArray(permisoProveedores.acciones)).toBe(true);
    expect(permisoProveedores.acciones).toContain('gestionar');
  });

  it('returns 403 for a role without matriz_accesos:ver', async () => {
    const { Rol, Usuario } = require('../../src/models');
    const bcrypt = require('bcryptjs');
    const gestorDocumentalRol = await Rol.findOne({ where: { nombre: 'gestor_documental' } });
    const username = `gestor_doc_matriz_${Date.now()}`;
    const usuario = await Usuario.create({
      username, email: `${username}@istho.com.co`, passwordHash: await bcrypt.hash('ClaveGestorDoc123!', 10),
      nombre: 'Gestor', apellido: 'Documental',
    });
    await usuario.setRoles([gestorDocumentalRol.id]);
    const login = await request(app).post('/api/v1/auth/login').send({ username, password: 'ClaveGestorDoc123!' });
    const gestorToken = login.body.data.token;

    const res = await request(app).get('/api/v1/roles/matriz-accesos').set('Authorization', `Bearer ${gestorToken}`);
    expect(res.status).toBe(403);
  });

  it('returns 401 without a token', async () => {
    const res = await request(app).get('/api/v1/roles/matriz-accesos');
    expect(res.status).toBe(401);
  });
});
