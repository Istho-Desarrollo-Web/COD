# Módulo de Solicitudes/Compras (ciclo 1: cotización → aprobación → confirmación) — Design

## Contexto

El mapa de proceso "Gestión de Compras" tiene dos sub-proyectos. El primero
(Proveedores y Contratistas: expediente digital + CRUD + aprobación en dos
gates) ya está completo. Este diseño construye el segundo: el flujo de
**Solicitudes/Compras**, deliberadamente diferido durante todo el ciclo
anterior.

El flujo completo del proceso real es cotización → aprobación → confirmación
→ factura/pago → evaluación de proveedor. De esos cinco pasos, **factura/pago
no tiene ningún modelo de datos hoy** (requeriría diseñar campos/tablas
nuevas) y **evaluación de proveedor** ya es un concepto aparte
(`EvaluacionProveedor`, con su propio ciclo de programación anual, señalado
como pendiente en `docs/ESTADO-PROYECTO.md`). Este ciclo cubre únicamente
**Solicitud → cotización → aprobación → confirmación** — el corte natural,
justo donde termina lo que ya tiene modelo de datos
(`Solicitud.ordenFormalNumero`/`ordenFormalS3Key`). Factura/pago y evaluación
quedan como sub-proyectos siguientes.

El modelo de datos base ya existe desde el diseño inicial del backend
(`TipoSolicitud`, `NivelAprobacion`, `Solicitud`, `Cotizacion`,
`SolicitudAprobacion` en `server/src/models/`, con sus migraciones y
asociaciones ya corridas), pero sin ninguna ruta/controlador backend ni
página frontend real — hoy `/solicitudes` renderiza el placeholder genérico
`ProximamentePage`. El refactor de roles previo (2026-07-21) ya dejó listo:
el catálogo de permisos `solicitudes: [ver, crear, comentar, cotizar,
aprobar, confirmar, exportar]` repartido en el seed entre `gestor_compras`
(`ver, crear, comentar, cotizar`) y `aprobador_area`/`aprobador_ejecutivo`
(`ver, aprobar, confirmar`); `NivelAprobacion.rolAprobador` ya usa el
catálogo de 8 roles funcionales; y `resolverNivelAprobacion(tipoSolicitudId,
monto, criticidad)` ya soporta escalar a `aprobador_ejecutivo` cuando la
criticidad es `'critico'`, independientemente del monto — pero esa función
todavía no está conectada a ningún flujo real. Este ciclo es lo que la
conecta.

## Objetivo

1. CRUD de `Solicitud` (crear, listar con filtros, detalle) — una Solicitud
   nace directamente en `estado: 'cotizando'` (sin una etapa de "borrador"
   editable separada en este ciclo, aunque el ENUM conserva el valor).
2. Flujo de cotización: `gestor_compras` agrega una o varias `Cotizacion`
   (proveedor opcional, monto, archivo adjunto, observaciones) y marca una
   como seleccionada.
3. Envío a aprobación: acción explícita que resuelve un único nivel de
   aprobación (por el monto de la cotización seleccionada y la criticidad de
   su proveedor, si tiene uno vinculado) y crea una `SolicitudAprobacion`
   pendiente — sin cadenas de aprobación multi-nivel en este ciclo.
4. Aprobación/rechazo: el aprobador correspondiente (`aprobador_area`,
   restringido a su propia área; `aprobador_ejecutivo`, sin restricción de
   área) resuelve la `SolicitudAprobacion` pendiente.
5. Confirmación: `gestor_compras` cierra el ciclo subiendo el número y el
   archivo de la orden formal.
6. Comentarios: hilo simple (sin edición/hilos anidados) ligado a la
   Solicitud, para `solicitante` y `gestor_compras` (los únicos roles con
   `solicitudes:comentar` en el seed actual).
7. Cancelación: el propio solicitante puede cancelar su Solicitud mientras
   esté en `cotizando` o `en_aprobacion`.

## Máquina de estados de `Solicitud`

```text
crear ──────────────────────────► cotizando
                                      │
                    POST /:id/enviar-aprobacion
                    (requiere una Cotizacion seleccionada)
                                      ▼
                                en_aprobacion ──POST /:id/rechazar──► rechazada (terminal)
                                      │
                              POST /:id/aprobar
                                      ▼
                                  aprobada
                                      │
                          POST /:id/confirmar
                                      ▼
                                 confirmada (terminal para este ciclo)

cotizando o en_aprobacion ──POST /:id/cancelar (dueño)──► cancelada (terminal)
```

`cerrada` (factura/pago) no tiene ninguna transición hacia ella en este
ciclo — queda reservada para el sub-proyecto de factura/pago.

## Arquitectura

### Backend

- **`solicitud.routes.js` + `solicitud.controller.js`**:
  - `GET /solicitudes` — filtrable por `estado`/`tipo` vía query params. Si
    el usuario autenticado tiene el rol `solicitante` (y ningún otro rol con
    visibilidad más amplia), el listado se filtra por
    `solicitanteUsuarioId === req.user.id`; el resto de roles con
    `solicitudes:ver` (`gestor_compras`, `aprobador_area`,
    `aprobador_ejecutivo`) ven todas las solicitudes, sin filtro de área
    (mismo criterio que `proveedores:ver` hoy).
  - `POST /solicitudes` — gateado por `solicitudes:crear`. Requiere
    `tipoSolicitudId`, `areaSolicitanteId`, `descripcion`.
    `montoEstimado` es opcional (el modelo ya lo permite nulo) — es
    puramente informativo, ya que la resolución del nivel de aprobación usa
    el monto real de la cotización seleccionada, no el estimado.
    `solicitanteUsuarioId` se fija siempre a `req.user.id` (no viene del
    body). `estado` nace en `'cotizando'`. `codigo` se genera en el
    backend, no lo provee el cliente: `SOL-<año actual>-<id autoincremental
    de la fila>` (ej. `SOL-2026-142`) — evita condiciones de carrera de
    contar filas por año y no depende de que el solicitante invente un
    código único.
  - `GET /solicitudes/:id`.
  - `POST /solicitudes/:id/enviar-aprobacion` — gateado por
    `solicitudes:cotizar` (mismo permiso que gestionar cotizaciones, ya que
    es `gestor_compras` quien decide enviar). Exige `estado === 'cotizando'`
    y que exista una `Cotizacion` con `seleccionada: true`; delega en
    `solicitudAprobacion.service.js` (ver abajo). Si
    `resolverNivelAprobacion` devuelve `null`, `400` ("no hay un nivel de
    aprobación configurado para este monto/tipo").
  - `POST /solicitudes/:id/aprobar` / `POST /solicitudes/:id/rechazar` —
    gateados por `solicitudes:aprobar`. Exige `estado === 'en_aprobacion'` y
    que exista una `SolicitudAprobacion` con `estado: 'pendiente'`. Valida
    que el usuario autenticado tenga el `rolAprobador` exacto de esa fila
    (`aprobador_area` requiere además `Usuario.areaId ===
    Solicitud.areaSolicitanteId`; `aprobador_ejecutivo` no tiene esa
    restricción) — si no califica, `403`. Actualiza la
    `SolicitudAprobacion` (`estado`, `aprobadorUsuarioId: req.user.id`,
    `comentario` opcional, `fechaResolucion: new Date()`) y mueve
    `Solicitud.estado` a `'aprobada'`/`'rechazada'`. Rechazar exige
    `motivo` en el body (mismo patrón que `Proveedor.rechazar`).
  - `POST /solicitudes/:id/confirmar` — gateado por `solicitudes:confirmar`.
    Exige `estado === 'aprobada'`. Body: `ordenFormalNumero` (obligatorio),
    archivo de la orden formal (obligatorio, mismo mecanismo de
    `guardarArchivo()` que ya usan Documentos/expediente de Proveedor).
    Mueve `estado` a `'confirmada'`.
  - `POST /solicitudes/:id/cancelar` — gateado por `solicitudes:crear`
    (mismo permiso que crear, ya que es una acción del propio dueño) más un
    chequeo de `solicitanteUsuarioId === req.user.id`. Exige `estado` en
    `['cotizando', 'en_aprobacion']`. Sin `motivo` obligatorio (a diferencia
    de rechazar, es prerrogativa del dueño, no una decisión sobre el
    trabajo de otro).

- **`cotizacion.routes.js` + `cotizacion.controller.js`** (sub-recurso de
  Solicitud, mismo patrón que `proveedorDocumento.controller.js`):
  - `GET /solicitudes/:id/cotizaciones`.
  - `POST /solicitudes/:id/cotizaciones` — gateado por `solicitudes:cotizar`,
    exige `estado === 'cotizando'`. Body: `proveedorId` (opcional —
    una cotización puede no venir de un Proveedor registrado en el
    sistema), `monto` (obligatorio), `observaciones` (opcional), archivo
    (opcional).
  - `POST /solicitudes/:id/cotizaciones/:cotizacionId/seleccionar` — marca
    esa `Cotizacion` como `seleccionada: true` y desmarca cualquier otra de
    la misma Solicitud (transacción). Gateado por `solicitudes:cotizar`,
    exige `estado === 'cotizando'`.

- **`solicitudComentario.routes.js` + `solicitudComentario.controller.js`**
  (sub-recurso de Solicitud):
  - `GET /solicitudes/:id/comentarios` — gateado por `solicitudes:ver` (si
    puedes ver la Solicitud, puedes ver sus comentarios).
  - `POST /solicitudes/:id/comentarios` — gateado por `solicitudes:comentar`
    (hoy solo `solicitante` y `gestor_compras` lo tienen en el seed; los
    roles aprobadores pueden ver pero no comentar — sin cambios al seed
    para esto). Body: `texto` (obligatorio).

- **Modelo nuevo `SolicitudComentario`** (`server/src/models/
  SolicitudComentario.js`, tabla `solicitud_comentarios`): `solicitudId`,
  `usuarioId`, `texto` (TEXT, obligatorio). Sin edición ni borrado en este
  ciclo — hilo append-only, mismo espíritu que `Auditoria`. Migración nueva
  que crea la tabla con ambas FKs.

- **`solicitudAprobacion.service.js`** (mismo patrón que
  `proveedorAprobacion.service.js`):

  ```js
  async function enviarAprobacion(solicitud, cotizacionSeleccionada) {
    const { resolverNivelAprobacion } = require('./nivelAprobacion.service');
    const criticidad = cotizacionSeleccionada.Proveedor?.criticidad;
    const nivel = await resolverNivelAprobacion(
      solicitud.tipoSolicitudId,
      cotizacionSeleccionada.monto,
      criticidad
    );
    if (!nivel) return { nivel: null };

    const aprobacion = await SolicitudAprobacion.create({
      solicitudId: solicitud.id,
      nivelAprobacionId: nivel.id,
      estado: 'pendiente',
      orden: 1,
    });
    await solicitud.update({ nivelAprobacionId: nivel.id, estado: 'en_aprobacion' });
    return { nivel, aprobacion };
  }
  ```

  Usa el monto **real cotizado** (`Cotizacion.monto` de la seleccionada), no
  `Solicitud.montoEstimado` — el estimado es solo orientativo al crear la
  Solicitud. Si la cotización seleccionada no tiene `proveedorId`, se
  resuelve solo por monto (mismo comportamiento que
  `resolverNivelAprobacion` ya tiene hoy sin el tercer argumento).

- **Permisos**: sin cambios al catálogo (`solicitudes` ya tiene todas las
  acciones necesarias) ni al seed de roles — ya están repartidas
  correctamente entre `gestor_compras` y los aprobadores desde el Paso 1 de
  este mismo refactor.

  Nota aparte, no incluida en este ciclo salvo que se pida explícitamente:
  `auditor` no tiene el módulo `solicitudes` (ni `proveedores`) en su mapa
  de permisos en `seedRolesPermisos.js`, lo que contradice su propia
  descripción ("lectura transversal a todo el sistema"). Es un gap
  preexistente del Paso 1 del refactor de roles, no introducido por este
  diseño — queda anotado, no se corrige aquí.

### Frontend

- `frontend/src/api/solicitud.service.js`, `cotizacion.service.js`,
  `solicitudComentario.service.js` — wrappers nuevos, mismo patrón que
  `proveedor.service.js`/`proveedorDocumento.service.js`.
- `frontend/src/pages/solicitudes/SolicitudesListado.jsx` en `/solicitudes`
  (reemplaza `ProximamentePage` en `App.jsx`) — listado con filtros
  (`estado`, `tipo`) vía `FilterDropdown`, botón "Crear solicitud" (gateado
  por `solicitudes:crear`), fila/tarjeta clickeable → `/solicitudes/:id`.
  Mismo patrón de `DataTable`/tarjetas (`useViewMode`) que
  `ProveedoresListado.jsx`.
- `frontend/src/pages/solicitudes/SolicitudDetalle.jsx` en
  `/solicitudes/:id` — mismo patrón de tabs (`role="tablist"`) que
  `ProveedorDetalle.jsx`:
  - Tab "Detalle": datos de la Solicitud (solo lectura en este ciclo — no
    hay edición de `descripcion`/`montoEstimado` tras crear) y los botones
    de transición de estado, condicionados a `estado` actual + permiso:
    "Enviar a aprobación" (`cotizando`, `solicitudes:cotizar`, deshabilitado
    si no hay ninguna cotización seleccionada), "Aprobar"/"Rechazar"
    (`en_aprobacion`, `solicitudes:aprobar`), "Confirmar" (`aprobada`,
    `solicitudes:confirmar`), "Cancelar" (`cotizando`/`en_aprobacion`, solo
    si `solicitanteUsuarioId` es el usuario actual).
  - Tab "Cotizaciones": lista de `Cotizacion` (proveedor, monto, archivo,
    seleccionada o no), formulario de alta y botón "Seleccionar" por fila,
    gateados por `tienePermiso('solicitudes', 'cotizar')` y
    `estado === 'cotizando'`.
  - Tab "Comentarios": lista cronológica (autor, fecha, texto) y formulario
    de alta, gateado por `tienePermiso('solicitudes', 'comentar')`.

## Manejo de errores

- `POST /solicitudes/:id/enviar-aprobacion`: `400` si `estado !==
  'cotizando'`, si no hay ninguna `Cotizacion` seleccionada, o si
  `resolverNivelAprobacion` devuelve `null`.
- `POST /solicitudes/:id/aprobar|rechazar`: `400` si `estado !==
  'en_aprobacion'` o si no hay una `SolicitudAprobacion` pendiente; `403`
  si el usuario no tiene el `rolAprobador` exacto (o no coincide el área,
  para `aprobador_area`).
- `POST /solicitudes/:id/confirmar`: `400` si `estado !== 'aprobada'`, si
  falta `ordenFormalNumero`, o si falta el archivo.
- `POST /solicitudes/:id/cancelar`: `400` si `estado` no está en
  `['cotizando', 'en_aprobacion']`; `403` si el usuario no es el dueño.
- `POST /cotizaciones`: `badRequest()` si falta `monto`; `notFound()` si
  `proveedorId` no existe.
- Toda mutación (`Solicitud`, `Cotizacion`, `SolicitudAprobacion`,
  `SolicitudComentario`) registra en `Auditoria`, igual que el resto del
  sistema.
- Errores de red/carga en frontend: `enqueueSnackbar` con el mensaje del
  backend, mismo patrón en toda la app.

## Testing

**Backend:** Jest + supertest (mismo patrón que
`proveedor.routes.test.js`), cubriendo: CRUD y filtrado por rol de
`Solicitud`; alta y selección de `Cotizacion`; resolución del nivel de
aprobación por monto de la cotización seleccionada y por criticidad del
proveedor vinculado (incluyendo el caso sin proveedor vinculado);
aprobación/rechazo con el chequeo de rol+área; confirmación; cancelación
(incluyendo el chequeo de dueño); comentarios. Unit test para
`solicitudAprobacion.service.js` (mismo patrón que
`proveedorAprobacion.service.test.js`).

**Frontend:** Vitest + Testing Library, `describe`/`it` en inglés,
`vi.mock(...)` para los servicios — cubriendo listado con filtros y su
alcance de visibilidad, creación, cada acción de transición de estado
condicionada a estado+permiso, el flujo de cotizaciones, y comentarios.

## Fuera de alcance

- **Factura/pago** (estado `cerrada`) — no hay modelo de datos hoy;
  sub-proyecto siguiente.
- **Evaluación de proveedores** (`EvaluacionProveedor`) — ya es un
  concepto aparte, ligado a Solicitudes cuando se aborde ese ciclo.
- **Cadenas de aprobación multi-nivel** — `resolverNivelAprobacion()`
  resuelve un único nivel; no hay doble aprobación secuencial en este
  ciclo.
- **Etapa "borrador" editable** — crear una Solicitud la deja directamente
  en `'cotizando'`; el valor `'borrador'` del ENUM queda sin una pantalla
  de edición dedicada.
- **Edición de `SolicitudComentario`** — hilo append-only, sin editar ni
  borrar comentarios.
- **`Formularios`/`PlantillaFormulario`** — `Solicitud.plantillaOrigenId`
  queda sin usar en este ciclo (siempre `null`); no se construye ninguna
  pantalla para originar una Solicitud desde una plantilla.
- **Corregir el gap de permisos de `auditor`** (falta `solicitudes` y
  `proveedores` en su mapa) — preexistente del Paso 1 del refactor de
  roles, anotado pero no corregido aquí.
- **Exportación** (`solicitudes:exportar`) — el permiso existe en el
  catálogo pero ninguna pantalla implementa una acción de exportar real,
  igual que en Proveedores.
