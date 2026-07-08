# Vista de carpetas estilo Google Drive + detalle de carpeta — Design

## Contexto

`frontend/src/pages/documentos/CarpetasGestion.jsx` (pantalla en `/documentos/carpetas`,
creada en un plan anterior para reemplazar el modal `CarpetasModal`) hoy muestra las
carpetas de un área como una lista plana de texto con la ruta completa de cada una
(`Carpeta Diagnostico`, `Carpeta Diagnostico / Sub Diagnostico`, ...), y un formulario
fijo debajo para crear una carpeta nueva eligiendo explícitamente su carpeta padre.

Este diseño la rediseña como una vista de navegación por carpetas estilo Google Drive
(tarjetas + entrar/salir de carpetas + detalle bajo demanda), sin tocar el backend ni
el modelo de datos de `Carpeta` — usa exactamente lo que `carpetaService.listar(areaId)`
ya devuelve (un árbol con `subcarpetas` anidadas).

## Objetivo

1. Reemplazar la lista de texto por una grilla de tarjetas navegable: se ve un nivel de
   carpetas a la vez, se entra a una carpeta haciendo clic en su tarjeta, y una miga de
   pan (breadcrumb) permite volver a cualquier nivel superior.
2. Agregar un detalle de carpeta (modal) que muestra información básica sin necesidad
   de entrar a la carpeta, con acceso directo a ver sus documentos.
3. Mover la creación de carpetas a un modal disparado por un botón "+ Nueva carpeta",
   con la carpeta padre implícita según dónde esté parado el usuario (ya no hay que
   elegirla de un select).

## Arquitectura

`CarpetasGestion.jsx` sigue pidiendo el árbol completo del área con
`carpetaService.listar(areaId)` (una sola llamada, como hoy) y navega ese árbol
**en memoria** con un nuevo estado `carpetaActualId` (`null` = raíz del área):

- Las tarjetas que se renderizan son las `subcarpetas` directas de `carpetaActualId`
  (o las carpetas raíz del árbol si `carpetaActualId` es `null`).
- Entrar a una carpeta es `setCarpetaActualId(carpeta.id)` — no dispara ninguna
  llamada nueva a la API, porque el árbol completo ya está en memoria.
- Cambiar el área en el `FilterDropdown` de arriba reinicia `carpetaActualId` a `null`.
- Crear una carpeta sigue disparando `carpetaService.crear(...)` y refrescando el
  árbol completo del área (mismo patrón de hoy), preservando `carpetaActualId` tal
  cual (la carpeta recién creada aparece como subcarpeta del nivel donde se creó).

No se agrega ningún endpoint nuevo al backend. La única pieza de datos que no viene
directamente del árbol es la ruta completa (breadcrumb / detalle), que se sigue
calculando en el frontend igual que hoy: `aplanarCarpetas` (ya existe, exportada desde
`DocumentosListado.jsx:35`) se reutiliza para construir una lista plana `{id, nombre,
ruta, areaId, carpetaPadreId}` de la que se puede leer la ruta y los ancestros de
cualquier carpeta por id — ya no para renderizar la lista principal (eso ahora lo hace
la navegación del árbol), sino solo como estructura auxiliar para el breadcrumb y el
modal de detalle.

## Componentes

### Breadcrumb

Fila de botones debajo del selector de área: `Financiera` (raíz, siempre clickeable)
`/ Carpeta Diagnostico / Sub Diagnostico`. Se construye recorriendo hacia arriba desde
`carpetaActualId` con `carpetaPadreId` sobre la lista aplanada. Cada segmento, al
hacer clic, hace `setCarpetaActualId(idDeEseSegmento)` (o `null` para el segmento raíz
del área).

### Grilla de tarjetas

Grid `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4`, mismo lenguaje visual que
`AreaCard` (`AreasListado.jsx:27-40`) y `DocumentoCard` (`DocumentosListado.jsx:42-60`):
`bg-white dark:bg-centhrix-card rounded-2xl p-5 shadow-sm border border-gray-100
dark:border-slate-700`.

Cada tarjeta muestra:
- Ícono `Folder` (lucide-react) + nombre de la carpeta.
- Un botón-ícono `Info` en la esquina superior derecha que abre el modal de detalle
  de esa carpeta sin navegar (`stopPropagation` para no disparar el clic de la
  tarjeta).
- El resto de la tarjeta es clickeable (`role="button"`, `tabIndex={0}`, `onClick` y
  `onKeyDown` para Enter/Espacio, mismo patrón que `DocumentoCard`) y entra a la
  carpeta.

Si el nivel actual no tiene subcarpetas, se muestra `EmptyState` (`icon={Folder}`,
`title="Sin subcarpetas aquí"`, `action` = el mismo botón "+ Nueva carpeta").

### Modal de detalle de carpeta

Reutiliza `Modal.jsx` (`size="sm"`, `title` = nombre de la carpeta). Contenido:
- Ruta completa (calculada igual que el breadcrumb).
- Fecha de creación: `new Date(carpeta.createdAt).toLocaleDateString('es-ES')` (no
  existe una convención previa de formato de fecha en el frontend; esta es la primera
  y queda como referencia para futuros casos).
- Cantidad de subcarpetas directas: `carpeta.subcarpetas.length` (ya viene en el árbol,
  sin llamada adicional).
- Botón "Ver documentos de esta carpeta": navega a
  `/documentos?areaId=<areaId>&carpetaId=<id>`.

**Cambio necesario en `DocumentosListado.jsx`:** al montar, leer `useSearchParams()`
de `react-router-dom` y, si vienen `areaId`/`carpetaId` en la URL, usarlos como valor
inicial de `filtros.areaId`/`filtros.carpetaId` en vez de los strings vacíos de hoy
(`DocumentosListado.jsx:80`). El resto del comportamiento de filtros (carga de
carpetas dependiente del área, `disabled` del filtro Carpeta, etc.) no cambia — es
exactamente como si el usuario hubiera elegido esos valores a mano en los
`FilterDropdown` existentes.

No se agrega conteo de documentos por carpeta en esta pasada (ni en las tarjetas ni en
el detalle) — mostrarlo requeriría una consulta adicional por carpeta (o un nuevo
endpoint de agregación en el backend), y el usuario priorizó el acceso directo a
Documentos sobre el conteo. Se puede agregar en una iteración futura si hace falta.

### Modal de creación de carpeta

Botón "+ Nueva carpeta" junto al breadcrumb abre `Modal.jsx` (`size="sm"`) con el
formulario que ya existe hoy (`Input` de nombre + validación `required`), pero **sin**
el selector de carpeta padre — la carpeta padre queda implícita: es `carpetaActualId`
(o `null` si se está en la raíz del área). Al enviar, se llama
`carpetaService.crear({areaId, nombre, carpetaPadreId: carpetaActualId})`, se cierra
el modal, se refresca el árbol del área (mismo `cargarCarpetas(areaId)` de hoy) y se
muestra el toast de éxito/error vía `notistack` (comportamiento sin cambios).

## Manejo de errores

Sin cambios respecto al comportamiento actual: fallos al cargar áreas o el árbol de
carpetas se tragan silenciosamente y dejan listas vacías (mismo patrón ya usado en
este archivo y en `DocumentoDetalle.jsx`); fallos al crear una carpeta muestran un
toast de error vía `notistack` (comportamiento ya existente, sin cambios).

## Testing

Se sigue la convención existente (Vitest + Testing Library, `describe`/`it` en
inglés, `MemoryRouter` envolviendo el componente). Casos a cubrir:

- Entrar a una carpeta (clic en tarjeta) muestra sus subcarpetas y actualiza el
  breadcrumb.
- Clic en un segmento del breadcrumb vuelve a ese nivel.
- El botón de info abre el modal de detalle sin cambiar de nivel.
- El detalle muestra ruta, fecha y cantidad de subcarpetas correctas.
- El botón "Ver documentos de esta carpeta" navega a la URL esperada con los query
  params correctos.
- Crear una carpeta desde el modal, con la carpeta padre implícita según el nivel
  actual (raíz y dentro de una carpeta, dos casos).
- Cambiar de área reinicia la navegación a la raíz.
- Estado vacío (`EmptyState`) cuando un nivel no tiene subcarpetas.
- `DocumentosListado.jsx`: lee `areaId`/`carpetaId` de la URL al montar y los usa como
  filtro inicial; sin esos query params, el comportamiento es exactamente el de hoy
  (filtros vacíos).

## Fuera de alcance

- Cualquier acción de carpeta más allá de crear (renombrar, eliminar, reordenar) —
  sigue siendo un CRUD de solo `listar`/`crear`, sin cambios respecto al estado
  actual del backend.
- Conteo de documentos por carpeta (ni en tarjetas ni en el detalle).
- Alternar entre vista de grilla y vista de lista (`ViewToggle`/`useViewMode`) — esta
  pantalla es solo grilla, a diferencia de `AreasListado`/`DocumentosListado`.
- Arrastrar y soltar carpetas o documentos.
- Cambios al modelo `Carpeta` o a cualquier endpoint del backend.
