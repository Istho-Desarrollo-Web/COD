# Estado del proyecto COD — Centro Operativo Documental

> Última actualización: 2026-07-21. Este documento es una foto del estado
> actual; para el detalle de diseño de cada pieza, ver los specs y planes
> enlazados en cada sección (`docs/superpowers/specs/` y
> `docs/superpowers/plans/`).

## Resumen

COD es el sistema hermano del CRM CenthriX (mismo lenguaje visual y
convenciones técnicas), enfocado en el dominio de Compras,
Proveedores/Contratistas y Repositorio documental (SGI).

Hasta ahora se ha construido: la base de datos y autenticación, el módulo de
Áreas, el repositorio documental completo (Documentos + Carpetas estilo
Drive), el modelo de roles y permisos (8 roles funcionales, independientes
del área), el módulo de Proveedores y Contratistas (CRUD + expediente +
aprobación en dos etapas), una Matriz de accesos de solo lectura, y una
pantalla de Logs técnicos del servidor. El flujo de Solicitudes/Compras
(cotización → aprobación → confirmación → factura/pago → evaluación) y los
módulos de Formularios y Reportes están deliberadamente fuera de alcance
todavía — son placeholders "Próximamente" en el frontend.

---

## ✅ Implementado

### 1. Fundaciones (backend + frontend)
- Modelo de datos base y estructura de carpetas — spec:
  `docs/superpowers/specs/2026-07-02-cod-modelo-datos-estructura-design.md`
- Scaffold de frontend, autenticación (JWT), layout, Dashboard de Inicio,
  módulo de Áreas — spec:
  `docs/superpowers/specs/2026-07-06-cod-frontend-foundation-design.md`
- Detalle de Área (info, líder resuelto, conteo de carpetas/documentos,
  navegación cruzada) — spec:
  `docs/superpowers/specs/2026-07-09-cod-detalle-area-design.md`

### 2. Repositorio documental (Documentos + Carpetas)
- API de Documentos: CRUD, tipos de documento, subida/versión/descarga de
  archivos, cálculo de `estado` con job diario — spec:
  `docs/superpowers/specs/2026-07-07-cod-documentos-api-design.md`
- Frontend de Documentos: listado con filtros/paginación, creación con
  subida de archivo, detalle con edición e historial de versiones, gestión
  de carpetas — spec:
  `docs/superpowers/specs/2026-07-07-cod-documentos-frontend-design.md`
- Vista de carpetas estilo Google Drive (tarjetas, migas de pan, detalle de
  carpeta) — spec:
  `docs/superpowers/specs/2026-07-08-cod-carpetas-vista-drive-design.md`

### 3. Modelo de roles y permisos (refactor 2026-07-21)

Reemplaza el modelo anterior (roles acoplados a departamento: `admin`,
`financiera`, `operaciones`, `lider_area`, `solicitante`, `auditor`) por 8
roles funcionales, con el área como un campo separado del usuario:

- **Catálogo de 8 roles**: `super_administrador` (100), `aprobador_ejecutivo`
  (90), `aprobador_area` (70), `gestor_compras` (50), `gestor_documental`
  (40), `solicitante` (30), `auditor` (20), `colaborador` (10). Migración de
  datos traduce usuarios existentes según tabla de mapeo, sin borrar
  historial de auditoría (roles viejos desactivados, no eliminados).
- **`Usuario.areaId`** (nullable) — el área ya no vive en el nombre del rol.
- **Relación muchos-a-muchos Usuario↔Rol** (tabla `usuario_roles`) — un
  usuario puede tener varios roles simultáneos (ej. Gestor documental +
  Auditor). Autorización por unión: basta con que UN rol otorgue el permiso.
  El JWT ya no lleva datos de autorización — `verificarToken` siempre
  reconsulta la BD.
- **Matriz de accesos** (`Administración > Matriz de accesos`, solo
  lectura): panel rol × módulo mostrando las acciones concedidas por cada
  rol, más el catálogo completo de módulos posibles. El área no es parte de
  la matriz (es global por rol) — el área de cada usuario se consulta por
  separado en Usuarios. Edición desde esta pantalla queda fuera de alcance
  por ahora (el permiso `matriz_accesos:editar` existe en el catálogo pero
  no tiene endpoint todavía).
- **Cuenta externa Colaborador↔Proveedor**: modelo de datos (sin pantalla
  todavía) para representar que un Usuario externo puede representar a uno o
  más Proveedor (`usuario_proveedores`, N:M). El scoping de autorización
  real (qué ve un colaborador externo) queda para un ciclo futuro.
- Spec: `docs/superpowers/specs/2026-07-21-cod-modelo-roles-definitivo.md`

### 4. Proveedores y Contratistas
- CRUD de Proveedor, catálogo de solo lectura de `RequisitoProveedor`,
  expediente documental (`ProveedorDocumento`: subida/descarga/baja),
  checklist de requisitos por criticidad, cálculo de `estado` con umbral de
  30 días, job diario extendido.
- **Criticidad renombrada**: `alta/media/baja` → `critico/relevante/basico`
  (migración de 3 pasos sobre el ENUM, datos existentes traducidos).
- **Permisos separados**: `proveedores:gestionar` (crear/editar/expediente,
  rol `gestor_compras`) y `proveedores:aprobar` (aprobar/rechazar, roles
  `aprobador_area`/`aprobador_ejecutivo`) — ya no comparten un único
  `proveedores:editar`. `PUT /:id` no acepta el campo `estado` a propósito,
  para que un rol con solo `gestionar` no pueda lograr el efecto de aprobar.
- **Aprobación en dos gates** (reemplaza el Aprobar/Rechazar de un solo
  paso):
  - **Aprobar registro** (`POST /:id/aprobar-registro`): `en_evaluacion` →
    `registro_aprobado`. Solo valida que exista `areaSolicitanteId`.
  - **Aprobar requisitos** (`POST /:id/aprobar-requisitos`):
    `registro_aprobado` → `activo`. Valida que todo `RequisitoProveedor`
    activo+obligatorio+aplicable a la criticidad del proveedor tenga al
    menos un `ProveedorDocumento` cubriéndolo (`estado != 'vencido'`); si
    falta alguno, 400 listando los nombres. Si todo está cubierto, crea (o
    reutiliza) la carpeta del proveedor en Documentos y refleja el
    expediente, igual que antes.
  - **Rechazar** (`POST /:id/rechazar`): ahora válido desde `en_evaluacion`
    O `registro_aprobado`.
  - Ambos gates de aprobación comparten el mismo permiso
    `proveedores:aprobar` (decisión de diseño confirmada).
- Spec: `docs/superpowers/specs/2026-07-09-cod-proveedores-design.md`

### 5. Niveles de aprobación (preparación para Solicitudes)

- `NivelAprobacion.rolAprobador` renombrado al catálogo de 8 roles
  (`aprobador_area`/`aprobador_ejecutivo` — nunca `admin`, que ya no
  significa "aprueba compras"). **Los montos de ejemplo siguen siendo
  provisionales, pendientes de que Financiera confirme las cifras reales.**
- `resolverNivelAprobacion(tipoSolicitudId, monto, criticidad)` — nuevo
  parámetro opcional `criticidad`: si vale `'critico'`, escala directo a
  `aprobador_ejecutivo` sin importar el monto (antes solo escalaba por
  monto, dejando pasar un proveedor crítico por un aprobador de menor
  nivel si el monto era bajo). Esta función todavía no está conectada a
  ningún controller real — Solicitudes sigue sin construirse.

### 6. Logs del servidor

- Pantalla técnica dentro de la app (no archivo en disco) en
  `/administracion/logs`, gateada por `logs_servidor:ver`.
- Tabla `LogServidor` (nivel/método/ruta/statusCode/duración/mensaje/stack/
  usuario/ip), poblada por middleware de cada request HTTP + extensión del
  middleware global de errores.
- Purga automática diaria a los 14 días (node-cron).
- Spec: `docs/superpowers/specs/2026-07-09-cod-logs-servidor-design.md`

---

## ⏳ Pendiente / fuera de alcance por ahora

- **Solicitudes / Compras** (`solicitudes` en el catálogo de permisos: ver,
  crear, comentar, cotizar, aprobar, confirmar, exportar): flujo completo
  cotización → aprobación → confirmación → factura/pago → evaluación de
  proveedor. Hoy `/solicitudes` es un placeholder "Próximamente".
- **Formularios** (`formularios`: ver, crear, editar, eliminar): sin
  diseñar, placeholder "Próximamente".
- **Reportes** (`reportes`: ver, exportar): sin diseñar, placeholder
  "Próximamente".
- **Evaluación de proveedores** (`EvaluacionProveedor`, permiso
  `proveedores:evaluar`): el modelo de datos ya existe, sin rutas ni
  pantalla propia todavía — ligado al flujo de Solicitudes/Compras.
- **Exportación** (`proveedores:exportar`, `documentos:exportar`,
  `reportes:exportar`): el permiso existe en el catálogo pero ninguna
  pantalla implementa hoy una acción de exportar real.
- **Matriz de accesos — edición**: hoy es solo lectura; el permiso
  `matriz_accesos:editar` existe en el catálogo pero no hay endpoint ni UI
  para modificar permisos de un rol desde la pantalla (se sigue ajustando
  vía `seedRolesPermisos.js`).
- **Cuenta externa Colaborador↔Proveedor — autorización real**: el modelo
  de datos (`usuario_proveedores`) ya existe, pero no hay ninguna lógica de
  scoping que limite lo que ve un colaborador externo a su(s) proveedor(es)
  vinculado(s), ni pantalla de administración para gestionar el vínculo.
- **Montos de `NivelAprobacion`**: siguen siendo cifras de ejemplo,
  pendientes de que Financiera confirme los valores reales de ISTHO.
- Notas Minor abiertas (no bloqueantes):
  - La tabla `logs_servidor` (y `auditoria`) crecen sin límite entre purgas
    en la base de test compartida.
  - Warning cosmético de Jest ("did not exit") por handles asíncronos de
    Sequelize/MySQL que no se cierran explícitamente al final de la suite.

---

## Notas de estado del repositorio

- Todo el trabajo hasta la fecha se hizo directamente sobre `main` (sin
  branches ni worktrees), siguiendo el patrón ya establecido en este
  proyecto.
- El ledger de progreso de las tareas ejecutadas vía Subagent-Driven
  Development vive en `.superpowers/sdd/progress.md` (ignorado por git, uso
  interno de recuperación entre sesiones).
