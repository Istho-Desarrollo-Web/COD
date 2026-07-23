const { sequelize } = require('../../src/config/database');
const { createMigrator } = require('../../src/config/migrator');
const migracion = require('../../src/migrations/20260723140000-crear-evaluaciones-proveedor');

beforeAll(async () => {
  await sequelize.authenticate();
  await createMigrator(sequelize).up();
});

afterAll(async () => {
  await sequelize.close();
});

describe('20260723140000-crear-evaluaciones-proveedor migration', () => {
  it('es idempotente: no falla si se ejecuta de nuevo contra una base donde la tabla ya existe', async () => {
    const queryInterface = sequelize.getQueryInterface();
    const tablas = await queryInterface.showAllTables();
    expect(tablas).toContain('evaluaciones_proveedor');

    await expect(migracion.up({ context: queryInterface })).resolves.not.toThrow();
  });
});
