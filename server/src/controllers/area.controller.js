// server/src/controllers/area.controller.js
const { Area, Usuario, Rol, Auditoria, sequelize } = require('../models');
const { success, created, notFound, badRequest } = require('../utils/responses');
const { hashearPassword, validarDatosNuevoUsuario } = require('../services/usuario.service');

async function listar(req, res) {
  const areas = await Area.findAll({ where: { activo: true }, order: [['nombre', 'ASC']] });
  return success(res, areas);
}

async function crear(req, res) {
  const { nombre, codigo, liderUsuarioId, nuevoUsuario } = req.body;

  if (liderUsuarioId && nuevoUsuario) {
    return badRequest(res, 'Envía liderUsuarioId o nuevoUsuario, no ambos');
  }

  if (nuevoUsuario) {
    const validacion = await validarDatosNuevoUsuario(nuevoUsuario, Rol);
    if (!validacion.valido) {
      return validacion.status === 404 ? notFound(res, validacion.error) : badRequest(res, validacion.error);
    }
  }

  if (liderUsuarioId) {
    const lider = await Usuario.findByPk(liderUsuarioId);
    if (!lider || !lider.activo) return notFound(res, 'Usuario líder no encontrado');
  }

  const area = await sequelize.transaction(async (t) => {
    let liderId = liderUsuarioId || null;

    if (nuevoUsuario) {
      const passwordHash = await hashearPassword(nuevoUsuario.password);
      const usuarioCreado = await Usuario.create(
        {
          username: nuevoUsuario.username,
          email: nuevoUsuario.email,
          nombre: nuevoUsuario.nombre,
          apellido: nuevoUsuario.apellido,
          passwordHash,
          requiereCambioPassword: nuevoUsuario.requiereCambioPassword !== undefined ? nuevoUsuario.requiereCambioPassword : true,
        },
        { transaction: t }
      );
      await usuarioCreado.setRoles(nuevoUsuario.rolIds, { transaction: t });
      liderId = usuarioCreado.id;
    }

    return Area.create({ nombre, codigo, liderUsuarioId: liderId }, { transaction: t });
  });

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
