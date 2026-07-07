const { Documento, TipoDocumento, Carpeta, DocumentoVersionHistorial, Auditoria } = require('../models');
const { success, created, paginated, notFound, badRequest } = require('../utils/responses');
const { calcularEstadoDocumento, subirNuevaVersion } = require('../services/documento.service');
const { recalcularSaludArea } = require('../services/area.service');
const { guardarArchivo, obtenerRutaAbsoluta } = require('../services/almacenamiento.service');

async function listar(req, res) {
  const { areaId, carpetaId, tipoDocumentoId, estado } = req.query;
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));

  const where = { activo: true };
  if (areaId) where.areaId = areaId;
  if (carpetaId) where.carpetaId = carpetaId;
  if (tipoDocumentoId) where.tipoDocumentoId = tipoDocumentoId;
  if (estado) where.estado = estado;

  const { rows, count } = await Documento.findAndCountAll({
    where,
    order: [['nombre', 'ASC']],
    limit,
    offset: (page - 1) * limit,
  });

  return paginated(res, rows, { page, limit, total: count, totalPages: Math.ceil(count / limit) });
}

async function obtener(req, res) {
  const documento = await Documento.findByPk(req.params.id);
  if (!documento || !documento.activo) return notFound(res, 'Documento no encontrado');
  return success(res, documento);
}

async function crear(req, res) {
  const { areaId, carpetaId, tipoDocumentoId, nombre, codigo, vigenciaDesde, vigenciaHasta, diasAlertaVencimiento, responsableUsuarioId } = req.body;

  if (!nombre || !areaId || !tipoDocumentoId || !carpetaId) {
    return badRequest(res, 'nombre, areaId, tipoDocumentoId y carpetaId son obligatorios');
  }
  if (!req.file) return badRequest(res, 'El archivo es obligatorio');

  const [tipoDocumento, carpeta] = await Promise.all([
    TipoDocumento.findByPk(tipoDocumentoId),
    Carpeta.findByPk(carpetaId),
  ]);
  if (!tipoDocumento || !tipoDocumento.activo) return notFound(res, 'Tipo de documento no encontrado');
  if (!carpeta || !carpeta.activo) return notFound(res, 'Carpeta no encontrada');
  if (carpeta.areaId !== Number(areaId)) return badRequest(res, 'La carpeta no pertenece al área indicada');
  if (vigenciaDesde && vigenciaHasta && new Date(vigenciaHasta) <= new Date(vigenciaDesde)) {
    return badRequest(res, 'vigenciaHasta debe ser posterior a vigenciaDesde');
  }

  const { ruta } = guardarArchivo(req.file, areaId);
  const diasAlerta = diasAlertaVencimiento ?? tipoDocumento.diasAlertaVencimientoDefault;
  const estado = calcularEstadoDocumento({ vigenciaHasta, diasAlerta });

  const documento = await Documento.create({
    areaId,
    carpetaId,
    tipoDocumentoId,
    nombre,
    codigo,
    vigenciaDesde: vigenciaDesde || null,
    vigenciaHasta: vigenciaHasta || null,
    diasAlertaVencimiento: diasAlertaVencimiento || null,
    estado,
    s3Key: ruta,
    responsableUsuarioId: responsableUsuarioId || null,
  });

  await Auditoria.registrar({
    tabla: 'documentos', registroId: documento.id, accion: 'crear',
    usuarioId: req.user.id, usuarioNombre: req.user.nombreCompleto, datosNuevos: documento.toJSON(),
  });
  await recalcularSaludArea(areaId);

  return created(res, 'Documento creado', documento);
}

async function editar(req, res) {
  const documento = await Documento.findByPk(req.params.id);
  if (!documento || !documento.activo) return notFound(res, 'Documento no encontrado');

  const { nombre, codigo, tipoDocumentoId, carpetaId, responsableUsuarioId, vigenciaDesde, vigenciaHasta, diasAlertaVencimiento } = req.body;

  if (carpetaId !== undefined) {
    const carpeta = await Carpeta.findByPk(carpetaId);
    if (!carpeta || !carpeta.activo) return notFound(res, 'Carpeta no encontrada');
    if (carpeta.areaId !== documento.areaId) return badRequest(res, 'La carpeta no pertenece al área del documento');
  }

  const vigenciaDesdeEfectiva = vigenciaDesde !== undefined ? vigenciaDesde : documento.vigenciaDesde;
  const vigenciaHastaEfectiva = vigenciaHasta !== undefined ? vigenciaHasta : documento.vigenciaHasta;
  if (vigenciaDesdeEfectiva && vigenciaHastaEfectiva && new Date(vigenciaHastaEfectiva) <= new Date(vigenciaDesdeEfectiva)) {
    return badRequest(res, 'vigenciaHasta debe ser posterior a vigenciaDesde');
  }

  const datosAnteriores = documento.toJSON();
  const cambiosVigencia = vigenciaDesde !== undefined || vigenciaHasta !== undefined || diasAlertaVencimiento !== undefined;

  const cambios = {};
  if (nombre !== undefined) cambios.nombre = nombre;
  if (codigo !== undefined) cambios.codigo = codigo;
  if (tipoDocumentoId !== undefined) cambios.tipoDocumentoId = tipoDocumentoId;
  if (carpetaId !== undefined) cambios.carpetaId = carpetaId;
  if (responsableUsuarioId !== undefined) cambios.responsableUsuarioId = responsableUsuarioId;
  if (vigenciaDesde !== undefined) cambios.vigenciaDesde = vigenciaDesde;
  if (vigenciaHasta !== undefined) cambios.vigenciaHasta = vigenciaHasta;
  if (diasAlertaVencimiento !== undefined) cambios.diasAlertaVencimiento = diasAlertaVencimiento;

  if (cambiosVigencia) {
    const tipoDocumentoIdEfectivo = cambios.tipoDocumentoId ?? documento.tipoDocumentoId;
    const tipoDocumento = await TipoDocumento.findByPk(tipoDocumentoIdEfectivo);
    const diasAlerta = (cambios.diasAlertaVencimiento ?? documento.diasAlertaVencimiento) ?? tipoDocumento.diasAlertaVencimientoDefault;
    cambios.estado = calcularEstadoDocumento({ vigenciaHasta: vigenciaHastaEfectiva, diasAlerta });
  }

  await documento.update(cambios);
  await Auditoria.registrar({
    tabla: 'documentos', registroId: documento.id, accion: 'actualizar',
    usuarioId: req.user.id, usuarioNombre: req.user.nombreCompleto, datosAnteriores, datosNuevos: documento.toJSON(),
  });
  if (cambiosVigencia && cambios.estado !== datosAnteriores.estado) {
    await recalcularSaludArea(documento.areaId);
  }

  return success(res, documento);
}

async function eliminar(req, res) {
  const documento = await Documento.findByPk(req.params.id);
  if (!documento || !documento.activo) return notFound(res, 'Documento no encontrado');

  const datosAnteriores = documento.toJSON();
  await documento.update({ activo: false });
  await Auditoria.registrar({
    tabla: 'documentos', registroId: documento.id, accion: 'eliminar',
    usuarioId: req.user.id, usuarioNombre: req.user.nombreCompleto, datosAnteriores,
  });
  await recalcularSaludArea(documento.areaId);

  return success(res, null, 'Documento eliminado');
}

async function listarVersiones(req, res) {
  const documento = await Documento.findByPk(req.params.id);
  if (!documento) return notFound(res, 'Documento no encontrado');

  const versiones = await DocumentoVersionHistorial.findAll({
    where: { documentoId: documento.id },
    order: [['createdAt', 'DESC']],
  });
  return success(res, versiones);
}

async function subirVersion(req, res) {
  const documento = await Documento.findByPk(req.params.id);
  if (!documento || !documento.activo) return notFound(res, 'Documento no encontrado');
  if (!req.file) return badRequest(res, 'El archivo es obligatorio');

  const { version, vigenciaDesde, vigenciaHasta } = req.body;
  if (!version) return badRequest(res, 'version es obligatorio');
  if (vigenciaDesde && vigenciaHasta && new Date(vigenciaHasta) <= new Date(vigenciaDesde)) {
    return badRequest(res, 'vigenciaHasta debe ser posterior a vigenciaDesde');
  }

  const { ruta } = guardarArchivo(req.file, documento.areaId);

  const actualizado = await subirNuevaVersion(documento.id, {
    version,
    s3Key: ruta,
    vigenciaDesde: vigenciaDesde || null,
    vigenciaHasta: vigenciaHasta || null,
    subidoPorUsuarioId: req.user.id,
  });

  await Auditoria.registrar({
    tabla: 'documentos', registroId: documento.id, accion: 'actualizar',
    usuarioId: req.user.id, usuarioNombre: req.user.nombreCompleto,
    descripcion: `Nueva versión ${version} subida`, datosNuevos: actualizado.toJSON(),
  });

  return success(res, actualizado);
}

async function descargar(req, res) {
  const documento = await Documento.findByPk(req.params.id);
  if (!documento || !documento.activo) return notFound(res, 'Documento no encontrado');
  if (!documento.s3Key) return notFound(res, 'El documento no tiene un archivo asociado');
  return res.download(obtenerRutaAbsoluta(documento.s3Key));
}

async function descargarVersion(req, res) {
  const version = await DocumentoVersionHistorial.findOne({
    where: { id: req.params.versionId, documentoId: req.params.id },
  });
  if (!version) return notFound(res, 'Versión no encontrada');
  if (!version.s3Key) return notFound(res, 'La versión no tiene un archivo asociado');
  return res.download(obtenerRutaAbsoluta(version.s3Key));
}

module.exports = { listar, obtener, crear, editar, eliminar, listarVersiones, subirVersion, descargar, descargarVersion };
