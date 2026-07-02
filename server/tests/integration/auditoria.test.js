const { sequelize } = require('../../src/config/database');
const { createMigrator } = require('../../src/config/migrator');
const { Auditoria } = require('../../src/models');

beforeAll(async () => {
  await sequelize.authenticate();
  await createMigrator(sequelize).up();
});

afterEach(async () => {
  await Auditoria.destroy({ where: {}, truncate: true });
});

afterAll(async () => {
  await sequelize.close();
});

describe('Auditoria.registrar', () => {
  it('persists a row with the given fields', async () => {
    const row = await Auditoria.registrar({
      tabla: 'areas',
      registroId: 1,
      accion: 'crear',
      usuarioId: 1,
      usuarioNombre: 'Admin COD',
      datosNuevos: { nombre: 'Financiera' },
    });
    expect(row).not.toBeNull();
    const found = await Auditoria.findByPk(row.id);
    expect(found.tabla).toBe('areas');
    expect(found.datosNuevos).toEqual({ nombre: 'Financiera' });
  });

  it('returns null instead of throwing when required fields are missing', async () => {
    const row = await Auditoria.registrar({ accion: 'crear' });
    expect(row).toBeNull();
  });
});
