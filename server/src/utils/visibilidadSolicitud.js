// Lista EXHAUSTIVA de roles con visibilidad ampliada (ven todas las
// solicitudes) — ver la Nota de implementación del plan. Cualquier otro rol
// con solicitudes:ver (solicitante, gestor_documental) solo ve las propias.
// Compartido entre solicitud.controller.js, cotizacion.controller.js y
// solicitudComentario.controller.js para evitar drift entre copias.
const ROLES_VISIBILIDAD_AMPLIA = ['super_administrador', 'gestor_compras', 'aprobador_area', 'aprobador_ejecutivo'];

function tieneVisibilidadAmplia(roles) {
  return (roles || []).some((rol) => ROLES_VISIBILIDAD_AMPLIA.includes(rol.nombre));
}

module.exports = { ROLES_VISIBILIDAD_AMPLIA, tieneVisibilidadAmplia };
