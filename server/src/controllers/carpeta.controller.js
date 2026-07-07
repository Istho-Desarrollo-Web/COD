const { Carpeta } = require('../models');
const { success, created, badRequest, notFound } = require('../utils/responses');

function construirArbol(carpetas, carpetaPadreId = null) {
  return carpetas
    .filter((c) => c.carpetaPadreId === carpetaPadreId)
    .map((c) => ({ ...c.toJSON(), subcarpetas: construirArbol(carpetas, c.id) }));
}

async function listar(req, res) {
  const { areaId } = req.query;
  if (!areaId) return badRequest(res, 'areaId es obligatorio');

  const carpetas = await Carpeta.findAll({
    where: { areaId, activo: true },
    order: [['orden', 'ASC'], ['nombre', 'ASC']],
  });
  return success(res, construirArbol(carpetas));
}

async function crear(req, res) {
  const { areaId, nombre, carpetaPadreId, orden } = req.body;
  if (!areaId || !nombre) return badRequest(res, 'areaId y nombre son obligatorios');

  if (carpetaPadreId) {
    const padre = await Carpeta.findByPk(carpetaPadreId);
    if (!padre || !padre.activo) return notFound(res, 'Carpeta padre no encontrada');
    if (padre.areaId !== Number(areaId)) return badRequest(res, 'La carpeta padre no pertenece a la misma área');
  }

  const carpeta = await Carpeta.create({ areaId, nombre, carpetaPadreId: carpetaPadreId || null, orden: orden || 0 });
  return created(res, 'Carpeta creada', carpeta);
}

module.exports = { listar, crear };
