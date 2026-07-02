const { DataTypes } = require('sequelize');

// Catálogo estático de módulos/acciones válidos para COD — usado para validar
// RolPermiso.acciones en el seed y en el panel de Matriz de Accesos.
const CATALOGO_MODULOS = {
  inicio: ['ver'],
  areas: ['ver'],
  area_detalle: ['ver'],
  documentos: ['ver', 'crear', 'editar', 'eliminar', 'aprobar_version', 'exportar'],
  solicitudes: ['ver', 'crear', 'comentar', 'cotizar', 'aprobar', 'confirmar', 'exportar'],
  proveedores: ['ver', 'crear', 'editar', 'eliminar', 'evaluar', 'exportar'],
  formularios: ['ver', 'crear', 'editar', 'eliminar'],
  reportes: ['ver', 'exportar'],
  usuarios: ['ver', 'crear', 'editar', 'eliminar'],
  roles: ['ver', 'crear', 'editar', 'eliminar'],
  matriz_accesos: ['ver', 'editar'],
  sesiones: ['ver', 'cerrar'],
  auditoria: ['ver'],
  perfil: ['ver', 'cambiar_password'],
};

// No tiene tabla propia — se mantiene como catálogo en código, igual a como
// el CRM referencia sus módulos en seedRolesPermisos.js.
module.exports = (sequelize) => ({ CATALOGO_MODULOS, sequelize });
