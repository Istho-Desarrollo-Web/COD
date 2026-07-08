# COD Usuario al Crear Área — Design Spec

## Contexto

COD no tiene hoy ninguna infraestructura de gestión de Usuarios más allá del modelo Sequelize (`server/src/models/Usuario.js`) y el flujo de login (`auth.service.js`). No existe `usuario.service.js`, `usuario.controller.js`, ni endpoint HTTP `/usuarios` — el único usuario existente es el `admin` sembrado por `seedRolesPermisos.js`. El catálogo de permisos ya reserva un módulo `usuarios: ['ver','crear','editar','eliminar']` y el Sidebar ya lista "usuarios" como submódulo de "Administración", pero ambos son placeholders sin implementación.

`Area` ya tiene un campo `liderUsuarioId` (FK a `usuarios.id` a nivel de base de datos, sin asociación Sequelize declarada) que hoy nunca se usa — el formulario de creación de área (`AreasListado.jsx`) solo pide `nombre`/`codigo`.

Este spec cubre: (1) construir el módulo de Usuarios (CRUD completo, backend + pantalla en `Administración`), y (2) integrar ese módulo en el flujo de creación de Área, permitiendo asignar un líder — ya sea creando un usuario nuevo en el momento o eligiendo uno existente.

## Decisiones de diseño

| Decisión | Elegido | Alternativas descartadas |
|---|---|---|
| Alcance del módulo de Usuarios | CRUD completo (listar/crear/editar/eliminar) en este spec | Solo un endpoint de listado mínimo para el selector (se descartó por quedar corto frente a lo que el usuario pidió) |
| Asignación de líder al crear área | Opcional, con checkbox: usuario nuevo (mini-formulario inline) o usuario existente (selector) | Siempre crear un usuario nuevo obligatoriamente |
| Contraseña de usuario | El admin la escribe manualmente en el formulario | Generada automáticamente y mostrada una sola vez (se descartó por preferencia explícita del usuario) |
| Username | Autogenerado a partir de nombre+apellido (primera letra + apellido), editable si ya existe | Campo completamente manual sin sugerencia |
| Ubicación de la pantalla de Usuarios | Ruta anidada `/administracion/usuarios` | Ruta de primer nivel `/usuarios` |
| Creación de área con usuario nuevo | Transaccional (`sequelize.transaction()`): si falla el usuario o el área, se revierte todo | Crear usuario y área como dos pasos independientes sin transacción (riesgo de usuario huérfano) |
| Permisos | Reutiliza el módulo `usuarios` ya definido en el catálogo (`ver`/`crear`/`editar`/`eliminar`) | Crear un módulo de permisos nuevo |

## Backend

### Endpoints nuevos (`/api/v1/usuarios`)

| Método | Ruta | Permiso | Descripción |
|---|---|---|---|
| GET | `/` | `usuarios.ver` | Listado de usuarios activos (`id`, `nombre`, `apellido`, `username`, `email`, `rolId`) |
| GET | `/:id` | `usuarios.ver` | Detalle de un usuario |
| POST | `/` | `usuarios.crear` | Crear usuario (`username`, `email`, `nombre`, `apellido`, `password`, `rolId`, `requiereCambioPassword` — todos obligatorios salvo `requiereCambioPassword`, default `true`) |
| PUT | `/:id` | `usuarios.editar` | Editar metadata; `password` opcional (si se envía, se rehashea con `bcryptjs`, cost 10, y `requiereCambioPassword` se actualiza junto con ella si el body lo incluye) |
| DELETE | `/:id` | `usuarios.eliminar` | Baja lógica (`activo=false`) |

Nuevos archivos: `server/src/services/usuario.service.js`, `server/src/controllers/usuario.controller.js`, `server/src/routes/usuario.routes.js`, montado en `server/src/routes/index.js`.

**Validaciones:** campos obligatorios en creación → `badRequest`; `rolId` debe existir en `Rol` → `notFound` si no; duplicado de `username`/`email` → `SequelizeUniqueConstraintError` capturado por el manejador global de `server.js` → `conflict()` (409), mismo patrón ya usado para el `codigo` de Área. El backend **no genera** el username — lo recibe ya resuelto del cliente y solo valida su unicidad.

### Creación de Área con líder (transaccional)

`POST /areas` acepta `{nombre, codigo, liderUsuarioId?, nuevoUsuario?}` (mutuamente excluyentes; `badRequest` si vienen ambos). Si viene `nuevoUsuario` (`{username, email, nombre, apellido, password, rolId, requiereCambioPassword}`), el controller:

```js
const area = await sequelize.transaction(async (t) => {
  let liderId = liderUsuarioId || null;
  if (nuevoUsuario) {
    const passwordHash = await bcrypt.hash(nuevoUsuario.password, 10);
    const usuario = await Usuario.create({ ...nuevoUsuario, passwordHash }, { transaction: t });
    liderId = usuario.id;
  }
  return Area.create({ nombre, codigo, liderUsuarioId: liderId }, { transaction: t });
});
```

Si la creación del usuario o del área falla (ej. `username` o `codigo` duplicado), la transacción revierte ambas — no queda un usuario huérfano ni un área sin su líder previsto.

## Frontend

### Módulo de Usuarios (`Administración > Usuarios`)

- `frontend/src/api/usuario.service.js`: `listar()`, `obtener(id)`, `crear(datos)`, `editar(id, datos)`, `eliminar(id)` — mismo patrón que `area.service.js`.
- `frontend/src/utils/sugerirUsername.js`: `sugerirUsername(nombre, apellido)` → normaliza (sin acentos/espacios, minúsculas) y arma `primeraLetraNombre + apellido` (ej. "Juan Pérez" → `jperez`). Compartido entre esta pantalla y el flujo inline de Crear Área.
- `frontend/src/pages/administracion/UsuariosListado.jsx`: mismo esqueleto que `AreasListado.jsx` (lista/tarjetas vía `useViewMode`, modal con `react-hook-form`).
  - Campos: Nombre, Apellido, Email, Username (autosugerido al perder foco en Apellido, editable), Contraseña (obligatoria al crear, opcional al editar — vacía = no cambiar), Rol (select), y al editar: toggle Activo/Inactivo.
  - Checkbox "Requiere cambio de contraseña en el próximo inicio de sesión" (marcado por defecto).
  - Gating granular: `tienePermiso('usuarios', 'crear'/'editar'/'eliminar')` por acción — nunca `isAdmin`.
- Ruta nueva `/administracion/usuarios` en `App.jsx`, envuelta en `PermissionRoute modulo="usuarios" accion="ver"`. El resto de `/administracion` (roles/matriz/sesiones/auditoría) sigue como placeholder, sin cambios.

### Integración en "Crear área"

En el modal "Crear área" (`AreasListado.jsx`), debajo de Nombre/Código:

- Checkbox **"Asignar líder de área"**. Al activarlo, aparecen dos opciones:
  - **"Usuario nuevo"** (por defecto): mini-formulario inline (Nombre, Apellido, Email, Username autosugerido editable, Contraseña, Rol — preseleccionado `lider_area`, editable).
  - **"Usuario existente"**: `<select>` poblado con `usuarioService.listar()`, mostrando "Nombre Apellido (username)".
- Si el checkbox está desactivado, `liderUsuarioId` queda `null` (comportamiento actual, sin cambios).

`area.service.js#crear` se extiende para aceptar `{nombre, codigo, liderUsuarioId?, nuevoUsuario?}` y enviarlo tal cual (JSON, sin multipart).

**Validación cliente:** con "Usuario nuevo" activo, todos sus campos son obligatorios; con "Usuario existente" activo, el select es obligatorio. La unicidad de username/email la resuelve el backend (mismo patrón `conflict()` que `codigo` de área).

## Testing

- Backend: tests de integración reales (MySQL + supertest) para `usuario.routes.js` (CRUD completo, unicidad de `username`/`email`, validaciones obligatorias, baja lógica) y extensión de `area.routes.test.js` para los 3 casos del flujo transaccional: crear área sin líder (sin regresión), crear área con `nuevoUsuario` (usuario y área quedan creados y vinculados), y crear área con `nuevoUsuario` inválido — verifica que ni el usuario ni el área se crean (rollback real).
- Frontend: `UsuariosListado.test.jsx` (mismo patrón que `AreasListado.test.jsx`) y extensión de `AreasListado.test.jsx` para los 3 modos del checkbox "Asignar líder" (desactivado / usuario nuevo / usuario existente).

## Estructura de archivos

**Nuevos:**
```
server/src/services/usuario.service.js
server/src/controllers/usuario.controller.js
server/src/routes/usuario.routes.js
server/tests/integration/usuario.routes.test.js
frontend/src/api/usuario.service.js
frontend/src/utils/sugerirUsername.js
frontend/src/utils/sugerirUsername.test.js
frontend/src/pages/administracion/UsuariosListado.jsx
frontend/src/pages/administracion/UsuariosListado.test.jsx
```

**Modificados:**
```
server/src/routes/index.js
server/src/controllers/area.controller.js
server/tests/integration/area.routes.test.js
frontend/src/App.jsx
frontend/src/pages/areas/AreasListado.jsx
frontend/src/pages/areas/AreasListado.test.jsx
frontend/src/api/area.service.js
```

## Fuera de alcance (deliberadamente)

- Edición/eliminación de Roles o de la Matriz de Accesos (siguen como placeholder).
- Bloquear el borrado de un usuario que sea líder de un área activa (el área conservaría un `liderUsuarioId` apuntando a un usuario inactivo).
- Forzar el cambio de contraseña en el login (el campo `requiereCambioPassword` se setea pero la lógica de forzarlo no está implementada en `auth.controller.js`, coherente con el estado actual del proyecto).
- Envío de credenciales por email (no existe servicio de correo).
- El módulo de "Detalle de Área" (spec separado, siguiente en la cola).
