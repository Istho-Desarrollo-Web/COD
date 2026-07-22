const { QueryTypes } = require('sequelize');

// Reemplaza el catálogo de 6 roles acoplados a departamento (admin,
// financiera, lider_area, operaciones, solicitante, auditor) por los 8 roles
// funcionales de docs/superpowers/specs/2026-07-21-cod-modelo-roles-definitivo.md.
// El área deja de vivir en el nombre del rol — pasa a ser un campo propio de
// Usuario (agregado en la migración del Paso 2, no en esta).
const ROLES_NUEVOS = [
  { nombre: 'super_administrador', nivel: 100, descripcion: 'Configura el sistema, usuarios, roles, matriz de accesos, logs técnicos' },
  { nombre: 'aprobador_ejecutivo', nivel: 90, descripcion: 'Aprueba solo lo escalado como Crítico desde cualquier área' },
  { nombre: 'aprobador_area', nivel: 70, descripcion: 'Aprueba solicitudes/proveedores de su área hasta el umbral de Relevante' },
  { nombre: 'gestor_compras', nivel: 50, descripcion: 'Cotiza, vincula proveedores, genera órdenes, consolida evaluaciones' },
  { nombre: 'gestor_documental', nivel: 40, descripcion: 'Sube/actualiza documentos y formularios de su área, no aprueba' },
  { nombre: 'solicitante', nivel: 30, descripcion: 'Crea solicitudes y consulta documentos de su área' },
  { nombre: 'auditor', nivel: 20, descripcion: 'Lectura transversal a todo el sistema, sin editar' },
  { nombre: 'colaborador', nivel: 10, descripcion: 'Consulta documentos puntuales compartidos y sube únicamente lo que le corresponde directamente' },
];

const ROLES_VIEJOS = ['admin', 'financiera', 'lider_area', 'operaciones', 'solicitante', 'auditor'];

// 'solicitante' y 'auditor' existen con el mismo nombre en ambos catálogos —
// NO son un rol viejo a reemplazar, son la misma fila reutilizada tal cual
// (incluso comparten el mismo `nivel`). Tratarlos como "nuevos" duplicaría
// el nombre y violaría el unique de roles.nombre.
const NOMBRES_COMPARTIDOS = ROLES_NUEVOS.map((r) => r.nombre).filter((n) => ROLES_VIEJOS.includes(n));

// Mapeo old→new confirmado en docs/superpowers/specs/2026-07-21-cod-ajustes-y-siguientes-pasos.md
// (§0/§1.1): financiera y operaciones NO heredan poder de aprobar — quedan en
// roles de gestión. Si la persona real detrás de esa cuenta debía ser
// Aprobador de área, se reclasifica a mano (ver aviso impreso más abajo).
const MAPEO_OLD_A_NEW = {
  admin: 'super_administrador',
  financiera: 'gestor_compras',
  lider_area: 'gestor_documental',
  operaciones: 'gestor_documental',
  solicitante: 'solicitante',
  auditor: 'auditor',
};

// Usado solo por down(): como lider_area y operaciones convergen ambos en
// gestor_documental, el rollback no puede reconstruir el origen exacto de
// cada usuario — por defecto todos los usuarios de gestor_documental
// vuelven a lider_area. Es una limitación conocida de este rollback, no un
// bug: se documenta aquí en vez de fingir simetría perfecta.
const ROLES_PARA_REVISION_MANUAL = new Set(['financiera', 'operaciones']);

async function idsPorNombre(queryInterface, nombres) {
  if (nombres.length === 0) return {};
  const filas = await queryInterface.sequelize.query('SELECT id, nombre FROM roles WHERE nombre IN (:nombres)', {
    replacements: { nombres },
    type: QueryTypes.SELECT,
  });
  return Object.fromEntries(filas.map((f) => [f.nombre, f.id]));
}

module.exports = {
  up: async ({ context: queryInterface }) => {
    const ahora = new Date();

    const existentes = await idsPorNombre(queryInterface, ROLES_NUEVOS.map((r) => r.nombre));
    const porInsertar = ROLES_NUEVOS.filter((r) => !existentes[r.nombre]);

    if (porInsertar.length > 0) {
      await queryInterface.bulkInsert(
        'roles',
        porInsertar.map((r) => ({ ...r, activo: true, created_at: ahora, updated_at: ahora }))
      );
    }

    // 'solicitante'/'auditor' ya estaban activos y con el nivel correcto —
    // solo se sincroniza la descripción al texto del catálogo nuevo.
    for (const nombre of NOMBRES_COMPARTIDOS) {
      if (!existentes[nombre]) continue;
      const definicion = ROLES_NUEVOS.find((r) => r.nombre === nombre);
      await queryInterface.sequelize.query('UPDATE roles SET descripcion = :descripcion WHERE id = :id', {
        replacements: { descripcion: definicion.descripcion, id: existentes[nombre] },
      });
    }

    const idNuevoPorNombre = await idsPorNombre(queryInterface, ROLES_NUEVOS.map((r) => r.nombre));
    const idViejoPorNombre = await idsPorNombre(queryInterface, ROLES_VIEJOS);

    const usuariosParaRevisar = [];

    for (const [nombreViejo, nombreNuevo] of Object.entries(MAPEO_OLD_A_NEW)) {
      const idViejo = idViejoPorNombre[nombreViejo];
      const idNuevo = idNuevoPorNombre[nombreNuevo];
      if (!idViejo || !idNuevo || idViejo === idNuevo) continue; // no existe en este ambiente, o es la misma fila reutilizada

      if (ROLES_PARA_REVISION_MANUAL.has(nombreViejo)) {
        const afectados = await queryInterface.sequelize.query(
          'SELECT id, username, email FROM usuarios WHERE rol_id = :idViejo',
          { replacements: { idViejo }, type: QueryTypes.SELECT }
        );
        usuariosParaRevisar.push(...afectados.map((u) => ({ ...u, rolAnterior: nombreViejo, rolAsignado: nombreNuevo })));
      }

      await queryInterface.sequelize.query('UPDATE usuarios SET rol_id = :idNuevo WHERE rol_id = :idViejo', {
        replacements: { idNuevo, idViejo },
      });
    }

    if (usuariosParaRevisar.length > 0) {
      console.warn(
        '\n[migración roles] Revisar manualmente — estos usuarios venían de financiera/operaciones y ' +
          'quedaron en un rol de gestión (sin poder de aprobar). Si la persona real detrás de la cuenta ' +
          'debía aprobar, reasignar a mano a aprobador_area o aprobador_ejecutivo:\n' +
          JSON.stringify(usuariosParaRevisar, null, 2)
      );
    }

    // Roles viejos a desactivar: todos los de ROLES_VIEJOS presentes en este
    // ambiente, EXCEPTO los compartidos (solicitante/auditor), que siguen
    // activos como parte del catálogo nuevo.
    const idsADesactivar = Object.entries(idViejoPorNombre)
      .filter(([nombre]) => !NOMBRES_COMPARTIDOS.includes(nombre))
      .map(([, id]) => id);

    if (idsADesactivar.length > 0) {
      // No son "historial" (a diferencia de auditorías) — son configuración
      // muerta una vez que ningún usuario apunta a estos roles.
      await queryInterface.sequelize.query('DELETE FROM rol_permisos WHERE rol_id IN (:ids)', {
        replacements: { ids: idsADesactivar },
      });
      // Los roles viejos no se borran — se desactivan, para no perder el
      // registro de que alguna vez existieron (mismo criterio que Auditoria).
      await queryInterface.sequelize.query('UPDATE roles SET activo = false WHERE id IN (:ids)', {
        replacements: { ids: idsADesactivar },
      });
    }
  },

  down: async ({ context: queryInterface }) => {
    const idsADesactivar = Object.entries(await idsPorNombre(queryInterface, ROLES_VIEJOS))
      .filter(([nombre]) => !NOMBRES_COMPARTIDOS.includes(nombre))
      .map(([, id]) => id);

    if (idsADesactivar.length > 0) {
      await queryInterface.sequelize.query('UPDATE roles SET activo = true WHERE id IN (:ids)', {
        replacements: { ids: idsADesactivar },
      });
    }

    const idNuevoPorNombre = await idsPorNombre(queryInterface, ROLES_NUEVOS.map((r) => r.nombre));
    const idViejoPorNombre = await idsPorNombre(queryInterface, ROLES_VIEJOS);

    // Mapeo inverso determinista. gestor_documental → lider_area por
    // defecto (ver comentario de ROLES_PARA_REVISION_MANUAL arriba): no se
    // puede reconstruir si el usuario venía de lider_area u operaciones.
    const MAPEO_NEW_A_OLD = {
      super_administrador: 'admin',
      gestor_compras: 'financiera',
      gestor_documental: 'lider_area',
    };

    for (const [nombreNuevo, nombreViejo] of Object.entries(MAPEO_NEW_A_OLD)) {
      const idNuevo = idNuevoPorNombre[nombreNuevo];
      const idViejo = idViejoPorNombre[nombreViejo];
      if (!idNuevo || !idViejo) continue;
      await queryInterface.sequelize.query('UPDATE usuarios SET rol_id = :idViejo WHERE rol_id = :idNuevo', {
        replacements: { idViejo, idNuevo },
      });
    }

    // Los roles nuevos que NO son compartidos (solicitante/auditor) se
    // eliminan; los compartidos se conservan (son la misma fila de siempre).
    const idsNuevosABorrar = Object.entries(idNuevoPorNombre)
      .filter(([nombre]) => !NOMBRES_COMPARTIDOS.includes(nombre))
      .map(([, id]) => id);

    if (idsNuevosABorrar.length > 0) {
      await queryInterface.sequelize.query('DELETE FROM rol_permisos WHERE rol_id IN (:ids)', {
        replacements: { ids: idsNuevosABorrar },
      });
      await queryInterface.sequelize.query('DELETE FROM roles WHERE id IN (:ids)', {
        replacements: { ids: idsNuevosABorrar },
      });
    }
  },
};
