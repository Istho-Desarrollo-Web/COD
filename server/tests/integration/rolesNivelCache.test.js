const { sequelize } = require('../../src/config/database');
const { createMigrator } = require('../../src/config/migrator');
const { Rol } = require('../../src/models');
const seedRolesPermisos = require('../../src/scripts/seedRolesPermisos');
const { ROLES_NIVEL, invalidarRolesNivelCache } = require('../../src/middlewares/rolesNivelCache');

beforeAll(async () => {
  await sequelize.authenticate();
  await createMigrator(sequelize).up();
  await seedRolesPermisos();
});

afterAll(async () => {
  await sequelize.close();
});

describe('rolesNivelCache invalidation', () => {
  let originalNivel;

  afterEach(async () => {
    if (originalNivel !== undefined) {
      await Rol.update({ nivel: originalNivel }, { where: { nombre: 'auditor' } });
      invalidarRolesNivelCache();
      originalNivel = undefined;
    }
  });

  it('reflects an updated role level after invalidarRolesNivelCache() is called', async () => {
    const antes = await ROLES_NIVEL();
    originalNivel = antes.auditor;
    expect(originalNivel).toBe(20);

    await Rol.update({ nivel: 25 }, { where: { nombre: 'auditor' } });

    // Without invalidation, the cached value should still be stale.
    const staleStill = await ROLES_NIVEL();
    expect(staleStill.auditor).toBe(20);

    invalidarRolesNivelCache();

    const despues = await ROLES_NIVEL();
    expect(despues.auditor).toBe(25);
  });
});
