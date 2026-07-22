# Módulo de Solicitudes/Compras (ciclo 2: factura/pago) — Design

## Contexto

El ciclo 1 (`Solicitud → cotización → aprobación → confirmación`) ya está
implementado y en `main`. El flujo completo del proceso real es cotización →
aprobación → confirmación → **factura/pago** → evaluación de proveedor. Este
diseño construye únicamente el paso de **factura/pago**: extiende la máquina
de estados de `Solicitud` agregando la transición `confirmada → cerrada`, el
único estado del ENUM que ciclo 1 dejó reservado sin ninguna transición hacia
él.

**Evaluación de proveedores** (`EvaluacionProveedor`) queda deliberadamente
fuera de este ciclo: es un subsistema técnicamente independiente (un ciclo
anual ligado a `Proveedor`, sin dependencia de una `Solicitud` puntual), con
su propio modelo ya existente pero sin migración, rutas, controlador ni
pantalla — se abordará como un ciclo 3 separado.

El modelo de datos base de `Solicitud` ya incluye `estado: 'cerrada'` en su
ENUM (`server/src/models/Solicitud.js`), sin ninguna transición que lo
alcance hoy. Este ciclo es lo que la conecta.

## Objetivo

1. Nuevo modelo `Factura` (1:1 con `Solicitud`) que registra número, monto,
   fecha de pago y el archivo de la factura.
2. `POST /solicitudes/:id/facturar` — registra la factura y el pago **en un
   solo paso** (sin estado intermedio "facturada"): exige que la `Solicitud`
   esté `confirmada`, crea la `Factura` y mueve `estado` a `'cerrada'`.
3. `GET /solicitudes/:id/factura` — obtiene la factura de la solicitud (o
   `null` si aún no se ha registrado).
4. Nuevo permiso `solicitudes:facturar`, agregado al catálogo y seedeado
   únicamente a `gestor_compras`.
5. Frontend: dentro de la pestaña "Detalle" de `SolicitudDetalle.jsx` (sin
   pestaña nueva), formulario para registrar la factura cuando corresponde,
   y bloque de solo lectura con los datos de la factura una vez cerrada.

## Máquina de estados

Extiende la máquina de ciclo 1 (sin modificarla):

```text
confirmada ──────────────────────────► cerrada (terminal)
              POST /:id/facturar
      (requiere numero, monto, fechaPago y archivo)
```

Ningún otro estado ni transición de ciclo 1 cambia.

## Modelo de datos

### Factura (nuevo)

```
id            INTEGER, PK autoincremental
solicitudId   INTEGER, FK a Solicitud, obligatorio, UNIQUE (una sola
              factura por solicitud — impuesto a nivel de columna, no solo
              de aplicación)
numero        STRING(30), obligatorio
monto         DECIMAL(14,2), obligatorio (representa el total ya pagado —
              sin pagos parciales en este ciclo, no existe un campo
              "montoPagado" separado)
fechaPago     DATEONLY, obligatorio
facturaS3Key  STRING(500), obligatorio (archivo de la factura, guardado vía
              guardarArchivo(), mismo mecanismo que ordenFormalS3Key)
observaciones TEXT, opcional
created_at / updated_at
```

Migración nueva que crea la tabla `facturas` con la FK a `solicitudes` y el
índice único sobre `solicitud_id`. Asociación en `models/index.js`:
`Solicitud.hasOne(Factura, { foreignKey: 'solicitudId' })` /
`Factura.belongsTo(Solicitud, { foreignKey: 'solicitudId' })` — mismo
patrón que `SolicitudComentario`, sin alias `as`.

No se agrega un modelo `Pago` separado: los campos de pago (`fechaPago`)
viven directamente en `Factura`, ya que este ciclo asume que para cuando se
registra la factura en el sistema, ya fue pagada por completo.

## Arquitectura

### Backend

- **`factura.routes.js` + `factura.controller.js`** (sub-recurso de
  `Solicitud`, mismo patrón que `cotizacion.controller.js`):
  - `GET /solicitudes/:id/factura` — gateado por `solicitudes:ver`. Si el
    usuario no tiene visibilidad amplia (`tieneVisibilidadAmplia`, importado
    de `../utils/visibilidadSolicitud`) y no es el dueño de la `Solicitud`
    (`solicitanteUsuarioId !== req.user.id`), `403` — mismo chequeo que
    `cotizacion.listar()`. Devuelve `null` (con `200`) si la solicitud no
    tiene factura registrada todavía, no `404`.
  - `POST /solicitudes/:id/facturar` — gateado por `solicitudes:facturar`
    (solo `gestor_compras` en el seed, rol de visibilidad amplia — sin
    chequeo de propiedad adicional, igual que `cotizacion.crear()`). Exige
    `estado === 'confirmada'` (`400` en caso contrario). Body:
    `numero` (obligatorio), `monto` (obligatorio), `fechaPago` (obligatorio)
    y `req.file` (obligatorio, vía `subirArchivoUnico` — sin middleware
    nuevo, un solo archivo por request). Si la solicitud ya tiene una
    `Factura` (no debería ocurrir dado que el estado ya cambió a `cerrada`,
    pero se valida por robustez del índice único), `400`. Crea la `Factura`
    con `guardarArchivo(req.file, \`solicitudes/${solicitud.id}\`)`, luego
    `solicitud.update({ estado: 'cerrada' })`. Registra en `Auditoria` sobre
    la tabla `solicitudes` (`accion: 'actualizar'`, descripción "Solicitud
    cerrada con registro de factura y pago"), mismo patrón que
    `confirmar()`.

- **Permiso nuevo `solicitudes:facturar`**: agregado a
  `CATALOGO_MODULOS.solicitudes` en `server/src/models/Permiso.js` (queda
  `['ver', 'crear', 'comentar', 'cotizar', 'aprobar', 'confirmar',
  'facturar', 'exportar']`). En `seedRolesPermisos.js`, se agrega
  únicamente a `gestor_compras` (queda `['ver', 'crear', 'comentar',
  'cotizar', 'confirmar', 'facturar']`) — deliberadamente **no** se agrega a
  `aprobador_area`/`aprobador_ejecutivo`: a diferencia de `confirmar` (que ya
  venía repartido así desde antes de ciclo 1 y ciclo 1 decidió dejarlo
  igual), `facturar` es una acción puramente operativa de compras/back
  office, sin relación con la potestad de aprobar.

### Frontend

- `frontend/src/api/factura.service.js` (nuevo) — `obtener(solicitudId)`,
  `registrar(solicitudId, formData)`; mismo patrón que
  `cotizacion.service.js` (usa `apiClient`, `multipart/form-data` en
  `registrar`).
- `frontend/src/pages/solicitudes/SolicitudDetalle.jsx` (modificado): dentro
  de la pestaña "Detalle" ya existente, junto al bloque de "Confirmar con
  orden formal":
  - Si `estado === 'confirmada'` y `tienePermiso('solicitudes', 'facturar')`
    → formulario "Registrar factura" (número, monto, fecha de pago, archivo
    con `validarArchivo`/`TIPOS_PERMITIDOS_ACCEPT`), envía `FormData` a
    `facturaService.registrar()`.
  - Si `estado === 'cerrada'` → bloque de solo lectura con número, monto,
    fecha de pago y enlace de descarga del archivo de la factura — mismo
    estilo visual que el bloque de "orden formal" ya mostrado para
    `confirmada`/`cerrada`.
  - La factura se obtiene con `facturaService.obtener()` al cargar la
    página (igual que cotizaciones/comentarios se cargan por pestaña).

## Manejo de errores

- `POST /solicitudes/:id/facturar`: `400` si `estado !== 'confirmada'`; si
  falta `numero`, `monto` o `fechaPago`; si falta el archivo; si ya existe
  una `Factura` para esa solicitud.
- `GET /solicitudes/:id/factura`: `403` si el usuario no tiene visibilidad
  amplia ni es el dueño; `404` si la `Solicitud` no existe (no la factura —
  la ausencia de factura es un `200` con `null`).
- Toda mutación (`Factura`, `Solicitud`) registra en `Auditoria`, igual que
  el resto del sistema.
- Errores de red/carga en frontend: `enqueueSnackbar` con el mensaje del
  backend, mismo patrón en toda la app.

## Testing

**Backend:** Jest + supertest (mismo patrón que
`cotizacion.routes.test.js`), cubriendo: registro exitoso de factura con
archivo y transición a `cerrada`; rechazo si `estado !== 'confirmada'`;
campos obligatorios (`numero`, `monto`, `fechaPago`, archivo); permiso
`solicitudes:facturar` (incluye caso positivo de `super_administrador` vía
`tieneVisibilidadAmplia`, y caso negativo de un rol sin el permiso); `GET`
devuelve `null` antes de facturar y la factura completa después; visibilidad
del `GET` (dueño vs. no dueño vs. rol de visibilidad amplia).

**Frontend:** Vitest + Testing Library, `describe`/`it` en inglés,
`vi.mock(...)` para los servicios — `factura.service.test.js` cubriendo
`obtener`/`registrar`; extensión de `SolicitudDetalle.test.jsx` cubriendo:
formulario de registro visible solo con `estado === 'confirmada'` +
permiso, envío de `FormData`, y bloque de solo lectura visible tras
`cerrada`.

## Fuera de alcance

- **Evaluación de proveedores** (`EvaluacionProveedor`) — ciclo 3 separado,
  ya señalado como tal en el spec de ciclo 1.
- **Pagos parciales o múltiples facturas por solicitud** — una sola
  `Factura` por `Solicitud`, impuesta con un índice único; no hay modelo
  `Pago` independiente ni lógica de "monto pendiente".
- **Comprobante de pago como archivo separado** — se cubre únicamente con
  el dato `fechaPago`; no se sube un segundo archivo (evita un middleware
  multer nuevo con múltiples campos).
- **Edición o anulación de una factura ya registrada, o reversión de
  `cerrada` a otro estado** — sin pantalla ni endpoint para esto en este
  ciclo, igual que `SolicitudComentario` no tiene edición.
- **Estado intermedio "facturada"** — factura y pago se registran juntos en
  una sola acción; no hay un paso donde la factura exista sin pago
  registrado.
