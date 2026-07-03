const { sequelize } = require('../../src/config/database');
const { createMigrator } = require('../../src/config/migrator');
const { Area, Carpeta, TipoDocumento, Documento } = require('../../src/models');
const { subirNuevaVersion } = require('../../src/services/documento.service');
const seedTiposDocumento = require('../../src/scripts/seedTiposDocumento');

let area;
let carpeta;
let tipo;

beforeAll(async () => {
  await sequelize.authenticate();
  await createMigrator(sequelize).up();
  // Reuse the seeded catalog instead of creating a new TipoDocumento row:
  // tipos_documento is a fixed reference table, and carpetas-tipos-documento.test.js
  // asserts an exact global count against it, so ad-hoc rows here would
  // accumulate across test reruns (real MySQL, no per-run reset) and break that test.
  await seedTiposDocumento();
  const uniqueCode = `SGI2${Date.now()}`;
  area = await Area.create({ nombre: 'SGI', codigo: uniqueCode });
  carpeta = await Carpeta.create({ areaId: area.id, nombre: 'Procesos' });
  tipo = await TipoDocumento.findOne({ where: { nombre: 'Procedimiento' } });
});

afterAll(async () => {
  await sequelize.close();
});

describe('Documento + DocumentoVersionHistorial', () => {
  it('archives the previous version and recalculates area health on a new upload', async () => {
    const documento = await Documento.create({
      areaId: area.id, carpetaId: carpeta.id, tipoDocumentoId: tipo.id,
      nombre: 'Procedimiento de compras', version: 'v1', s3Key: 'documentos/1/v1.pdf',
      vigenciaDesde: '2026-01-01', vigenciaHasta: '2026-12-31', estado: 'vigente',
    });

    await subirNuevaVersion(documento.id, {
      version: 'v2', s3Key: 'documentos/1/v2.pdf', vigenciaDesde: '2026-07-01', vigenciaHasta: '2026-07-10',
    });

    const actualizado = await Documento.findByPk(documento.id);
    expect(actualizado.version).toBe('v2');
    expect(actualizado.estado).toBe('por_vencer');

    const historial = await require('../../src/models').DocumentoVersionHistorial.findAll({ where: { documentoId: documento.id } });
    expect(historial).toHaveLength(1);
    expect(historial[0].version).toBe('v1');

    // The document ends up in 'por_vencer' state (asserted above), and
    // calcularSaludDocumental (task 7) only counts 'vigente' documents as
    // healthy, so with the area's single document no longer vigente, area
    // health drops from its 100 default to 0.
    const areaActualizada = await Area.findByPk(area.id);
    expect(Number(areaActualizada.saludDocumentalPct)).toBe(0);
  });
});
