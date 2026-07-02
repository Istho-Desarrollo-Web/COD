const jwt = require('jsonwebtoken');
const { Usuario, Rol } = require('../models');
const { unauthorized } = require('../utils/responses');

async function verificarToken(req, res, next) {
  const header = req.get('Authorization') || '';
  const [, token] = header.split(' ');
  if (!token) return unauthorized(res, 'Token no proporcionado');

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const usuario = await Usuario.findByPk(payload.id, { include: [{ model: Rol }] });
    if (!usuario || !usuario.activo) return unauthorized(res, 'Usuario inválido');

    req.user = {
      id: usuario.id,
      username: usuario.username,
      email: usuario.email,
      nombre: usuario.nombre,
      apellido: usuario.apellido,
      nombreCompleto: `${usuario.nombre} ${usuario.apellido}`,
      rol: usuario.Rol.nombre,
      rolId: usuario.rolId,
      nivelRol: usuario.Rol.nivel,
      esAdmin: () => usuario.Rol.nombre === 'admin',
    };
    return next();
  } catch {
    return unauthorized(res, 'Token inválido o expirado');
  }
}

module.exports = { verificarToken };
