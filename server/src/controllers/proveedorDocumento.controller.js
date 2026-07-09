const { Proveedor, ProveedorDocumento, RequisitoProveedor, Auditoria } = require('../models');
const { success, created, notFound, badRequest } = require('../utils/responses');
const { calcularEstadoProveedorDocumento } = require('../services/proveedorDocumento.service');
const { guardarArchivo, obtenerRutaAbsoluta, eliminarArchivo } = require('../services/almacenamiento.service');

async function listar(req, res) {
  const proveedor = await Proveedor.findByPk(req.params.id);
  if (!proveedor) return notFound(res, 'Proveedor no encontrado');

  const documentos = await ProveedorDocumento.findAll({
    where: { proveedorId: proveedor.id },
    include: [{ model: RequisitoProveedor }],
    order: [['createdAt', 'DESC']],
  });
  return success(res, documentos);
}

async function crear(req, res) {
  const proveedor = await Proveedor.findByPk(req.params.id);
  if (!proveedor) return notFound(res, 'Proveedor no encontrado');
  if (!req.file) return badRequest(res, 'El archivo es obligatorio');

  const { requisitoId, vigenciaDesde, vigenciaHasta } = req.body;
  if (vigenciaDesde && vigenciaHasta && new Date(vigenciaHasta) <= new Date(vigenciaDesde)) {
    return badRequest(res, 'vigenciaHasta debe ser posterior a vigenciaDesde');
  }

  if (requisitoId) {
    const requisito = await RequisitoProveedor.findByPk(requisitoId);
    if (!requisito || !requisito.activo) return notFound(res, 'Requisito no encontrado');
  }

  // Reutiliza guardarArchivo() tal cual (server/src/services/almacenamiento.service.js),
  // pasando 'proveedores/<id>' como subdirectorio — los archivos terminan en
  // uploads/documentos/proveedores/<id>/, conviviendo con los de Documento en
  // vez de abrir un árbol de carpetas propio; es una reutilización deliberada
  // del helper existente, no una carpeta "incorrecta".
  const { ruta } = guardarArchivo(req.file, `proveedores/${proveedor.id}`);
  const estado = calcularEstadoProveedorDocumento({ vigenciaHasta });

  const documento = await ProveedorDocumento.create({
    proveedorId: proveedor.id,
    requisitoId: requisitoId || null,
    s3Key: ruta,
    vigenciaDesde: vigenciaDesde || null,
    vigenciaHasta: vigenciaHasta || null,
    estado,
  });

  await Auditoria.registrar({
    tabla: 'proveedor_documentos', registroId: documento.id, accion: 'crear',
    usuarioId: req.user.id, usuarioNombre: req.user.nombreCompleto, datosNuevos: documento.toJSON(),
  });

  return created(res, 'Documento del expediente subido', documento);
}

async function descargar(req, res) {
  const documento = await ProveedorDocumento.findOne({ where: { id: req.params.docId, proveedorId: req.params.id } });
  if (!documento) return notFound(res, 'Documento no encontrado');
  if (!documento.s3Key) return notFound(res, 'El documento no tiene un archivo asociado');
  return res.download(obtenerRutaAbsoluta(documento.s3Key));
}

async function eliminar(req, res) {
  const documento = await ProveedorDocumento.findOne({ where: { id: req.params.docId, proveedorId: req.params.id } });
  if (!documento) return notFound(res, 'Documento no encontrado');

  const datosAnteriores = documento.toJSON();
  // ProveedorDocumento no tiene columna `activo` (a diferencia de Documento) —
  // no hay baja lógica posible aquí, se hace un delete real. Auditoria conserva
  // datosAnteriores como snapshot, así que el rastro de auditoría no se pierde.
  if (documento.s3Key) {
    eliminarArchivo(documento.s3Key);
  }
  await documento.destroy();
  await Auditoria.registrar({
    tabla: 'proveedor_documentos', registroId: documento.id, accion: 'eliminar',
    usuarioId: req.user.id, usuarioNombre: req.user.nombreCompleto, datosAnteriores,
  });

  return success(res, null, 'Documento eliminado');
}

module.exports = { listar, crear, descargar, eliminar };
