const { sequelize } = require('../../src/config/database');
const { createMigrator } = require('../../src/config/migrator');
const { Area, PlantillaFormulario } = require('../../src/models');

beforeAll(async () => {
  await sequelize.authenticate();
  await createMigrator(sequelize).up();
});

afterAll(async () => {
  await sequelize.close();
});

describe('PlantillaFormulario', () => {
  it('enforces a unique codigo', async () => {
    const uniqueCode = `CAL${Date.now()}`;
    const area = await Area.create({ nombre: 'Calidad', codigo: uniqueCode });
    const templateCode = `GC-FT-04${Date.now()}`;
    await PlantillaFormulario.create({ codigo: templateCode, nombre: 'Solicitud de compra', areaId: area.id, version: 'v1' });
    await expect(
      PlantillaFormulario.create({ codigo: templateCode, nombre: 'Duplicada', areaId: area.id, version: 'v1' })
    ).rejects.toThrow();
  });
});
