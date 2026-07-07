const { calcularSaludDocumental, recalcularSaludArea } = require('../../src/services/area.service');
const { sequelize } = require('../../src/config/database');
const { createMigrator } = require('../../src/config/migrator');
const { Area, Carpeta, TipoDocumento, Documento } = require('../../src/models');

describe('calcularSaludDocumental', () => {
  it('returns 100 when there are no documents', () => {
    expect(calcularSaludDocumental({ vigentes: 0, porVencer: 0, vencidos: 0 })).toBe(100);
  });

  it('computes the percentage of vigentes over the total', () => {
    expect(calcularSaludDocumental({ vigentes: 3, porVencer: 1, vencidos: 1 })).toBe(60);
  });

  it('rounds to 1 decimal', () => {
    expect(calcularSaludDocumental({ vigentes: 1, porVencer: 1, vencidos: 1 })).toBe(33.3);
  });
});

describe('recalcularSaludArea', () => {
  let area;
  let carpeta;
  let tipoDocumento;

  beforeAll(async () => {
    await sequelize.authenticate();
    await createMigrator(sequelize).up();
    area = await Area.create({ nombre: 'Salud Area Prueba', codigo: `SALUD${Date.now()}` });
    carpeta = await Carpeta.create({ areaId: area.id, nombre: 'Raíz' });
    [tipoDocumento] = await TipoDocumento.findOrCreate({
      where: { nombre: 'Procedimiento' },
      defaults: { diasAlertaVencimientoDefault: 30 },
    });
  });

  afterAll(async () => {
    await sequelize.close();
  });

  it('excludes soft-deleted (activo: false) documentos from the health calculation', async () => {
    const vigente = await Documento.create({
      areaId: area.id,
      carpetaId: carpeta.id,
      tipoDocumentoId: tipoDocumento.id,
      nombre: 'Vigente para salud',
      estado: 'vigente',
    });
    const vencido = await Documento.create({
      areaId: area.id,
      carpetaId: carpeta.id,
      tipoDocumentoId: tipoDocumento.id,
      nombre: 'Vencido para salud',
      estado: 'vencido',
    });

    const pctInicial = await recalcularSaludArea(area.id);
    expect(pctInicial).toBe(50);

    await vencido.update({ activo: false });
    const pctTrasEliminar = await recalcularSaludArea(area.id);
    expect(pctTrasEliminar).toBe(100);

    // sanity check: the still-active vigente documento remains counted
    await vigente.reload();
    expect(vigente.activo).toBe(true);
  });
});
