# Detalle de Área — Design

## Contexto

El spec original de modelo de datos (`docs/superpowers/specs/2026-07-02-cod-modelo-datos-estructura-design.md`)
dejó anotado un "Detalle de área — solo consulta/navegación (carpetas, formularios,
solicitudes de esa área); no vive lógica de aprobación aquí", y planes posteriores lo
mencionaron como "siguiente en la cola". Este diseño lo construye ahora, acotado a lo
que hoy realmente existe en COD.

`AreasListado.jsx` (`/areas`) muestra hoy una lista/grilla de áreas sin ningún
drill-down: ni las tarjetas ni las filas de la tabla son clickeables. `GET /areas/:id`
ya existe en el backend (`area.controller.js`'s `obtener`, `Area.findByPk(id)`) pero
solo devuelve la fila del área — sin carpetas, documentos, ni líder resuelto.
Formularios y Solicitudes siguen siendo módulos "Próximamente" en COD (no existen
como features reales todavía), así que quedan fuera de este detalle.

## Objetivo

1. Página nueva `/areas/:id` que muestra la información propia del área, quién es su
   líder, y accesos directos a sus carpetas y documentos — sin editar nada (fiel al
   "solo consulta/navegación" del spec original).
2. `AreasListado.jsx` deja de ser una vista sin salida: sus tarjetas y filas navegan
   al detalle.
3. Cero cambios de backend: todo lo necesario se resuelve con servicios/endpoints que
   ya existen.

## Arquitectura

Página nueva `frontend/src/pages/areas/AreaDetalle.jsx`, ruta `/areas/:id` en
`App.jsx`, gateada con el mismo permiso que `/areas`
(`<PermissionRoute modulo="areas" accion="ver">`). Cinco fuentes de datos, cada una
cargada en su propio `useEffect`/`try-catch` independiente (si una falla, no bloquea
a las demás — mismo patrón silencioso ya usado en `DocumentosListado.jsx`/
`CarpetasGestion.jsx`):

1. **El área misma**: `areaService.obtener(id)` (ya existe) — nombre, código,
   `saludDocumentalPct`, `activo`, `liderUsuarioId`. Si esta llamada falla (o
   devuelve 404), se muestra un `EmptyState` de error con enlace de vuelta a
   `/areas` — a diferencia de las otras 4 fuentes, esta sí es bloqueante porque sin
   ella no hay página que mostrar.
2. **Líder resuelto**: si `area.liderUsuarioId` no es `null`, `usuarioService.obtener(liderUsuarioId)`
   (ya existe) para mostrar nombre + apellido. Si `liderUsuarioId` es `null`, se
   muestra "Sin líder asignado" sin hacer ninguna llamada.
3. **Conteo de carpetas**: `carpetaService.listar(areaId)` (ya existe, devuelve el
   árbol) aplanado con `aplanarCarpetas` (ya exportado desde
   `frontend/src/pages/documentos/DocumentosListado.jsx`) — el conteo es
   `carpetasPlanas.length`.
4. **Conteo de documentos por estado**: 4 llamadas paralelas (`Promise.all`) a
   `documentoService.listar({areaId, estado, limit: 1})` — una sin `estado` (total) y
   una por cada valor (`vigente`, `por_vencer`, `vencido`) — leyendo solo
   `pagination.total` de cada respuesta. Cuatro llamadas ligeras para una sola área
   vista a la vez no son un problema de N+1 (es exactamente el mismo razonamiento ya
   aplicado al detalle de carpeta: consulta cara solo si se multiplicara por cada
   fila de una lista, lo cual no es el caso aquí).
5. **Navegación cruzada**: "Ver carpetas" navega a `/documentos/carpetas?areaId=<id>`;
   "Ver documentos" navega a `/documentos?areaId=<id>` (ya soportado por
   `DocumentosListado.jsx` desde el plan anterior).

**Cambio adicional necesario en `CarpetasGestion.jsx`:** hoy no lee ningún query
param — el área siempre arranca en `''` y el usuario la elige a mano en el
`FilterDropdown`. Se le agrega el mismo patrón ya usado en `DocumentosListado.jsx`:
leer `areaId` de `useSearchParams()` al montar y usarlo como valor inicial del estado
`areaId` (con el mismo cuidado de `Number(...)` para que la comparación estricta de
`FilterDropdown` siga funcionando).

**Cambio en `AreasListado.jsx`:** `AreaCard` y las filas de `DataTable` ganan
navegación al detalle. `AreaCard` se envuelve con el mismo patrón `role="button"` +
`onClick`/`onKeyDown` ya usado por `DocumentoCard`/`CarpetaCard` (clic o
Enter/Espacio navega a `/areas/${area.id}`, con `e.preventDefault()` en Espacio para
no scrollear la página — lección ya aprendida en el detalle de carpeta). `DataTable`
ya soporta un prop `onRowClick` (usado y testeado en otros archivos de este
codebase) — se le pasa `onRowClick={(area) => navigate(`/areas/${area.id}`)}`.

## Componentes

### `AreaDetalle.jsx`

- Botón "Volver a Áreas" (`Link to="/areas"`) + encabezado con el nombre del área
  (mismo patrón visual que `CarpetasGestion.jsx`/`DocumentoDetalle.jsx`).
- **Tarjeta de información**: nombre, código, badge de estado (`activo`/`inactivo` —
  simple, no usa `StatusChip` porque no es un estado de vigencia documental), salud
  documental (reutilizando `StatusChip` + el mismo helper `nivelSalud(pct)` que ya
  usa `AreasListado.jsx` — se duplica la función localmente, ya que es una función
  pura de 5 líneas sin estado compartido, no vale la pena extraerla a un módulo
  compartido por una sola reutilización), y línea de líder ("Líder: Nombre Apellido"
  o "Sin líder asignado").
- **Tarjeta Carpetas**: ícono `Folder`, "N carpetas", botón "Ver carpetas" →
  `navigate(`/documentos/carpetas?areaId=${id}`)`.
- **Tarjeta Documentos**: ícono `FileText`, "N documentos" como cifra principal, y
  tres cifras secundarias (vigentes / por vencer / vencidos), botón "Ver documentos"
  → `navigate(`/documentos?areaId=${id}`)`.

### `CarpetasGestion.jsx` (modificado)

Agrega `useSearchParams` (ya importado en otros archivos del proyecto, mismo patrón)
y seedea el estado `areaId` desde el query param `areaId` al montar, igual que
`DocumentosListado.jsx` ya hace hoy.

### `AreasListado.jsx` (modificado)

`AreaCard` se vuelve clickeable (navega al detalle); `DataTable` recibe
`onRowClick` apuntando a la misma navegación.

## Manejo de errores

- Fallo al cargar el área (`GET /areas/:id`, incluyendo 404): `EmptyState` de error
  con mensaje y enlace de vuelta a `/areas` — esta es la única fuente de datos que
  bloquea el render de la página.
- Fallo al resolver el líder, contar carpetas, o contar documentos por estado: cada
  uno se atrapa de forma independiente y silenciosa (mismo patrón ya usado en
  `DocumentosListado.jsx`/`CarpetasGestion.jsx` para sus propias cargas de catálogo);
  el bloque correspondiente muestra "—" en vez de un número, sin toast de error — es
  información de apoyo, no una acción crítica del usuario.

## Testing

Vitest + Testing Library, `describe`/`it` en inglés, `vi.mock(...)` para los
servicios, `MemoryRouter` con `Routes`/`Route` para las pruebas de navegación entre
`/areas` y `/areas/:id`. Casos a cubrir:

- `AreaDetalle` carga y muestra nombre, código, salud, y estado del área.
- Muestra el nombre completo del líder cuando `liderUsuarioId` no es `null`.
- Muestra "Sin líder asignado" cuando `liderUsuarioId` es `null` (sin llamar a
  `usuarioService.obtener`).
- Muestra el conteo correcto de carpetas.
- Muestra el conteo total y el desglose por estado de documentos.
- "Ver carpetas" navega a `/documentos/carpetas?areaId=<id>`.
- "Ver documentos" navega a `/documentos?areaId=<id>`.
- Un fallo al cargar el área muestra el `EmptyState` de error con enlace de vuelta.
- Un fallo al resolver el líder (o contar carpetas/documentos) no bloquea el resto de
  la página — el resto de la info sigue mostrándose.
- `AreasListado`: clic en una tarjeta y en una fila de la tabla navegan a
  `/areas/:id`.
- `CarpetasGestion`: preselecciona el área cuando `?areaId=` viene en la URL al
  montar.

## Fuera de alcance

- Editar el área (nombre, código, líder) desde el detalle — requeriría un endpoint
  `PUT /areas/:id` que no existe hoy.
- Dar de baja (desactivar) un área desde aquí — no existe endpoint `eliminar` para
  Área.
- Secciones o pestañas de Formularios/Solicitudes — esos módulos no existen todavía
  en COD.
- Vista previa con listas embebidas de carpetas/documentos — solo conteos + enlaces
  de acceso directo a las pantallas ya existentes.
- Cualquier cambio al modelo `Area` o a cualquier endpoint del backend.
