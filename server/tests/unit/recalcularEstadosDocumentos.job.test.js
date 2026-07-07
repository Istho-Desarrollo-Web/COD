const { sequelize } = require('../../src/config/database');
const { createMigrator } = require('../../src/config/migrator');
const { Area, Carpeta, TipoDocumento, Documento } = require('../../src/models');
const { ejecutar } = require('../../src/jobs/recalcularEstadosDocumentos.job');

function fechaEnDias(dias) {
  return new Date(Date.now() + dias * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

let area;
let carpeta;
let tipoDocumento;

beforeAll(async () => {
  await sequelize.authenticate();
  await createMigrator(sequelize).up();
  area = await Area.create({ nombre: 'Job Prueba', codigo: `JOB${Date.now()}` });
  carpeta = await Carpeta.create({ areaId: area.id, nombre: 'Raíz' });
  [tipoDocumento] = await TipoDocumento.findOrCreate({
    where: { nombre: 'Procedimiento' },
    defaults: { diasAlertaVencimientoDefault: 30 },
  });
});

afterAll(async () => {
  await sequelize.close();
});

describe('recalcularEstadosDocumentos.job', () => {
  it('flips a document from vigente to vencido when its vigencia already passed, and recalculates area health', async () => {
    const documento = await Documento.create({
      areaId: area.id,
      carpetaId: carpeta.id,
      tipoDocumentoId: tipoDocumento.id,
      nombre: 'Documento vencido silenciosamente',
      vigenciaDesde: fechaEnDias(-100),
      vigenciaHasta: fechaEnDias(-1),
      estado: 'vigente',
    });

    const resultado = await ejecutar();

    await documento.reload();
    expect(documento.estado).toBe('vencido');
    expect(resultado.documentosActualizados).toBeGreaterThanOrEqual(1);

    await area.reload();
    expect(Number(area.saludDocumentalPct)).toBeLessThan(100);
  });

  it('leaves an already-correct estado untouched', async () => {
    const documento = await Documento.create({
      areaId: area.id,
      carpetaId: carpeta.id,
      tipoDocumentoId: tipoDocumento.id,
      nombre: 'Documento ya vigente',
      vigenciaDesde: fechaEnDias(-10),
      vigenciaHasta: fechaEnDias(365),
      estado: 'vigente',
    });

    await ejecutar();

    await documento.reload();
    expect(documento.estado).toBe('vigente');
  });
});
