# COD Documentos API — Design Spec

## Contexto

El backend de COD (Centro Operativo Documental) ya tiene, desde el diseño de modelo de datos (`2026-07-02-cod-modelo-datos-estructura-design.md`), los modelos Sequelize, migraciones, y una capa de servicio mínima para `Documento`, `Carpeta`, `TipoDocumento` y `DocumentoVersionHistorial` — todos probados a nivel de modelo/servicio. Pero **no existe ninguna API HTTP para estas entidades**: no hay controller, no hay rutas, no hay endpoint de listado/filtrado/paginación, y no hay manejo real de subida de archivos (el campo `s3Key` es hoy un string libre sin ningún middleware de upload conectado).

Este spec cubre la construcción de esa API HTTP completa — el equivalente para Documentos de lo que ya existe para Áreas — como paso previo al módulo frontend de Documentos (que se diseñará en un spec separado una vez esta API esté fusionada).

## Decisiones de diseño

| Decisión | Elegido | Alternativas descartadas |
|---|---|---|
| Almacenamiento de archivos | Disco local vía `multer`, con una capa de indirección (`almacenamiento.service.js`) para poder migrar a S3 después sin cambiar el contrato de la API | Integración real con AWS S3 ahora (requiere credenciales/bucket que no existen aún); solo metadatos sin manejo real de archivos (no sería un sistema documental funcional) |
| Alcance de Carpetas/TiposDocumento | Incluidos en este mismo spec | Spec aparte (bloquearía al frontend de Documentos, que necesita navegación por carpetas desde el día uno) |
| Significado de `documentos.aprobar_version` | Permiso simple para subir una nueva versión (sin flujo de aprobación en dos pasos) | Flujo de aprobación con estado "pendiente" (requeriría un modelo/estado adicional no contemplado en el diseño de datos actual) |
| Significado de `documentos.exportar` | Gatea la descarga del archivo (vigente o de una versión histórica) | Gatea un export CSV/Excel del listado (se puede agregar después como una acción adicional si hace falta) |
| Job de recálculo diario de `estado` | Cron interno con `node-cron`, programado desde `server.js`, más un script npm para ejecución manual/externa | Diferirlo a un spec futuro (el diseño de datos ya lo exige explícitamente: "recalculada por job diario + al guardar") |
| Restricciones de archivo | `.pdf, .doc, .docx, .xls, .xlsx, .ppt, .pptx, .jpg, .jpeg, .png`, máximo 20MB | Solo PDF (muy restrictivo, no cubre plantillas Office); sin restricción de tipo (superficie de riesgo innecesaria) |
| Nombre del campo de ubicación de archivo | Se mantiene `s3Key`/`s3_key` en el esquema existente (evita una migración innecesaria); el spec documenta que es "ubicación del archivo" en abstracto, no necesariamente S3 | Renombrar la columna ahora (churn de migración sin beneficio funcional inmediato) |
| Paginación | Se usa por fin el helper `paginated()` ya existente en `utils/responses.js` (definido pero sin ningún call site hasta ahora) | Implementar un esquema de paginación nuevo desde cero |

## Endpoints

### Documentos (`/api/v1/documentos`)

| Método | Ruta | Permiso | Descripción |
|---|---|---|---|
| GET | `/` | `documentos.ver` | Listar con filtros (`areaId`, `carpetaId`, `tipoDocumentoId`, `estado`) + paginación (`page`, `limit`, default `limit=20`, máx `100`) |
| GET | `/:id` | `documentos.ver` | Detalle de un documento |
| POST | `/` | `documentos.crear` | Crear documento (multipart: archivo + metadata) |
| PUT | `/:id` | `documentos.editar` | Editar metadata (nombre, código, tipo, carpeta, responsable, días de alerta) |
| DELETE | `/:id` | `documentos.eliminar` | Baja lógica (`activo=false`) |
| GET | `/:id/versiones` | `documentos.ver` | Historial de versiones |
| POST | `/:id/versiones` | `documentos.aprobar_version` | Subir nueva versión (reemplaza la vigente; reutiliza `subirNuevaVersion` ya existente en `documento.service.js`) |
| GET | `/:id/descargar` | `documentos.exportar` | Descargar el archivo vigente |
| GET | `/:id/versiones/:versionId/descargar` | `documentos.exportar` | Descargar una versión histórica |

### Carpetas (`/api/v1/carpetas`)

| Método | Ruta | Permiso | Descripción |
|---|---|---|---|
| GET | `/?areaId=` | `documentos.ver` | Árbol de carpetas de un área (incluye `subcarpetas` anidadas). `areaId` es obligatorio — sin él, `badRequest`. |
| POST | `/` | `documentos.crear` | Crear carpeta (raíz o anidada vía `carpetaPadreId`) |

### Tipos de documento (`/api/v1/tipos-documento`)

| Método | Ruta | Permiso | Descripción |
|---|---|---|---|
| GET | `/` | `documentos.ver` | Catálogo de solo lectura (ya sembrado por `seedTiposDocumento.js`; sin crear/editar vía API) |

## Subida de archivos

**Almacenamiento:**
- Directorio: `server/uploads/documentos/<areaId>/`
- Nombre generado: `<uuid>.<extensión-original>` (evita colisiones, no expone el nombre original en la URL)
- Capa de indirección: `server/src/services/almacenamiento.service.js` expone `guardarArchivo(file, areaId)` → `{ ruta }`, `obtenerRutaAbsoluta(ruta)`, `eliminarArchivo(ruta)`. Ningún controller/servicio llama a `multer`/`fs` directamente — esto es lo que permite migrar a S3 después cambiando un solo archivo.
- La ruta relativa devuelta por `guardarArchivo` se guarda en el campo existente `s3Key` de `Documento`/`DocumentoVersionHistorial` (sin renombrar el campo).

**Validación (middleware `server/src/middlewares/upload.js`, config de multer):**
- Tipos aceptados (por extensión y mimetype): `.pdf, .doc, .docx, .xls, .xlsx, .ppt, .pptx, .jpg, .jpeg, .png`
- Tamaño máximo: 20MB por archivo
- Rechazos: `badRequest(res, 'Tipo de archivo no permitido')` / `badRequest(res, 'El archivo excede el tamaño máximo de 20MB')`

**Validación de metadata (sin librería, igual que `area.controller.js`):**
- `nombre`, `areaId`, `tipoDocumentoId`, `carpetaId` obligatorios en creación → `badRequest` si faltan
- `tipoDocumentoId`/`carpetaId` deben existir y estar activos → `notFound`/`badRequest` si no
- `carpetaId` debe pertenecer al `areaId` enviado (`Carpeta.areaId === areaId`) → `badRequest` si no coincide. Se valida igual en `PUT /:id` cuando se cambia `carpetaId`.
- `vigenciaHasta` (si se envía) debe ser posterior a `vigenciaDesde` → `badRequest`

**Recálculo de `estado` en `PUT /:id`:** si la edición cambia `vigenciaDesde`, `vigenciaHasta` o `diasAlertaVencimiento`, el controller recalcula `estado` con `calcularEstadoDocumento` (igual que hace `subirNuevaVersion`) antes de guardar. Si el `estado` resultante cambió, se llama `recalcularSaludArea(areaId)`. Ediciones que no tocan esos tres campos no disparan recálculo.

**Recálculo de salud de área en `DELETE /:id`:** dar de baja un documento (`activo=false`) cambia el denominador de `saludDocumentalPct`, así que el controller llama `recalcularSaludArea(areaId)` después de la baja lógica.

## Job diario de recálculo de estado

- Módulo `server/src/jobs/recalcularEstadosDocumentos.job.js`, exporta `ejecutar()` (lógica pura, testeable sin el scheduler) y `programar()` (registra el cron).
- `programar()` se llama una sola vez desde `server.js` al arrancar, con expresión cron configurable vía `CRON_RECALCULO_ESTADOS` en `.env` (default `'0 3 * * *'`, 3am).
- `ejecutar()`: recorre `Documento` con `activo: true`, recalcula `estado` con `calcularEstadoDocumento` (ya existente), actualiza en lote solo los que cambiaron, y llama `recalcularSaludArea(areaId)` una vez por área afectada (no una vez por documento).
- Script npm `job:recalcular-estados` para ejecución manual/externa (además del cron interno).
- Sin endpoint HTTP expuesto para disparar el job manualmente — solo el script npm.

## Respuestas y paginación

- Todas las respuestas usan el contrato existente `{ success, data, message, errors, code }` de `utils/responses.js`.
- `GET /documentos` usa por primera vez el helper `paginated(res, documentos, { page, limit, total, totalPages })`.
- Los filtros (`areaId`, `carpetaId`, `tipoDocumentoId`, `estado`) son todos opcionales y combinables como `WHERE` de Sequelize.

## Estructura de archivos

**Nuevos:**
```
server/src/controllers/documento.controller.js
server/src/controllers/carpeta.controller.js
server/src/controllers/tipoDocumento.controller.js
server/src/routes/documento.routes.js
server/src/routes/carpeta.routes.js
server/src/routes/tipoDocumento.routes.js
server/src/middlewares/upload.js
server/src/services/almacenamiento.service.js
server/src/jobs/recalcularEstadosDocumentos.job.js
server/tests/integration/documento.routes.test.js
server/tests/integration/carpeta.routes.test.js
server/tests/integration/tipoDocumento.routes.test.js
server/tests/unit/recalcularEstadosDocumentos.job.test.js
server/tests/fixtures/documento-prueba.pdf
```

**Modificados:**
```
server/src/routes/index.js        (montar /documentos, /carpetas, /tipos-documento)
server/src/services/documento.service.js  (sin cambios de contrato; se reutiliza tal cual)
server/server.js                  (llamar programar() del cron al arrancar)
server/package.json               (agregar multer, node-cron)
server/.env.example                (CRON_RECALCULO_ESTADOS)
.gitignore                         (agregar /server/uploads/)
```

## Testing

Misma convención que el resto del backend: tests de integración reales contra MySQL vía `supertest`, sin mocks. Las subidas de archivo se prueban con `.attach()` de supertest usando un PDF pequeño real en `server/tests/fixtures/`. Los controllers siguen el mismo estilo delgado que `area.controller.js` (consultas Sequelize directas en el controller), delegando a `documento.service.js` solo la lógica ya existente y probada (cálculo de estado, versión, salud del área). El job de recálculo se prueba llamando `ejecutar()` directamente (documentos con fechas ya vencidas insertados en la BD de test), sin depender del scheduler real.

## Fuera de alcance (deliberadamente)

- Frontend del módulo Documentos (spec separado, posterior a esta API).
- Integración real con AWS S3 (la capa de indirección lo permite después sin romper el contrato).
- Flujo de aprobación de versión en dos pasos.
- Export CSV/Excel del listado de documentos.
- Endpoint HTTP para disparar el job de recálculo manualmente (solo script npm).
- Notificaciones de vencimiento (email/push) — el job solo recalcula `estado`, no notifica a nadie todavía.
- Edición/eliminación de Carpetas y Tipos de Documento vía API (Carpetas solo se crean, no se editan/eliminan en este spec; Tipos de Documento es solo lectura).
