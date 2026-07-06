const { autenticar, firmarTokens, refrescarToken } = require('../services/auth.service');
const { Auditoria, Usuario, Rol } = require('../models');
const { success, unauthorized } = require('../utils/responses');
const { obtenerPermisosDeRol } = require('../middlewares/roles');

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

  const permisos = await obtenerPermisosDeRol(usuario.rolId);

  return success(res, {
    token,
    refreshToken,
    usuario: { id: usuario.id, username: usuario.username, nombre: usuario.nombre, rol: usuario.Rol.nombre },
    permisos,
  });
}

async function me(req, res) {
  const permisos = await obtenerPermisosDeRol(req.user.rolId);
  return success(res, { ...req.user, permisos });
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
