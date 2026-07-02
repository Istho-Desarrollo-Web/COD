const { Area, Auditoria } = require('../models');
const { success, created, notFound } = require('../utils/responses');

async function listar(req, res) {
  const areas = await Area.findAll({ where: { activo: true }, order: [['nombre', 'ASC']] });
  return success(res, areas);
}

async function crear(req, res) {
  const { nombre, codigo, liderUsuarioId } = req.body;
  const area = await Area.create({ nombre, codigo, liderUsuarioId });
  await Auditoria.registrar({
    tabla: 'areas', registroId: area.id, accion: 'crear',
    usuarioId: req.user.id, usuarioNombre: req.user.nombreCompleto, datosNuevos: area.toJSON(),
  });
  return created(res, 'Área creada', area);
}

async function obtener(req, res) {
  const area = await Area.findByPk(req.params.id);
  if (!area) return notFound(res, 'Área no encontrada');
  return success(res, area);
}

module.exports = { listar, crear, obtener };
