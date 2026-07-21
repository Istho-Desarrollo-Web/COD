const { sequelize } = require('../../src/config/database');
const { createMigrator } = require('../../src/config/migrator');
const { LogServidor } = require('../../src/models');
const { purgar } = require('../../src/jobs/logServidor.job');

function fechaHaceDias(dias) {
  return new Date(Date.now() - dias * 24 * 60 * 60 * 1000);
}

beforeAll(async () => {
  await sequelize.authenticate();
  await createMigrator(sequelize).up();
});

afterAll(async () => {
  await sequelize.close();
});

describe('logServidor.job', () => {
  it('borra filas de más de 14 días y conserva las más recientes', async () => {
    const vieja = await LogServidor.create({ nivel: 'info', mensaje: 'Fila vieja de prueba' });
    await sequelize.query(
      'UPDATE logs_servidor SET created_at = ? WHERE id = ?',
      { replacements: [fechaHaceDias(20), vieja.id] }
    );

    const reciente = await LogServidor.create({ nivel: 'info', mensaje: 'Fila reciente de prueba' });
    await sequelize.query(
      'UPDATE logs_servidor SET created_at = ? WHERE id = ?',
      { replacements: [fechaHaceDias(1), reciente.id] }
    );

    const resultado = await purgar();
    expect(resultado.eliminados).toBeGreaterThanOrEqual(1);

    const viejaExiste = await LogServidor.findByPk(vieja.id);
    expect(viejaExiste).toBeNull();

    const recienteExiste = await LogServidor.findByPk(reciente.id);
    expect(recienteExiste).not.toBeNull();
  });
});
