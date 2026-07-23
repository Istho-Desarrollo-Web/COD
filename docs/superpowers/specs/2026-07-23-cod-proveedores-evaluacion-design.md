# Evaluación de Proveedores — Design

## Contexto

El mapa de proceso "Gestión de Compras" incluye, como paso final del ciclo
cotización → aprobación → confirmación → factura/pago → **evaluación de
proveedor**, la evaluación anual de cada proveedor/contratista. El modelo de
datos base ya existe desde el diseño inicial del backend
(`server/src/models/EvaluacionProveedor.js`, con su asociación
`Proveedor.hasMany(EvaluacionProveedor)` ya presente en `models/index.js`),
pero **sin migración, sin rutas, sin controlador y sin pantalla** — es un
concepto técnicamente independiente de `Solicitud` (un ciclo anual ligado a
`Proveedor`, sin depender de ninguna Solicitud puntual), señalado como
pendiente en `docs/ESTADO-PROYECTO.md`.

`Proveedor` ya tiene las columnas `fechaUltimaEvaluacion`/
`fechaProximaEvaluacion` (ambas nulas hoy, sin usar en ningún controller). El
permiso `proveedores:evaluar` ya existe en `CATALOGO_MODULOS` pero **ningún
rol lo tiene asignado** en el seed actual — ni siquiera `gestor_compras`,
cuya propia descripción ("Cotiza, vincula proveedores, genera órdenes,
**consolida evaluaciones**") ya lo anticipa.

Este diseño construye ese ciclo: creación de evaluaciones (automática vía
job diario + manual), su flujo de estados, y la actualización del ciclo
anual en `Proveedor`.

## Objetivo

1. Migración para la tabla `evaluaciones_proveedor` (el modelo y la
   asociación ya existen).
2. Job diario (`node-cron`, mismo patrón que
   `recalcularEstadosDocumentos.job.js`) que crea evaluaciones `pendiente`
   automáticamente y marca `vencida` las que ya pasaron su fecha
   programada sin completarse.
3. Creación manual de una evaluación (necesaria para el "arranque" del
   ciclo de cada proveedor, ya que `fechaProximaEvaluacion` nace en `NULL`
   y el job no tiene de dónde disparar la primera).
4. Flujo de estados `pendiente → en_proceso → completada`, con `puntaje`
   (0-100) obligatorio al completar.
5. Al completar una evaluación, actualizar
   `Proveedor.fechaUltimaEvaluacion`/`fechaProximaEvaluacion` (+1 año),
   cerrando el ciclo anual para la siguiente ejecución del job.
6. Nuevo permiso `proveedores:evaluar` en el seed, para `gestor_compras`,
   `aprobador_area` y `aprobador_ejecutivo`.
7. Frontend: pestaña "Evaluaciones" en `ProveedorDetalle.jsx` (historial +
   acciones) y un listado transversal nuevo (`/proveedores/evaluaciones`,
   solo lectura, filtrable por estado) para ver de un vistazo qué está
   pendiente/vencido en todos los proveedores.

## Máquina de estados

ENUM ya existente en `EvaluacionProveedor.estado`: `pendiente | en_proceso |
completada | vencida`.

```text
(job diario o creación manual) ──────────────► pendiente
                                                    │
                                    POST /:id/evaluaciones/:evalId/iniciar
                                                    ▼
                                              en_proceso
                                                    │
                          POST /:id/evaluaciones/:evalId/completar
                          (puntaje 0-100 obligatorio, observaciones opcional)
                                                    ▼
                                              completada (terminal)
                                                    │
                              Proveedor.fechaUltimaEvaluacion = hoy
                              Proveedor.fechaProximaEvaluacion = hoy + 1 año

pendiente o en_proceso, con fechaProgramada ya pasada ──(job diario)──► vencida (terminal)
```

## Job diario

`server/src/jobs/evaluacionProveedor.job.js` (mismo patrón `node-cron` que
`recalcularEstadosDocumentos.job.js`), más el script
`server/src/scripts/ejecutarEvaluacionesProveedor.js` para correrlo
manualmente (`npm run job:evaluar-proveedores`). Para cada `Proveedor` con
`estado === 'activo'`:

1. Si tiene una `EvaluacionProveedor` con `estado` en
   `['pendiente', 'en_proceso']` y `fechaProgramada` ya pasada (`<` hoy) →
   márcala `vencida`.
2. Si NO tiene ninguna `EvaluacionProveedor` con `estado` en
   `['pendiente', 'en_proceso']` vigente, y `fechaProximaEvaluacion` no es
   `NULL` y ya llegó o pasó (`<=` hoy) → crea una nueva
   `EvaluacionProveedor` (`periodo` = año de `fechaProximaEvaluacion`,
   `fechaProgramada` = `fechaProximaEvaluacion`, `estado: 'pendiente'`).

El job **no** registra en `Auditoria` sus cambios automáticos — mismo
precedente que `recalcularEstadosDocumentos.job.js` (que tampoco lo hace);
`Auditoria` requiere un usuario humano (`usuarioId`/`usuarioNombre`), y un
cron no lo es.

## Arquitectura

### Backend

- **Permisos**: sin cambios a `CATALOGO_MODULOS` (`proveedores:evaluar` ya
  existe). En `seedRolesPermisos.js`, se agrega `'evaluar'` a los arrays
  `proveedores` de `gestor_compras` (→ `['ver', 'gestionar', 'evaluar']`),
  `aprobador_area` y `aprobador_ejecutivo` (→ `['ver', 'aprobar',
  'evaluar']` en ambos).

- **`evaluacionProveedor.controller.js`** (nuevo — agrupa todo lo de
  evaluaciones, tanto el sub-recurso por proveedor como el listado
  transversal, para no sumarle más responsabilidades a
  `proveedor.controller.js`):
  - `listar(req, res)` — `GET /proveedores/:id/evaluaciones`: historial de
    evaluaciones de un proveedor (orden descendente por `fechaProgramada`).
    Gateado por `proveedores:ver`.
  - `listarTodas(req, res)` — `GET /proveedores/evaluaciones`: listado
    transversal de todos los proveedores, filtrable por `?estado=`,
    incluye `Proveedor` (razón social, criticidad). Gateado por
    `proveedores:evaluar` (vista de gestión, no de consulta general —
    mismo criterio que `logs_servidor:ver`/`matriz_accesos:ver`). Es
    **solo lectura**: ninguna acción (iniciar/completar/crear) vive aquí,
    todas están en la pestaña del proveedor, para no duplicar UI de
    acciones en dos lugares.
  - `crear(req, res)` — `POST /proveedores/:id/evaluaciones`: programa
    manualmente una evaluación. Body: `fechaProgramada` (obligatoria);
    `periodo` se calcula del año de `fechaProgramada`. Estado inicial
    `'pendiente'`. Gateado por `proveedores:evaluar`. `400` si el
    proveedor ya tiene una evaluación `pendiente`/`en_proceso` vigente
    (evita duplicados, mismo espíritu que el chequeo de `Factura`
    duplicada en el ciclo anterior).
  - `iniciar(req, res)` — `POST
    /proveedores/:id/evaluaciones/:evaluacionId/iniciar`: exige `estado
    === 'pendiente'` (`400` si no), fija `responsableUsuarioId =
    req.user.id`, pasa a `'en_proceso'`. Gateado por `proveedores:evaluar`.
  - `completar(req, res)` — `POST
    /proveedores/:id/evaluaciones/:evaluacionId/completar`: exige `estado
    === 'en_proceso'` (`400` si no). Body: `puntaje` (obligatorio, `0` a
    `100` inclusive — `400` fuera de rango o faltante), `observaciones`
    (opcional). Fija `fechaRealizada = hoy`, pasa a `'completada'`, y
    actualiza el `Proveedor` asociado: `fechaUltimaEvaluacion = hoy`,
    `fechaProximaEvaluacion = hoy + 1 año`. Gateado por
    `proveedores:evaluar`.
  - Las 3 acciones de escritura (`crear`, `iniciar`, `completar`)
    registran en `Auditoria` (`tabla: 'evaluaciones_proveedor'`), mismo
    patrón que el resto del sistema.

- **Rutas** (`proveedor.routes.js`, modificado — **orden crítico en
  Express**: `GET /evaluaciones` debe declararse antes de `GET /:id`,
  mismo problema de ambigüedad que `/solicitudes/tipos` resolvió en el
  ciclo 1 de Solicitudes):
  ```
  GET  /proveedores/evaluaciones                                 (listarTodas)
  GET  /proveedores/:id/evaluaciones                              (listar)
  POST /proveedores/:id/evaluaciones                              (crear)
  POST /proveedores/:id/evaluaciones/:evaluacionId/iniciar        (iniciar)
  POST /proveedores/:id/evaluaciones/:evaluacionId/completar      (completar)
  ```

- **Migración**: crea la tabla `evaluaciones_proveedor` con los campos ya
  definidos en el modelo (`proveedor_id` FK, `periodo`, `fecha_programada`,
  `fecha_realizada` nullable, `responsable_usuario_id` FK nullable,
  `puntaje` nullable, `estado` ENUM con default `'pendiente'`,
  `observaciones` nullable).

### Frontend

- `frontend/src/api/evaluacionProveedor.service.js` (nuevo):
  `listar(proveedorId)`, `listarTodas(filtros)`, `crear(proveedorId,
  datos)`, `iniciar(proveedorId, evaluacionId)`, `completar(proveedorId,
  evaluacionId, datos)` — mismo patrón que el resto de
  `frontend/src/api/*.service.js`.
- `frontend/src/pages/proveedores/ProveedorDetalle.jsx` (modificado):
  nueva pestaña "Evaluaciones" (tercera, junto a "Detalle" y "Expediente
  documental"): historial (periodo, fecha programada/realizada, puntaje,
  estado vía `StatusChip`, responsable); botón "Programar evaluación"
  (form con `fechaProgramada`, gateado por `tienePermiso('proveedores',
  'evaluar')`, oculto si ya existe una `pendiente`/`en_proceso` activa);
  botón "Iniciar" por cada evaluación `pendiente`; formulario "Completar"
  (`puntaje` + `observaciones`) por cada evaluación `en_proceso`.
- `frontend/src/pages/proveedores/EvaluacionesListado.jsx` (nuevo) en
  `/proveedores/evaluaciones`: filtro por estado (`FilterDropdown`), fila
  con proveedor (razón social + criticidad), periodo, fechas, puntaje,
  estado; clic en una fila navega a `/proveedores/:id` (para actuar desde
  la pestaña "Evaluaciones" de ese proveedor). Gateado por
  `PermissionRoute modulo="proveedores" accion="evaluar"`. A diferencia
  del backend, React Router v7 (ya en uso, `package.json`) rankea las
  rutas estáticas sobre las dinámicas automáticamente — `/proveedores/
  evaluaciones` no necesita declararse antes de `/proveedores/:id` en
  `App.jsx`.

## Manejo de errores

- `POST /:id/evaluaciones`: `400` si falta `fechaProgramada`, o si ya
  existe una evaluación `pendiente`/`en_proceso` para ese proveedor;
  `404` si el proveedor no existe.
- `POST /:id/evaluaciones/:evaluacionId/iniciar`: `400` si `estado !==
  'pendiente'`; `404` si la evaluación no existe (o no pertenece a ese
  proveedor).
- `POST /:id/evaluaciones/:evaluacionId/completar`: `400` si `estado !==
  'en_proceso'`, si falta `puntaje`, o si `puntaje` está fuera de `[0,
  100]`.
- Toda mutación (`EvaluacionProveedor`, `Proveedor`) iniciada por un
  usuario registra en `Auditoria`; el job diario no.
- Errores de red/carga en frontend: `enqueueSnackbar` con el mensaje del
  backend, mismo patrón en toda la app.

## Testing

**Backend:** Jest + supertest (mismo patrón que
`proveedor.routes.test.js`/`cotizacion.routes.test.js`), cubriendo:
creación manual (éxito y rechazo por duplicado), `iniciar`/`completar` con
validación de estado en cada transición, rango de `puntaje` (0, 100,
fuera de rango, faltante), actualización de `fechaUltimaEvaluacion`/
`fechaProximaEvaluacion` en `Proveedor` al completar, permisos por rol
(`gestor_compras`/`aprobador_area`/`aprobador_ejecutivo` sí, otros roles
no), listado transversal filtrado por `estado`. Test unitario para el job
(mismo patrón que `recalcularEstadosDocumentos.job.test.js`): crea
`pendiente` cuando corresponde, marca `vencida` cuando corresponde, no
duplica si ya hay una evaluación activa, ignora proveedores no `activo`.

**Frontend:** Vitest + Testing Library, `describe`/`it` en inglés,
`vi.mock(...)` para los servicios — `evaluacionProveedor.service.test.js`;
extensión de `ProveedorDetalle.test.jsx` (pestaña nueva, gating de
acciones por estado/permiso); `EvaluacionesListado.test.jsx` (nuevo,
filtro por estado, navegación al hacer clic en una fila).

## Fuera de alcance

- **Notificaciones/emails de recordatorio** — el "recordatorio
  automático" se traduce en la creación de la fila `pendiente` (visible
  en el listado transversal); no hay envío de correos en este ciclo.
- **Adjuntar un documento/reporte a la evaluación** — el modelo no tiene
  columna de archivo; la evaluación es solo `puntaje` + `observaciones`.
- **Editar o revertir una evaluación ya `completada` o `vencida`.**
- **Configurar el período de "1 año" o el criterio de vencimiento** —
  quedan fijos en código, sin pantalla de configuración.
- **Acciones (iniciar/completar/crear) desde el listado transversal** —
  ese listado es solo lectura + navegación; toda acción ocurre desde la
  pestaña "Evaluaciones" del proveedor.
