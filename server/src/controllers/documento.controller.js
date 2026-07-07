const { Documento, TipoDocumento, Carpeta, Auditoria } = require('../models');
const { success, created, paginated, notFound, badRequest } = require('../utils/responses');
const { calcularEstadoDocumento } = require('../services/documento.service');
const { recalcularSaludArea } = require('../services/area.service');
const { guardarArchivo } = require('../services/almacenamiento.service');

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

module.exports = { listar, obtener, crear };
