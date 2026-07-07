# COD Documentos Frontend — Design Spec

## Contexto

La API HTTP de Documentos/Carpetas/Tipos de Documento (`2026-07-07-cod-documentos-api-design.md`) ya está fusionada en `main` y funcionando, pero la ruta `/documentos` del frontend todavía renderiza el placeholder `ProximamentePage`. Este spec cubre la construcción del módulo frontend real que consume esa API, siguiendo el patrón ya validado por el módulo Áreas (`AreasListado.jsx`, `useViewMode`, `StatusChip`, `PermissionRoute`).

## Decisiones de diseño

| Decisión | Elegido | Alternativas descartadas |
|---|---|---|
| Navegación principal | Lista plana con filtros (Área, Carpeta, Tipo, Estado), como Áreas | Árbol de carpetas + panel de documentos ahora (más trabajo de UI, se documenta como fase futura) |
| Resolución de nombres Área/Carpeta/Tipo | Cargar catálogos una vez (`/areas`, `/tipos-documento`, `/carpetas?areaId=`) y cruzar por ID en el cliente | Pedir `include` al backend (tocaría un módulo ya fusionado, fuera de alcance de "solo frontend"); mostrar IDs crudos |
| Gating de acciones | Permisos granulares (`tienePermiso('documentos', accion)` por cada acción: crear/editar/eliminar/aprobar_version/exportar) | `isAdmin` a secas (como Áreas) — inconsistente con que `lider_area` tiene crear/editar/aprobar_version/exportar pero no eliminar |
| Vista de detalle de documento | Ruta dedicada `/documentos/:id` (primera ruta con parámetro del proyecto) | Modal/drawer con tabs sobre el listado |
| Campo `responsableUsuarioId` | Omitido del formulario en esta fase (no existe endpoint `/usuarios` para construir un selector) | Input numérico crudo (mala UX) |
| Gestión de Carpetas | Modal "Gestionar carpetas" desde el toolbar del listado (selector de área + lista plana con ruta calculada + formulario de creación) | Creación "al vuelo" solo dentro del formulario de Documento |
| Descarga de archivos | `apiClient.get(url, {responseType:'blob'})` + `URL.createObjectURL` + `<a download>` temporal, encapsulado en el servicio | `<a href>` directo al backend (no autenticaría, `Authorization` va por header, no query param) |

## Pantallas y navegación

**Rutas (`App.jsx`):**
- `/documentos` (ya montada, `PermissionRoute modulo="documentos" accion="ver"`) → reemplaza `ProximamentePage` por `DocumentosListado`.
- `/documentos/:id` (nueva) → misma gate → `DocumentoDetalle`.

**`DocumentosListado`:**
- Toolbar: filtros (Área, Carpeta —dependiente del área—, Tipo, Estado), botón "+ Crear documento" (`tienePermiso('documentos','crear')`), botón "Gestionar carpetas" (`tienePermiso('documentos','crear')`).
- Alterna lista/tarjetas vía `useViewMode('cod_view_documentos')`; cada fila/tarjeta usa `<StatusChip status={documento.estado}/>`.
- Clic en fila/tarjeta → `navigate('/documentos/' + id)`.
- Paginación: nuevo componente `Pagination` (Anterior / Página X de Y / Siguiente), primera pantalla que consume `pagination` de `paginated()`.
- Resolución de nombres: carga una vez `GET /areas`, `GET /tipos-documento`; recarga `GET /carpetas?areaId=` al cambiar el filtro de área; arma diccionarios `{id: nombre}` para pintar en la tabla.

**`DocumentoDetalle`:**
- Header: nombre, código, `StatusChip`, botón "Volver", botón "Descargar versión vigente" (`tienePermiso('documentos','exportar')`).
- Tab "Detalle": formulario de edición (`tienePermiso('documentos','editar')`), botón "Eliminar" con confirmación (`tienePermiso('documentos','eliminar')`).
- Tab "Historial de versiones": tabla de versiones + botón "Descargar" por fila (`exportar`) + botón "Subir nueva versión" (`aprobar_version`).

**Modal "Gestionar carpetas":** selector de Área arriba; lista plana de carpetas de esa área mostrando su ruta calculada (ej. "RRHH / Contratos", aplanando el árbol que ya devuelve el backend); formulario de creación (nombre + carpeta padre opcional) debajo.

## Formularios y validación cliente

**Validación de archivo compartida:** `frontend/src/utils/validarArchivo.js` espeja las reglas del backend (mismos 9 mimetypes, máx 20MB) para feedback inmediato; no reemplaza la validación del servidor.

**Crear documento (Modal en `DocumentosListado`):**
- Campos RHF: `areaId`, `carpetaId` (deshabilitado hasta elegir área), `tipoDocumentoId`, `nombre`, `codigo` (opcional), `vigenciaDesde`/`vigenciaHasta` (opcionales), `diasAlertaVencimiento` (opcional, placeholder = default del tipo), `archivo` (obligatorio).
- Validación cliente: obligatorios, `vigenciaHasta > vigenciaDesde` si ambos están, `validarArchivo(file)`.
- Envío: `FormData` manual (key `archivo` exacta) vía `documentoService.crear`; éxito → toast, cerrar modal, recargar listado completo.

**Editar metadata (tab "Detalle"):** mismos campos salvo `archivo` y `areaId` (fijo); `carpetaId` limitado a carpetas de la misma área. Como `/documentos/:id` es una ruta independiente (accesible directamente por URL, sin depender de que `DocumentosListado` haya cargado nada antes), `DocumentoDetalle` carga sus propios catálogos al montar: el documento (`obtener(id)`), `GET /tipos-documento`, y `GET /carpetas?areaId=` usando el `areaId` fijo del documento — no reutiliza ningún estado de `DocumentosListado`. Envío JSON vía `PUT /documentos/:id`; éxito → refresca detalle in-place.

**Subir nueva versión (tab "Historial"):** `version` (texto libre, obligatorio), `vigenciaDesde`/`vigenciaHasta` (opcionales), `archivo` (obligatorio, misma validación); éxito → refresca detalle + historial.

**Crear carpeta (dentro del modal "Gestionar carpetas"):** `nombre` (obligatorio), `carpetaPadreId` (select opcional, opciones = carpetas del área elegida); éxito → recarga la lista de carpetas de esa área dentro del mismo modal.

## Servicios API y permisos

**Servicios nuevos** (mismo patrón que `area.service.js` — funciones sueltas, export default como objeto):
- `documento.service.js`: `listar(filtros)` → retorna `{data, pagination}` (preserva el sibling `pagination` del envelope); `obtener(id)`; `crear(formData)`; `editar(id, cambios)`; `eliminar(id)`; `listarVersiones(id)`; `subirVersion(id, formData)`; `descargar(id)`; `descargarVersion(id, versionId)`.
- `carpeta.service.js`: `listar(areaId)`; `crear({areaId, nombre, carpetaPadreId})`.
- `tipoDocumento.service.js`: `listar()`.

**Descarga:** `descargar`/`descargarVersion` piden el archivo con `responseType: 'blob'`, crean `URL.createObjectURL(blob)` y disparan un `<a download>` temporal — encapsulado en el servicio, los componentes solo llaman `await documentoService.descargar(id)`.

**Permisos:** cada acción usa `tienePermiso('documentos', accion)` con el nombre exacto de la tabla de rutas del backend (`crear`, `editar`, `eliminar`, `aprobar_version` para subir versión, `exportar` para ambas descargas). Rutas protegidas con `PermissionRoute modulo="documentos" accion="ver"`.

## Estructura de archivos

**Nuevos:**
```
frontend/src/pages/documentos/DocumentosListado.jsx
frontend/src/pages/documentos/DocumentosListado.test.jsx
frontend/src/pages/documentos/DocumentoDetalle.jsx
frontend/src/pages/documentos/DocumentoDetalle.test.jsx
frontend/src/pages/documentos/CarpetasModal.jsx
frontend/src/pages/documentos/CarpetasModal.test.jsx
frontend/src/api/documento.service.js
frontend/src/api/documento.service.test.js
frontend/src/api/carpeta.service.js
frontend/src/api/tipoDocumento.service.js
frontend/src/utils/validarArchivo.js
frontend/src/utils/validarArchivo.test.js
frontend/src/components/common/Pagination/Pagination.jsx
frontend/src/components/common/Pagination/Pagination.test.jsx
```

**Modificados:**
```
frontend/src/App.jsx   (reemplazar placeholder /documentos por DocumentosListado; agregar ruta /documentos/:id)
```

Sin cambios en `Sidebar.jsx` (el ítem "Documentos" ya está completo) ni en `server/` (0 archivos de backend tocados).

## Testing

Mismo patrón que `AreasListado.test.jsx`: Vitest + Testing Library, mockeando servicios API y `AuthContext` para simular distintos roles/permisos. Casos clave: un usuario `lider_area` no ve "Eliminar" pero sí "Crear"/"Editar"/"Subir versión"/"Descargar"; `financiera`/`solicitante` solo ven, sin ninguna acción de escritura; filtros combinados; paginación (cambio de página dispara nuevo fetch con `page` actualizado); validación de archivo (tipo/tamaño rechazados antes de enviar); resolución de nombres Área/Carpeta/Tipo en la tabla; flujo completo crear → ver detalle → editar → subir versión → descargar, al menos un test de integración por pantalla.

## Fuera de alcance (deliberadamente)

- Árbol visual de navegación de carpetas (fase futura).
- Selector real de `responsableUsuarioId` (requiere un endpoint `/usuarios` que no existe hoy).
- Edición/eliminación de Carpetas y Tipos de Documento vía UI (el backend tampoco lo expone).
- Cualquier cambio al backend.
