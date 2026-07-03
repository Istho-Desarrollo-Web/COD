const { sequelize } = require('../../src/config/database');
const { createMigrator } = require('../../src/config/migrator');
const { Proveedor, RequisitoProveedor, ProveedorDocumento, EvaluacionProveedor } = require('../../src/models');
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
