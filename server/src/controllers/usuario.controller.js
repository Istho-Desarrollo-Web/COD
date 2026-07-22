const { Usuario, Rol, Auditoria } = require('../models');
const { success, created, notFound, badRequest } = require('../utils/responses');
const { hashearPassword, validarDatosNuevoUsuario } = require('../services/usuario.service');

const INCLUDE_ROLES = { include: [{ model: Rol, as: 'roles', attributes: ['id', 'nombre'], through: { attributes: [] } }] };

async function listar(req, res) {
  const usuarios = await Usuario.findAll({ where: { activo: true }, order: [['nombre', 'ASC']], ...INCLUDE_ROLES });
  return success(res, usuarios);
}

async function obtener(req, res) {
  const usuario = await Usuario.findByPk(req.params.id, INCLUDE_ROLES);
  if (!usuario || !usuario.activo) return notFound(res, 'Usuario no encontrado');
  return success(res, usuario);
}

async function crear(req, res) {
  const { username, email, nombre, apellido, password, rolIds, areaId, requiereCambioPassword } = req.body;

  const validacion = await validarDatosNuevoUsuario({ username, email, nombre, apellido, password, rolIds }, Rol);
  if (!validacion.valido) {
    return validacion.status === 404 ? notFound(res, validacion.error) : badRequest(res, validacion.error);
  }

  const passwordHash = await hashearPassword(password);
  const usuarioCreado = await Usuario.create({
    username,
    email,
    nombre,
    apellido,
    areaId,
    passwordHash,
    requiereCambioPassword: requiereCambioPassword !== undefined ? requiereCambioPassword : true,
  });
  await usuarioCreado.setRoles(rolIds);

  // Usuario.create() returns an in-memory instance built from the values we just
  // passed (including passwordHash) — it does NOT go through defaultScope's
  // attribute exclusion. Re-fetch via findByPk so the hash never reaches the
  // response or the audit log.
  const usuario = await Usuario.findByPk(usuarioCreado.id, INCLUDE_ROLES);

  await Auditoria.registrar({
    tabla: 'usuarios', registroId: usuario.id, accion: 'crear',
    usuarioId: req.user.id, usuarioNombre: req.user.nombreCompleto, datosNuevos: usuario.toJSON(),
  });

  return created(res, 'Usuario creado', usuario);
}

async function editar(req, res) {
  const usuario = await Usuario.findByPk(req.params.id, INCLUDE_ROLES);
  if (!usuario || !usuario.activo) return notFound(res, 'Usuario no encontrado');

  const { nombre, apellido, email, rolIds, areaId, password, requiereCambioPassword, activo } = req.body;

  if (rolIds !== undefined) {
    if (!Array.isArray(rolIds) || rolIds.length === 0) return badRequest(res, 'rolIds debe ser un arreglo con al menos un rol');
    const roles = await Rol.findAll({ where: { id: rolIds } });
    const activos = roles.filter((rol) => rol.activo);
    if (activos.length !== rolIds.length) return notFound(res, 'Rol no encontrado');
  }

  const datosAnteriores = usuario.toJSON();
  const cambios = {};
  if (nombre !== undefined) cambios.nombre = nombre;
  if (apellido !== undefined) cambios.apellido = apellido;
  if (email !== undefined) cambios.email = email;
  if (areaId !== undefined) cambios.areaId = areaId;
  if (activo !== undefined) cambios.activo = activo;
  if (requiereCambioPassword !== undefined) cambios.requiereCambioPassword = requiereCambioPassword;
  if (password) cambios.passwordHash = await hashearPassword(password);

  await usuario.update(cambios);
  if (rolIds !== undefined) await usuario.setRoles(rolIds);

  // Same reasoning as crear(): if `cambios.passwordHash` was set above, the
  // in-memory `usuario` instance now carries it, bypassing defaultScope's
  // exclusion. Re-fetch via findByPk before returning/auditing.
  const usuarioActualizado = await Usuario.findByPk(usuario.id, INCLUDE_ROLES);

  await Auditoria.registrar({
    tabla: 'usuarios', registroId: usuario.id, accion: 'actualizar',
    usuarioId: req.user.id, usuarioNombre: req.user.nombreCompleto, datosAnteriores, datosNuevos: usuarioActualizado.toJSON(),
  });

  return success(res, usuarioActualizado);
}

async function eliminar(req, res) {
  const usuario = await Usuario.findByPk(req.params.id);
  if (!usuario || !usuario.activo) return notFound(res, 'Usuario no encontrado');

  const datosAnteriores = usuario.toJSON();
  await usuario.update({ activo: false });
  await Auditoria.registrar({
    tabla: 'usuarios', registroId: usuario.id, accion: 'eliminar',
    usuarioId: req.user.id, usuarioNombre: req.user.nombreCompleto, datosAnteriores,
  });

  return success(res, null, 'Usuario eliminado');
}

module.exports = { listar, obtener, crear, editar, eliminar };
