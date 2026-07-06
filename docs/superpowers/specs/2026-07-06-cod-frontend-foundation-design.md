# COD Frontend Foundation — Diseño

**Fecha:** 2026-07-06
**Estado:** Aprobado por el usuario, pendiente de plan de implementación.
**Alcance de este documento:** scaffold de `frontend/` (Vite + React + MUI + Tailwind), autenticación, layout base (FloatingHeader + Sidebar colapsable), Dashboard Inicio (KPIs de muestra) y la página real de Áreas. Incluye 2 adiciones pequeñas al backend necesarias para que la autenticación y la navegación por permisos funcionen de extremo a extremo. Los demás 6 módulos de negocio quedan como placeholder.

**Relacionado:** `docs/superpowers/specs/2026-07-02-cod-modelo-datos-estructura-design.md` (diseño original, define los 10 módulos y el modelo de datos completo). `DESIGN_SYSTEM_CENTHRIX.md` (tokens y convenciones visuales — fuente de verdad).

## Contexto

El backend de COD (`server/`) está completo y fusionado en `main`: RBAC + JWT, Auditoría, y el modelo de dominio completo (Área, Carpeta, TipoDocumento, Documento, PlantillaFormulario, TipoSolicitud/NivelAprobación, Solicitud/Cotización/SolicitudAprobación, Proveedor y su expediente). Hoy solo **Área** tiene controllers/rutas HTTP reales (`GET/POST /api/v1/areas`, `GET /api/v1/areas/:id`) — el resto de módulos existen como modelos/migraciones pero sin endpoints, tal como quedó explícitamente diferido en el plan de backend.

Se encontró en la máquina el repo real del CRM CenthriX (`istho-crm-p/frontend`), que el spec original cita como fuente para copiar componentes comunes. Se usó como referencia directa para las decisiones de este documento (estructura, componentes, patrones de auth/permisos).

## Decisiones de diseño (confirmadas con el usuario)

| Decisión | Elegida | Alternativas descartadas |
|---|---|---|
| Navegación principal | Híbrido: `FloatingHeader` (perfil, tema, colapsar sidebar) + `Sidebar` colapsable con los módulos | Solo FloatingHeader con mega-menú (como el CRM hoy); Sidebar fijo sin header |
| Stack de UI | MUI + Tailwind (igual al CRM real) | Solo Tailwind (como decía el spec original literalmente) |
| Estrategia de código reutilizado | Híbrido: copiar tal cual los componentes visuales puros del CRM (`Button`, `Input`, `Modal`, `Card`, `StatusChip`, `EmptyState`, `Table`); reescribir más simple auth/layout (`client.js`, `AuthContext`, `FloatingHeader`, `Sidebar`, `PrivateRoute`/`PermissionRoute`/`AdminRoute`) sin 2FA/dispositivos de confianza/notificaciones que no existen en COD | Copiar todo tal cual del CRM; reescribir todo desde cero |
| Dashboard Inicio | Los 3 KPIs (aprobaciones pendientes, alertas de vigencia, % documentos al día) con **datos de muestra**, etiquetados como tales | Mezclar KPIs reales (Áreas) con placeholders de texto para el resto |
| Página de Áreas | Se construye ya, real, en este plan (API ya existe y está probada) | Dejarla como placeholder igual que el resto, para un plan siguiente |
| Rutas de los 7 módulos restantes | Todas existen y navegan a un placeholder compartido "Módulo en construcción", filtradas por permisos | Solo Inicio/Áreas en el nav; el resto ausente hasta tener páginas reales |
| Sesión / refresh token | Se agrega `POST /api/v1/auth/refresh` al backend ahora (rotación de ambos tokens) | Frontend sin refresh automático; re-login forzado cada 24h |
| Permisos en el nav | Se agrega un mapa `permisos` a la respuesta de `/auth/me` y `/auth/login`, construido desde `RolPermiso` | Mostrar los 10 módulos a cualquier usuario autenticado sin filtrar |
| Cambio de contraseña obligatorio (`requiereCambioPassword`) | Fuera de alcance de este plan | Exponer el flag + endpoint de cambio + modal en Login |
| Vista de listados | Toggle lista/tarjetas, persistido en `localStorage` por módulo. **Default: lista.** En viewport móvil (`< md`, 768px) se **fuerza tarjetas**, ignorando (sin borrar) la preferencia guardada | Tarjetas como default general; sin toggle (una sola vista fija) |
| Líder de Área en la UI | Se omite (nombre y formulario de creación) — no existe endpoint para resolver `liderUsuarioId` a un nombre de usuario | Agregar un endpoint de usuarios para resolverlo en este mismo plan |

## 1. Adiciones al backend (mínimas, necesarias para el frontend)

### `POST /api/v1/auth/refresh`
- Body: `{ refreshToken }`.
- Verifica el JWT, exige `payload.type === 'refresh'`, carga el `Usuario` (+ `Rol`) y confirma que siga `activo`.
- Reemite **ambos** tokens vía la `firmarTokens()` ya existente (rotación, igual que hace el CRM).
- Responde `{ success, data: { token, refreshToken } }` en el shape estándar de `responses.js`; `401` si el token es inválido, expiró, o el usuario ya no existe/está inactivo.
- Sin `verificarToken` como middleware (el refresh token *es* la credencial de esta ruta) — pero sí con un rate limiter propio, mismo patrón que `loginLimiter`.

### `GET /api/v1/auth/me` y `POST /api/v1/auth/login` incluyen `permisos`
- Se construye desde `RolPermiso` (la misma tabla que ya usa `requierePermiso()` — se reutiliza `cargarCachePermisos()`, no se duplica la consulta).
- Shape: `permisos: { areas: ['ver'], documentos: [...], ... }` — igual al formato que ya usa el catálogo de módulos del backend.
- No cambia el shape de ningún campo existente en la respuesta, solo agrega esta clave.

## 2. Estructura de carpetas del frontend

```
frontend/
├── src/
│   ├── api/
│   │   ├── client.js            # axios + interceptores (token, refresh-on-401)
│   │   ├── auth.service.js
│   │   └── area.service.js
│   ├── assets/
│   ├── components/
│   │   ├── auth/                # PrivateRoute, PermissionRoute, AdminRoute
│   │   ├── common/               # copiados del CRM: Button, Input, Modal, Card,
│   │   │                         # StatusChip, EmptyState, Table
│   │   │   └── ViewToggle.jsx    # nuevo — toggle lista/tarjetas
│   │   └── layout/               # FloatingHeader, Sidebar, ProtectedLayout
│   ├── context/                  # AuthContext, ThemeContext
│   ├── hooks/                    # usePermissions, useViewMode
│   ├── pages/
│   │   ├── auth/Login.jsx
│   │   ├── inicio/Dashboard.jsx
│   │   ├── areas/AreasListado.jsx
│   │   └── proximamente/ProximamentePage.jsx  # compartido por los 7 módulos restantes
│   ├── styles/
│   ├── utils/                    # formatDate.js
│   └── main.jsx
├── tailwind.config.js            # tokens centhrix-*, darkMode: 'class'
└── vite.config.js
```

**Renombres de marca** (ya fijados en el spec original, se aplican tal cual): `TOKEN_KEY` → `cod_token`, `REFRESH_TOKEN_KEY` → `cod_refresh_token`, `VITE_APP_NAME` → `COD`.

## 3. Autenticación

- **`client.js`**: instancia axios (`baseURL` desde `VITE_API_URL`), interceptor de request inyecta `Authorization: Bearer {cod_token}`. Interceptor de response: ante `401`, intenta `POST /auth/refresh` **una sola vez** con `cod_refresh_token` y reintenta la petición original; si el refresh también falla, limpia ambos tokens y redirige a `/login`.
- **`AuthContext`**: al montar la app, si hay `cod_token` guardado, llama a `GET /auth/me` para hidratar `{ user, permisos }`. Expone `login(username, password)`, `logout()` (solo cliente — no existe `/auth/logout`), `tienePermiso(modulo, accion)`, `isAdmin`, `isLoading`.
- **`PrivateRoute`**: redirige a `/login` si no autenticado (guarda `location` para volver tras login).
- **`PermissionRoute({ module, action })`**: admin siempre pasa; para los demás roles verifica `tienePermiso(module, action)` contra el `permisos` del contexto; si no, redirige a `/inicio`.
- **`AdminRoute`**: atajo de `PermissionRoute` para rutas exclusivas de admin.

## 4. Layout

- **`FloatingHeader`** (nuevo, mucho más chico que el del CRM): título del módulo activo, botón de colapsar `Sidebar`, menú de usuario (nombre, rol, toggle de tema oscuro, cerrar sesión). Sin búsqueda global ni notificaciones — no hay backend para ninguna de las dos todavía.
- **`Sidebar`** colapsable: un ítem por módulo con permiso `'ver'` en el `permisos` del usuario (Inicio, Áreas, Documentos, Solicitudes, Proveedores, Formularios, Reportes, Administración), resaltando la ruta activa. Colapsa a solo-íconos.
- **`ProtectedLayout`**: envuelve `FloatingHeader` + `Sidebar` + `<Outlet />`, aplicado a todas las rutas autenticadas.
- **`ThemeContext`**: modo oscuro vía `darkMode: 'class'` de Tailwind, reutilizando los tokens `centhrix-*` ya definidos.

## 5. Vistas lista/tarjetas (patrón reutilizable)

- **`useViewMode(storageKey)`**: persiste `'lista' | 'tarjetas'` en `localStorage` por módulo (clave distinta por página, ej. `cod_view_areas`). **Default: `'lista'`.** Detecta viewport `< 768px` (breakpoint `md`) y en ese caso el modo efectivo es siempre `'tarjetas'`, sin sobreescribir la preferencia guardada (al volver a desktop, se respeta lo guardado).
- **`ViewToggle`**: dos botones de ícono (lista/grid, `lucide-react`); oculto cuando el viewport está en modo móvil forzado.

## 6. Páginas

### Login (`pages/auth/Login.jsx`)
Tarjeta centrada, `react-hook-form` con `username`/`password`. Sin "olvidé mi contraseña" ni registro (no existen esos endpoints). Al autenticar exitosamente, redirige a `/inicio` o a la ruta original si `PrivateRoute` lo interceptó primero.

### Dashboard Inicio (`pages/inicio/Dashboard.jsx`)
3 tarjetas de KPI con **datos de muestra**, con una etiqueta discreta ("datos de muestra") para no confundirlos con datos reales: pendientes de aprobación, alertas de vigencia documental, % documentos al día.

### Áreas (`pages/areas/AreasListado.jsx`)
- **Vista lista** (default, y siempre en móvil se ve tarjetas — ver sección 5): tabla compacta (`Table` del CRM) con nombre, código, indicador de salud documental.
- **Vista tarjetas**: grid de tarjetas, mismo contenido.
- Indicador de salud documental por color: verde ≥80%, ámbar 50-79%, rojo <50%.
- Botón "Crear área" visible solo para admin (coincide con `soloAdmin` del backend). Modal con `nombre` + `código` únicamente — sin campo de líder (ver decisión arriba).
- `EmptyState` si no hay áreas.

### Los 7 módulos restantes
Un solo componente `ProximamentePage` (ícono del módulo + "Módulo en construcción"), reusado por cada ruta (`/documentos`, `/solicitudes`, `/proveedores`, `/formularios`, `/reportes`, `/administracion`, y el detalle de área `/areas/:id`).

## 7. Testing

Vitest + React Testing Library + `@testing-library/user-event`. A diferencia del backend (que prueba contra MySQL real, sin mocks), en el frontend **sí se mockea la capa HTTP** (axios) — es el estándar para tests de UI, no una excepción a la convención del proyecto.

Cobertura mínima:
- Componentes comunes copiados (render + interacción básica).
- `AuthContext`: login exitoso/fallido, hidratación desde `/me`, refresh-on-401, logout.
- `PrivateRoute` / `PermissionRoute` / `AdminRoute`: redirección y filtrado por permisos (incluyendo bypass de admin).
- `Login`: submit exitoso, mensaje de error ante credenciales inválidas.
- `useViewMode`: default `'lista'`, persistencia en `localStorage`, override forzado en viewport móvil.
- `Áreas`: listado (ambas vistas), creación (modal), visibilidad del botón "Crear área" solo para admin, `EmptyState` sin datos.

## Fuera de alcance de este plan

- Páginas reales de Documentos, Solicitudes, Proveedores, Formularios, Reportes, Administración, y Detalle de área — quedan como placeholder.
- Flujo de cambio de contraseña obligatorio (`requiereCambioPassword`).
- Búsqueda global, notificaciones, atajos de teclado tipo CRM.
- Resolución de `liderUsuarioId` a nombre de usuario (requiere un endpoint de usuarios que no existe).
- Implementación de `crmClient.js` (solo documentado en `docs/architecture/crm-integration.md`).
- Despliegue/CI del frontend (Vercel u otro) — no definido todavía.
