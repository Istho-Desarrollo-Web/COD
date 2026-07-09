# Aprobación de Proveedores + Carpeta del Expediente — Design

## Contexto

El módulo de Proveedores y Contratistas (`docs/superpowers/specs/2026-07-09-cod-proveedores-design.md`)
ya está implementado: CRUD de `Proveedor`, catálogo de `RequisitoProveedor`, y
expediente documental vía `ProveedorDocumento` (subida/descarga/eliminación con
cálculo de vigencia). Hoy `Proveedor.estado` nace en `'en_evaluacion'` pero no
existe ninguna acción explícita para sacarlo de ahí — solo `editar` (que permite
cambiar `estado` a mano) y `eliminar` (baja lógica → `inactivo`).

Este diseño cierra el paso del BPMN "crear la carpeta del proveedor si es nuevo":
al aprobar un proveedor recién creado, el sistema debe (a) marcarlo como
formalmente aprobado y (b) crear una carpeta real dentro del módulo Documentos
(`Carpeta`/`Documento`, la vista Drive-style ya existente en `/documentos/carpetas`)
que refleje los documentos ya subidos a su expediente — para que ese proveedor
tenga presencia en el árbol documental de la misma forma que cualquier otra
carpeta del área que lo solicitó.

El expediente documental (`ProveedorDocumento`) sigue siendo la fuente de verdad
operativa del proveedor (vigencias, checklist de requisitos); la carpeta que se
crea al aprobar es un reflejo de organización/visibilidad dentro del árbol de
Documentos, no un reemplazo.

## Objetivo

1. Dos acciones nuevas sobre `Proveedor`, disponibles solo mientras
   `estado === 'en_evaluacion'`: **Aprobar** (→ `activo`) y **Rechazar** (→
   `inactivo`, con motivo).
2. Al aprobar: crear (o reutilizar) una carpeta raíz `"Proveedores"` en el área
   que solicitó el proveedor, una subcarpeta con el nombre del proveedor dentro
   de ella, y un `Documento` por cada `ProveedorDocumento` ya subido al
   expediente en ese momento — reflejo único, no sincronización continua.
3. Nuevo campo `Proveedor.areaSolicitanteId`, para saber a qué área pertenece la
   carpeta que se crea al aprobar.

## Arquitectura

### Cambios de modelo

- **`Proveedor`**: nueva columna `areaSolicitanteId` (`INTEGER`, `allowNull:
  true` en la migración — para no romper los proveedores ya existentes sin
  este dato —, FK a `Area`). El controlador de `crear()` la exige a partir de
  ahora (`badRequest()` si falta); `editar()` permite completarla después para
  proveedores antiguos. Mismo nombre que usa `Solicitud.areaSolicitanteId`
  (`server/src/models/index.js:48-49`), por consistencia.
- **`RequisitoProveedor`**: nueva columna `tipoDocumentoId` (`INTEGER`,
  `allowNull: true`, FK a `TipoDocumento`). Se actualiza
  `seedRequisitosProveedor.js` para incluirla en cada uno de los 5 requisitos
  ya sembrados, referenciando un `TipoDocumento` por nombre — 2 de los 5 ya
  existen en `seedTiposDocumento.js` (`Certificado SST`, `Certificado
  SARLAFT`); los 3 restantes (`Cámara de Comercio`, `RUT`, `Póliza de
  responsabilidad civil`) se agregan a `TIPOS` en ese mismo seed.
- **`TipoDocumento` genérico**: se agrega `"Documento de proveedor"` (30 días de
  alerta) a `seedTiposDocumento.js`, usado como *fallback* cuando un
  `ProveedorDocumento` reflejado no tiene `requisitoId` (subida sin requisito
  asociado).
- **`Carpeta`**: nueva columna `proveedorId` (`INTEGER`, `allowNull: true`, FK
  a `Proveedor`). Permite ubicar la carpeta raíz `"Proveedores"` de un área sin
  duplicarla (`proveedorId: null`, `nombre: 'Proveedores'`, `carpetaPadreId:
  null`) y marcar la subcarpeta de cada proveedor (`proveedorId:
  proveedor.id`).

Las 3 migraciones son aditivas (`ALTER TABLE ... ADD COLUMN`, todas nullable) —
no requieren backfill de datos existentes.

### Backend

- **`POST /proveedores/:id/aprobar`** (`proveedor.controller.js`, gateado por
  `requierePermiso('proveedores', 'editar')`):
  1. `404` si el proveedor no existe; `400` si `estado !== 'en_evaluacion'`
     (`"El proveedor ya fue aprobado o rechazado"`); `400` si
     `areaSolicitanteId` es `null` (`"Completa el área solicitante antes de
     aprobar"`).
  2. Ejecuta dentro de una transacción de Sequelize (`sequelize.transaction`):
     - Busca o crea la carpeta raíz `"Proveedores"` del área
       (`Carpeta.findOrCreate({ where: { areaId, proveedorId: null,
       carpetaPadreId: null, nombre: 'Proveedores' } })`).
     - Crea la subcarpeta del proveedor (`carpetaPadreId` = la raíz,
       `proveedorId: proveedor.id`, `nombre: proveedor.razonSocial`).
     - Por cada `ProveedorDocumento` del proveedor: lee el archivo físico
       (`fs.readFileSync` sobre `obtenerRutaAbsoluta(doc.s3Key)`), lo vuelve a
       guardar con `guardarArchivo({ originalname, buffer }, areaId)` (mismo
       helper que usa `documento.controller.js`, sin modificarlo), y crea un
       `Documento` en la subcarpeta con `tipoDocumentoId` resuelto (el de
       `RequisitoProveedor.tipoDocumentoId` si el documento tiene requisito
       asignado y ese requisito tiene un tipo mapeado; el genérico "Documento
       de proveedor" en cualquier otro caso — sin requisito, o requisito sin
       `tipoDocumentoId`), `vigenciaDesde`/
       `vigenciaHasta` copiadas, y `estado` recalculado con
       `calcularEstadoDocumento` (servicio ya existente de `documento.service.js`).
     - Actualiza `proveedor.estado = 'activo'`.
     - Si cualquier paso falla (ej. archivo del expediente no encontrado en
       disco), la transacción revierte completa y la respuesta es `500` con
       mensaje descriptivo — el proveedor no queda a medio aprobar.
  3. `Auditoria.registrar` sobre `proveedores` (acción `'aprobar'`), con
     `descripcion` indicando cuántos documentos se reflejaron.
  4. Responde `success()` con el proveedor actualizado y la subcarpeta creada
     (`{ proveedor, carpeta }`).
- **`POST /proveedores/:id/rechazar`** (mismo gate de permiso): body `{ motivo
  }` (`badRequest()` si falta); `400` si `estado !== 'en_evaluacion'`. Cambia
  `estado` → `'inactivo'`, sin tocar carpetas. `Auditoria.registrar` con el
  `motivo` en `descripcion`. No agrega columna nueva a `Proveedor` para el
  motivo — vive solo en la auditoría, igual que otras descripciones de acción
  en el resto del sistema.
- **Formulario de creación de proveedor**: `POST /proveedores` ahora exige
  `areaSolicitanteId` en el body (`badRequest()` si falta), junto a los campos
  ya requeridos (`tipo`, `documentoIdentificacion`, `razonSocial`).

### Frontend

- **`ProveedoresListado.jsx`**: el modal "Crear proveedor" agrega un selector
  de Área para `areaSolicitanteId` (mismo patrón de select ya usado en otras
  pantallas del proyecto para elegir área).
- **`ProveedorDetalle.jsx`**: mientras `estado === 'en_evaluacion'` y el
  usuario tiene permiso `proveedores:editar`, se muestran dos botones
  "Aprobar" y "Rechazar" junto a los ya existentes. Cada uno abre un modal de
  confirmación (mismo patrón que el modal de "Dar de baja" ya implementado en
  esta página); el de "Rechazar" incluye un campo de texto obligatorio para el
  motivo. Al aprobar con éxito, se refresca el proveedor y se muestra un
  `enqueueSnackbar` de éxito indicando cuántos documentos se reflejaron en la
  nueva carpeta.
- **`proveedor.service.js`**: dos nuevas funciones, `aprobar(id)` y
  `rechazar(id, motivo)`.

## Manejo de errores

- `POST /proveedores`: `badRequest()` si falta `areaSolicitanteId`.
- `POST /proveedores/:id/aprobar`: `notFound()` si el proveedor no existe;
  `badRequest()` si `estado !== 'en_evaluacion'` o si falta
  `areaSolicitanteId`; `500` (con rollback de transacción) si falla la lectura
  de algún archivo del expediente durante el reflejo.
- `POST /proveedores/:id/rechazar`: `notFound()`/`badRequest()` análogos;
  `badRequest()` si falta `motivo`.
- Toda mutación nueva registra en `Auditoria`, igual que el resto del sistema.
- Errores de red/carga en frontend: `enqueueSnackbar` con el mensaje del
  backend, mismo patrón en toda la app.

## Testing

**Backend:** Jest + supertest, cubriendo: creación de proveedor sin
`areaSolicitanteId` (400), aprobar con y sin documentos en el expediente
(verifica que se crean `Carpeta` raíz + subcarpeta + `Documento`s con
`tipoDocumentoId` correcto, incluyendo el caso fallback sin requisito), aprobar
sin `areaSolicitanteId` (400), aprobar dos veces (400 la segunda vez), rechazar
con y sin motivo, y que la carpeta raíz `"Proveedores"` no se duplica al
aprobar un segundo proveedor de la misma área.

**Frontend:** Vitest + Testing Library — selector de área en el formulario de
creación, botones Aprobar/Rechazar visibles solo en `en_evaluacion` y con
permiso, modal de confirmación de cada acción, mensaje de éxito tras aprobar.

## Fuera de alcance

- Sincronizar documentos subidos al expediente **después** de la aprobación
  hacia la carpeta — el reflejo ocurre una única vez, en el momento de
  aprobar.
- Un link directo "Ver carpeta" desde `ProveedorDetalle.jsx` hacia
  `/documentos/carpetas` — queda preparado con `Carpeta.proveedorId`, pero la
  UI de navegación no se construye en este ciclo (fast-follow posible).
- Editar o mover la carpeta/subcarpeta después de creada — se gestiona con las
  pantallas ya existentes de Gestión de Carpetas si hiciera falta.
- Cualquier cosa del flujo de Solicitudes/Compras (cotización, aprobación de
  compra, factura) — sigue fuera de alcance, como en el diseño anterior.
- Revertir una aprobación (volver un proveedor `activo` a `en_evaluacion`) o
  eliminar la carpeta si se "desaprueba" — no se pidió y no tiene flujo real
  en el BPMN.
