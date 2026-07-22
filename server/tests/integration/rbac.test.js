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

// La BD de test es compartida y persistente entre archivos: los roles viejos
// (admin, financiera, ...) que la migración de roles funcionales desactiva
// pueden seguir presentes con activo:false. Por eso estas pruebas filtran
// siempre por activo:true en vez de usar conteos absolutos de la tabla.
describe('RBAC seed', () => {
  it('creates the 8 functional roles with correct hierarchy levels', async () => {
    await seedRolesPermisos();
    const roles = await Rol.findAll({ where: { activo: true }, order: [['nivel', 'DESC']] });
    expect(roles.map((r) => r.nombre)).toEqual([
      'super_administrador',
      'aprobador_ejecutivo',
      'aprobador_area',
      'gestor_compras',
      'gestor_documental',
      'solicitante',
      'auditor',
      'colaborador',
    ]);
    expect(roles.map((r) => r.nivel)).toEqual([100, 90, 70, 50, 40, 30, 20, 10]);
  });

  it('is idempotent — running twice does not duplicate the active roles', async () => {
    await seedRolesPermisos();
    await seedRolesPermisos();
    const count = await Rol.count({ where: { activo: true } });
    expect(count).toBe(8);
  });

  it('grants super_administrador the documentos.crear permission', async () => {
    await seedRolesPermisos();
    const superAdmin = await Rol.findOne({ where: { nombre: 'super_administrador' } });
    const permiso = await RolPermiso.findOne({ where: { rolId: superAdmin.id, modulo: 'documentos' } });
    expect(permiso.acciones).toContain('crear');
  });

  it('creates a default admin user requiring password change', async () => {
    await seedRolesPermisos();
    const user = await Usuario.findOne({ where: { username: 'admin' } });
    expect(user).not.toBeNull();
    expect(user.requiereCambioPassword).toBe(true);
  });
});
