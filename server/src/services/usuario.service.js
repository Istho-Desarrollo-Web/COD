const bcrypt = require('bcryptjs');

async function hashearPassword(password) {
  return bcrypt.hash(password, 10);
}

// Shared validation for "create a new usuario" data, used by both
// usuario.controller.js's crear() and area.controller.js's crear() (when
// creating a líder usuario inline). Keeps the required-field check and the
// Rol existence/active check identical in both call sites.
async function validarDatosNuevoUsuario({ username, email, nombre, apellido, password, rolId }, Rol) {
  if (!username || !email || !nombre || !apellido || !password || !rolId) {
    return { valido: false, status: 400, error: 'username, email, nombre, apellido, password y rolId son obligatorios' };
  }

  const rol = await Rol.findByPk(rolId);
  if (!rol || !rol.activo) {
    return { valido: false, status: 404, error: 'Rol no encontrado' };
  }

  return { valido: true };
}

module.exports = { hashearPassword, validarDatosNuevoUsuario };
