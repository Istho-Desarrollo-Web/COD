const { sequelize } = require('../../src/config/database');
const { createMigrator } = require('../../src/config/migrator');
const { Proveedor, RequisitoProveedor, ProveedorDocumento, EvaluacionProveedor, Area, TipoDocumento, Carpeta, Usuario } = require('../../src/models');
const seedRequisitosProveedor = require('../../src/scripts/seedRequisitosProveedor');
const seedTiposDocumento = require('../../src/scripts/seedTiposDocumento');

beforeAll(async () => {
  await sequelize.authenticate();
  await createMigrator(sequelize).up();
});

afterAll(async () => {
  await sequelize.close();
});

describe('Proveedor domain', () => {
  it('seedRequisitosProveedor is idempotent and includes SARLAFT as critico criticidad', async () => {
    await seedRequisitosProveedor();
    await seedRequisitosProveedor();
    const count = await RequisitoProveedor.count();
    expect(count).toBe(5);
    const sarlaft = await RequisitoProveedor.findOne({ where: { nombre: 'Certificado SARLAFT' } });
    expect(sarlaft.criticidadMinima).toBe('critico');
    expect(sarlaft.vigenciaAplica).toBe(true);
  });

  it('seedRequisitosProveedor maps each requisito to a TipoDocumento of the same name', async () => {
    await seedTiposDocumento();
    await seedRequisitosProveedor();

    const rut = await RequisitoProveedor.findOne({ where: { nombre: 'RUT' } });
    const tipoRut = await TipoDocumento.findByPk(rut.tipoDocumentoId);
    expect(tipoRut.nombre).toBe('RUT');

    const sarlaft = await RequisitoProveedor.findOne({ where: { nombre: 'Certificado SARLAFT' } });
    const tipoSarlaft = await TipoDocumento.findByPk(sarlaft.tipoDocumentoId);
    expect(tipoSarlaft.nombre).toBe('Certificado SARLAFT');

    const generico = await TipoDocumento.findOne({ where: { nombre: 'Documento de proveedor' } });
    expect(generico).not.toBeNull();
  });

  it('links Proveedor -> ProveedorDocumento -> RequisitoProveedor and -> EvaluacionProveedor', async () => {
    const requisito = await RequisitoProveedor.findOne({ where: { nombre: 'RUT' } });
    const proveedor = await Proveedor.create({
      tipo: 'proveedor', documentoIdentificacion: `900123456-7${Date.now()}`, razonSocial: 'Transportes ABC SAS',
      criticidad: 'relevante', categoria: 'transporte', estado: 'activo',
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

    // Limpieza: la base de test es persistente entre archivos, así que hay que
    // restaurar el estado original del seed y borrar el registro creado en este test
    // para no romper los conteos exactos de otros archivos de test.
    await requisito.update({ tipoDocumentoId: null });
    await tipoDocumento.destroy();
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

describe('Cuenta externa Colaborador<->Proveedor (usuario_proveedores)', () => {
  it('links Usuario <-> Proveedor via usuario_proveedores, en ambos sentidos', async () => {
    const area = await Area.create({ nombre: 'Cuenta Externa', codigo: `CTAEXT${Date.now()}` });
    const proveedor = await Proveedor.create({
      tipo: 'proveedor', documentoIdentificacion: `960${Date.now()}`, razonSocial: 'Externo SAS', areaSolicitanteId: area.id,
    });
    const username = `colaborador_externo_${Date.now()}`;
    const usuario = await Usuario.create({
      username, email: `${username}@istho.com.co`, passwordHash: 'hash-de-prueba',
      nombre: 'Colaborador', apellido: 'Externo',
    });

    await usuario.addProveedoresRepresentados(proveedor);

    const usuarioConProveedores = await Usuario.findByPk(usuario.id, { include: [{ association: 'proveedoresRepresentados' }] });
    expect(usuarioConProveedores.proveedoresRepresentados).toHaveLength(1);
    expect(usuarioConProveedores.proveedoresRepresentados[0].id).toBe(proveedor.id);

    const proveedorConColaboradores = await Proveedor.findByPk(proveedor.id, { include: [{ association: 'colaboradoresExternos' }] });
    expect(proveedorConColaboradores.colaboradoresExternos).toHaveLength(1);
    expect(proveedorConColaboradores.colaboradoresExternos[0].id).toBe(usuario.id);
  });
});
