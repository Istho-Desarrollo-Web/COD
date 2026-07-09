# Módulo de Proveedores y Contratistas — Design

## Contexto

El mapa de proceso "Gestión de Compras" (BPMN provisto por el usuario) describe el
flujo: identificar necesidad → recibir cotizaciones → (si el proveedor es nuevo)
crear su expediente → solicitar la compra → el proveedor entrega → confirmar
recepción → recibir factura y programar el pago → evaluar al proveedor. Este
diseño construye el primer sub-proyecto de ese mapa: el módulo de **Proveedores y
Contratistas** (expediente digital + CRUD), del que depende la rama "¿el proveedor
es nuevo?" del proceso completo. El segundo sub-proyecto (flujo de Solicitudes/
Compras: cotización → aprobación → confirmación → factura/pago) queda
deliberadamente fuera de este ciclo.

El modelo de datos para este módulo ya existe por completo en el backend
(`Proveedor`, `RequisitoProveedor`, `ProveedorDocumento`, `EvaluacionProveedor` en
`server/src/models/`, con sus migraciones y asociaciones ya corridas), pero sin
ninguna ruta/controlador backend ni página frontend real — hoy `/proveedores`
renderiza el placeholder genérico `ProximamentePage`. El catálogo de permisos
(`Permiso.js`) ya define `proveedores: [ver, crear, editar, eliminar, evaluar,
exportar]`, y `RequisitoProveedor` ya está poblado por `seedRequisitosProveedor.js`
con 5 requisitos fijos (Cámara de Comercio, RUT, Certificado SST, Certificado
SARLAFT, Póliza de responsabilidad civil).

## Objetivo

1. CRUD completo de `Proveedor` (listar, crear, editar, baja lógica) — mismo nivel
   de funcionalidad que el módulo de Áreas.
2. Expediente documental por proveedor: checklist de requisitos aplicables según
   la criticidad del proveedor, y subida/descarga/baja de los documentos que
   los cubren (`ProveedorDocumento`), con cálculo automático de vigencia
   (vigente/por_vencer/vencido).
3. Cero necesidad de reutilizar o modificar el modelo `Carpeta` — el expediente
   documental del proveedor vive enteramente en `ProveedorDocumento`, que ya
   tiene la forma correcta (`proveedorId`, `requisitoId` opcional, `s3Key`,
   vigencia, `estado`, `version`) sin requerir cambios de esquema para esto.

## Arquitectura

### Backend (todo nuevo, sin tocar el modelo de datos existente)

- **`proveedor.routes.js` + `proveedor.controller.js`**: `GET /proveedores`
  (listado, filtrable por `estado`/`tipo`/`criticidad` vía query params), `GET
  /proveedores/:id`, `POST /proveedores`, `PUT /proveedores/:id`, `DELETE
  /proveedores/:id` (baja lógica → `estado: 'inactivo'`). Mismo patrón de
  `Auditoria.registrar` en cada mutación que ya usan `area.controller.js`/
  `usuario.controller.js`. `documentoIdentificacion` se valida como único con un
  pre-chequeo (`findOne`) antes del insert, respondiendo `conflict()` (409) en
  vez de dejar propagar el error de Sequelize sin capturar (hoy no hay
  middleware de errores global en el proyecto).
- **`requisitoProveedor.routes.js` + controller**: `GET /requisitos-proveedor` —
  solo lectura, mismo patrón de solo-`listar()` que `tipoDocumento.controller.js`.
  Sin CRUD de catálogo en este ciclo (el catálogo se sigue sembrando por script).
- **`proveedorDocumento.routes.js` + controller**: `GET
  /proveedores/:id/documentos` (lista los documentos del expediente), `POST
  /proveedores/:id/documentos` (subida — reutiliza `guardarArchivo()` de
  `almacenamiento.service.js`, mismo mecanismo de almacenamiento local que
  Documentos), `GET .../documentos/:docId/descargar`, `DELETE
  .../documentos/:docId` (baja lógica). Body de creación: `requisitoId`
  (opcional — un documento puede no estar ligado a ningún requisito del
  catálogo), `vigenciaDesde`/`vigenciaHasta` (opcionales), archivo (obligatorio).
- **Nueva función de servicio `calcularEstadoProveedorDocumento`** en
  `server/src/services/proveedorDocumento.service.js`, hermana de
  `calcularEstadoDocumento` (`documento.service.js`) pero con un umbral fijo de
  30 días (sin campo `diasAlerta` variable, ya que `RequisitoProveedor` no tiene
  un campo de días de alerta configurable — decisión deliberada de este ciclo,
  YAGNI frente a replicar el mecanismo de `TipoDocumento.diasAlertaVencimientoDefault`):

  ```js
  function calcularEstadoProveedorDocumento({ vigenciaHasta, hoy = new Date() }) {
    if (!vigenciaHasta) return 'vigente';
    const fechaVencimiento = new Date(`${vigenciaHasta}T00:00:00`);
    const diasRestantes = Math.floor((fechaVencimiento.getTime() - hoy.getTime()) / (24 * 60 * 60 * 1000));
    if (diasRestantes < 0) return 'vencido';
    if (diasRestantes <= 30) return 'por_vencer';
    return 'vigente';
  }
  ```

  (Nota: a diferencia de `Documento`, que usa `sin_vigencia` cuando no hay fecha,
  `ProveedorDocumento.estado` no incluye ese valor en su ENUM — ver migración
  `20260702100800-crear-proveedores.js` — así que sin `vigenciaHasta` el
  documento se considera `vigente` por defecto.)

- **Job diario extendido**: `recalcularEstadosDocumentos.job.js` gana una segunda
  función `ejecutarProveedores()` (mismo archivo, mismo cron) que recorre
  `ProveedorDocumento` activos y recalcula su `estado` con
  `calcularEstadoProveedorDocumento`, igual de espíritu que el recálculo de
  Documentos pero sin el paso de "recalcular salud de área" (Proveedor no tiene
  un campo de salud documental agregada en este ciclo — ver Fuera de alcance).
- **Permisos**: rutas gateadas con `requierePermiso('proveedores', accion)`
  (acciones `ver`/`crear`/`editar`/`eliminar` ya están en el catálogo). Se
  actualiza `seedRolesPermisos.js` para que el rol `financiera` gane `crear` y
  `editar` (hoy solo tiene `ver`), quedando `financiera: { ..., proveedores:
  ['ver', 'crear', 'editar'], ... }` — para que coincida con el paso "Crear la
  carpeta del proveedor" del BPMN, que ese rol es quien lo ejecuta en el
  proceso real. El rol `operaciones` conserva su acceso actual (`ver, crear,
  editar, evaluar`), pensado originalmente para proveedores de transporte.

### Frontend

- `frontend/src/api/proveedor.service.js`, `requisitoProveedor.service.js`,
  `proveedorDocumento.service.js` — wrappers nuevos, mismo patrón que
  `area.service.js`/`documento.service.js`.
- `frontend/src/pages/proveedores/ProveedoresListado.jsx` en `/proveedores`
  (reemplaza `ProximamentePage` en `App.jsx`) — listado con `DataTable`/tarjetas
  (`useViewMode`, mismo patrón que `AreasListado.jsx`), filtros por
  `estado`/`tipo`/`criticidad` vía `FilterDropdown`, modal "Crear proveedor",
  fila/tarjeta clickeable → `/proveedores/:id`.
- `frontend/src/pages/proveedores/ProveedorDetalle.jsx` en `/proveedores/:id` —
  mismo patrón de tabs (`role="tablist"`) que `DocumentoDetalle.jsx`:
  - Tab "Detalle": formulario inline editable (gateado por
    `tienePermiso('proveedores', 'editar')`), botón "Eliminar" (gateado por
    `eliminar`).
  - Tab "Expediente documental": (a) checklist de requisitos — por cada
    `RequisitoProveedor` activo cuya `criticidadMinima` sea aplicable a la
    criticidad del proveedor (`baja` aplica siempre, `media` aplica a
    proveedores `media`/`alta`, `alta` aplica solo a `alta`), un indicador de
    cobertura (`StatusChip`: vigente/por_vencer/vencido, o "Falta" si no hay
    ningún `ProveedorDocumento` ligado a ese requisito); (b) lista de todos los
    documentos subidos con botón de descarga, y formulario de subida
    (`requisitoId` opcional vía `<select>`, fechas de vigencia opcionales,
    archivo obligatorio con `validarArchivo`/`TIPOS_PERMITIDOS`), gateado por
    `tienePermiso('proveedores', 'editar')`.

## Manejo de errores

- `POST /proveedores`: `documentoIdentificacion` duplicado → `conflict()` (409)
  con pre-chequeo, en vez de propagar el error de Sequelize sin capturar.
- `PUT`/`DELETE /proveedores/:id`, operaciones sobre `ProveedorDocumento`:
  `notFound()` si el proveedor o documento no existe o ya está inactivo (mismo
  patrón que Área/Documento/Usuario).
- Subida de documento: `badRequest()` si falta el archivo o si `vigenciaHasta
  <= vigenciaDesde` (idéntico a `documento.controller.js`); `validarArchivo()`
  en frontend antes de enviar.
- Toda mutación (`crear`/`editar`/`eliminar` de `Proveedor` y de
  `ProveedorDocumento`) registra en `Auditoria`, igual que el resto del sistema.
- Errores de red/carga en frontend: `enqueueSnackbar` con el mensaje del
  backend, mismo patrón en toda la app.

## Testing

**Backend:** Jest + supertest (mismo patrón que `documento.controller`/
`area.controller`), cubriendo: CRUD de proveedor, unicidad de
`documentoIdentificacion`, subida/descarga/baja lógica de `ProveedorDocumento`,
`calcularEstadoProveedorDocumento` (vigente/por_vencer/vencido con el umbral fijo
de 30 días), y el job de recálculo diario extendido.

**Frontend:** Vitest + Testing Library, `describe`/`it` en inglés,
`vi.mock(...)` para los servicios — cubriendo listado con filtros, creación,
edición inline, baja lógica, el checklist de requisitos (cubierto/por
vencer/vencido/faltante en cada combinación de criticidad), y subida/descarga de
documentos del expediente.

## Fuera de alcance

- **Evaluación de proveedores** (`EvaluacionProveedor`, acción
  `proveedores:evaluar`) — paso distinto del BPMN ("Evaluar proveedor"), con su
  propio ciclo de programación anual y puntaje; queda para un ciclo separado.
- **CRUD del catálogo de `RequisitoProveedor`** — sigue poblado por script
  (`seedRequisitosProveedor.js`), sin UI de administración, igual que
  `TipoDocumento` hoy.
- **Un campo de "salud documental" agregada para `Proveedor`** (análogo a
  `Area.saludDocumentalPct`) — el checklist de requisitos ya comunica cobertura
  por proveedor individual; un porcentaje agregado por proveedor o por
  cartera de proveedores no se pidió y no tiene consumidor hoy.
- **Flujo de Solicitudes/Compras** (cotización → aprobación → confirmación →
  factura/pago) — el segundo sub-proyecto del mapa de "Gestión de Compras",
  deliberadamente fuera de este ciclo.
- Cualquier cambio a los modelos `Cotizacion`/`Solicitud` — aunque
  `Cotizacion.belongsTo(Proveedor)` ya existe, no se toca en este ciclo.
- Días de alerta de vencimiento configurables por requisito (como
  `TipoDocumento.diasAlertaVencimientoDefault`) — se usa un umbral fijo de 30
  días para todo el módulo (ver Arquitectura).
