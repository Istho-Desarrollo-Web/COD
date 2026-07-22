const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { Usuario, Rol } = require('../models');

const DUMMY_HASH = bcrypt.hashSync('contraseña_invalida_dummy_para_timing_seguro', 10);

async function autenticar(username, password) {
  const usuario = await Usuario.unscoped().findOne({ where: { username }, include: [{ model: Rol, as: 'roles' }] });
  const hashParaComparar = usuario?.passwordHash || DUMMY_HASH;
  const valido = await bcrypt.compare(password, hashParaComparar);
  if (!usuario || !usuario.activo || !valido) return null;
  return usuario;
}

function firmarTokens(usuario) {
  // El JWT no lleva los roles — verificarToken() siempre re-consulta la BD
  // en cada request, así que el token nunca es la fuente de autorización.
  const payloadBase = { id: usuario.id, username: usuario.username };
  const token = jwt.sign({ ...payloadBase, type: 'access' }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
  });
  const refreshToken = jwt.sign({ id: usuario.id, type: 'refresh' }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  });
  return { token, refreshToken };
}

async function refrescarToken(refreshTokenRecibido) {
  let payload;
  try {
    payload = jwt.verify(refreshTokenRecibido, process.env.JWT_SECRET);
  } catch {
    return null;
  }
  if (payload.type !== 'refresh') return null;

  const usuario = await Usuario.unscoped().findOne({ where: { id: payload.id }, include: [{ model: Rol, as: 'roles' }] });
  if (!usuario || !usuario.activo) return null;
  return usuario;
}

module.exports = { autenticar, firmarTokens, refrescarToken };
