const { sequelize } = require('../../src/config/database');
const { createMigrator } = require('../../src/config/migrator');
const { Usuario, Rol, RolPermiso } = require('../../src/models');
const seedRolesPermisos = require('../../src/scripts/seedRolesPermisos');

beforeAll(async () => {
  await sequelize.authenticate();
  await createMigrator(sequelize).up();
});

afterAll(async () => {
  await sequelize.close();
});

describe('RBAC seed', () => {
  it('creates the 6 roles with correct hierarchy levels', async () => {
    await seedRolesPermisos();
    const roles = await Rol.findAll({ order: [['nivel', 'DESC']] });
    expect(roles.map((r) => r.nombre)).toEqual(['admin', 'financiera', 'lider_area', 'operaciones', 'solicitante', 'auditor']);
    expect(roles.map((r) => r.nivel)).toEqual([100, 80, 60, 50, 30, 20]);
  });

  it('is idempotent — running twice does not duplicate roles', async () => {
    await seedRolesPermisos();
    await seedRolesPermisos();
    const count = await Rol.count();
    expect(count).toBe(6);
  });

  it('grants admin the documentos.crear permission', async () => {
    await seedRolesPermisos();
    const admin = await Rol.findOne({ where: { nombre: 'admin' } });
    const permiso = await RolPermiso.findOne({ where: { rolId: admin.id, modulo: 'documentos' } });
    expect(permiso.acciones).toContain('crear');
  });

  it('creates a default admin user requiring password change', async () => {
    await seedRolesPermisos();
    const user = await Usuario.findOne({ where: { username: 'admin' } });
    expect(user).not.toBeNull();
    expect(user.requiereCambioPassword).toBe(true);
  });
});
