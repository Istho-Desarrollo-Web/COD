# Portar componentes reutilizables del CRM Centhrix a COD — Design Spec

## Contexto

COD y el CRM Centhrix (`istho-crm-p`) comparten el mismo lenguaje visual (paleta `centhrix-*`, `orange-*` remapeado al rojo/naranja de marca, Tailwind v4). El CRM ya construyó varios componentes reutilizables que COD no tiene: `DatePicker` (calendario con navegación rápida de mes/año, locale ES), `FilterDropdown` (dropdown de filtro con buscador integrado, single/multiple, renderizado en portal), y `AccionesDropdown` (agrupador de acciones de toolbar que colapsa a un menú "..." en móvil).

Los 3 componentes del CRM ya usan las mismas clases de color que COD (`dark:bg-centhrix-card`, `dark:border-slate-600`, `focus:ring-orange-500/20`, etc.), por lo que el port es casi verbatim — solo requieren adaptarse a la convención de carpeta-por-componente de COD (`components/common/<Nombre>/<Nombre>.jsx`) en vez del archivo plano del CRM.

Este spec cubre: (1) portar los 3 componentes a COD como piezas de librería con sus propios tests, y (2) integrarlos en los puntos donde ya existe un caso de uso real y de bajo riesgo — que resultan ser, casi en su totalidad, en `DocumentosListado.jsx` y `CarpetasModal.jsx`, los únicos lugares del código actual con filtros, múltiples botones de toolbar y campos de fecha.

## Decisiones de diseño

| Decisión | Elegido | Alternativas descartadas |
|---|---|---|
| Alcance de esta pasada | Portar los 3 componentes + integrarlos donde ya aplican de forma natural (DocumentosListado, CarpetasModal) | Solo portar sin integrar (se descartó: el usuario pidió integrar "en todo lo posible") |
| Selects de formularios (react-hook-form `register(...)`) | Fuera de alcance — se dejan como `<select>` nativos | Convertirlos también a `FilterDropdown` vía `Controller` (se descartó por ampliar demasiado el alcance: tocaría Crear Área, Usuarios, Crear documento, CarpetasModal — varios formularios ya probados — y merece su propia pasada deliberada) |
| `AccionesDropdown` en AreasListado/UsuariosListado | No se integra — cada uno solo tiene un botón de acción, nada que colapsar | Envolver el único botón igual en `AccionesDropdown` (se descartó: no aporta valor con un solo elemento y sería sobre-ingeniería) |
| Estructura de archivos | Carpeta por componente (`DatePicker/DatePicker.jsx`), igual que `Button/Button.jsx`, `Modal/Modal.jsx` | Archivo plano como en el CRM (se descartó por romper la convención ya establecida en COD) |
| Dependencia nueva | Agregar `react-day-picker` (única dependencia que falta; `lucide-react` y `prop-types` ya existen en COD) | Reimplementar el calendario sin la librería (se descartó: reinventar la rueda sin necesidad) |

## Componentes a portar

### `DatePicker` (`components/common/DatePicker/DatePicker.jsx`)

Selector de fecha con: navegación por mes/año, vista de días/meses/años, formato de entrada ISO (`onChange` recibe `'YYYY-MM-DD'` o `''`), formato de visualización `dd/mm/aaaa`, botón de limpiar (`clearable`, default `true`). Props: `value` (string ISO o vacío), `onChange(iso)`, `placeholder`, `label`, `clearable`. Usa `react-day-picker` con locale `es`. Se posiciona con `position: fixed` calculado dinámicamente (no portal — el CRM lo renderiza inline con z-index alto, comportamiento que se porta igual).

### `FilterDropdown` (`components/common/FilterDropdown/FilterDropdown.jsx`)

Dropdown de selección (simple o múltiple) con buscador que aparece automáticamente cuando `options.length > 6` (o se fuerza con la prop `searchable`). Renderiza el panel vía `createPortal(..., document.body)` para escapar overflow/transform de ancestros. Props: `label`, `options` (`{value, label}[]`), `value` (string/number, o array si `multiple`), `onChange`, `placeholder`, `multiple`, `icon` (componente lucide), `compact`, `searchable`.

### `AccionesDropdown` (`components/common/AccionesDropdown/AccionesDropdown.jsx`)

Agrupador de acciones: en desktop (`md:` y superior) renderiza botones individuales en fila; en móvil colapsa a un botón "..." con menú desplegable (`role="menu"`). Prop: `acciones` (`{label, icon, onClick, variant?, hidden?}[]`). Las acciones con `hidden: true` no se renderizan en ningún breakpoint (así se aplica el gating por permiso: `hidden: !tienePermiso(...)`).

## Cambios de soporte (antes de portar)

- **`frontend/package.json`**: agregar `react-day-picker` (misma versión que usa el CRM).
- **`frontend/src/index.css`**: agregar el keyframe `fadeIn` y la clase `.animate-fadeIn` (usados por `DatePicker` y `FilterDropdown` para la animación de apertura del panel) — no existen hoy en COD.

## Integración

### `DocumentosListado.jsx`

- **Toolbar**: "Gestionar carpetas" y "Crear documento" se agrupan en un solo `<AccionesDropdown acciones={[...]}>`, cada acción gateada con `hidden: !tienePermiso('documentos','crear')` (mismo permiso que hoy condiciona ambos botones). El `ViewToggle` queda fuera del `AccionesDropdown` (es un modo de visualización, no una acción).
- **Filtros** (Área, Carpeta, Tipo, Estado): los 4 `<select>` — hoy controlados manualmente vía `filtros`/`actualizarFiltro` (no react-hook-form) — pasan a `FilterDropdown`, con `options` (`{value, label}[]`) construido desde los mismos catálogos ya cargados (`areas`, `carpetas`, `tipos`). Para "Estado", `ESTADOS` es hoy un array plano de strings (`['vigente','por_vencer','vencido','sin_vigencia']`) — sus `options` se construyen como `{value: estado, label: <mismo texto humano que ya usa StatusChip.jsx>}` (`'vigente'`, `'por vencer'`, `'vencido'`, `'sin vigencia'`), para que el label mostrado en el dropdown coincida con el que ya se ve en los chips de la tabla, en vez de mostrar el valor crudo con guion bajo.
- **"Vigencia desde"/"Vigencia hasta"** (en el modal Crear documento): pasan de `<Input type="date">` a `<DatePicker>`, integrados con react-hook-form vía `Controller` (única integración de esta pasada que toca el wiring de un formulario, ya que `DatePicker` expone `value`/`onChange` controlado, no un `<input>` nativo registrable).

### `CarpetasModal.jsx`

- El select "Área de las carpetas" (controlado por `useState`, no react-hook-form) pasa a `FilterDropdown`. El select "Carpeta padre (opcional)" queda igual (está registrado vía `register('carpetaPadreId')`, fuera de alcance).

### Fuera de alcance (deliberadamente)

- Cualquier `<select>` registrado con `react-hook-form`'s `register(...)` dentro de un formulario de creación/edición: Rol en "Crear área" (ambos, líder nuevo/existente), Rol y Usuario existente en Usuarios, Carpeta/Tipo de documento en "Crear documento", Carpeta padre en CarpetasModal.
- `AreasListado.jsx` y `UsuariosListado.jsx`: no tienen filtros ni más de un botón de toolbar hoy, así que no hay integración natural en esta pasada.

## Testing

- **Componentes nuevos**: `DatePicker.test.jsx`, `FilterDropdown.test.jsx`, `AccionesDropdown.test.jsx` en sus respectivas carpetas, siguiendo el patrón Vitest + Testing Library ya usado (ver `Modal.test.jsx`/`Pagination.test.jsx`). Cobertura mínima: apertura/cierre del panel, selección (simple y múltiple para FilterDropdown), buscador filtra opciones, `clearable` en DatePicker, colapso desktop/móvil en AccionesDropdown (vía `window.innerWidth` + clases `hidden md:flex`/`md:hidden`, mismo patrón que ya usa `useViewMode`).
- **Tests existentes afectados**: en `DocumentosListado.test.jsx` y `CarpetasModal.test.jsx`, toda interacción `userEvent.selectOptions(screen.getByLabelText(...), ...)` sobre un filtro/select convertido pasa a `userEvent.click` sobre el botón del `FilterDropdown` seguido de `userEvent.click` sobre la opción deseada (el panel se renderiza vía portal, así que las opciones se buscan con `screen.getByRole('button', {name: ...})` fuera de cualquier `within(...)` que asuma que el panel es hijo del contenedor). Los asserts sobre valores de "Vigencia desde/hasta" cambian de `userEvent.type` sobre un `<input type="date">` a la interacción de `DatePicker` (clic en el botón, clic en el día del calendario).
- **Regla general**: ningún test existente debe perder cobertura — se actualiza la interacción, no se elimina la aserción.

## Estructura de archivos

**Nuevos:**
```
frontend/src/components/common/DatePicker/DatePicker.jsx
frontend/src/components/common/DatePicker/DatePicker.test.jsx
frontend/src/components/common/FilterDropdown/FilterDropdown.jsx
frontend/src/components/common/FilterDropdown/FilterDropdown.test.jsx
frontend/src/components/common/AccionesDropdown/AccionesDropdown.jsx
frontend/src/components/common/AccionesDropdown/AccionesDropdown.test.jsx
```

**Modificados:**
```
frontend/package.json
frontend/src/index.css
frontend/src/pages/documentos/DocumentosListado.jsx
frontend/src/pages/documentos/DocumentosListado.test.jsx
frontend/src/pages/documentos/CarpetasModal.jsx
frontend/src/pages/documentos/CarpetasModal.test.jsx
README.md
```
