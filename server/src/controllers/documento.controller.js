const { Documento } = require('../models');
const { success, paginated, notFound } = require('../utils/responses');

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

module.exports = { listar, obtener };
