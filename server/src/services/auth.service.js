const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { Usuario, Rol } = require('../models');

async function autenticar(username, password) {
  const usuario = await Usuario.unscoped().findOne({ where: { username }, include: [{ model: Rol }] });
  if (!usuario || !usuario.activo) return null;
  const valido = await bcrypt.compare(password, usuario.passwordHash);
  if (!valido) return null;
  return usuario;
}

function firmarTokens(usuario) {
  const payload = { id: usuario.id, username: usuario.username, rol: usuario.Rol.nombre, rolId: usuario.rolId };
  const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '24h' });
  const refreshToken = jwt.sign({ id: usuario.id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  });
  return { token, refreshToken };
}

module.exports = { autenticar, firmarTokens };
