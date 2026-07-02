const bcrypt = require('bcryptjs');
const { Rol, Usuario, RolPermiso } = require('../models');
const { CATALOGO_MODULOS } = require('../models/Permiso')();

const ROLES = [
  { nombre: 'admin', nivel: 100, descripcion: 'Acceso total' },
  { nombre: 'financiera', nivel: 80, descripcion: 'Aprueba solicitudes, gestión de compras' },
  { nombre: 'lider_area', nivel: 60, descripcion: 'Gestiona documentos y solicitudes de su área' },
  { nombre: 'operaciones', nivel: 50, descripcion: 'Crea/valida proveedores de transporte' },
  { nombre: 'solicitante', nivel: 30, descripcion: 'Inicia solicitudes, consulta documentos' },
  { nombre: 'auditor', nivel: 20, descripcion: 'Solo lectura + auditoría' },
];

// Matriz inicial — ajustable después desde Administración > Matriz de accesos.
const PERMISOS_POR_ROL = {
  admin: CATALOGO_MODULOS,
  financiera: {
    inicio: ['ver'], areas: ['ver'], documentos: ['ver'],
    solicitudes: ['ver', 'crear', 'comentar', 'cotizar', 'aprobar', 'confirmar', 'exportar'],
    proveedores: ['ver'], formularios: ['ver'], reportes: ['ver', 'exportar'], perfil: ['ver', 'cambiar_password'],
  },
  lider_area: {
    inicio: ['ver'], areas: ['ver'], area_detalle: ['ver'],
    documentos: ['ver', 'crear', 'editar', 'aprobar_version', 'exportar'],
    solicitudes: ['ver', 'crear', 'comentar', 'exportar'],
    formularios: ['ver', 'crear', 'editar'], reportes: ['ver', 'exportar'], perfil: ['ver', 'cambiar_password'],
  },
  operaciones: {
    inicio: ['ver'], proveedores: ['ver', 'crear', 'editar', 'evaluar'],
    solicitudes: ['ver', 'crear', 'comentar'], perfil: ['ver', 'cambiar_password'],
  },
  solicitante: {
    inicio: ['ver'], areas: ['ver'], area_detalle: ['ver'], documentos: ['ver'],
    solicitudes: ['ver', 'crear', 'comentar'], formularios: ['ver'], perfil: ['ver', 'cambiar_password'],
  },
  auditor: { inicio: ['ver'], auditoria: ['ver'], perfil: ['ver', 'cambiar_password'] },
};

module.exports = async function seedRolesPermisos() {
  for (const rolDef of ROLES) {
    const [rol] = await Rol.findOrCreate({ where: { nombre: rolDef.nombre }, defaults: rolDef });

    const permisos = PERMISOS_POR_ROL[rolDef.nombre] || {};
    for (const [modulo, acciones] of Object.entries(permisos)) {
      await RolPermiso.findOrCreate({
        where: { rolId: rol.id, modulo },
        defaults: { rolId: rol.id, modulo, acciones },
      });
    }
  }

  const adminRol = await Rol.findOne({ where: { nombre: 'admin' } });
  const existingAdmin = await Usuario.unscoped().findOne({ where: { username: 'admin' } });
  if (!existingAdmin) {
    const passwordHash = await bcrypt.hash(process.env.SEED_PASSWORD_ADMIN || 'CambiarAhora123!', 10);
    await Usuario.create({
      username: 'admin',
      email: 'admin@istho.com.co',
      passwordHash,
      nombre: 'Administrador',
      apellido: 'COD',
      rolId: adminRol.id,
      requiereCambioPassword: true,
    });
  }
};
