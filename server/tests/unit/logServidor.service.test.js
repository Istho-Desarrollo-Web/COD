const { sequelize } = require('../../src/config/database');
const { createMigrator } = require('../../src/config/migrator');
const { LogServidor } = require('../../src/models');
const { calcularNivelPorStatusCode, registrar } = require('../../src/services/logServidor.service');

beforeAll(async () => {
  await sequelize.authenticate();
  await createMigrator(sequelize).up();
});

afterAll(async () => {
  await sequelize.close();
});

describe('logServidor.service', () => {
  it('calcularNivelPorStatusCode clasifica info/warn/error según el status code', () => {
    expect(calcularNivelPorStatusCode(200)).toBe('info');
    expect(calcularNivelPorStatusCode(304)).toBe('info');
    expect(calcularNivelPorStatusCode(404)).toBe('warn');
    expect(calcularNivelPorStatusCode(409)).toBe('warn');
    expect(calcularNivelPorStatusCode(500)).toBe('error');
  });

  it('registrar crea una fila en LogServidor con los campos dados', async () => {
    const fila = await registrar({
      nivel: 'info',
      metodo: 'GET',
      ruta: '/api/v1/health-test',
      statusCode: 200,
      duracionMs: 12,
      mensaje: 'GET /api/v1/health-test → 200',
      usuarioId: null,
      usuarioNombre: null,
      ip: '127.0.0.1',
    });
    expect(fila).not.toBeNull();
    expect(fila.nivel).toBe('info');
    expect(fila.ruta).toBe('/api/v1/health-test');

    const recargada = await LogServidor.findByPk(fila.id);
    expect(recargada.mensaje).toBe('GET /api/v1/health-test → 200');
  });

  it('registrar no lanza y devuelve null si faltan campos obligatorios (nivel/mensaje)', async () => {
    const resultado = await registrar({ metodo: 'GET' });
    expect(resultado).toBeNull();
  });
});
