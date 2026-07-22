const bcrypt = require('bcryptjs');
const { Rol, Usuario, RolPermiso } = require('../models');
const { CATALOGO_MODULOS } = require('../models/Permiso')();

// Catálogo de roles funcionales — ver
// docs/superpowers/specs/2026-07-21-cod-modelo-roles-definitivo.md. El área
// ya no vive en el nombre del rol (Usuario.areaId, agregado en el Paso 2).
const ROLES = [
  { nombre: 'super_administrador', nivel: 100, descripcion: 'Configura el sistema, usuarios, roles, matriz de accesos, logs técnicos' },
  { nombre: 'aprobador_ejecutivo', nivel: 90, descripcion: 'Aprueba solo lo escalado como Crítico desde cualquier área' },
  { nombre: 'aprobador_area', nivel: 70, descripcion: 'Aprueba solicitudes/proveedores de su área hasta el umbral de Relevante' },
  { nombre: 'gestor_compras', nivel: 50, descripcion: 'Cotiza, vincula proveedores, genera órdenes, consolida evaluaciones' },
  { nombre: 'gestor_documental', nivel: 40, descripcion: 'Sube/actualiza documentos y formularios de su área, no aprueba' },
  { nombre: 'solicitante', nivel: 30, descripcion: 'Crea solicitudes y consulta documentos de su área' },
  { nombre: 'auditor', nivel: 20, descripcion: 'Lectura transversal a todo el sistema, sin editar' },
  { nombre: 'colaborador', nivel: 10, descripcion: 'Consulta documentos puntuales compartidos y sube únicamente lo que le corresponde directamente' },
];

// Matriz inicial — ajustable después desde Administración > Matriz de accesos.
// `solicitudes` separa aprobar/confirmar (roles aprobadores) de
// crear/cotizar/comentar (gestor_compras) desde ya, aunque el módulo todavía
// no tiene rutas propias — es la misma separación de poderes que motiva este
// refactor, para no tener que volver a migrar esto cuando se diseñe
// Solicitudes. `proveedores:aprobar` (separado de `:editar`) llega en el
// Paso 3; hasta entonces aprobador_area/aprobador_ejecutivo solo tienen
// lectura ahí. `colaborador` solo tiene acceso base — su alcance real
// (documento/expediente propio) llega con el Paso 6.
const PERMISOS_POR_ROL = {
  super_administrador: CATALOGO_MODULOS,
  aprobador_ejecutivo: {
    inicio: ['ver'], areas: ['ver'], documentos: ['ver'],
    solicitudes: ['ver', 'aprobar', 'confirmar'],
    proveedores: ['ver', 'aprobar'], perfil: ['ver', 'cambiar_password'],
  },
  aprobador_area: {
    inicio: ['ver'], areas: ['ver'], area_detalle: ['ver'], documentos: ['ver'],
    solicitudes: ['ver', 'aprobar', 'confirmar'],
    proveedores: ['ver', 'aprobar'], perfil: ['ver', 'cambiar_password'],
  },
  gestor_compras: {
    inicio: ['ver'], proveedores: ['ver', 'gestionar'],
    solicitudes: ['ver', 'crear', 'comentar', 'cotizar', 'confirmar'],
    perfil: ['ver', 'cambiar_password'],
  },
  gestor_documental: {
    inicio: ['ver'], areas: ['ver'], area_detalle: ['ver'],
    documentos: ['ver', 'crear', 'editar', 'aprobar_version', 'exportar'],
    formularios: ['ver', 'crear', 'editar'],
    solicitudes: ['ver', 'crear', 'comentar', 'exportar'],
    perfil: ['ver', 'cambiar_password'],
  },
  solicitante: {
    inicio: ['ver'], areas: ['ver'], area_detalle: ['ver'], documentos: ['ver'],
    solicitudes: ['ver', 'crear', 'comentar'], formularios: ['ver'], perfil: ['ver', 'cambiar_password'],
  },
  auditor: { inicio: ['ver'], auditoria: ['ver'], perfil: ['ver', 'cambiar_password'] },
  colaborador: { perfil: ['ver', 'cambiar_password'] },
};

module.exports = async function seedRolesPermisos() {
  for (const rolDef of ROLES) {
    const [rol] = await Rol.findOrCreate({ where: { nombre: rolDef.nombre }, defaults: rolDef });

    const permisos = PERMISOS_POR_ROL[rolDef.nombre] || {};
    for (const [modulo, acciones] of Object.entries(permisos)) {
      // upsert (no findOrCreate): un cambio posterior a la matriz de arriba
      // debe aplicarse también en ambientes donde el seed ya había corrido
      // antes con una matriz distinta.
      await RolPermiso.upsert({ rolId: rol.id, modulo, acciones });
    }
  }

  const superAdminRol = await Rol.findOne({ where: { nombre: 'super_administrador' } });
  const existingAdmin = await Usuario.unscoped().findOne({ where: { username: 'admin' } });
  if (!existingAdmin) {
    const passwordHash = await bcrypt.hash(process.env.SEED_PASSWORD_ADMIN || 'CambiarAhora123!', 10);
    const nuevoAdmin = await Usuario.create({
      username: 'admin',
      email: 'admin@istho.com.co',
      passwordHash,
      nombre: 'Administrador',
      apellido: 'COD',
      requiereCambioPassword: true,
    });
    await nuevoAdmin.setRoles([superAdminRol.id]);
  }
};
