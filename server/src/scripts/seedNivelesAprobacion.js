const { TipoSolicitud, NivelAprobacion } = require('../models');

const TIPOS = ['compra', 'contratacion_servicio'];

// Umbrales de ejemplo, PENDIENTES de que Financiera confirme las cifras
// reales de ISTHO — no son definitivos, no inventar ni dar por cerrados.
// rolAprobador ya usa el catálogo de 8 roles funcionales (Paso 8 del
// refactor de roles): aprobador_area cubre los dos tramos inferiores
// (hoy no hay un tercer rol intermedio de aprobación), aprobador_ejecutivo
// el tramo superior. Ver también resolverNivelAprobacion() en
// nivelAprobacion.service.js, que además escala a aprobador_ejecutivo por
// criticidad 'critico' del proveedor, independientemente del monto.
const NIVELES = [
  { montoDesde: 0, montoHasta: 1_000_000, rolAprobador: 'aprobador_area', orden: 1 },
  { montoDesde: 1_000_000.01, montoHasta: 10_000_000, rolAprobador: 'aprobador_area', orden: 2 },
  { montoDesde: 10_000_000.01, montoHasta: null, rolAprobador: 'aprobador_ejecutivo', orden: 3 },
];

module.exports = async function seedNivelesAprobacion() {
  for (const nombre of TIPOS) {
    const [tipo] = await TipoSolicitud.findOrCreate({ where: { nombre } });
    for (const nivel of NIVELES) {
      // findOrCreate + update (no un findOrCreate solo): en ambientes donde el
      // seed ya había corrido antes con el catálogo de roles viejo, la fila ya
      // existe y `defaults` se ignora silenciosamente, dejando rolAprobador
      // con valores obsoletos como 'admin' — el mismo bug ya documentado en
      // seedRolesPermisos.js, aquí sin una columna única sobre la que apoyar
      // un upsert() nativo, así que se resuelve con update() explícito.
      const [fila] = await NivelAprobacion.findOrCreate({
        where: { tipoSolicitudId: tipo.id, orden: nivel.orden },
        defaults: { ...nivel, tipoSolicitudId: tipo.id },
      });
      await fila.update({ ...nivel, tipoSolicitudId: tipo.id });
    }
  }
};
