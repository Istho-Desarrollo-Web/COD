const { autenticar, firmarTokens, refrescarToken } = require('../services/auth.service');
const { Auditoria, Usuario, Rol } = require('../models');
const { success, unauthorized } = require('../utils/responses');

async function login(req, res) {
  const { username, password } = req.body;
  const usuario = await autenticar(username, password);
  if (!usuario) return unauthorized(res, 'Usuario o contraseña incorrectos');

  const { token, refreshToken } = firmarTokens(usuario);
  await Auditoria.registrar({
    tabla: 'usuarios',
    registroId: usuario.id,
    accion: 'login',
    usuarioId: usuario.id,
    usuarioNombre: `${usuario.nombre} ${usuario.apellido}`,
    ipAddress: req.ip,
    userAgent: req.get('User-Agent'),
  });

  return success(res, {
    token,
    refreshToken,
    usuario: { id: usuario.id, username: usuario.username, nombre: usuario.nombre, rol: usuario.Rol.nombre },
  });
}

async function me(req, res) {
  return success(res, req.user);
}

async function refresh(req, res) {
  const { refreshToken } = req.body;
  if (!refreshToken) return unauthorized(res, 'Refresh token no proporcionado');

  const usuario = await refrescarToken(refreshToken);
  if (!usuario) return unauthorized(res, 'Refresh token inválido o expirado');

  const tokens = firmarTokens(usuario);
  return success(res, tokens);
}

module.exports = { login, me, refresh };
