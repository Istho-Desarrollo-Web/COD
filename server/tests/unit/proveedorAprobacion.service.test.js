const path = require('path');
const fs = require('fs');
const { sequelize } = require('../../src/config/database');
const { createMigrator } = require('../../src/config/migrator');
const { Area, Proveedor, ProveedorDocumento, RequisitoProveedor, Carpeta, Documento } = require('../../src/models');
const seedTiposDocumento = require('../../src/scripts/seedTiposDocumento');
const seedRequisitosProveedor = require('../../src/scripts/seedRequisitosProveedor');
const { guardarArchivo } = require('../../src/services/almacenamiento.service');
const { aprobarProveedor } = require('../../src/services/proveedorAprobacion.service');

let area;
let requisitoRut;

beforeAll(async () => {
  await sequelize.authenticate();
  await createMigrator(sequelize).up();
  await seedTiposDocumento();
  await seedRequisitosProveedor();
  area = await Area.create({ nombre: 'Aprobación Servicio', codigo: `APRSERV${Date.now()}` });
  requisitoRut = await RequisitoProveedor.findOne({ where: { nombre: 'RUT' } });
});

afterAll(async () => {
  await sequelize.close();
});

async function crearProveedorConDocumento({ conRequisito = true } = {}) {
  const proveedor = await Proveedor.create({
    tipo: 'proveedor', documentoIdentificacion: `930${Date.now()}${Math.random()}`, razonSocial: `Aprobado ${Date.now()}`,
    areaSolicitanteId: area.id,
  });
  const { ruta } = guardarArchivo(
    { originalname: 'rut-original.pdf', buffer: Buffer.from('contenido de prueba') },
    `proveedores/${proveedor.id}`
  );
  await ProveedorDocumento.create({
    proveedorId: proveedor.id,
    requisitoId: conRequisito ? requisitoRut.id : null,
    s3Key: ruta,
    vigenciaHasta: '2099-01-01',
    estado: 'vigente',
  });
  return proveedor;
}

describe('proveedorAprobacion.service', () => {
  it('crea la carpeta raíz "Proveedores" y una subcarpeta con el nombre del proveedor', async () => {
    const proveedor = await crearProveedorConDocumento();
    const { carpeta } = await aprobarProveedor(proveedor);

    expect(carpeta.nombre).toBe(proveedor.razonSocial);
    expect(carpeta.proveedorId).toBe(proveedor.id);

    const raiz = await Carpeta.findByPk(carpeta.carpetaPadreId);
    expect(raiz.nombre).toBe('Proveedores');
    expect(raiz.areaId).toBe(area.id);
    expect(raiz.proveedorId).toBeNull();
  });

  it('refleja cada ProveedorDocumento como un Documento en la subcarpeta, usando el tipoDocumento del requisito', async () => {
    const proveedor = await crearProveedorConDocumento({ conRequisito: true });
    const { carpeta, documentosReflejados } = await aprobarProveedor(proveedor);

    expect(documentosReflejados).toBe(1);
    const documentos = await Documento.findAll({ where: { carpetaId: carpeta.id } });
    expect(documentos).toHaveLength(1);
    expect(documentos[0].nombre).toBe('RUT');
    expect(documentos[0].areaId).toBe(area.id);

    const tipoDocumento = await require('../../src/models').TipoDocumento.findByPk(documentos[0].tipoDocumentoId);
    expect(tipoDocumento.nombre).toBe('RUT');
  });

  it('usa el TipoDocumento genérico cuando el ProveedorDocumento no tiene requisito asociado', async () => {
    const proveedor = await crearProveedorConDocumento({ conRequisito: false });
    const { carpeta } = await aprobarProveedor(proveedor);

    const documentos = await Documento.findAll({ where: { carpetaId: carpeta.id } });
    expect(documentos[0].nombre).toBe('Documento de proveedor');
    const tipoDocumento = await require('../../src/models').TipoDocumento.findByPk(documentos[0].tipoDocumentoId);
    expect(tipoDocumento.nombre).toBe('Documento de proveedor');
  });

  it('deja al proveedor en estado activo', async () => {
    const proveedor = await crearProveedorConDocumento();
    await aprobarProveedor(proveedor);
    const recargado = await Proveedor.findByPk(proveedor.id);
    expect(recargado.estado).toBe('activo');
  });

  it('no duplica la carpeta raíz "Proveedores" al aprobar un segundo proveedor de la misma área', async () => {
    const proveedor1 = await crearProveedorConDocumento();
    const proveedor2 = await crearProveedorConDocumento();
    await aprobarProveedor(proveedor1);
    await aprobarProveedor(proveedor2);

    const raices = await Carpeta.findAll({ where: { areaId: area.id, nombre: 'Proveedores', carpetaPadreId: null } });
    expect(raices).toHaveLength(1);
  });
});
