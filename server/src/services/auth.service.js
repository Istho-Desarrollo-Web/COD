const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { Usuario, Rol } = require('../models');

const DUMMY_HASH = bcrypt.hashSync('contraseña_invalida_dummy_para_timing_seguro', 10);

async function autenticar(username, password) {
  const usuario = await Usuario.unscoped().findOne({ where: { username }, include: [{ model: Rol }] });
  const hashParaComparar = usuario?.passwordHash || DUMMY_HASH;
  const valido = await bcrypt.compare(password, hashParaComparar);
  if (!usuario || !usuario.activo || !valido) return null;
  return usuario;
}

function firmarTokens(usuario) {
  const payloadBase = { id: usuario.id, username: usuario.username, rol: usuario.Rol.nombre, rolId: usuario.rolId };
  const token = jwt.sign({ ...payloadBase, type: 'access' }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
  });
  const refreshToken = jwt.sign({ id: usuario.id, type: 'refresh' }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  });
  return { token, refreshToken };
}

module.exports = { autenticar, firmarTokens };
