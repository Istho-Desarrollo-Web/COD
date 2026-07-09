const { sequelize } = require('../../src/config/database');
const { createMigrator } = require('../../src/config/migrator');
const { Proveedor, RequisitoProveedor, ProveedorDocumento, EvaluacionProveedor, Area, TipoDocumento, Carpeta } = require('../../src/models');
const seedRequisitosProveedor = require('../../src/scripts/seedRequisitosProveedor');

beforeAll(async () => {
  await sequelize.authenticate();
  await createMigrator(sequelize).up();
});

afterAll(async () => {
  await sequelize.close();
});

describe('Proveedor domain', () => {
  it('seedRequisitosProveedor is idempotent and includes SARLAFT as alta criticidad', async () => {
    await seedRequisitosProveedor();
    await seedRequisitosProveedor();
    const count = await RequisitoProveedor.count();
    expect(count).toBe(5);
    const sarlaft = await RequisitoProveedor.findOne({ where: { nombre: 'Certificado SARLAFT' } });
    expect(sarlaft.criticidadMinima).toBe('alta');
    expect(sarlaft.vigenciaAplica).toBe(true);
  });

  it('links Proveedor -> ProveedorDocumento -> RequisitoProveedor and -> EvaluacionProveedor', async () => {
    const requisito = await RequisitoProveedor.findOne({ where: { nombre: 'RUT' } });
    const proveedor = await Proveedor.create({
      tipo: 'proveedor', documentoIdentificacion: `900123456-7${Date.now()}`, razonSocial: 'Transportes ABC SAS',
      criticidad: 'media', categoria: 'transporte', estado: 'activo',
    });
    const documento = await ProveedorDocumento.create({
      proveedorId: proveedor.id, requisitoId: requisito.id, s3Key: 'documentos/prov-1/rut.pdf', estado: 'vigente',
    });
    const evaluacion = await EvaluacionProveedor.create({
      proveedorId: proveedor.id, periodo: 2026, fechaProgramada: '2026-12-01', estado: 'pendiente',
    });

    expect(documento.proveedorId).toBe(proveedor.id);
    expect(evaluacion.proveedorId).toBe(proveedor.id);
  });
});

describe('Columnas de aprobación (areaSolicitanteId, tipoDocumentoId, proveedorId)', () => {
  it('Proveedor.areaSolicitanteId referencia un Area', async () => {
    const area = await Area.create({ nombre: 'Compras', codigo: `COMPRAS${Date.now()}` });
    const proveedor = await Proveedor.create({
      tipo: 'proveedor', documentoIdentificacion: `920${Date.now()}`, razonSocial: 'Con Área SAS',
      areaSolicitanteId: area.id,
    });
    expect(proveedor.areaSolicitanteId).toBe(area.id);
  });

  it('RequisitoProveedor.tipoDocumentoId referencia un TipoDocumento', async () => {
    const tipoDocumento = await TipoDocumento.create({ nombre: `Tipo Prueba ${Date.now()}` });
    const requisito = await RequisitoProveedor.findOne({ where: { nombre: 'RUT' } });
    await requisito.update({ tipoDocumentoId: tipoDocumento.id });
    const recargado = await RequisitoProveedor.findByPk(requisito.id);
    expect(recargado.tipoDocumentoId).toBe(tipoDocumento.id);
  });

  it('Carpeta.proveedorId referencia un Proveedor, y es opcional para carpetas normales', async () => {
    const area = await Area.create({ nombre: 'Compras 2', codigo: `COMPRAS2${Date.now()}` });
    const proveedor = await Proveedor.create({
      tipo: 'proveedor', documentoIdentificacion: `921${Date.now()}`, razonSocial: 'Con Carpeta SAS', areaSolicitanteId: area.id,
    });
    const carpetaNormal = await Carpeta.create({ areaId: area.id, nombre: 'Procesos' });
    const carpetaDeProveedor = await Carpeta.create({ areaId: area.id, nombre: proveedor.razonSocial, proveedorId: proveedor.id });

    expect(carpetaNormal.proveedorId).toBeNull();
    expect(carpetaDeProveedor.proveedorId).toBe(proveedor.id);
  });
});
