# Logs del Servidor — Design

## Contexto

Hoy el backend (`server/server.js`, Express) no tiene ninguna infraestructura de
logging: solo un puñado de `console.log` en el arranque, y un middleware de
errores global que traduce errores de Sequelize a códigos HTTP (409/400) sin
persistir nada. No existe ningún archivo ni tabla de logs técnicos. El modelo
`Auditoria` (`server/src/models/Auditoria.js`) ya registra auditoría de
**negocio** (quién creó/editó/eliminó qué registro) en cada mutación, pero es un
concepto completamente separado — no cubre tráfico HTTP ni excepciones no
controladas, y tampoco tiene ninguna pantalla de consulta.

Este diseño agrega una pantalla dentro de la aplicación para consultar logs
**técnicos** del servidor: tráfico HTTP (requests) y errores no controlados
(con stack trace), pensada como herramienta de diagnóstico para el rol `admin`.

## Objetivo

1. Persistir en MySQL (vía Sequelize, mismo patrón que `Auditoria`) cada
   request HTTP y cada error no controlado del backend.
2. Purgar automáticamente los registros de más de 14 días, para que la tabla
   no crezca sin límite.
3. Exponer un endpoint paginado y filtrable (`GET /logs-servidor`), gateado
   por un permiso nuevo (`logs_servidor: ['ver']`) otorgado únicamente al rol
   `admin`.
4. Una pantalla nueva en `Administración` (`/administracion/logs`) con tabla
   paginada, filtros, y refresco manual (sin auto-refresh ni streaming).

## Arquitectura

### Modelo y migración

- **`LogServidor`** (`server/src/models/LogServidor.js`, tabla
  `logs_servidor`, `underscored: true`):
  - `nivel`: `ENUM('info', 'warn', 'error')`, `allowNull: false`.
  - `metodo`: `STRING(10)`, `allowNull: true` (GET/POST/PUT/DELETE — `null`
    para errores que no ocurren dentro de una request HTTP, si los hubiera).
  - `ruta`: `STRING(255)`, `allowNull: true`.
  - `statusCode`: `INTEGER`, `allowNull: true`.
  - `duracionMs`: `INTEGER`, `allowNull: true`.
  - `mensaje`: `STRING(500)`, `allowNull: false`.
  - `stack`: `TEXT`, `allowNull: true`.
  - `usuarioId`: `INTEGER`, `allowNull: true` (sin FK obligatoria — un log
    técnico debe poder persistir aunque el usuario ya no exista o la request
    sea anónima).
  - `ip`: `STRING(45)`, `allowNull: true`.
  - Migración aditiva nueva (`createTable`), sin relación con tablas
    existentes — no requiere tocar ningún modelo del dominio de negocio.

### Captura

- **Middleware de requests** (`server/src/middlewares/logServidor.js`,
  nuevo): montado en `server.js` después de `helmet()`/`cors()` y antes de
  las rutas. En `res.on('finish')`, calcula la duración (`Date.now()` al
  entrar vs. al terminar) y crea una fila con `nivel` derivado del
  `statusCode` (2xx/3xx → `'info'`, 4xx → `'warn'`, 5xx → `'error'`),
  `metodo`, `ruta` (`req.originalUrl`), `statusCode`, `duracionMs`,
  `mensaje` (`` `${metodo} ${ruta} → ${statusCode}` ``), `usuarioId`
  (`req.user?.id`, disponible si el middleware de auth ya corrió),
  `ip` (`req.ip`).
- **Errores no controlados**: se extiende el middleware de errores global ya
  existente en `server.js` (el mismo `app.use((err, req, res, next) => {...})`
  que hoy traduce errores de Sequelize) para que, además de su
  comportamiento actual, cree una fila `nivel: 'error'` con `mensaje:
  err.message`, `stack: err.stack`, y los mismos `metodo`/`ruta`/`usuarioId`/`ip`
  de la request que falló.
- Ambas escrituras están envueltas en `try/catch` que solo hace
  `console.error` si la escritura del log falla — igual que
  `Auditoria.registrar` — para que un log no guardado nunca tumbe una
  request real.
- **Nota deliberada sobre duplicación:** cuando un error no controlado
  produce una respuesta 5xx, se generan **dos** filas — la del middleware de
  requests (`nivel:'error'`, solo con método/ruta/status/duración, por el
  `res.on('finish')` que corre para toda respuesta) y la del middleware de
  errores (`nivel:'error'`, con `mensaje`/`stack` del error real). No es un
  bug: la primera da visión de tráfico ("esta request terminó en 500"), la
  segunda da el detalle para diagnosticar por qué. Ambas quedan asociadas por
  `metodo`/`ruta`/timestamp cercano, sin necesidad de una columna de
  correlación adicional.

### Purga diaria

- **`server/src/jobs/logServidor.job.js`** (nuevo): función `purgar()` que
  borra (`LogServidor.destroy`) filas con `createdAt` de más de **14 días**
  (umbral fijo, sin campo configurable — mismo criterio que el umbral fijo de
  30 días usado para `ProveedorDocumento`). Programada con `node-cron`, mismo
  mecanismo que ya usa `recalcularEstadosDocumentos.job.js` (corre una vez al
  día). Se agrega a `server/src/scripts/ejecutarRecalculoEstados.js` o a un
  script hermano nuevo para poder correrla manualmente (`npm run
  job:purgar-logs`).

### API y permisos

- **`GET /logs-servidor`** (`server/src/routes/logServidor.routes.js` +
  controller nuevo): paginado (`page`/`limit`, mismo envelope `paginated()`
  que el resto de listados), filtros vía query params: `nivel`, `metodo`,
  `desde`/`hasta` (rango de fecha sobre `createdAt`), `q` (búsqueda de texto
  con `LIKE` sobre `mensaje`/`ruta`). Orden descendente por `createdAt`
  (los logs más recientes primero).
- Nuevo módulo `logs_servidor: ['ver']` agregado a `CATALOGO_MODULOS`
  (`server/src/models/Permiso.js`). `admin: CATALOGO_MODULOS` ya lo otorga
  automáticamente — no hace falta modificar la matriz de ningún otro rol en
  `seedRolesPermisos.js`.
- Ruta gateada por `requierePermiso('logs_servidor', 'ver')`, mismo
  middleware que el resto del sistema.

### Frontend

- **`frontend/src/api/logServidor.service.js`** (nuevo): `listar(filtros)`.
- **`frontend/src/pages/administracion/LogsServidor.jsx`** (nueva página),
  ruta `/administracion/logs` en `App.jsx`, envuelta en `PermissionRoute
  modulo="logs_servidor" accion="ver"`.
- Se agrega una entrada a `SUBMODULOS` en `AdministracionInicio.jsx` (mismo
  patrón de tarjetas que ya usa "Usuarios"): `{ path:
  '/administracion/logs', label: 'Logs del servidor', icon: ScrollText,
  modulo: 'logs_servidor' }`.
- La página muestra una `DataTable` paginada (columnas: fecha, nivel
  —`StatusChip`—, método, ruta, status code, duración, usuario), filtros
  (`FilterDropdown` para nivel, inputs de fecha para el rango, input de texto
  para `q`), y un botón "Actualizar" que vuelve a pedir la página actual con
  los filtros vigentes. Sin auto-refresh ni streaming.

## Manejo de errores

- Si la escritura de un log (request o error) falla, se captura y se hace
  `console.error` — nunca debe interrumpir ni cambiar el código de respuesta
  de la request real que se estaba sirviendo.
- `GET /logs-servidor` responde `403` si el usuario no tiene
  `logs_servidor:ver` (mismo middleware `requierePermiso` que el resto de la
  API); `400` si `desde`/`hasta` no son fechas válidas.
- Errores de carga en el frontend: `enqueueSnackbar` con el mensaje del
  backend, mismo patrón que el resto de la app.

## Testing

**Backend:** Jest + supertest — cubriendo: que el middleware de requests
crea una fila con `nivel` correcto según el status code (2xx→info, 4xx→warn,
5xx→error); que un error no controlado genera una fila `nivel:'error'` con
`stack` poblado; el endpoint `GET /logs-servidor` con sus filtros
(`nivel`, `metodo`, rango de fechas, `q`) y su paginación; `403` para un rol
sin el permiso; y el job de purga (`purgar()`) — borra filas de más de 14
días y conserva las más recientes.

**Frontend:** Vitest + Testing Library — listado paginado, filtros
disparando la recarga con los query params correctos, botón "Actualizar",
la entrada nueva en `AdministracionInicio` visible solo con el permiso.

## Fuera de alcance

- Streaming/tail en vivo o WebSockets — la pantalla es de consulta bajo
  demanda, no un monitor en tiempo real.
- Exportar logs a archivo/CSV.
- Alertas o notificaciones automáticas disparadas por errores registrados.
- Logs de nivel `debug` o trazas detalladas de queries SQL — solo tráfico
  HTTP (requests) y errores no controlados.
- Auto-refresh — la página se actualiza solo al cambiar filtros o presionar
  "Actualizar".
- Dar acceso al rol `auditor` u otro rol distinto de `admin` a este módulo
  — puede agregarse después editando la matriz de permisos sin cambios de
  código, ya que el módulo queda definido en el catálogo.
