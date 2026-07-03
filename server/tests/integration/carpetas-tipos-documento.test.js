const { sequelize } = require('../../src/config/database');
const { createMigrator } = require('../../src/config/migrator');
const { Area, Carpeta, TipoDocumento } = require('../../src/models');
const seedTiposDocumento = require('../../src/scripts/seedTiposDocumento');

beforeAll(async () => {
  await sequelize.authenticate();
  await createMigrator(sequelize).up();
});

afterAll(async () => {
  await sequelize.close();
});

describe('Carpeta + TipoDocumento', () => {
  it('supports nested carpetas within an area', async () => {
    const uniqueCode = `SGI${Date.now()}`;
    const area = await Area.create({ nombre: 'SGI', codigo: uniqueCode });
    const raiz = await Carpeta.create({ areaId: area.id, nombre: 'Procesos' });
    const sub = await Carpeta.create({ areaId: area.id, nombre: 'Formatos', carpetaPadreId: raiz.id });
    expect(sub.carpetaPadreId).toBe(raiz.id);
  });

  it('seedTiposDocumento is idempotent and sets default alert windows', async () => {
    await seedTiposDocumento();
    await seedTiposDocumento();
    const count = await TipoDocumento.count();
    expect(count).toBe(7);
    const legal = await TipoDocumento.findOne({ where: { nombre: 'Legal' } });
    expect(legal.diasAlertaVencimientoDefault).toBe(15);
  });
});
