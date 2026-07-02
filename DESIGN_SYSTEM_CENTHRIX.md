# DESIGN SYSTEM CENTHRIX — Guía de Referencia Técnica para Proyecto COD

> **Propósito:** Consolida los tokens, patrones y convenciones del CRM CenthriX (ISTHO S.A.S.) extraídos directamente del código fuente. Sirve como base para que el proyecto COD se vea y comporte como una extensión de la misma plataforma.
>
> **Metodología:** Toda información fue verificada leyendo los archivos fuente reales. Los casos donde no fue posible confirmar con el código se marcan con ⚠️ **No confirmado en código** — verificar directamente antes de asumir.

---

## 1. TOKENS DE MARCA

### 1.1 Colores

Fuente: `frontend/tailwind.config.js` + `frontend/src/index.css`.

#### Fondos dark (modo oscuro principal)

| Token Tailwind | Variable CSS | Hex | Uso |
|---|---|---|---|
| `dark:bg-centhrix-bg` | `--color-centhrix-bg` | `#0F1023` | Fondo de página raíz |
| `dark:bg-centhrix-card` | `--color-centhrix-card` | `#1A1B3A` | Cards, modales, paneles |
| `dark:bg-centhrix-surface` | `--color-centhrix-surface` | `#151631` | Superficies intermedias, sidebars |

> **Regla crítica:** Usar SIEMPRE los tokens `centhrix-*` para fondos dark. **NUNCA** usar `dark:bg-slate-600` a `dark:bg-slate-900` — producen un azul grisáceo incorrecto que rompe la identidad visual.

`index.css` también define overrides globales de dark mode:
```css
.dark .bg-white     → background: #1a1b3a
.dark .bg-slate-50  → background: #0f1023
.dark .bg-slate-100 → background: #151631
```

#### Acento y marca

| Token | Hex | Uso |
|---|---|---|
| `centhrix-accent` | `#E74C3C` | Color primario de marca, botones CTA, highlights |
| `centhrix-accent-hover` | `#C0392B` | Estado hover del acento |
| `accent.light` | `#FF6B5A` | Variante clara (uso esporádico) |

> **Paleta `orange-*` remapeada:** En `tailwind.config.js` la escala `orange` completa apunta a la paleta roja de CENTHRIX, **no** al naranja estándar de Tailwind. Usar `orange-500`/`orange-600` o `centhrix-accent` es equivalente:

```js
// tailwind.config.js
orange: {
  50:  '#fef2f2',
  100: '#fee2e2',
  200: '#fecaca',
  300: '#fca5a5',
  400: '#f87171',
  500: '#E74C3C',   // ← acento CENTHRIX, no naranja real
  600: '#E74C3C',
  700: '#C0392B',
  800: '#991B1B',
  900: '#7F1D1D',
}
```

#### Semánticos y estado

| Token | Hex | Uso |
|---|---|---|
| `success.DEFAULT` | `#2ECC71` | Éxito, estado positivo |
| `success.light` | `#3DDB83` | Variante clara |
| `success.dark` | `#27AE60` | Hover / variante oscura |
| Acento (rojo) | `#E74C3C` | Error y alerta crítica |

> ⚠️ **No confirmado:** No se encontró un token `warning` dedicado en `tailwind.config.js`. Las advertencias en la UI usan `amber-500` (`#F59E0B`) del Tailwind estándar. Verificar el archivo completo si se requiere un token propio.

#### Colores de roles (definidos en seed)

```js
// server/src/scripts/seedRolesPermisos.js — usar para badges de rol
admin:      '#EF4444'
supervisor: '#F59E0B'
financiera: '#10B981'
operador:   '#3B82F6'
conductor:  '#F97316'
cliente:    '#8B5CF6'
```

#### Colores de charts

**Archivo:** `frontend/src/utils/chartColors.js` — importar siempre desde aquí, nunca hardcodear.

```js
export const CHART_COLORS = [
  '#3b82f6',  // azul
  '#10b981',  // verde
  '#f59e0b',  // ámbar
  '#8b5cf6',  // púrpura
  '#ef4444',  // rojo
  '#06b6d4',  // cian
  '#f97316',  // naranja real
  '#ec4899',  // rosa
];

export const CHART_COLORS_OPACITY = (opacity = 0.7) =>
  CHART_COLORS.map(c => `${c}${Math.round(opacity * 255).toString(16).padStart(2, '0')}`);
```

---

### 1.2 Tipografías

Fuente: `frontend/tailwind.config.js` y `frontend/src/index.css`.

```js
// tailwind.config.js
fontFamily: {
  sans:    ['"Segoe UI"', 'Calibri', '-apple-system', 'BlinkMacSystemFont', 'system-ui', 'sans-serif'],
  display: ['Rajdhani', '"Segoe UI"', 'system-ui', 'sans-serif'],
}
```

| Familia | Clase Tailwind | Uso |
|---|---|---|
| Segoe UI (stack system) | `font-sans` (default) | Cuerpo, datos, tablas, párrafos |
| Rajdhani | `font-display` | Headings de páginas, títulos de módulo, cifras KPI grandes |

La variable CSS `--font-display` se define en el bloque `@theme` de `index.css`.

> ⚠️ **No confirmado:** No se leyó `frontend/index.html` durante el análisis. Verificar ahí si Rajdhani se carga via `<link>` de Google Fonts. Segoe UI es fuente del sistema en Windows (no requiere carga externa).

---

### 1.3 Bordes, sombras y espaciados

> ⚠️ **No confirmados en código.** Durante el análisis de `tailwind.config.js` no se extrajeron personalizaciones de `borderRadius`, `boxShadow` ni `spacing` custom más allá de los tokens de color y tipografía. Es probable que el proyecto use los valores default de Tailwind para estos. Leer el archivo completo antes de definir tokens propios en COD:
>
> ```bash
> cat frontend/tailwind.config.js
> ```

---

## 2. COMPONENTES BASE REUTILIZABLES

### 2.1 Componentes de formulario obligatorios

**Regla global:** No usar `<select>` ni `<input type="date">` nativos en ningún formulario nuevo. Usar siempre los componentes custom.

---

#### `FilterDropdown` — reemplaza `<select>`

**Archivo:** `frontend/src/components/common/FilterDropdown.jsx`
**Import:** `import { FilterDropdown } from '@components/common'`

```ts
interface Props {
  label?:       string;
  options:      Array<{ value: string | number; label: string }>;
  value?:       string | number | any[];
  onChange?:    (value: any) => void;
  placeholder?: string;
  multiple?:    boolean;
  icon?:        LucideIcon;
  compact?:     boolean;    // para barras de filtros en tablas/dashboards
  searchable?:  boolean;    // automático si options.length > 6
}
```

**Patrones de uso:**

```jsx
// Pattern A — estado local
<FilterDropdown
  options={[{ value: '', label: 'Todos' }, { value: 'activo', label: 'Activo' }]}
  value={filtro}
  onChange={(v) => setFiltro(v)}
  compact
/>

// Pattern B — React Hook Form (IDs numéricos de BD: SIEMPRE String())
<Controller
  name="campo"
  control={control}
  render={({ field }) => (
    <FilterDropdown
      options={[{ value: '', label: 'Seleccionar...' }, ...opciones]}
      value={String(field.value || '')}
      onChange={(v) => field.onChange(v)}
    />
  )}
/>
```

**Notas:**
- Sin prop `disabled` nativa — deshabilitar con wrapper: `<div className={cond ? 'pointer-events-none opacity-60' : ''}>`
- Si el formulario aún no usaba `Controller`: agregar a imports de RHF y destructurar `control` del `useForm()`

---

#### `DatePicker` — reemplaza `<input type="date">`

**Archivo:** `frontend/src/components/common/DatePicker.jsx`
**Librería base:** react-day-picker@9.14.0

```ts
interface Props {
  value:        string;     // YYYY-MM-DD — siempre string, nunca Date object
  onChange?:    (date: string) => void;
  placeholder?: string;     // default: "dd/mm/aaaa"
  label?:       string;
  clearable?:   boolean;
}
```

**Patrones de uso:**

```jsx
// Pattern A — estado local
<DatePicker value={fechaStr} onChange={(v) => setFecha(v)} />

// Pattern B — React Hook Form
<Controller
  name="fecha"
  control={control}
  render={({ field }) => (
    <DatePicker value={field.value || ''} onChange={(v) => field.onChange(v)} />
  )}
/>
```

**Notas:**
- Formato display: `DD/MM/YYYY`; formato almacenamiento: `YYYY-MM-DD` (compatible con `DATEONLY` de Sequelize)
- Para parsear en frontend: `new Date(value + 'T00:00:00')` — evita desfase UTC-5 Colombia
- Sin prop `disabled` — mismo patrón wrapper que FilterDropdown
- Navegación interna: mes → año → rango 1950–2041

---

#### `AccionesDropdown`

**Archivo:** `frontend/src/components/common/AccionesDropdown.jsx`

```ts
interface Accion {
  label:    string;
  icon:     LucideIcon;
  onClick:  () => void;
  variant?: 'primary' | 'outline';  // default: 'outline'
  hidden?:  boolean;
}

interface Props {
  acciones: Accion[];
}
```

**Patrón estándar en páginas de reporte:**

```jsx
<AccionesDropdown acciones={[
  { label: 'Actualizar', icon: RefreshCw,      onClick: fetchData },
  { label: 'Enviar',     icon: Mail,            onClick: () => setEmailModal(true), hidden: !canDownload },
  { label: 'Excel',      icon: FileSpreadsheet, onClick: () => handleExport('excel'), hidden: !canDownload },
  { label: 'PDF',        icon: Download,        onClick: () => handleExport('pdf'),   hidden: !canDownload, variant: 'primary' },
]} />
```

**Comportamiento adaptativo:** Desktop → botones individuales; Mobile (`md:hidden`) → dropdown con `MoreVertical`.

---

### 2.2 Componentes de datos

#### `KpiCard`

**Archivo:** `frontend/src/components/common/Card/KpiCard.jsx`

```ts
interface Props {
  title:      string;           // requerido
  value:      string | number;  // requerido
  change?:    string;           // ej: "+12.5%" o "-3.2%"
  subtitle?:  string | number;
  positive?:  boolean;          // true=verde, false=rojo para el change
  icon?:      LucideIcon;
  iconBg?:    string;           // default: 'bg-blue-100 dark:bg-blue-900/30'
  iconColor?: string;           // default: 'text-blue-600 dark:text-blue-400'
  onClick?:   () => void;
  loading?:   boolean;          // muestra 3 barras skeleton con animate-pulse
}
```

---

#### `Modal`

**Archivo:** `frontend/src/components/common/Modal/Modal.jsx`

```ts
interface Props {
  isOpen:           boolean;     // requerido
  onClose:          () => void;  // requerido
  title:            string;      // requerido
  subtitle?:        string;
  children?:        ReactNode;
  size?:            'sm' | 'md' | 'lg' | 'xl' | 'full';  // default: 'md'
  showCloseButton?: boolean;     // default: true
  closeOnOverlay?:  boolean;     // default: true
  footer?:          ReactNode;
}
```

Incluye: focus trap, prevención de scroll del body, cierre con ESC, ARIA completo (`role="dialog"`, `aria-modal`, `aria-labelledby`).

---

#### `DataTable`

**Archivo:** `frontend/src/components/common/Table/DataTable.jsx`

```ts
interface Column {
  label:   string;
  key:     string;
  align?:  'left' | 'center' | 'right';
  render?: (value: any, row: any) => ReactNode;
}

interface Props {
  columns:       Column[];
  data:          any[];
  onRowClick?:   (row: any) => void;
  loading?:      boolean;
  emptyMessage?: string;
  ariaLabel?:    string;
}
```

---

#### `StatusChip`

**Archivo:** `frontend/src/components/common/StatusChip/StatusChip.jsx`

```ts
interface Props {
  status:       string;  // requerido — ver estados predefinidos abajo
  customLabel?: string;
  size?:        'sm' | 'md' | 'lg';  // default: 'md'
}
```

Estados predefinidos: `completado`, `en_transito`, `en_preparacion`, `programado`, `cancelado`, `pendiente`, `disponible`, `bajo_stock`, `agotado`, `reservado`, `activo`, `inactivo`, `suspendido`, `operativa`, `mantenimiento`, `cerrada`.

---

#### `Button`

**Archivo:** `frontend/src/components/common/Button/Button.jsx`

```ts
interface Props {
  children?:     ReactNode;
  variant?:      'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'success';  // default: 'primary'
  size?:         'sm' | 'md' | 'lg';  // default: 'md'
  icon?:         ReactNode;
  iconPosition?: 'left' | 'right';    // default: 'left'
  loading?:      boolean;
  disabled?:     boolean;
  fullWidth?:    boolean;
  type?:         'button' | 'submit' | 'reset';  // default: 'button'
  onClick?:      () => void;
  className?:    string;
  title?:        string;
  ariaLabel?:    string;
  id?:           string;
}
```

---

#### `Input`

**Archivo:** `frontend/src/components/common/Input/Input.jsx`

```ts
interface Props {
  label?:              string;
  error?:              string;
  hint?:               string;
  icon?:               ReactNode;   // icono en lado izquierdo
  className?:          string;
  containerClassName?: string;
  type?:               string;      // default: 'text'
  disabled?:           boolean;
  id?:                 string;
  // + todos los atributos HTML nativos de <input>
}
```

---

#### `EmptyState`

**Archivo:** `frontend/src/components/common/EmptyState/EmptyState.jsx`

```ts
interface Props {
  icon?:        ReactNode;
  title:        string;    // requerido
  description?: string;
  action?:      ReactNode;
}
```

---

### 2.3 Barrel export de `components/common`

**Archivo:** `frontend/src/components/common/index.js`

```js
export { default as Button }               from './Button/Button';
export { default as Modal }                from './Modal/Modal';
export { default as ConfirmDialog }        from './Dialog/ConfirmDialog';
export { default as StatusChip }           from './StatusChip/StatusChip';
export { default as KpiCard }              from './Card/KpiCard';
export { default as DataTable }            from './Table/DataTable';
export { default as AlertWidget }          from './Widget/AlertWidget';
export { default as EmptyState }           from './EmptyState/EmptyState';
export { default as S3Image }              from './S3Image';
export { default as SearchBar }            from './SearchBar';
export { default as FilterDropdown }       from './FilterDropdown';
export { default as DatePicker }           from './DatePicker';
export { default as Pagination }           from './Pagination';
export { default as Input }                from './Input/Input';
export { default as ReportFilters }        from './ReportFilters';
export { default as AccionesDropdown }     from './AccionesDropdown';
export { default as EnviarEmailModal }     from './EnviarEmailModal';
export { default as EditarOperacionModal } from './EditarOperacionModal';
// ...más exports de componentes WMS/operaciones
```

---

### 2.4 Layout

#### `FloatingHeader`

**Archivo:** `frontend/src/components/layout/FloatingHeader.jsx`
**Props:** Ninguna — lee todo de contextos (`useAuth`, `useThemeContext`, `useNotificaciones`, `useNavigate`).

**Menús configurados (IDs):** `dashboard`, `clientes`, `inventario`, `operaciones`, `viajes`, `solicitudes`, `admin`.

**Atajos de teclado (secuencias con G):**

| Secuencia | Destino |
|---|---|
| `G D` | Dashboard |
| `G R` | Reportes |
| `G C` | Clientes |
| `G I` | Inventario |
| `G E` | Entradas |
| `G S` | Salidas |
| `G K` | Kardex |
| `G V` | Vehículos |
| `G T` | Viajes |
| `G M` | Cajas Menores |
| `G U` | Usuarios |
| `G X` | Auditoría |

**Atajos globales:** `Ctrl/Cmd+B` (toggle dark mode), `Ctrl/Cmd+K` (búsqueda global), `F1` (ver atajos).

#### Sidebar

> ⚠️ **No confirmado.** El análisis no leyó el Sidebar directamente. Ruta probable: `frontend/src/components/layout/Sidebar.jsx`. Leer antes de replicar en COD.

---

### 2.5 Dark/light mode

**Motor:** Tailwind con estrategia `class` — se aplica clase `dark` en `<html>`.

```css
/* index.css — @theme block */
--color-centhrix-accent:       #e74c3c;
--color-centhrix-accent-hover: #c0392b;
--color-centhrix-bg:           #0f1023;
--color-centhrix-surface:      #151631;
--color-centhrix-card:         #1a1b3a;
--font-display: 'Rajdhani', 'Segoe UI', system-ui, sans-serif;
```

**Reglas:**
- ✅ Usar `dark:bg-centhrix-bg`, `dark:bg-centhrix-card`, `dark:bg-centhrix-surface`
- ✅ Usar `dark:bg-white/5` y similares con opacidad para sutilezas
- ❌ **NUNCA** usar `dark:bg-slate-600` a `dark:bg-slate-900`

**Context:** `AppThemeProvider` expone `useThemeContext()`. Verificar nombre exacto del archivo en `frontend/src/context/`.

---

## 3. ARQUITECTURA Y CONVENCIONES DE BACKEND

### 3.1 Flujo de request

```
Petición HTTP
  ↓
express app (global)
  ↓  limiterGeneral — 500 req/15 min por usuario autenticado
  ↓  cors, helmet, compression, json parse
  ↓
/api/v1/  →  Routes (src/routes/index.js)
  ↓
verificarToken (auth.js)
  — lee JWT, popula req.user con id/rol/permisos/helpers
  ↓
filtrarPorCliente (auth.js)  [si la ruta lo requiere]
  — inyecta req.body.cliente_id para usuarios rol='cliente'
  ↓
requierePermiso(modulo, accion) (roles.js)
  — valida contra cache en memoria (TTL 60s)
  ↓
Controller → Service → Model (Sequelize)
  ↓
Auditoria.registrar(...)  ← OBLIGATORIO en todo write
  ↓
helpers de respuesta (utils/responses.js)
```

**Excepción:** `/auth/refresh` NO lleva middlewares de autenticación.

**Cache de permisos** (`cargarCachePermisos()` en `auth.js`):
```js
// Estructura en memoria — TTL 60 segundos
{ rol_id: { modulo: ['accion1', 'accion2'] } }
```
Invalidar con `invalidarCachePermisos()` cuando se editan roles o permisos.

---

### 3.2 Objeto `req.user` (populado por `verificarToken`)

```js
req.user = {
  id, username, email,
  nombre, apellido, nombre_completo,
  rol, rol_id,
  cliente_id,         // solo si rol='cliente'
  permisos_cliente,   // solo si rol='cliente' — JSON propio
  requiere_cambio_password,
  ultimo_acceso,

  // Métodos helpers (verificar en el código antes de usar)
  esCliente()     => boolean,
  esInterno()     => boolean,
  esAdmin()       => boolean,
  esConductor()   => boolean,
  esOperador()    => boolean,
  esFinanciera()  => boolean,
  tienePermiso(modulo, accion) => boolean,
}
```

---

### 3.3 Middlewares disponibles

**`server/src/middlewares/auth.js`**

| Función | Uso |
|---|---|
| `verificarToken` | Middleware principal — toda ruta protegida |
| `verificarTokenOpcional` | Rutas donde el token es opcional |
| `filtrarPorCliente` | Inyecta `cliente_id` en query/body para rol=cliente |
| `verificarAccesoCliente` | Verifica que cliente solo acceda a su propio `cliente_id` |
| `verificarPermisoCliente(modulo, accion)` | Factory — permisos dinámicos portal cliente |
| `verificarCambioPassword` | Fuerza cambio si `requiere_cambio_password=true` |
| `soloUsuariosInternos` | Bloquea rol='cliente' |
| `registrarAcceso` | Actualiza `ultimo_acceso` en background |

**`server/src/middlewares/roles.js`**

| Función | Uso |
|---|---|
| `requiereRol(...roles)` | Factory — verifica pertenencia a rol(es) |
| `requiereRolMinimo(rol)` | Factory — nivel jerárquico mínimo |
| `requierePermiso(modulo, accion)` | Factory — permiso granular (preferido) |
| `soloAdmin` | Alias: `requiereRol('admin')` |
| `supervisorOAdmin` | Alias: `requiereRol('admin', 'supervisor')` |
| `financieraOAdmin` | Alias: `requiereRol('admin', 'supervisor', 'financiera')` |
| `noClientes` | Bloquea rol='cliente' |

**Otros middlewares:**

| Middleware | Archivo | Uso |
|---|---|---|
| `limiterGeneral` | `rateLimiter.js` | 500 req/15 min por usuario |
| `limiterLogin` | `rateLimiter.js` | 10 intentos/15 min por email |
| `limiterExport` | `rateLimiter.js` | 20 req/15 min por usuario |
| `handleSequelizeError` | `errorHandler.js` | Convierte errores ORM a HTTP |
| `comprimir(opts)` | `comprimir.js` | Sharp — max 2000px, quality 80 |
| `powerbiAuth` | `powerbiAuth.js` | API key SHA-256 para endpoints BI |

**Nota crítica `filtrarPorCliente` + Multer:** En rutas `multipart/form-data`, multer reemplaza `req.body` al parsear — borrando el `cliente_id` inyectado. Leer `cliente_id` desde `req.user` en controladores multipart:

```js
// ❌ En rutas multipart — multer habrá borrado este valor
const { cliente_id } = req.body;

// ✅ Para rutas multipart con usuarios cliente
const cliente_id = (req.user.esCliente && req.user.cliente_id)
  ? req.user.cliente_id
  : req.body.cliente_id;
```

---

### 3.4 Helpers de respuesta (`server/src/utils/responses.js`)

```js
success(res, data, statusCodeOrMessage = 200)
successMessage(res, message, data = null, statusCode = 200)
created(res, message, data)           // 201
paginated(res, data, pagination)      // 200 + metadatos de paginación

error(res, message, statusCode = 400, errors = null, code = null)
unauthorized(res, message)            // 401
forbidden(res, message)               // 403
notFound(res, message)                // 404
badRequest(res, message)              // 400
conflict(res, message)                // 409 — duplicado
unprocessable(res, message)           // 422 — regla de negocio
serverError(res, message, errorObj)   // 500
```

**3er argumento:** `string` = mensaje personalizado; `número` = status code.

**Formato de respuesta siempre:**
```json
{
  "success": true | false,
  "data": {},
  "message": "...",
  "errors": [],
  "code": "..."
}
```

---

### 3.5 Helpers generales (`server/src/utils/helpers.js`)

```js
parsePaginacion(query)                // parse page, limit, calcula offset
buildPaginacion(total, page, limit)   // { totalPages, hasNext, hasPrev }
parseOrdenamiento(query, camposPermitidos, defaultField, defaultOrder)
limpiarObjeto(obj)                    // remueve undefined/null
formatearNIT(nit)                     // "123456789-0"
generarCodigoCliente(ultimoId)        // "CLI-0001"
getClientIP(req)                      // IP real considerando proxies
sanitizarBusqueda(str)                // escapa % y _ para SQL LIKE
```

---

### 3.6 Auditoría obligatoria en writes

**Modelo:** `server/src/models/Auditoria.js`

```js
await Auditoria.registrar({
  tabla:            'nombre_tabla',    // requerido
  registro_id:      record.id,         // requerido
  accion:           'crear' | 'actualizar' | 'eliminar' | 'login' | 'logout',
  usuario_id:       req.user.id,
  usuario_nombre:   req.user.nombre_completo,
  datos_anteriores: valorAntes || null,
  datos_nuevos:     valorDespues || null,
  ip_address:       req.ip,
  user_agent:       req.get('User-Agent'),
  descripcion:      'Descripción opcional',
});
```

`registrar()` retorna el registro creado o `null` si hay error — **no interrumpe la operación principal** aunque la auditoría falle.

---

### 3.7 Migraciones y seeds

#### Migraciones (Umzug)

Corren **automáticamente** en cada startup dentro de `initializeDatabase()` en `server.js`. Archivos en `server/src/migrations/` — naming: `YYYYMMDDHHMMSS-descripcion-kebab.js`.

**Nunca usar** `sync({ alter: true })` en producción.

```bash
npm run migration:create -- <nombre>   # Crear migración
npm run migration:status               # Ver pendientes
npm run migration:up                   # Aplicar pendientes
npm run migration:undo                 # Revertir última
```

**Estructura de un archivo de migración:**

```js
// server/src/migrations/20260421000000-crear-mi-tabla.js
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('mi_tabla', {
      id:         { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      campo:      { type: Sequelize.STRING(100), allowNull: false },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false },
    });
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable('mi_tabla');
  },
};
```

**Diagnóstico si Umzug no aplica una migración:** Verificar `SELECT name FROM SequelizeMeta ORDER BY name`. Si el archivo no aparece pero Umzug dice "sin pendientes", aplicar manualmente con `sequelize.query('ALTER TABLE ...')` + `INSERT INTO SequelizeMeta (name) VALUES (?)`.

#### Seeds

Tres seeds idempotentes corren en cada startup:
1. `seedRolesPermisos.js` — 6 roles + catálogo de permisos
2. `seedPlantillasEmail.js` — Plantillas de email por defecto
3. `seedConfiguracionWms.js` — Configuración base WMS

**Los seeds NO afectan usuarios `rol='cliente'`** — usan `permisos_cliente` JSON independiente.

#### Modelos Sequelize

```js
// Convención en todos los modelos
{ underscored: true }
// → columna 'created_at' = propiedad JS 'createdAt'
```

---

### 3.8 Sistema de permisos

#### Jerarquía de roles (valores del código fuente)

```
admin       (100)  — Acceso total
supervisor  ( 75)  — Gestión operativa completa
financiera  ( 70)  — Finanzas + cajas menores
operador    ( 50)  — Operaciones de bodega
conductor   ( 30)  — Viajes y gastos
cliente     ( 10)  — Portal cliente (sistema SEPARADO)
```

> **Nota:** El nivel de `financiera` en el código (`seedRolesPermisos.js`) es `70`, no `60` como figura en algunos documentos. El valor del código prevalece.

#### Catálogo completo de módulos y acciones

| Módulo | Acciones disponibles |
|---|---|
| `dashboard` | ver, exportar |
| `clientes` | ver, crear, editar, eliminar, exportar, importar |
| `inventario` | ver, crear, editar, eliminar, ajustar, exportar, alertas |
| `operaciones` | ver, exportar, reenviar_correo |
| `auditoria` | ver |
| `reportes` | ver, crear, exportar |
| `plantillas_email` | ver, crear, editar, eliminar |
| `usuarios` | ver, crear, editar, eliminar |
| `roles` | ver, crear, editar, eliminar |
| `configuracion` | ver, editar |
| `configuracion_wms` | ver, crear, editar, eliminar |
| `notificaciones` | ver, crear, editar, eliminar, enviar |
| `vehiculos` | ver, crear, editar, eliminar |
| `viajes` | ver, crear, editar, eliminar, exportar |
| `caja_menor` | ver, crear, editar, cerrar, aprobar, eliminar, exportar |
| `movimientos` | ver, crear, editar, eliminar, aprobar |
| `solicitudes` | ver, crear, comentar, exportar |
| `contactos` | ver, crear, editar, eliminar |
| `perfil` | ver, cambiar_password |

#### Matriz de permisos por rol

**Supervisor:**
```js
{
  dashboard:        ['ver', 'exportar'],
  clientes:         ['ver'],
  inventario:       ['ver', 'crear', 'editar', 'ajustar', 'exportar', 'alertas'],
  operaciones:      ['ver', 'exportar', 'reenviar_correo'],
  auditoria:        ['ver'],
  reportes:         ['ver', 'crear', 'exportar'],
  plantillas_email: ['ver'],
  usuarios:         ['ver'],
  configuracion:    ['ver', 'editar'],
  configuracion_wms:['ver'],
  notificaciones:   ['ver', 'enviar'],
  vehiculos:        ['ver', 'crear', 'editar', 'eliminar'],
  viajes:           ['ver', 'crear', 'editar', 'eliminar', 'exportar'],
  caja_menor:       ['ver', 'crear', 'editar', 'cerrar', 'aprobar', 'eliminar', 'exportar'],
  movimientos:      ['ver', 'crear', 'editar', 'eliminar', 'aprobar'],
  solicitudes:      ['ver', 'comentar', 'exportar'],
  contactos:        ['ver', 'crear', 'editar', 'eliminar'],
  perfil:           ['ver', 'cambiar_password'],
}
```

**Financiera:**
```js
{
  dashboard:     ['ver'],
  clientes:      ['ver'],
  reportes:      ['ver', 'crear', 'exportar'],
  configuracion: ['ver', 'editar'],
  notificaciones:['ver'],
  vehiculos:     ['ver', 'crear', 'editar'],
  viajes:        ['ver', 'exportar'],
  caja_menor:    ['ver', 'crear', 'editar', 'cerrar', 'aprobar', 'exportar'],
  movimientos:   ['ver', 'crear', 'editar', 'aprobar'],
  perfil:        ['ver', 'cambiar_password'],
}
```

**Operador:**
```js
{
  dashboard:     ['ver'],
  clientes:      ['ver'],
  inventario:    ['ver', 'alertas'],
  operaciones:   ['ver', 'exportar', 'reenviar_correo'],
  auditoria:     ['ver'],
  reportes:      ['ver', 'exportar'],
  configuracion: ['ver', 'editar'],
  notificaciones:['ver'],
  caja_menor:    ['ver'],
  movimientos:   ['ver', 'crear', 'editar'],
  solicitudes:   ['ver', 'comentar'],
  perfil:        ['ver', 'cambiar_password'],
}
```

**Conductor:**
```js
{
  dashboard:     ['ver'],
  configuracion: ['ver', 'editar'],
  notificaciones:['ver'],
  vehiculos:     ['ver'],
  viajes:        ['ver', 'crear', 'editar'],
  caja_menor:    ['ver'],
  movimientos:   ['ver', 'crear', 'editar'],
  perfil:        ['ver', 'cambiar_password'],
}
```

**Cliente (portal — sistema SEPARADO):**

Los clientes usan `permisos_cliente` JSON propio en la tabla `usuarios`, **no** la tabla `rol_permisos`. Sus permisos se gestionan individualmente. Módulos forzados en `Usuario.getPermisos()`: `clientes/operaciones/configuracion/perfil/notificaciones`.

```js
// Defaults en Usuario.getPermisos()
{
  inventario:  { ver: true,  exportar: false,              alertas: true },
  despachos:   { ver: true,  crear_solicitud: false,        descargar_documentos: true },
  reportes:    { ver: true,  descargar: false },
  facturacion: { ver: true,  descargar: true },
  perfil:      { ver: true,  editar: true,                  cambiar_password: true },
  solicitudes: { ver: true,  crear: true,                   comentar: true },
}
```

#### Uso en rutas backend

```js
// Permiso granular (preferido)
router.get('/',    verificarToken, requierePermiso('inventario', 'ver'),       ctrl.listar);
router.post('/',   verificarToken, requierePermiso('inventario', 'crear'),     ctrl.crear);

// Nivel jerárquico mínimo
router.delete('/:id', verificarToken, requiereRolMinimo('supervisor'),          ctrl.anular);

// Solo admin
router.patch('/:id/config', verificarToken, soloAdmin,                          ctrl.configurar);

// Solo usuarios internos (no cliente)
router.get('/todos', verificarToken, soloUsuariosInternos,                      ctrl.listarTodos);
```

#### Uso en rutas frontend

```jsx
// Ruta protegida por permiso — redirige a /dashboard si no tiene acceso
<PermissionRoute modulo="inventario" accion="ver">
  <InventarioPage />
</PermissionRoute>

// Solo admin
<AdminRoute>
  <AdminPage />
</AdminRoute>

// Mostrar/ocultar elemento
<ProtectedAction module="clientes" action="crear">
  <Button>Nuevo Cliente</Button>
</ProtectedAction>

// En código — lógica condicional
const { hasPermission } = useAuth();
const canDownload = hasPermission('reportes', 'exportar') || hasPermission('reportes', 'descargar');
```

---

### 3.9 Inicialización del servidor (`server/server.js`)

**Validaciones críticas al startup (falla rápido):**
```js
if (!JWT_SECRET || JWT_SECRET.length < 32)            → error fatal
if (isProduccion && JWT_SECRET.includes('cambiar'))   → error fatal
if (!DB_NAME || !DB_USER || !DB_HOST)                 → error fatal
if (isProduccion && !CORS_ORIGIN)                     → error fatal
```

**Orden de inicialización async:**
1. Conectar BD con retry automático (max 10 intentos, backoff exponencial desde 3s)
2. Correr migraciones (Umzug)
3. Correr seeds idempotentes
4. Crear usuarios por defecto (admin, supervisor, operador)
5. Iniciar jobs en background (reportes programados, polling WMS, email de cierre)

**`registerErrorHandlers()` DESPUÉS de todas las rutas.** Health check ANTES de error handlers.

---

## 4. ARQUITECTURA Y CONVENCIONES DE FRONTEND

### 4.1 Estructura de carpetas y aliases

```
frontend/src/
├── api/              # Servicios HTTP  →  @api
│   ├── client.js     # Instancia axios + interceptores
│   └── *.service.js  # Un archivo por dominio
├── assets/           # Imágenes, iconos estáticos  →  @assets
├── components/       # Componentes reutilizables  →  @components
│   ├── auth/         # PrivateRoute, PermissionRoute, AdminRoute
│   ├── common/       # Biblioteca de UI (KpiCard, Modal, DataTable, etc.)
│   └── layout/       # FloatingHeader, Sidebar, ProtectedLayout
├── context/          # Providers React  →  @context
│   ├── AuthContext.jsx
│   ├── SocketContext.jsx
│   ├── NotificacionesContext.jsx
│   └── ThemeContext.jsx (AppThemeProvider)
├── hooks/            # Custom hooks  →  @hooks
│   ├── useNotification.js
│   ├── useTutorial.js
│   └── useIdleTimer.js   (montado en ProtectedLayout)
├── pages/            # Páginas por módulo  →  @pages
├── styles/           # CSS global  →  @styles
├── utils/            # Utilidades puras  →  @utils
│   ├── chartColors.js
│   ├── formatDate.js
│   └── tutorialConfig.js
└── main.jsx
```

**Aliases Vite** (fuente: `frontend/vite.config.js`):
```js
'@':           './src',
'@components': './src/components',
'@pages':      './src/pages',
'@hooks':      './src/hooks',
'@context':    './src/context',
'@api':        './src/api',
'@utils':      './src/utils',
'@styles':     './src/styles',
'@assets':     './src/assets',
```

**Dev proxy:**
```js
'/api'       → 'http://localhost:5000'
'/socket.io' → 'http://localhost:5000'  (WebSocket)
```

**Code splitting manual (chunks en `vite.config.js`):**
`vendor` (React/Router/MUI), `icons` (lucide-react), `charts` (recharts/d3), `realtime` (socket.io-client), `tutorial` (driver.js), `forms` (react-hook-form/yup), `dates` (date-fns/react-day-picker), `notifications` (notistack).

---

### 4.2 Orden de providers en `main.jsx`

```jsx
<React.StrictMode>
  <Analytics />        {/* Vercel Analytics */}
  <SpeedInsights />    {/* Vercel Speed Insights */}
  <AuthProvider>
    <SocketProvider>
      <AppThemeProvider>
        <NotificacionesProvider>
          <App />
        </NotificacionesProvider>
      </AppThemeProvider>
    </SocketProvider>
  </AuthProvider>
</React.StrictMode>
```

**Orden crítico:** `AuthProvider` antes de `SocketProvider` (Socket necesita el token del AuthContext). `AppThemeProvider` envuelve `NotificacionesProvider`.

---

### 4.3 Cliente HTTP (`frontend/src/api/client.js`)

```js
// Exportaciones
import { apiClient, setAuthToken, clearAuthToken, getAuthToken,
         isAuthenticated, createUploadClient, getServerFileUrl } from '@api/client';

// Config base
API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1'
TOKEN_KEY = 'istho_token'
REFRESH_TOKEN_KEY = 'istho_refresh_token'
timeout = 30000
```

**Comportamiento de interceptores:**
- **Request:** Agrega `Authorization: Bearer {token}` automáticamente
- **Response 2xx:** Devuelve `response.data` directamente — **no hacer `.data.data`**
- **Response 401:** Intenta refresh; si falla, limpia tokens y redirige a `/login`
- **Response 403 cuenta desactivada:** Limpia sesión + sessionStorage con mensaje + redirige
- **Response 403 sin permiso:** Emite evento `istho:permission-denied` para toast
- **GETs duplicados simultáneos:** Deduplicados — una sola promesa compartida
- **POST/PUT/PATCH/DELETE duplicados:** Segundo rechazado con `code: 'DUPLICATE_REQUEST'`

**Para uploads (multipart/form-data):**
```js
const uploadClient = createUploadClient();  // timeout: 60s
// El interceptor de uploadClient también extrae response.data — no hacer .data.data
```

---

### 4.4 Notificaciones (`useNotification`)

**Archivo:** `frontend/src/hooks/useNotification.js`
**Import:** `import useNotification from '@hooks/useNotification'` (default export)

```js
const { success, error, warning, info, notify,
        loading, loadingComplete, apiError,
        saved, deleted, sessionExpired, permissionDenied,
        documentUploaded, emailSent } = useNotification();

// Métodos base
success(message, options)
error(message, options)
warning(message, options)
info(message, options)
notify(message, options)
loading(message)                       // retorna key
loadingComplete(key, isSuccess, msg)   // actualiza el loading toast

// Especializados
saved(entity)           // "Guardado correctamente"
deleted(entity)         // "Eliminado"
apiError(err)           // extrae el mensaje de error del response de axios
documentUploaded(name)  // "Documento subido"
emailSent(to)           // "Email enviado a..."
sessionExpired()        // "Tu sesión ha expirado"
permissionDenied()      // "Sin permisos para esta acción"
```

**Notas:**
- Default export — `import useNotification from ...` (no es named export)
- Métodos: `success`, `error`, `warning`, `info` — **NO** `showSuccess`, `showError`
- Construido sobre notistack

---

### 4.5 Formatos de fecha

**Archivo:** `frontend/src/utils/formatDate.js`

```js
import { formatDate, formatDateShort, setPreferencias } from '@utils/formatDate';

// Configurar desde AuthContext al hacer login
setPreferencias({ zona_horaria: 'America/Bogota', formato_fecha: 'DD/MM/YYYY' });

formatDate(fechaStr)       // largo: "18 mar. 2026"
formatDateShort(fechaStr)  // corto: "18/03/2026" (según preferencia)
```

**Regla crítica — MySQL DECIMAL llega como string:**
```js
// ❌ Incorrecto — renderiza "100.000" como string
<span>{cantidad}</span>

// ✅ Correcto
<span>{Number(cantidad).toLocaleString('es-CO', { maximumFractionDigits: 2 })}</span>
```

**Aplica a:** `cantidad_esperada`, `cantidad`, precios, y cualquier campo `DECIMAL` de la BD.

---

### 4.6 Patrón estándar de página de reporte/listado

```jsx
import { useState, useCallback, useEffect }       from 'react';
import { useSearchParams }                         from 'react-router-dom';
import { useAuth }                                 from '@context/AuthContext';
import { AccionesDropdown, KpiCard, DataTable }   from '@components/common';
import { EnviarReporteModal }                      from '@components/common';
import useNotification                             from '@hooks/useNotification';
import { getAuthToken }                            from '@api/client';

export default function MiReporte() {
  // 1. URL persistence — TODOS los filtros en searchParams
  const [searchParams, setSearchParams] = useSearchParams();
  const [filtros, setFiltros] = useState({
    fecha_desde: searchParams.get('fecha_desde') || '',
    fecha_hasta: searchParams.get('fecha_hasta') || '',
  });

  // 2. Estado de datos
  const [stats, setStats]       = useState(null);
  const [items, setItems]       = useState([]);
  const [loading, setLoading]   = useState(false);
  const [firstLoad, setFirstLoad] = useState(true);
  const [emailModal, setEmailModal] = useState(false);

  const { hasPermission } = useAuth();
  const { error: notifyError } = useNotification();
  const canDownload = hasPermission('reportes', 'exportar') || hasPermission('reportes', 'descargar');

  // 3. fetchData con useCallback
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [statsRes, itemsRes] = await Promise.all([
        miService.getStats(filtros),
        miService.getItems(filtros),
      ]);
      setStats(statsRes.data);
      setItems(itemsRes.data);
    } catch (err) {
      notifyError('Error al cargar datos');
    } finally {
      setLoading(false);
      setFirstLoad(false);
    }
  }, [filtros]);

  // 4. Effect
  useEffect(() => { fetchData(); }, [fetchData]);

  // 5. Export seguro (token en header, nunca en URL)
  const handleExport = async (formato) => {
    const params = new URLSearchParams(filtros).toString();
    const token = getAuthToken();
    const res = await fetch(`${import.meta.env.VITE_API_URL}/reportes/mi-reporte/${formato}?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `reporte.${formato}`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display text-2xl font-bold dark:text-white">Mi Reporte</h1>
        <AccionesDropdown acciones={[
          { label: 'Actualizar', icon: RefreshCw,      onClick: fetchData },
          { label: 'Enviar',     icon: Mail,            onClick: () => setEmailModal(true), hidden: !canDownload },
          { label: 'Excel',      icon: FileSpreadsheet, onClick: () => handleExport('excel'), hidden: !canDownload },
          { label: 'PDF',        icon: Download,        onClick: () => handleExport('pdf'), hidden: !canDownload, variant: 'primary' },
        ]} />
      </div>

      {/* KPIs — firstLoad skeleton */}
      {firstLoad ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 animate-pulse mb-6">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 bg-gray-200 dark:bg-centhrix-surface rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <KpiCard title="Total" value={stats?.total} icon={BarChart3} />
        </div>
      )}

      {/* Tabla con loading overlay (no skeleton) en recargas */}
      <div className="relative">
        {loading && !firstLoad && (
          <div className="absolute inset-0 bg-white/50 dark:bg-centhrix-card/50 z-10 rounded-xl flex items-center justify-center">
            <Loader2 className="animate-spin text-centhrix-accent" size={32} />
          </div>
        )}
        <DataTable columns={columns} data={items} loading={firstLoad} />
      </div>

      {/* Modal email al final del JSX */}
      <EnviarReporteModal
        isOpen={emailModal}
        onClose={() => setEmailModal(false)}
        endpoint="/reportes/mi-reporte/pdf"
        filtros={filtros}
      />
    </div>
  );
}
```

---

### 4.7 Descargas seguras

```js
// ✅ CORRECTO — Bearer token en header
const token = getAuthToken();
const response = await fetch(`${API_BASE_URL}/reportes/endpoint?${params}`, {
  headers: { Authorization: `Bearer ${token}` },
});

// ❌ INCORRECTO — JWT en URL queda en logs de servidor, historial y Referer
fetch(`/api/reporte?token=${jwt}`)
```

---

### 4.8 `onClick` con parámetros

```jsx
// ✅ Correcto — envuelve en arrow function
onClick={() => handleEdit(item.id)}

// ❌ Incorrecto — SyntheticEvent pasa como primer argumento a handleEdit
onClick={handleEdit(item.id)}
```

---

### 4.9 Respuesta paginada

```js
// Endpoints paginados retornan { data: { rows: [...], count: N } }
// El campo es .rows — NO .items
const { rows, count } = response.data;
```

---

## 5. INFRAESTRUCTURA DE REFERENCIA

### 5.1 Stack de despliegue

| Servicio | Producto | Región | Notas |
|---|---|---|---|
| Backend API | AWS App Runner | us-west-2 | NO configurar `PORT` — lo inyecta App Runner (8080) |
| Frontend | Vercel | Auto | Root dir: `frontend` (no `./frontend`) |
| Base de datos | AWS RDS MySQL 8.0 | us-west-2 | `db.t3.micro`, sin acceso público, VPC connector |
| Archivos | AWS S3 | us-west-2 | Bucket: `istho-crm-files` (COD usará su propio bucket) |
| WebSocket multi-inst | Upstash Redis | Auto | Opcional — `REDIS_URL` activa modo multi-instancia |
| Email transaccional | Outlook 365 SMTP | — | `smtp.office365.com:587`, TLS |
| Email backup | Resend | — | Solo fallback cuando SMTP falla |

**Seeds se ejecutan en cada deploy automáticamente** — no requieren paso manual.

---

### 5.2 Variables de entorno críticas para replicar en COD

**Backend:**

```bash
# Auth — OBLIGATORIO (falla en startup si < 32 chars o == 'cambiar')
JWT_SECRET=<mínimo_32_caracteres_aleatorios>
JWT_EXPIRES_IN=24h
JWT_REFRESH_EXPIRES_IN=7d

# BD MySQL
DB_HOST=<rds-endpoint>
DB_PORT=3306
DB_NAME=<nombre_bd>
DB_USER=<usuario>
DB_PASSWORD=<password>
DB_POOL_MAX=5           # calibrado para RDS t3.micro

# CORS — OBLIGATORIO en prod (URL exacta de Vercel, sin / final)
CORS_ORIGIN=https://mi-cod-app.vercel.app

# S3 (IAM Instance Role en prod — no poner claves en env)
AWS_S3_BUCKET=<bucket-propio-de-cod>
AWS_REGION=us-west-2

# Email
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=<cuenta@dominio.com>
EMAIL_FROM=COD <cuenta@dominio.com>

NODE_ENV=production
# PORT — NO configurar en App Runner, lo inyecta automáticamente

# Redis (opcional — activa Socket.IO multi-instancia)
REDIS_URL=rediss://<password>@<host>.upstash.io:6379

# Rate limiting
RATE_LIMIT_WINDOW=15
RATE_LIMIT_MAX=500

# Passwords seed (cambiar antes de primer deploy)
SEED_PASSWORD_ADMIN=<password_seguro>
```

**Frontend:**

```bash
VITE_API_URL=https://<app-runner-url-de-cod>/api/v1
VITE_APP_NAME=COD                    # Nombre del nuevo proyecto
VITE_APP_VERSION=1.0.0
VITE_MAX_FILE_SIZE=10485760          # 10 MB
VITE_ALLOWED_FILE_TYPES=.pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png
VITE_ENABLE_DARK_MODE=true
```

---

### 5.3 Start command App Runner

```bash
# ✅ CORRECTO — desde la raíz del repo
node server/server.js

# ❌ INCORRECTO — App Runner ejecuta sin shell, no soporta cd + &&
cd server && node server.js
```

---

### 5.4 Estructura de carpetas S3 recomendada para COD

Replicar el patrón semántico del CRM (COD usará su propio bucket):

```
<bucket-de-cod>/
├── avatares/
├── documentos/{id}/
├── branding/           # logo-email.png (URL pública)
└── <otras-carpetas-según-dominio-de-cod>/
```

- Acceso via presigned URLs (TTL 15 min) — no URLs directas públicas (excepto branding)
- En producción: IAM Instance Role, **no claves en variables de entorno**

---

### 5.5 Health check (replicar en COD)

```js
// server.js — ANTES de error handlers
app.get('/health', async (req, res) => {
  let dbStatus = 'connecting';
  try { await sequelize.authenticate(); dbStatus = 'connected'; }
  catch { dbStatus = 'error'; }
  res.json({
    success: true,
    environment: process.env.NODE_ENV,
    timestamp: new Date().toISOString(),
    database: dbStatus,
  });
});
```

---

### 5.6 Pool de conexiones BD (calibrado para RDS t3.micro)

```js
pool: {
  max:     parseInt(process.env.DB_POOL_MAX) || 5,
  min:     0,
  acquire: 30000,  // 30s
  idle:    10000,  // 10s
  evict:   5000,   // 5s
}
timezone: '-05:00'  // Colombia
```

Retry automático en `database.js`: 3 intentos, detecta `ECONNREFUSED`, `ETIMEDOUT`, `PROTOCOL_CONNECTION_LOST`.

---

## 6. QUÉ NO REPLICAR EN COD

### 6.1 Módulos de dominio logístico (no copiar)

Estos módulos son exclusivos del negocio de ISTHO y no tienen sentido fuera del contexto de bodega/transporte:

| Módulo | Modelos / Archivos clave | Por qué no replicar |
|---|---|---|
| **Integración WMS** | `Operacion`, `OperacionDetalle`, `CajaInventario`, `wmsSyncService.js`, `wmsPollingJob.js`, `ConfiguracionWms`, `wmsDatabase.js` | Integración propietaria con WMS CenthriX (API privada, schema PostgreSQL separado, lógica de pallets/kardex) |
| **Viajes y transporte** | `Viaje`, `Vehiculo`, routes de viajes | Lógica de transporte de carga (placas, conductores, rutas de entrega) |
| **Cajas Menores** | `CajaMenor`, `MovimientoCajaMenor` | Fondos de caja para gastos de campo de conductores |
| **Clientes CRM** | `Cliente`, `Contacto`, routes de clientes | Modelo B2B logístico con NIT, contratos, documentos, segmentación |
| **Solicitudes de portal** | `Solicitud`, `SolicitudDetalle`, `SolicitudComentario`, `ClienteResponsable` | Sistema de avisos de ingreso/despacho para clientes de bodega (dominio WMS) |
| **Operaciones kardex** | `AuditoriaWmsController` con 6 mapeos explícitos | Lógica específica de movimientos de inventario por pallet |

### 6.2 Integraciones propietarias (no reutilizables)

- **WMS CenthriX API:** Endpoints `/wms/sync/*`, `/wms/inventario/*`, credenciales privadas de ISTHO
- **Power BI connector:** `powerbiAuth.js`, tabla `api_keys`, endpoints `/powerbi/*` — licenciados a ISTHO
- **Tutorial interactivo (driver.js):** `tutorialConfig.js` y `useTutorial.js` tienen IDs y rutas hardcodeadas del CRM — se puede copiar la estructura pero hay que reescribir el contenido

### 6.3 Seeds con contenido de dominio (reemplazar completamente)

| Seed | Qué reemplazar |
|---|---|
| `seedRolesPermisos.js` | Copiar la **estructura** (6 roles, catálogo de permisos + seeds idempotentes) pero **cambiar los módulos** para el dominio de COD |
| `seedPlantillasEmail.js` | Las plantillas tienen copy de ISTHO S.A.S. — reemplazar nombres, logos, redacción |
| `seedConfiguracionWms.js` | Específico de WMS — no aplica a COD |

### 6.4 Identificadores de marca (renombrar)

Renombrar al iniciar COD:
- `TOKEN_KEY = 'istho_token'` → elegir nombre para COD
- `REFRESH_TOKEN_KEY = 'istho_refresh_token'` → renombrar
- `VITE_APP_NAME = 'ISTHO CRM'` → nombre de COD
- `localStorage` keys de tour (`centhrix_tour_*`) → prefijo de COD
- Bucket S3 `istho-crm-files` → bucket propio
- Carpeta de logos y branding → nuevo logo para email

---

### 6.5 Qué SÍ replicar (patrones estructurales)

| Patrón | Estado para COD |
|---|---|
| Sistema RBAC con 6 niveles jerárquicos | ✅ Copiar estructura — cambiar módulos del catálogo |
| Cache de permisos TTL 60s (`auth.js`) | ✅ Copiar sin cambios |
| Umzug para migraciones automáticas en startup | ✅ Copiar configuración |
| Seeds idempotentes en startup | ✅ Mismo patrón — reescribir contenido |
| `Auditoria.registrar()` en todo write | ✅ Obligatorio — copiar modelo |
| Helpers `success/error/paginated` (`responses.js`) | ✅ Copiar sin cambios |
| Helpers `parsePaginacion/buildPaginacion` | ✅ Copiar sin cambios |
| Interceptor axios con deduplicación y refresh token | ✅ Copiar `client.js` — cambiar `TOKEN_KEY` |
| Patrón de página de reporte (firstLoad skeleton + overlay + AccionesDropdown) | ✅ Mismo patrón |
| `useNotification` con `success/error/warning/info/apiError` | ✅ Copiar — renombrar especializados de dominio |
| Tokens de color y tipografía CENTHRIX | ✅ Mismos hex, mismas clases, mismas reglas dark |
| Carpeta `components/common/` completa | ✅ Copiar: KpiCard, Modal, DataTable, FilterDropdown, DatePicker, Button, Input, EmptyState, StatusChip |
| Seguridad: descargas con Bearer en header, excluir `password_hash` de respuestas, sanitizar HTML con DOMPurify | ✅ Obligatorio |
| `onClick={() => fn(arg)}` para handlers con parámetros | ✅ Convención |
| Imports case-sensitive (Linux prod ≠ Windows dev) | ✅ Siempre casing exacto |

---

*Generado el 2026-07-02 a partir del análisis directo del código fuente de `istho-crm-p`. Revisar ante cualquier refactor de los archivos referenciados.*
