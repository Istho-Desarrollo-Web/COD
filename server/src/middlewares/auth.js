const jwt = require('jsonwebtoken');
const { Usuario, Rol } = require('../models');
const { unauthorized } = require('../utils/responses');
const { cargarCachePermisos } = require('./roles');

async function verificarToken(req, res, next) {
  const header = req.get('Authorization') || '';
  const [, token] = header.split(' ');
  if (!token) return unauthorized(res, 'Token no proporcionado');

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload.type !== 'access') return unauthorized(res, 'Token inválido o expirado');

    const usuario = await Usuario.findByPk(payload.id, { include: [{ model: Rol, as: 'roles' }] });
    if (!usuario || !usuario.activo) return unauthorized(res, 'Usuario inválido');

    const roles = usuario.roles.map((rol) => ({ id: rol.id, nombre: rol.nombre, nivel: rol.nivel }));

    req.user = {
      id: usuario.id,
      username: usuario.username,
      email: usuario.email,
      nombre: usuario.nombre,
      apellido: usuario.apellido,
      nombreCompleto: `${usuario.nombre} ${usuario.apellido}`,
      areaId: usuario.areaId,
      roles,
      // El nivel efectivo es el más alto entre todos sus roles — un usuario
      // con dos roles no queda limitado por el de menor jerarquía.
      nivelRol: roles.reduce((maximo, rol) => Math.max(maximo, rol.nivel), 0),
      esAdmin: () => roles.some((rol) => rol.nombre === 'super_administrador'),
      tienePermiso: async (modulo, accion) => {
        const permisos = await cargarCachePermisos();
        return roles.some((rol) => (permisos[rol.id]?.[modulo] || []).includes(accion));
      },
    };
    return next();
  } catch {
    return unauthorized(res, 'Token inválido o expirado');
  }
}

module.exports = { verificarToken };
