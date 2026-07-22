const bcrypt = require('bcryptjs');

async function hashearPassword(password) {
  return bcrypt.hash(password, 10);
}

// Shared validation for "create a new usuario" data, used by both
// usuario.controller.js's crear() and area.controller.js's crear() (when
// creating a líder usuario inline). Keeps the required-field check and the
// Rol existence/active check identical in both call sites.
async function validarDatosNuevoUsuario({ username, email, nombre, apellido, password, rolIds }, Rol) {
  if (!username || !email || !nombre || !apellido || !password || !Array.isArray(rolIds) || rolIds.length === 0) {
    return { valido: false, status: 400, error: 'username, email, nombre, apellido, password y rolIds (con al menos un rol) son obligatorios' };
  }

  const roles = await Rol.findAll({ where: { id: rolIds } });
  const activos = roles.filter((rol) => rol.activo);
  if (activos.length !== rolIds.length) {
    return { valido: false, status: 404, error: 'Rol no encontrado' };
  }

  return { valido: true };
}

module.exports = { hashearPassword, validarDatosNuevoUsuario };
