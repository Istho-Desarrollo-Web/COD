# COD Frontend Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up `frontend/` (Vite + React + MUI + Tailwind) with authentication, a FloatingHeader + collapsible Sidebar layout, a Dashboard Inicio with sample KPIs, and a real Áreas page — plus the two small backend additions (`POST /auth/refresh`, a `permisos` map on `/auth/me` and `/auth/login`) needed to make session handling and permission-based navigation actually work end to end.

**Architecture:** Common UI primitives (`Button`, `Input`, `Modal`, `EmptyState`, `StatusChip`, `KpiCard`, `DataTable`) are copied near-verbatim from the real CRM CenthriX frontend (`istho-crm-p/frontend/src/components/common`), since they carry no CRM-specific business logic. Auth/layout/routing (`client.js`, `AuthContext`, `PrivateRoute`/`PermissionRoute`/`AdminRoute`, `FloatingHeader`, `Sidebar`) are written fresh and smaller, matching COD's actual auth shape (`tienePermiso`, `rol`, `nivelRol`) without the CRM's 2FA/trusted-device/notification machinery, which COD's backend doesn't have.

**Tech Stack:** Vite 7, React 19 (JSX, no TypeScript), React Router v7, MUI 7 + `@emotion/react`/`@emotion/styled`, Tailwind CSS v4 (`@tailwindcss/vite`, CSS-first `@theme` tokens — no `tailwind.config.js`), `axios`, `react-hook-form`, `lucide-react`, `notistack`, `prop-types`. Testing: Vitest + `@testing-library/react` + `@testing-library/user-event` + `axios-mock-adapter`.

**Related spec:** `docs/superpowers/specs/2026-07-06-cod-frontend-foundation-design.md`

## Global Constraints

- No TypeScript — plain `.jsx`, matching the reference CRM (`istho-crm-p/frontend`).
- Tailwind v4 is CSS-first: tokens live in `src/index.css`'s `@theme` block (`--color-centhrix-*`, `--font-display`), not in a `tailwind.config.js`. Dark mode via `@variant dark (&:is(.dark *));` and toggling the `dark` class on `<html>`.
- `localStorage` keys are COD-branded, never reused from the CRM: `cod_token`, `cod_refresh_token`, `cod_user`, `cod_theme`, and one `cod_view_<pagina>` key per list page (e.g. `cod_view_areas`).
- `client.js`'s response interceptor returns `response.data` directly (the backend's `{ success, data, message, errors, code }` envelope), matching the CRM's `client.js` convention — every `*.service.js` function then destructures `.data` off of that.
- Every component that takes an `icon` prop takes a `lucide-react` component reference (`icon: Icon`), never a rendered element — matches the CRM's `Button`/`Input`/`EmptyState`/`KpiCard` convention.
- All copied common components keep their CRM prop-shape and `PropTypes` exactly, so future modules that already know the CRM's `Button`/`Modal`/`DataTable` API can use COD's without relearning it.
- Frontend tests mock the HTTP boundary (`axios-mock-adapter` for `client.js`/`*.service.js`, `vi.mock` for consumers of those services and of context hooks) — this is the correct, standard approach for frontend unit tests, not an exception to the backend's real-MySQL-only testing convention.
- Backend additions in Tasks 2–3 must not change the shape of any existing response field — only add new ones (`permisos`) or new endpoints (`/auth/refresh`).
- Sidebar module keys must match the backend's actual `Permiso.js` catalog exactly: `inicio`, `areas`, `documentos`, `solicitudes`, `proveedores`, `formularios`, `reportes` — there is no single `administracion` catalog key; that nav item is gated on the user having `'ver'` on any of `usuarios`, `roles`, `matriz_accesos`, `sesiones`, `auditoria`.
- The reference CRM lives at `C:\Users\PC_PRACTIDS\Documents\GitHub\istho-crm-p\frontend` — implementers should read the exact file named in a task's "Copied from" note if they need to see more surrounding context than what's inlined in that task's steps.

---

### Task 1: Scaffold the Vite + React project

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/vite.config.js`
- Create: `frontend/index.html`
- Create: `frontend/.env.example`
- Create: `frontend/src/index.css`
- Create: `frontend/src/test/setup.js`
- Create: `frontend/src/main.jsx`
- Create: `frontend/src/App.jsx`
- Test: `frontend/src/App.test.jsx`

**Interfaces:**
- Produces: a bootable Vite dev server (`npm run dev`) and a working `npm test` (Vitest + jsdom + Testing Library), which every later task's `npm test` command depends on.

- [ ] **Step 1: Write `frontend/package.json`**

```json
{
  "name": "cod-frontend",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "engines": {
    "node": ">=20"
  },
  "dependencies": {
    "@emotion/react": "^11.14.0",
    "@emotion/styled": "^11.14.1",
    "@mui/material": "^7.3.7",
    "@tailwindcss/vite": "^4.1.18",
    "axios": "^1.13.2",
    "lucide-react": "^0.562.0",
    "notistack": "^3.0.2",
    "prop-types": "^15.8.1",
    "react": "^19.2.0",
    "react-dom": "^19.2.0",
    "react-hook-form": "^7.70.0",
    "react-router-dom": "^7.12.0",
    "tailwindcss": "^4.1.18"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.9.1",
    "@testing-library/react": "^16.3.2",
    "@testing-library/user-event": "^14.6.1",
    "@vitejs/plugin-react": "^5.1.1",
    "jsdom": "^29.1.0",
    "vite": "^7.2.4",
    "vitest": "^4.1.5"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run: `cd frontend && npm install`
Expected: `node_modules/` created, no errors.

- [ ] **Step 3: Write `frontend/vite.config.js`**

```js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:5000', changeOrigin: true, secure: false },
    },
  },
  build: {
    outDir: 'dist',
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.js'],
    css: false,
  },
});
```

- [ ] **Step 4: Write `frontend/index.html`**

```html
<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>COD — Centro Operativo Documental</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

- [ ] **Step 5: Write `frontend/.env.example`**

```bash
VITE_API_URL=http://localhost:5000/api/v1
```

- [ ] **Step 6: Write `frontend/src/index.css`**

```css
@import 'tailwindcss';

@variant dark (&:is(.dark *));

@theme {
  --color-orange-50: #fef2f2;
  --color-orange-100: #fee2e2;
  --color-orange-200: #fecaca;
  --color-orange-300: #fca5a5;
  --color-orange-400: #f87171;
  --color-orange-500: #e74c3c;
  --color-orange-600: #e74c3c;
  --color-orange-700: #c0392b;
  --color-orange-800: #991b1b;
  --color-orange-900: #7f1d1d;

  --color-centhrix-accent: #e74c3c;
  --color-centhrix-accent-hover: #c0392b;
  --color-centhrix-bg: #0f1023;
  --color-centhrix-surface: #151631;
  --color-centhrix-card: #1a1b3a;

  --font-display: 'Rajdhani', 'Segoe UI', system-ui, sans-serif;
}

body {
  font-family:
    'Segoe UI',
    Calibri,
    -apple-system,
    BlinkMacSystemFont,
    system-ui,
    sans-serif;
  -webkit-font-smoothing: antialiased;
}

.dark body {
  background-color: #0f1023;
  color: #f0f0f5;
}
```

- [ ] **Step 7: Write `frontend/src/test/setup.js`**

```js
import '@testing-library/jest-dom';
```

- [ ] **Step 8: Write the failing test — `frontend/src/App.test.jsx`**

```jsx
import { render, screen } from '@testing-library/react';
import App from './App';

describe('App', () => {
  it('renders without crashing', () => {
    render(<App />);
    expect(screen.getByText('COD')).toBeInTheDocument();
  });
});
```

- [ ] **Step 9: Run test to verify it fails**

Run: `cd frontend && npm test -- App.test.jsx`
Expected: FAIL — `Cannot find module './App'`

- [ ] **Step 10: Write `frontend/src/App.jsx`**

```jsx
function App() {
  return <div>COD</div>;
}

export default App;
```

- [ ] **Step 11: Write `frontend/src/main.jsx`**

```jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

- [ ] **Step 12: Run test to verify it passes**

Run: `cd frontend && npm test -- App.test.jsx`
Expected: `PASS src/App.test.jsx`

- [ ] **Step 13: Verify the dev server boots**

Run: `cd frontend && npm run dev` (then stop it, e.g. Ctrl+C, or run with a short timeout)
Expected: Vite prints a local URL (`http://localhost:5173/`) with no errors.

- [ ] **Step 14: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/vite.config.js frontend/index.html frontend/.env.example frontend/src/index.css frontend/src/test frontend/src/main.jsx frontend/src/App.jsx frontend/src/App.test.jsx frontend/.gitignore
git commit -m "feat(frontend): scaffold Vite + React project with Tailwind v4 and Vitest"
```

Note: Vite's scaffolding normally writes a `.gitignore` (ignoring `node_modules/`, `dist/`) — if `npm install` didn't create one, add `frontend/.gitignore` with `node_modules/` and `dist/` before committing, mirroring `server/`'s existing `.gitignore` pattern (check the root `.gitignore` — `server/node_modules/` and `server/.env` are already ignored there; add `frontend/node_modules/`, `frontend/dist/`, and `frontend/.env` alongside them in the root `.gitignore` in this same commit).

---

### Task 2: Backend — `POST /api/v1/auth/refresh`

**Files:**
- Modify: `server/src/services/auth.service.js`
- Modify: `server/src/controllers/auth.controller.js`
- Modify: `server/src/routes/auth.routes.js`
- Modify: `server/src/middlewares/rateLimit.js`
- Test: `server/tests/integration/auth.test.js`

**Interfaces:**
- Consumes: `firmarTokens(usuario)` (already exists in `auth.service.js`), `Usuario`/`Rol` models, `error`/`unauthorized`/`success` from `utils/responses.js`, `asyncHandler` from `utils/asyncHandler.js`.
- Produces: `refrescarToken(refreshTokenRecibido)` in `auth.service.js` → resolves to the `Usuario` (with `Rol` included) if the token is a valid, non-expired `type: 'refresh'` JWT for an active user, else `null`. Produces `POST /api/v1/auth/refresh` → `{ success: true, data: { token, refreshToken } }` (200) on success, `401` on any failure. Produces `refreshLimiter` exported from `rateLimit.js`.

- [ ] **Step 1: Write the failing test**

Add to `server/tests/integration/auth.test.js` (after the existing `describe('POST /api/v1/auth/login', ...)` block):

```js
describe('POST /api/v1/auth/refresh', () => {
  it('returns a new token pair for a valid refresh token', async () => {
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: 'admin', password: process.env.SEED_PASSWORD_ADMIN || 'CambiarAhora123!' });
    const { refreshToken } = loginRes.body.data;

    const res = await request(app).post('/api/v1/auth/refresh').send({ refreshToken });

    expect(res.status).toBe(200);
    expect(res.body.data.token).toEqual(expect.any(String));
    expect(res.body.data.refreshToken).toEqual(expect.any(String));
  });

  it('rejects an access token used as a refresh token with 401', async () => {
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: 'admin', password: process.env.SEED_PASSWORD_ADMIN || 'CambiarAhora123!' });
    const { token } = loginRes.body.data;

    const res = await request(app).post('/api/v1/auth/refresh').send({ refreshToken: token });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('rejects a missing refreshToken with 401', async () => {
    const res = await request(app).post('/api/v1/auth/refresh').send({});
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npm test -- auth.test.js`
Expected: FAIL — `404` on `POST /api/v1/auth/refresh` (route doesn't exist yet)

- [ ] **Step 3: Add `refrescarToken` to `server/src/services/auth.service.js`**

Modify the file to add this function and export it (keep the existing `autenticar`/`firmarTokens` unchanged):

```js
async function refrescarToken(refreshTokenRecibido) {
  let payload;
  try {
    payload = jwt.verify(refreshTokenRecibido, process.env.JWT_SECRET);
  } catch {
    return null;
  }
  if (payload.type !== 'refresh') return null;

  const usuario = await Usuario.unscoped().findOne({ where: { id: payload.id }, include: [{ model: Rol }] });
  if (!usuario || !usuario.activo) return null;
  return usuario;
}

module.exports = { autenticar, firmarTokens, refrescarToken };
```

- [ ] **Step 4: Add `refreshLimiter` to `server/src/middlewares/rateLimit.js`**

Modify the file (keep `loginLimiter` unchanged):

```js
const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    error(res, 'Demasiadas solicitudes de renovación de token. Intente nuevamente más tarde.', 429);
  },
});

module.exports = { loginLimiter, refreshLimiter };
```

- [ ] **Step 5: Add `refresh` to `server/src/controllers/auth.controller.js`**

Modify the file to add this function (keep `login`/`me` unchanged) and export it:

```js
const { autenticar, firmarTokens, refrescarToken } = require('../services/auth.service');

async function refresh(req, res) {
  const { refreshToken } = req.body;
  if (!refreshToken) return unauthorized(res, 'Refresh token no proporcionado');

  const usuario = await refrescarToken(refreshToken);
  if (!usuario) return unauthorized(res, 'Refresh token inválido o expirado');

  const tokens = firmarTokens(usuario);
  return success(res, tokens);
}

module.exports = { login, me, refresh };
```

- [ ] **Step 6: Wire the route in `server/src/routes/auth.routes.js`**

Modify the file:

```js
const express = require('express');
const router = express.Router();
const { verificarToken } = require('../middlewares/auth');
const authController = require('../controllers/auth.controller');
const asyncHandler = require('../utils/asyncHandler');
const { loginLimiter, refreshLimiter } = require('../middlewares/rateLimit');

router.post('/login', loginLimiter, asyncHandler(authController.login));
router.post('/refresh', refreshLimiter, asyncHandler(authController.refresh));
router.get('/me', verificarToken, asyncHandler(authController.me));

module.exports = router;
```

- [ ] **Step 7: Run test to verify it passes**

Run: `cd server && npm test -- auth.test.js`
Expected: `PASS` (all cases, including the 3 new ones)

- [ ] **Step 8: Run the full backend suite to confirm no regressions**

Run: `cd server && npm test`
Expected: all suites `PASS`

- [ ] **Step 9: Commit**

```bash
git add server/src/services/auth.service.js server/src/controllers/auth.controller.js server/src/routes/auth.routes.js server/src/middlewares/rateLimit.js server/tests/integration/auth.test.js
git commit -m "feat(server): add POST /api/v1/auth/refresh for token rotation"
```

---

### Task 3: Backend — `permisos` map on `/auth/me` and `/auth/login`

**Files:**
- Modify: `server/src/middlewares/roles.js`
- Modify: `server/src/controllers/auth.controller.js`
- Test: `server/tests/integration/auth.test.js`

**Interfaces:**
- Consumes: `cargarCachePermisos()` (already exists in `roles.js`).
- Produces: `obtenerPermisosDeRol(rolId)` exported from `roles.js` → resolves to `{ [modulo]: string[] }` for that role (e.g. `{ areas: ['ver'], documentos: ['ver','crear',...] }`), or `{}` if the role has no rows. Produces: `POST /auth/login`'s and `GET /auth/me`'s response `data` gains a `permisos` key with that shape — no existing field changes.

- [ ] **Step 1: Write the failing test**

Add to `server/tests/integration/auth.test.js` (a new top-level `describe`):

```js
describe('permisos map on login and me', () => {
  it('includes the admin permisos map on login and on /me', async () => {
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: 'admin', password: process.env.SEED_PASSWORD_ADMIN || 'CambiarAhora123!' });

    expect(loginRes.body.data.permisos.areas).toContain('ver');

    const meRes = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${loginRes.body.data.token}`);

    expect(meRes.body.data.permisos.areas).toContain('ver');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npm test -- auth.test.js`
Expected: FAIL — `loginRes.body.data.permisos` is `undefined`

- [ ] **Step 3: Add `obtenerPermisosDeRol` to `server/src/middlewares/roles.js`**

Modify the file to add this function and export it (keep everything else unchanged):

```js
async function obtenerPermisosDeRol(rolId) {
  const permisos = await cargarCachePermisos();
  return permisos[rolId] || {};
}

module.exports = {
  requierePermiso,
  requiereRolMinimo,
  soloAdmin,
  cargarCachePermisos,
  invalidarCachePermisos,
  obtenerPermisosDeRol,
};
```

- [ ] **Step 4: Use it in `server/src/controllers/auth.controller.js`**

Modify the file:

```js
const { autenticar, firmarTokens, refrescarToken } = require('../services/auth.service');
const { Auditoria, Usuario, Rol } = require('../models');
const { success, unauthorized } = require('../utils/responses');
const { obtenerPermisosDeRol } = require('../middlewares/roles');

async function login(req, res) {
  const { username, password } = req.body;
  const usuario = await autenticar(username, password);
  if (!usuario) return unauthorized(res, 'Usuario o contraseña incorrectos');

  const { token, refreshToken } = firmarTokens(usuario);
  await Auditoria.registrar({
    tabla: 'usuarios',
    registroId: usuario.id,
    accion: 'login',
    usuarioId: usuario.id,
    usuarioNombre: `${usuario.nombre} ${usuario.apellido}`,
    ipAddress: req.ip,
    userAgent: req.get('User-Agent'),
  });

  const permisos = await obtenerPermisosDeRol(usuario.rolId);

  return success(res, {
    token,
    refreshToken,
    usuario: { id: usuario.id, username: usuario.username, nombre: usuario.nombre, rol: usuario.Rol.nombre },
    permisos,
  });
}

async function me(req, res) {
  const permisos = await obtenerPermisosDeRol(req.user.rolId);
  return success(res, { ...req.user, permisos });
}

async function refresh(req, res) {
  const { refreshToken } = req.body;
  if (!refreshToken) return unauthorized(res, 'Refresh token no proporcionado');

  const usuario = await refrescarToken(refreshToken);
  if (!usuario) return unauthorized(res, 'Refresh token inválido o expirado');

  const tokens = firmarTokens(usuario);
  return success(res, tokens);
}

module.exports = { login, me, refresh };
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd server && npm test -- auth.test.js`
Expected: `PASS`

- [ ] **Step 6: Run the full backend suite to confirm no regressions**

Run: `cd server && npm test`
Expected: all suites `PASS`

- [ ] **Step 7: Commit**

```bash
git add server/src/middlewares/roles.js server/src/controllers/auth.controller.js server/tests/integration/auth.test.js
git commit -m "feat(server): include permisos map in auth/login and auth/me responses"
```

---

### Task 4: `api/client.js` — axios instance with token injection and refresh-on-401

**Files:**
- Create: `frontend/src/api/client.js`
- Test: `frontend/src/api/client.test.js`

**Interfaces:**
- Consumes: `POST /api/v1/auth/refresh` (Task 2), `VITE_API_URL` env var.
- Produces: default export `apiClient` (axios instance whose calls resolve to the backend's `{ success, data, message, errors, code }` body directly, not the axios envelope). Produces named exports `getStoredToken()`, `getStoredRefreshToken()`, `setAuthTokens(token, refreshToken)`, `clearAuthTokens()` — every later task that touches tokens uses these, never raw `localStorage` calls.

- [ ] **Step 1: Add `axios-mock-adapter` as a dev dependency**

Run: `cd frontend && npm install --save-dev axios-mock-adapter@^2.1.0`
Expected: added to `package.json` devDependencies, `node_modules/axios-mock-adapter` created.

- [ ] **Step 2: Write the failing test — `frontend/src/api/client.test.js`**

```js
import MockAdapter from 'axios-mock-adapter';
import apiClient, { setAuthTokens, getStoredToken } from './client';

describe('client.js', () => {
  let mock;

  beforeEach(() => {
    mock = new MockAdapter(apiClient);
    localStorage.clear();
  });

  afterEach(() => {
    mock.restore();
  });

  it('injects the Bearer token from localStorage into requests', async () => {
    setAuthTokens('token-123', 'refresh-123');
    mock.onGet('/areas').reply((config) => {
      expect(config.headers.Authorization).toBe('Bearer token-123');
      return [200, { success: true, data: [] }];
    });

    await apiClient.get('/areas');
  });

  it('resolves to the backend body directly, not the axios envelope', async () => {
    mock.onGet('/areas').reply(200, { success: true, data: [{ id: 1 }], message: null, errors: [], code: null });
    const response = await apiClient.get('/areas');
    expect(response).toEqual({ success: true, data: [{ id: 1 }], message: null, errors: [], code: null });
  });

  it('retries once via /auth/refresh on a 401, then succeeds with the new token', async () => {
    setAuthTokens('token-vencido', 'refresh-valido');
    mock.onGet('/areas').replyOnce(401, { success: false, message: 'Token inválido' });
    mock.onPost('/auth/refresh').reply(200, {
      success: true,
      data: { token: 'token-nuevo', refreshToken: 'refresh-nuevo' },
    });
    mock.onGet('/areas').reply(200, { success: true, data: [{ id: 1 }] });

    const response = await apiClient.get('/areas');

    expect(response.data).toEqual([{ id: 1 }]);
    expect(getStoredToken()).toBe('token-nuevo');
  });

  it('clears tokens and rejects when the refresh itself fails', async () => {
    setAuthTokens('token-vencido', 'refresh-invalido');
    mock.onGet('/areas').reply(401, { success: false, message: 'Token inválido' });
    mock.onPost('/auth/refresh').reply(401, { success: false, message: 'Refresh inválido' });

    await expect(apiClient.get('/areas')).rejects.toBeTruthy();
    expect(getStoredToken()).toBeNull();
  });

  it('does not attempt a refresh for a 401 from the login endpoint itself', async () => {
    mock.onPost('/auth/login').reply(401, { success: false, message: 'Usuario o contraseña incorrectos' });

    await expect(apiClient.post('/auth/login', { username: 'x', password: 'y' })).rejects.toEqual({
      success: false,
      message: 'Usuario o contraseña incorrectos',
    });
    expect(mock.history.post.filter((r) => r.url === '/auth/refresh')).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd frontend && npm test -- client.test.js`
Expected: FAIL — `Cannot find module './client'`

- [ ] **Step 4: Write `frontend/src/api/client.js`**

```js
import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1';
const TOKEN_KEY = 'cod_token';
const REFRESH_TOKEN_KEY = 'cod_refresh_token';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
});

export function getStoredToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function getStoredRefreshToken() {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function setAuthTokens(token, refreshToken) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
}

export function clearAuthTokens() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

apiClient.interceptors.request.use((config) => {
  const token = getStoredToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let refreshingPromise = null;

apiClient.interceptors.response.use(
  (response) => response.data,
  async (error) => {
    const original = error.config;
    const isAuthEndpoint = original?.url?.includes('/auth/login') || original?.url?.includes('/auth/refresh');

    if (error.response?.status === 401 && !original._retry && !isAuthEndpoint) {
      original._retry = true;
      const refreshToken = getStoredRefreshToken();
      if (!refreshToken) {
        clearAuthTokens();
        return Promise.reject(error.response?.data || error);
      }

      try {
        refreshingPromise = refreshingPromise || apiClient.post('/auth/refresh', { refreshToken });
        const data = await refreshingPromise;
        refreshingPromise = null;
        setAuthTokens(data.data.token, data.data.refreshToken);
        original.headers.Authorization = `Bearer ${data.data.token}`;
        return apiClient(original);
      } catch (refreshError) {
        refreshingPromise = null;
        clearAuthTokens();
        return Promise.reject(refreshError.response?.data || refreshError);
      }
    }

    return Promise.reject(error.response?.data || error);
  }
);

export default apiClient;
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd frontend && npm test -- client.test.js`
Expected: `PASS` (5 tests)

- [ ] **Step 6: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/src/api/client.js frontend/src/api/client.test.js
git commit -m "feat(frontend): add axios client with token injection and refresh-on-401"
```

---

### Task 5: `api/auth.service.js` and `api/area.service.js`

**Files:**
- Create: `frontend/src/api/auth.service.js`
- Create: `frontend/src/api/area.service.js`
- Test: `frontend/src/api/auth.service.test.js`
- Test: `frontend/src/api/area.service.test.js`

**Interfaces:**
- Consumes: `apiClient`, `setAuthTokens`, `clearAuthTokens`, `getStoredToken`, `getStoredRefreshToken` from `./client` (Task 4).
- Produces: default export from `auth.service.js` → `{ login(username, password), logout(), obtenerUsuarioActual(), obtenerUsuarioGuardado() }`. `login`/`obtenerUsuarioActual` resolve to a user object shaped `{ id, username, email, nombre, apellido, nombreCompleto, rol, rolId, nivelRol, permisos }` (matching `/auth/login`'s `usuario` + `permisos`, and `/auth/me`'s full `req.user` + `permisos`) and persist it to `localStorage` under `cod_user`. Produces default export from `area.service.js` → `{ listar(), crear({ nombre, codigo }) }`.

- [ ] **Step 1: Write the failing test — `frontend/src/api/auth.service.test.js`**

```js
import MockAdapter from 'axios-mock-adapter';
import apiClient, { getStoredToken, getStoredRefreshToken } from './client';
import authService from './auth.service';

describe('auth.service', () => {
  let mock;

  beforeEach(() => {
    mock = new MockAdapter(apiClient);
    localStorage.clear();
  });

  afterEach(() => {
    mock.restore();
  });

  it('login stores both tokens and returns the user with its permisos', async () => {
    mock.onPost('/auth/login').reply(200, {
      success: true,
      data: {
        token: 'tok',
        refreshToken: 'reftok',
        usuario: { id: 1, username: 'admin', nombre: 'Administrador', rol: 'admin' },
        permisos: { areas: ['ver', 'crear'] },
      },
    });

    const user = await authService.login('admin', 'CambiarAhora123!');

    expect(user.rol).toBe('admin');
    expect(user.permisos.areas).toContain('crear');
    expect(getStoredToken()).toBe('tok');
    expect(getStoredRefreshToken()).toBe('reftok');
    expect(authService.obtenerUsuarioGuardado().username).toBe('admin');
  });

  it('logout clears tokens and the stored user', () => {
    localStorage.setItem('cod_token', 'x');
    localStorage.setItem('cod_user', JSON.stringify({ username: 'admin' }));

    authService.logout();

    expect(getStoredToken()).toBeNull();
    expect(authService.obtenerUsuarioGuardado()).toBeNull();
  });

  it('obtenerUsuarioActual fetches /auth/me and updates the stored user', async () => {
    mock.onGet('/auth/me').reply(200, {
      success: true,
      data: { id: 1, username: 'admin', rol: 'admin', permisos: { areas: ['ver'] } },
    });

    const user = await authService.obtenerUsuarioActual();

    expect(user.username).toBe('admin');
    expect(authService.obtenerUsuarioGuardado().username).toBe('admin');
  });

  it('obtenerUsuarioGuardado returns null when nothing is stored', () => {
    expect(authService.obtenerUsuarioGuardado()).toBeNull();
  });
});
```

- [ ] **Step 2: Write the failing test — `frontend/src/api/area.service.test.js`**

```js
import MockAdapter from 'axios-mock-adapter';
import apiClient from './client';
import areaService from './area.service';

describe('area.service', () => {
  let mock;

  beforeEach(() => {
    mock = new MockAdapter(apiClient);
  });

  afterEach(() => {
    mock.restore();
  });

  it('listar returns the areas array', async () => {
    mock.onGet('/areas').reply(200, { success: true, data: [{ id: 1, nombre: 'Financiera' }] });
    const areas = await areaService.listar();
    expect(areas).toEqual([{ id: 1, nombre: 'Financiera' }]);
  });

  it('crear posts nombre and codigo and returns the created area', async () => {
    mock.onPost('/areas').reply(201, { success: true, data: { id: 2, nombre: 'SGI', codigo: 'SGI' } });
    const area = await areaService.crear({ nombre: 'SGI', codigo: 'SGI' });
    expect(area).toEqual({ id: 2, nombre: 'SGI', codigo: 'SGI' });
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd frontend && npm test -- auth.service.test.js area.service.test.js`
Expected: FAIL — modules not found

- [ ] **Step 4: Write `frontend/src/api/auth.service.js`**

```js
import apiClient, { setAuthTokens, clearAuthTokens } from './client';

const USER_KEY = 'cod_user';

async function login(username, password) {
  const response = await apiClient.post('/auth/login', { username, password });
  const { token, refreshToken, usuario, permisos } = response.data;
  setAuthTokens(token, refreshToken);
  const user = { ...usuario, permisos };
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  return user;
}

function logout() {
  clearAuthTokens();
  localStorage.removeItem(USER_KEY);
}

async function obtenerUsuarioActual() {
  const response = await apiClient.get('/auth/me');
  localStorage.setItem(USER_KEY, JSON.stringify(response.data));
  return response.data;
}

function obtenerUsuarioGuardado() {
  const stored = localStorage.getItem(USER_KEY);
  return stored ? JSON.parse(stored) : null;
}

export default { login, logout, obtenerUsuarioActual, obtenerUsuarioGuardado };
```

- [ ] **Step 5: Write `frontend/src/api/area.service.js`**

```js
import apiClient from './client';

async function listar() {
  const response = await apiClient.get('/areas');
  return response.data;
}

async function crear({ nombre, codigo }) {
  const response = await apiClient.post('/areas', { nombre, codigo });
  return response.data;
}

export default { listar, crear };
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd frontend && npm test -- auth.service.test.js area.service.test.js`
Expected: `PASS` (8 tests total)

- [ ] **Step 7: Commit**

```bash
git add frontend/src/api/auth.service.js frontend/src/api/area.service.js frontend/src/api/auth.service.test.js frontend/src/api/area.service.test.js
git commit -m "feat(frontend): add auth.service and area.service"
```

---

### Task 6: `context/AuthContext`

**Files:**
- Create: `frontend/src/context/AuthContext.jsx`
- Test: `frontend/src/context/AuthContext.test.jsx`

**Interfaces:**
- Consumes: `authService` (Task 5), `getStoredToken` from `./api/client` (Task 4).
- Produces: `AuthProvider` component and `useAuth()` hook → `{ user, isAuthenticated, isLoading, isAdmin, login(username, password), logout(), tienePermiso(modulo, accion) }`. Every later task that needs auth state (`PrivateRoute`, `PermissionRoute`, `AdminRoute`, `FloatingHeader`, `Sidebar`, `Login`, `AreasListado`) consumes `useAuth()` — this is the one shape all of them share.

- [ ] **Step 1: Write the failing test — `frontend/src/context/AuthContext.test.jsx`**

```jsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { AuthProvider, useAuth } from './AuthContext';
import authService from '../api/auth.service';
import { getStoredToken } from '../api/client';

vi.mock('../api/auth.service');
vi.mock('../api/client', async () => {
  const actual = await vi.importActual('../api/client');
  return { ...actual, getStoredToken: vi.fn() };
});

function Consumidor() {
  const { user, isAuthenticated, isLoading, login, logout, tienePermiso, isAdmin } = useAuth();
  if (isLoading) return <p>Cargando...</p>;
  return (
    <div>
      <p>{isAuthenticated ? `autenticado:${user.username}` : 'sin sesión'}</p>
      <p>{isAdmin ? 'es admin' : 'no admin'}</p>
      <p>{tienePermiso('areas', 'ver') ? 'puede ver areas' : 'no puede ver areas'}</p>
      <button onClick={() => login('admin', 'x')}>login</button>
      <button onClick={logout}>logout</button>
    </div>
  );
}

describe('AuthContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getStoredToken.mockReturnValue(null);
  });

  it('starts unauthenticated when there is no stored token', async () => {
    render(
      <AuthProvider>
        <Consumidor />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByText('sin sesión')).toBeInTheDocument());
  });

  it('hydrates the user from /me when a token is already stored', async () => {
    getStoredToken.mockReturnValue('tok-existente');
    authService.obtenerUsuarioActual.mockResolvedValue({ username: 'admin', rol: 'admin', permisos: {} });

    render(
      <AuthProvider>
        <Consumidor />
      </AuthProvider>
    );

    await waitFor(() => expect(screen.getByText('autenticado:admin')).toBeInTheDocument());
  });

  it('clears the session when hydration fails', async () => {
    getStoredToken.mockReturnValue('tok-invalido');
    authService.obtenerUsuarioActual.mockRejectedValue(new Error('401'));

    render(
      <AuthProvider>
        <Consumidor />
      </AuthProvider>
    );

    await waitFor(() => expect(screen.getByText('sin sesión')).toBeInTheDocument());
    expect(authService.logout).toHaveBeenCalledTimes(1);
  });

  it('login updates the context and tienePermiso resolves from the returned permisos', async () => {
    authService.login.mockResolvedValue({ username: 'lider', rol: 'lider_area', permisos: { areas: ['ver'] } });

    render(
      <AuthProvider>
        <Consumidor />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByText('sin sesión')).toBeInTheDocument());

    await userEvent.click(screen.getByText('login'));

    await waitFor(() => expect(screen.getByText('autenticado:lider')).toBeInTheDocument());
    expect(screen.getByText('no admin')).toBeInTheDocument();
    expect(screen.getByText('puede ver areas')).toBeInTheDocument();
  });

  it('admin always resolves tienePermiso to true, regardless of the permisos map', async () => {
    authService.login.mockResolvedValue({ username: 'admin', rol: 'admin', permisos: {} });

    render(
      <AuthProvider>
        <Consumidor />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByText('sin sesión')).toBeInTheDocument());
    await userEvent.click(screen.getByText('login'));

    await waitFor(() => expect(screen.getByText('es admin')).toBeInTheDocument());
    expect(screen.getByText('puede ver areas')).toBeInTheDocument();
  });

  it('logout clears the user from context', async () => {
    authService.login.mockResolvedValue({ username: 'admin', rol: 'admin', permisos: {} });

    render(
      <AuthProvider>
        <Consumidor />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByText('sin sesión')).toBeInTheDocument());
    await userEvent.click(screen.getByText('login'));
    await waitFor(() => expect(screen.getByText('autenticado:admin')).toBeInTheDocument());

    await userEvent.click(screen.getByText('logout'));
    await waitFor(() => expect(screen.getByText('sin sesión')).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- AuthContext.test.jsx`
Expected: FAIL — `Cannot find module './AuthContext'`

- [ ] **Step 3: Write `frontend/src/context/AuthContext.jsx`**

```jsx
import { createContext, useContext, useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import authService from '../api/auth.service';
import { getStoredToken } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function hidratar() {
      const token = getStoredToken();
      if (!token) {
        setIsLoading(false);
        return;
      }
      try {
        const usuarioActual = await authService.obtenerUsuarioActual();
        setUser(usuarioActual);
      } catch {
        authService.logout();
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    }
    hidratar();
  }, []);

  async function login(username, password) {
    const usuarioAutenticado = await authService.login(username, password);
    setUser(usuarioAutenticado);
    return usuarioAutenticado;
  }

  function logout() {
    authService.logout();
    setUser(null);
  }

  function tienePermiso(modulo, accion) {
    if (!user) return false;
    if (user.rol === 'admin') return true;
    return (user.permisos?.[modulo] || []).includes(accion);
  }

  const value = {
    user,
    isAuthenticated: !!user,
    isLoading,
    isAdmin: user?.rol === 'admin',
    login,
    logout,
    tienePermiso,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

AuthProvider.propTypes = { children: PropTypes.node.isRequired };

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return context;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm test -- AuthContext.test.jsx`
Expected: `PASS` (6 tests)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/context/AuthContext.jsx frontend/src/context/AuthContext.test.jsx
git commit -m "feat(frontend): add AuthContext with login/logout/tienePermiso"
```

---

### Task 7: Common components — `Button` and `Input`

**Copied from:** `istho-crm-p/frontend/src/components/common/Button/Button.jsx` and `.../Input/Input.jsx` — verbatim, no CRM-specific logic to strip.

**Files:**
- Create: `frontend/src/components/common/Button/Button.jsx`
- Create: `frontend/src/components/common/Input/Input.jsx`
- Test: `frontend/src/components/common/Button/Button.test.jsx`
- Test: `frontend/src/components/common/Input/Input.test.jsx`

**Interfaces:**
- Produces: `Button` — props `{ children, variant, size, icon: Icon, iconPosition, loading, disabled, fullWidth, type, onClick, className, title, ariaLabel, id }`. Produces: `Input` (a `forwardRef`) — props `{ label, error, hint, icon: Icon, className, containerClassName, type, disabled, id, ...restSpreadOntoNativeInput }`, so `react-hook-form`'s `register(...)` (which returns `{ name, onChange, onBlur, ref }`) can be spread directly onto it.

- [ ] **Step 1: Write the failing test — `frontend/src/components/common/Button/Button.test.jsx`**

```jsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import Button from './Button';

describe('Button', () => {
  it('renders children and responds to clicks', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Guardar</Button>);
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('disables the button and shows a loading label when loading', () => {
    render(<Button loading>Guardar</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
    expect(screen.getByText('Cargando...')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Write the failing test — `frontend/src/components/common/Input/Input.test.jsx`**

```jsx
import { render, screen } from '@testing-library/react';
import Input from './Input';

describe('Input', () => {
  it('renders a label linked to the input', () => {
    render(<Input label="Usuario" />);
    expect(screen.getByLabelText('Usuario')).toBeInTheDocument();
  });

  it('shows an error message with role alert', () => {
    render(<Input label="Usuario" error="El usuario es obligatorio" />);
    expect(screen.getByRole('alert')).toHaveTextContent('El usuario es obligatorio');
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd frontend && npm test -- Button.test.jsx Input.test.jsx`
Expected: FAIL — modules not found

- [ ] **Step 4: Write `frontend/src/components/common/Button/Button.jsx`**

```jsx
import PropTypes from 'prop-types';

const Button = ({
  children,
  variant = 'primary',
  size = 'md',
  icon: Icon,
  iconPosition = 'left',
  loading = false,
  disabled = false,
  fullWidth = false,
  type = 'button',
  onClick,
  className = '',
  title,
  ariaLabel,
  id,
}) => {
  const baseClasses = `
    inline-flex items-center justify-center gap-2
    font-medium rounded-xl
    transition-all duration-200
    focus:outline-none focus:ring-2 focus:ring-offset-2
    disabled:opacity-50 disabled:cursor-not-allowed
  `;

  const variantClasses = {
    primary: `
      bg-orange-500 text-white
      hover:bg-orange-600
      focus:ring-orange-500
    `,
    secondary: `
      bg-slate-800 text-white
      hover:bg-slate-700
      focus:ring-slate-500
    `,
    outline: `
      bg-white dark:bg-centhrix-card text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-600
      hover:bg-slate-50 dark:hover:bg-centhrix-surface hover:border-slate-300 dark:hover:border-slate-500
      focus:ring-slate-500
    `,
    ghost: `
      bg-transparent text-slate-600 dark:text-slate-300
      hover:bg-slate-100 dark:hover:bg-centhrix-surface hover:text-slate-800 dark:hover:text-slate-100
      focus:ring-slate-500
    `,
    danger: `
      bg-red-500 text-white
      hover:bg-red-600
      focus:ring-red-500
    `,
    success: `
      bg-emerald-500 text-white
      hover:bg-emerald-600
      focus:ring-emerald-500
    `,
  };

  const sizeClasses = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2.5 text-sm',
    lg: 'px-6 py-3 text-base',
  };

  const iconSizes = {
    sm: 'w-4 h-4',
    md: 'w-4 h-4',
    lg: 'w-5 h-5',
  };

  return (
    <button
      id={id}
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      title={title}
      aria-label={loading ? 'Cargando, por favor espere' : (ariaLabel ?? title)}
      aria-busy={loading || undefined}
      aria-live="polite"
      className={`
        ${baseClasses}
        ${variantClasses[variant]}
        ${sizeClasses[size]}
        ${fullWidth ? 'w-full' : ''}
        ${className}
      `}
    >
      {loading ? (
        <>
          <svg
            className={`animate-spin ${iconSizes[size]}`}
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          <span>Cargando...</span>
        </>
      ) : (
        <>
          {Icon && iconPosition === 'left' && <Icon className={iconSizes[size]} />}
          {children}
          {Icon && iconPosition === 'right' && <Icon className={iconSizes[size]} />}
        </>
      )}
    </button>
  );
};

Button.propTypes = {
  children: PropTypes.node,
  variant: PropTypes.oneOf(['primary', 'secondary', 'outline', 'ghost', 'danger', 'success']),
  size: PropTypes.oneOf(['sm', 'md', 'lg']),
  icon: PropTypes.elementType,
  iconPosition: PropTypes.oneOf(['left', 'right']),
  loading: PropTypes.bool,
  disabled: PropTypes.bool,
  fullWidth: PropTypes.bool,
  type: PropTypes.oneOf(['button', 'submit', 'reset']),
  onClick: PropTypes.func,
  className: PropTypes.string,
  title: PropTypes.string,
  ariaLabel: PropTypes.string,
};

export default Button;
```

- [ ] **Step 5: Write `frontend/src/components/common/Input/Input.jsx`**

```jsx
import { forwardRef, useId } from 'react';
import { AlertCircle } from 'lucide-react';
import PropTypes from 'prop-types';

const Input = forwardRef(
  ({ label, error, hint, icon: Icon, className = '', containerClassName = '', type = 'text', disabled, id: externalId, ...props }, ref) => {
    const generatedId = useId();
    const id = externalId ?? generatedId;
    const errorId = `${id}-error`;
    const hintId = `${id}-hint`;

    return (
      <div className={`w-full ${containerClassName}`}>
        {label && (
          <label htmlFor={id} className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
            {label}
            {props.required && (
              <span aria-hidden="true" className="text-red-500 ml-0.5">
                *
              </span>
            )}
          </label>
        )}

        {hint && (
          <p className="text-slate-500 dark:text-slate-400 text-xs mt-0.5 mb-1" id={hintId}>
            {hint}
          </p>
        )}

        <div className="relative">
          {Icon && <Icon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" aria-hidden="true" />}

          <input
            ref={ref}
            id={id}
            type={type}
            disabled={disabled}
            aria-invalid={error ? 'true' : undefined}
            aria-describedby={[hint && hintId, error && errorId].filter(Boolean).join(' ') || undefined}
            className={`
            w-full py-2.5 border rounded-xl text-sm transition-colors
            focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500
            ${Icon ? 'pl-10' : 'pl-4'} pr-4
            ${error ? 'border-red-300 bg-red-50 text-red-900 placeholder-red-300' : 'border-slate-200 bg-white text-slate-900'}
            ${disabled ? 'bg-slate-50 text-slate-500 cursor-not-allowed' : ''}
            ${className}
          `}
            {...props}
          />
        </div>

        {error && (
          <p id={errorId} role="alert" className="text-xs text-red-500 mt-1 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" aria-hidden="true" />
            {error}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';

Input.propTypes = {
  label: PropTypes.string,
  error: PropTypes.string,
  hint: PropTypes.string,
  icon: PropTypes.elementType,
  className: PropTypes.string,
  containerClassName: PropTypes.string,
  type: PropTypes.string,
  disabled: PropTypes.bool,
  id: PropTypes.string,
};

export default Input;
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd frontend && npm test -- Button.test.jsx Input.test.jsx`
Expected: `PASS` (4 tests)

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/common/Button frontend/src/components/common/Input
git commit -m "feat(frontend): add Button and Input common components (copied from CRM)"
```

---

### Task 8: Common components — `Modal` and `EmptyState`

**Copied from:** `istho-crm-p/frontend/src/components/common/Modal/Modal.jsx` and `.../EmptyState/EmptyState.jsx` — verbatim.

**Files:**
- Create: `frontend/src/components/common/Modal/Modal.jsx`
- Create: `frontend/src/components/common/EmptyState/EmptyState.jsx`
- Test: `frontend/src/components/common/Modal/Modal.test.jsx`
- Test: `frontend/src/components/common/EmptyState/EmptyState.test.jsx`

**Interfaces:**
- Produces: `Modal` — props `{ isOpen, onClose, title, subtitle, children, size, showCloseButton, closeOnOverlay, footer }`, renders `null` when `isOpen` is false, full focus trap + ESC-to-close. Produces: `EmptyState` — props `{ icon: Icon, title, description, action }`.

- [ ] **Step 1: Write the failing test — `frontend/src/components/common/Modal/Modal.test.jsx`**

```jsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import Modal from './Modal';

describe('Modal', () => {
  it('renders nothing when isOpen is false', () => {
    render(<Modal isOpen={false} onClose={vi.fn()} title="Prueba" />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders the title and content when open, and closes on the close button', async () => {
    const onClose = vi.fn();
    render(
      <Modal isOpen onClose={onClose} title="Crear área">
        <p>Contenido</p>
      </Modal>
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Crear área')).toBeInTheDocument();
    expect(screen.getByText('Contenido')).toBeInTheDocument();

    await userEvent.click(screen.getByLabelText('Cerrar modal'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders the footer when provided', () => {
    render(
      <Modal isOpen onClose={vi.fn()} title="Prueba" footer={<button>Guardar</button>}>
        <p>Contenido</p>
      </Modal>
    );
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Write the failing test — `frontend/src/components/common/EmptyState/EmptyState.test.jsx`**

```jsx
import { render, screen } from '@testing-library/react';
import { Building2 } from 'lucide-react';
import EmptyState from './EmptyState';

describe('EmptyState', () => {
  it('renders title and description', () => {
    render(<EmptyState icon={Building2} title="Sin áreas" description="Crea la primera área" />);
    expect(screen.getByText('Sin áreas')).toBeInTheDocument();
    expect(screen.getByText('Crea la primera área')).toBeInTheDocument();
  });

  it('renders the optional action', () => {
    render(<EmptyState title="Sin áreas" action={<button>Crear</button>} />);
    expect(screen.getByRole('button', { name: 'Crear' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd frontend && npm test -- Modal.test.jsx EmptyState.test.jsx`
Expected: FAIL — modules not found

- [ ] **Step 4: Write `frontend/src/components/common/Modal/Modal.jsx`**

```jsx
import { useEffect, useRef, useId } from 'react';
import PropTypes from 'prop-types';
import { X } from 'lucide-react';

const Modal = ({ isOpen, onClose, title, subtitle, children, size = 'md', showCloseButton = true, closeOnOverlay = true, footer }) => {
  const modalRef = useRef(null);
  const previousFocusRef = useRef(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    if (!isOpen) {
      previousFocusRef.current?.focus();
      return;
    }

    previousFocusRef.current = document.activeElement;

    const getFocusable = () =>
      Array.from(
        modalRef.current?.querySelectorAll(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        ) ?? []
      );

    const focusable = getFocusable();
    (focusable[0] ?? modalRef.current)?.focus();

    const handleTab = (e) => {
      if (e.key !== 'Tab') return;
      const els = getFocusable();
      if (els.length === 0) {
        e.preventDefault();
        return;
      }
      if (e.shiftKey) {
        if (document.activeElement === els[0]) {
          e.preventDefault();
          els[els.length - 1]?.focus();
        }
      } else if (document.activeElement === els[els.length - 1]) {
        e.preventDefault();
        els[0]?.focus();
      }
    };

    window.addEventListener('keydown', handleTab);
    return () => window.removeEventListener('keydown', handleTab);
  }, [isOpen]);

  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : 'unset';
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    if (isOpen) window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const sizeClasses = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
    full: 'max-w-6xl',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={closeOnOverlay ? onClose : undefined} aria-hidden="true" />

      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        aria-labelledby={titleId}
        aria-describedby={subtitle ? descId : undefined}
        className={`
          relative w-full ${sizeClasses[size]}
          bg-white rounded-2xl shadow-2xl
          max-h-[90vh] flex flex-col
        `}
      >
        <div className="flex items-start justify-between p-6 border-b border-gray-100">
          <div>
            <h2 id={titleId} className="text-xl font-semibold text-slate-800">
              {title}
            </h2>
            {subtitle && (
              <p id={descId} className="text-sm text-slate-500 mt-1">
                {subtitle}
              </p>
            )}
          </div>
          {showCloseButton && (
            <button onClick={onClose} aria-label="Cerrar modal" className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
              <X className="w-5 h-5" aria-hidden="true" />
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-6">{children}</div>

        {footer && (
          <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-3 p-6 border-t border-gray-100 bg-slate-50 rounded-b-2xl [&>button]:w-full sm:[&>button]:w-auto">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};

Modal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  title: PropTypes.string.isRequired,
  subtitle: PropTypes.string,
  children: PropTypes.node,
  size: PropTypes.oneOf(['sm', 'md', 'lg', 'xl', 'full']),
  showCloseButton: PropTypes.bool,
  closeOnOverlay: PropTypes.bool,
  footer: PropTypes.node,
};

export default Modal;
```

- [ ] **Step 5: Write `frontend/src/components/common/EmptyState/EmptyState.jsx`**

```jsx
import PropTypes from 'prop-types';

const EmptyState = ({ icon: Icon, title, description, action }) => {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center bg-gray-50 dark:bg-centhrix-card/50 border border-gray-100 dark:border-slate-700 rounded-xl border-dashed">
      <div className="w-12 h-12 bg-white dark:bg-centhrix-surface rounded-full flex items-center justify-center shadow-sm mb-4">
        {Icon && <Icon className="w-6 h-6 text-slate-400 dark:text-slate-500" />}
      </div>

      <h3 className="text-lg font-medium text-slate-800 dark:text-slate-100 mb-1">{title}</h3>

      {description && <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm mb-6">{description}</p>}

      {action && <div>{action}</div>}
    </div>
  );
};

EmptyState.propTypes = {
  icon: PropTypes.elementType,
  title: PropTypes.string.isRequired,
  description: PropTypes.string,
  action: PropTypes.node,
};

export default EmptyState;
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd frontend && npm test -- Modal.test.jsx EmptyState.test.jsx`
Expected: `PASS` (5 tests)

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/common/Modal frontend/src/components/common/EmptyState
git commit -m "feat(frontend): add Modal and EmptyState common components (copied from CRM)"
```

---

### Task 9: Common components — `StatusChip` (adapted) and `KpiCard`

**Copied from:** `istho-crm-p/frontend/src/components/common/StatusChip/StatusChip.jsx` (component logic verbatim; `STATUS_CONFIG` **replaced** with COD's own enum values — the CRM's config covers despachos/inventario/bodegas states that don't exist in COD) and `.../Card/KpiCard.jsx` (verbatim).

**Files:**
- Create: `frontend/src/components/common/StatusChip/StatusChip.jsx`
- Create: `frontend/src/components/common/Card/KpiCard.jsx`
- Test: `frontend/src/components/common/StatusChip/StatusChip.test.jsx`
- Test: `frontend/src/components/common/Card/KpiCard.test.jsx`

**Interfaces:**
- Produces: `StatusChip` — props `{ status, customLabel, size }`; `STATUS_CONFIG` keys cover every enum value already defined in the backend data-model spec (`Documento.estado`, `Solicitud.estado`, `SolicitudAprobacion.estado`, plus generic `activo`/`inactivo` and a COD-specific `saludable`/`atencion`/`critico` triplet for Área's health percentage, computed by the page — not an enum the backend returns). Unknown `status` values fall back to a neutral gray chip labeled with the raw `status` string. Produces: `KpiCard` — props `{ title, value, change, subtitle, positive, icon: Icon, iconBg, iconColor, onClick, loading }`.

- [ ] **Step 1: Write the failing test — `frontend/src/components/common/StatusChip/StatusChip.test.jsx`**

```jsx
import { render, screen } from '@testing-library/react';
import StatusChip from './StatusChip';

describe('StatusChip', () => {
  it('renders the configured label for a known status', () => {
    render(<StatusChip status="vigente" />);
    expect(screen.getByText('vigente')).toBeInTheDocument();
  });

  it('renders a customLabel when provided, overriding the default label', () => {
    render(<StatusChip status="saludable" customLabel="92% al día" />);
    expect(screen.getByText('92% al día')).toBeInTheDocument();
    expect(screen.queryByText('saludable')).not.toBeInTheDocument();
  });

  it('falls back to the raw status as label when the status is unknown', () => {
    render(<StatusChip status="estado_no_definido" />);
    expect(screen.getByText('estado_no_definido')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Write the failing test — `frontend/src/components/common/Card/KpiCard.test.jsx`**

```jsx
import { render, screen } from '@testing-library/react';
import { ClipboardList } from 'lucide-react';
import KpiCard from './KpiCard';

describe('KpiCard', () => {
  it('renders title and value', () => {
    render(<KpiCard title="Aprobaciones pendientes" value={4} icon={ClipboardList} />);
    expect(screen.getByText('Aprobaciones pendientes')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
  });

  it('renders a loading skeleton when loading is true, hiding the real value', () => {
    render(<KpiCard title="X" value={1} loading />);
    expect(screen.getByLabelText('Cargando indicador')).toBeInTheDocument();
    expect(screen.queryByText('1')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd frontend && npm test -- StatusChip.test.jsx KpiCard.test.jsx`
Expected: FAIL — modules not found

- [ ] **Step 4: Write `frontend/src/components/common/StatusChip/StatusChip.jsx`**

```jsx
import PropTypes from 'prop-types';

const STATUS_CONFIG = {
  activo: { bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-400', label: 'activo' },
  inactivo: { bg: 'bg-gray-100 dark:bg-centhrix-surface', text: 'text-gray-700 dark:text-slate-300', label: 'inactivo' },

  saludable: { bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-400', label: 'saludable' },
  atencion: { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-400', label: 'atención' },
  critico: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-400', label: 'crítico' },

  vigente: { bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-400', label: 'vigente' },
  por_vencer: { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-400', label: 'por vencer' },
  vencido: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-400', label: 'vencido' },
  sin_vigencia: { bg: 'bg-gray-100 dark:bg-centhrix-surface', text: 'text-gray-700 dark:text-slate-300', label: 'sin vigencia' },

  borrador: { bg: 'bg-gray-100 dark:bg-centhrix-surface', text: 'text-gray-700 dark:text-slate-300', label: 'borrador' },
  cotizando: { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-400', label: 'cotizando' },
  en_aprobacion: { bg: 'bg-violet-100 dark:bg-violet-900/30', text: 'text-violet-700 dark:text-violet-400', label: 'en aprobación' },
  aprobada: { bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-400', label: 'aprobada' },
  rechazada: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-400', label: 'rechazada' },
  confirmada: { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-400', label: 'confirmada' },
  cerrada: { bg: 'bg-gray-100 dark:bg-centhrix-surface', text: 'text-gray-700 dark:text-slate-300', label: 'cerrada' },
  cancelada: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-400', label: 'cancelada' },

  pendiente: { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-400', label: 'pendiente' },
  aprobado: { bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-400', label: 'aprobado' },
  rechazado: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-400', label: 'rechazado' },
};

const StatusChip = ({ status, customLabel, size = 'md' }) => {
  const config = STATUS_CONFIG[status] || {
    bg: 'bg-gray-100 dark:bg-centhrix-surface',
    text: 'text-gray-700 dark:text-slate-300',
    label: status,
  };

  const sizeClasses = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-2.5 py-1 text-xs',
    lg: 'px-3 py-1.5 text-sm',
  };

  return (
    <span
      className={`
        inline-flex items-center rounded-full font-medium
        ${config.bg} ${config.text} ${sizeClasses[size]}
      `}
    >
      {customLabel || config.label}
    </span>
  );
};

StatusChip.propTypes = {
  status: PropTypes.string.isRequired,
  customLabel: PropTypes.string,
  size: PropTypes.oneOf(['sm', 'md', 'lg']),
};

export default StatusChip;
```

- [ ] **Step 5: Write `frontend/src/components/common/Card/KpiCard.jsx`**

```jsx
import PropTypes from 'prop-types';

const KpiCard = ({
  title,
  value,
  change,
  subtitle,
  positive = true,
  icon: Icon,
  iconBg = 'bg-blue-100 dark:bg-blue-900/30',
  iconColor = 'text-blue-600 dark:text-blue-400',
  onClick,
  loading = false,
}) => {
  if (loading) {
    return (
      <div
        aria-busy="true"
        aria-label="Cargando indicador"
        className="
        bg-white dark:bg-centhrix-card
        rounded-2xl p-5
        shadow-sm border border-gray-100 dark:border-slate-700
        animate-pulse
      "
      >
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="h-4 bg-gray-200 dark:bg-centhrix-surface rounded w-24 mb-2" />
            <div className="h-8 bg-gray-200 dark:bg-centhrix-surface rounded w-32 mb-2" />
            <div className="h-3 bg-gray-200 dark:bg-centhrix-surface rounded w-28" />
          </div>
          <div className="w-12 h-12 bg-gray-200 dark:bg-centhrix-surface rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={onClick}
      className={`
        bg-white dark:bg-centhrix-card
        rounded-2xl p-5 
        shadow-sm border border-gray-100 dark:border-slate-700
        hover:shadow-md dark:hover:shadow-lg
        transition-shadow duration-300
        ${onClick ? 'cursor-pointer' : ''}
      `}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">{title}</p>
          <p className="text-3xl font-bold text-slate-800 dark:text-slate-100">{value}</p>
          {subtitle && <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">{subtitle}</p>}
          {change && (
            <p
              className={`
                text-sm mt-2 font-medium
                ${positive ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}
              `}
            >
              {change}
            </p>
          )}
        </div>

        {Icon && (
          <div className={`p-3 rounded-xl ${iconBg}`}>
            <Icon className={`w-6 h-6 ${iconColor}`} />
          </div>
        )}
      </div>
    </div>
  );
};

KpiCard.propTypes = {
  title: PropTypes.string.isRequired,
  value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  change: PropTypes.string,
  subtitle: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  positive: PropTypes.bool,
  icon: PropTypes.elementType,
  iconBg: PropTypes.string,
  iconColor: PropTypes.string,
  onClick: PropTypes.func,
  loading: PropTypes.bool,
};

export default KpiCard;
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd frontend && npm test -- StatusChip.test.jsx KpiCard.test.jsx`
Expected: `PASS` (5 tests)

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/common/StatusChip frontend/src/components/common/Card
git commit -m "feat(frontend): add StatusChip (COD status enums) and KpiCard common components"
```

---

### Task 10: Common component — `DataTable`

**Copied from:** `istho-crm-p/frontend/src/components/common/Table/DataTable.jsx` — verbatim.

**Files:**
- Create: `frontend/src/components/common/Table/DataTable.jsx`
- Test: `frontend/src/components/common/Table/DataTable.test.jsx`

**Interfaces:**
- Consumes: `StatusChip` (Task 9), for any column with `type: 'status'`.
- Produces: `DataTable` — props `{ tabs, columns, data, defaultTab, onTabChange, onRowClick, loading, emptyMessage, ariaLabel }`. `columns` is `Array<{ key, label, align?, type?, render? }>`; `render(value, row)` takes precedence, else `type: 'status'` renders a `StatusChip`, `type: 'id'`/`'currency'` apply styling, otherwise plain text. Degrades to a plain table (no tabs UI) when `tabs` is omitted — this is the only mode used by this plan (Áreas has no tabs).

- [ ] **Step 1: Write the failing test — `frontend/src/components/common/Table/DataTable.test.jsx`**

```jsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import DataTable from './DataTable';

const columnas = [
  { key: 'nombre', label: 'Nombre' },
  { key: 'estado', label: 'Estado', type: 'status' },
];
const datos = [
  { id: 1, nombre: 'Financiera', estado: 'activo' },
  { id: 2, nombre: 'SGI', estado: 'inactivo' },
];

describe('DataTable', () => {
  it('renders one row per data item with the configured columns', () => {
    render(<DataTable columns={columnas} data={datos} />);
    expect(screen.getByText('Financiera')).toBeInTheDocument();
    expect(screen.getByText('SGI')).toBeInTheDocument();
    expect(screen.getByText('activo')).toBeInTheDocument();
    expect(screen.getByText('inactivo')).toBeInTheDocument();
  });

  it('shows the empty message when there is no data', () => {
    render(<DataTable columns={columnas} data={[]} emptyMessage="Sin áreas todavía" />);
    expect(screen.getByText('Sin áreas todavía')).toBeInTheDocument();
  });

  it('calls onRowClick with the row when a row is clicked', async () => {
    const onRowClick = vi.fn();
    render(<DataTable columns={columnas} data={datos} onRowClick={onRowClick} />);
    await userEvent.click(screen.getByText('Financiera'));
    expect(onRowClick).toHaveBeenCalledWith(datos[0]);
  });

  it('renders a custom cell via a column render function', () => {
    const conRender = [{ key: 'nombre', label: 'Nombre', render: (valor) => `→ ${valor}` }];
    render(<DataTable columns={conRender} data={datos} />);
    expect(screen.getByText('→ Financiera')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- DataTable.test.jsx`
Expected: FAIL — `Cannot find module './DataTable'`

- [ ] **Step 3: Write `frontend/src/components/common/Table/DataTable.jsx`**

```jsx
import { useState, useRef } from 'react';
import PropTypes from 'prop-types';
import StatusChip from '../StatusChip/StatusChip';

const SimpleTable = ({ columns, data, onRowClick, loading, emptyMessage, ariaLabel }) => {
  if (loading) {
    return (
      <div className="overflow-x-auto">
        <table className="w-full" aria-busy="true" aria-label={ariaLabel || 'Cargando datos'}>
          <thead>
            <tr className="border-b border-gray-100 dark:border-slate-700">
              {columns.map((col, idx) => (
                <th scope="col" key={idx} className="py-3 px-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...Array(5)].map((_, rowIdx) => (
              <tr key={rowIdx} className="border-b border-gray-50 dark:border-slate-700">
                {columns.map((_, colIdx) => (
                  <td key={colIdx} className="py-4 px-4">
                    <div className="h-4 bg-gray-200 dark:bg-centhrix-surface rounded animate-pulse" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="py-12 text-center text-slate-500 dark:text-slate-400">
        <p>{emptyMessage || 'No hay datos para mostrar'}</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full" aria-label={ariaLabel}>
        <thead>
          <tr className="border-b border-gray-100 dark:border-slate-700">
            {columns.map((col, idx) => (
              <th
                scope="col"
                key={idx}
                className={`
                  py-3 px-4 text-xs font-semibold uppercase tracking-wider
                  text-slate-500 dark:text-slate-400
                  ${col.align === 'center' ? 'text-center' : ''}
                  ${col.align === 'right' ? 'text-right' : 'text-left'}
                `}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {data.map((row, rowIdx) => (
            <tr
              key={row.id || rowIdx}
              onClick={() => onRowClick?.(row)}
              onKeyDown={
                onRowClick
                  ? (e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onRowClick(row);
                      }
                    }
                  : undefined
              }
              tabIndex={onRowClick ? 0 : undefined}
              className={`
                border-b border-gray-50 dark:border-slate-700
                hover:bg-slate-50 dark:hover:bg-centhrix-surface
                transition-colors
                ${onRowClick ? 'cursor-pointer' : ''}
              `}
            >
              {columns.map((col, colIdx) => (
                <td
                  key={colIdx}
                  className={`
                    py-4 px-4 text-sm
                    text-slate-600 dark:text-slate-300
                    ${col.align === 'center' ? 'text-center' : ''}
                    ${col.align === 'right' ? 'text-right' : ''}
                  `}
                >
                  {renderCell(row, col)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const renderCell = (row, col) => {
  const value = row[col.key];

  if (col.render) return col.render(value, row);
  if (col.type === 'status') return <StatusChip status={value} />;
  if (col.type === 'id') return <span className="font-medium text-orange-600 dark:text-orange-400">{value}</span>;
  if (col.type === 'currency') return <span className="font-medium text-slate-600 dark:text-slate-300">{value}</span>;

  return <span className="text-slate-600 dark:text-slate-300">{value}</span>;
};

const DataTable = ({ tabs, columns, data, defaultTab, onTabChange, onRowClick, loading = false, emptyMessage, ariaLabel }) => {
  const [activeTab, setActiveTab] = useState(defaultTab || tabs?.[0]?.id);
  const tabRefs = useRef({});

  if (!tabs || tabs.length === 0) {
    return (
      <div className="bg-white dark:bg-centhrix-card rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 overflow-hidden">
        <SimpleTable columns={columns} data={data} onRowClick={onRowClick} loading={loading} emptyMessage={emptyMessage} ariaLabel={ariaLabel} />
      </div>
    );
  }

  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    onTabChange?.(tabId);
    tabRefs.current[tabId]?.focus();
  };

  const currentColumns = columns[activeTab] || columns;
  const currentData = data[activeTab] || data;

  return (
    <div className="bg-white dark:bg-centhrix-card rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 overflow-hidden">
      <div role="tablist" aria-label="Secciones" className="flex border-b border-gray-100 dark:border-slate-700">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            ref={(el) => {
              tabRefs.current[tab.id] = el;
            }}
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={activeTab === tab.id}
            aria-controls={`panel-${tab.id}`}
            tabIndex={activeTab === tab.id ? 0 : -1}
            onClick={() => handleTabChange(tab.id)}
            onKeyDown={(e) => {
              const tabIds = tabs.map((t) => t.id);
              const currentIdx = tabIds.indexOf(activeTab);
              if (e.key === 'ArrowRight') {
                handleTabChange(tabIds[(currentIdx + 1) % tabIds.length]);
              } else if (e.key === 'ArrowLeft') {
                handleTabChange(tabIds[(currentIdx - 1 + tabIds.length) % tabIds.length]);
              }
            }}
            className={`
              px-6 py-4 text-sm font-medium transition-colors relative
              ${activeTab === tab.id ? 'text-slate-900 dark:text-slate-100' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}
            `}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span className="ml-2 text-xs bg-slate-100 dark:bg-centhrix-surface px-2 py-0.5 rounded-full">{tab.count}</span>
            )}
            {activeTab === tab.id && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-orange-500" />}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`panel-${activeTab}`} aria-labelledby={`tab-${activeTab}`}>
        <SimpleTable columns={currentColumns} data={currentData} onRowClick={onRowClick} loading={loading} emptyMessage={emptyMessage} ariaLabel={ariaLabel} />
      </div>
    </div>
  );
};

DataTable.propTypes = {
  tabs: PropTypes.arrayOf(PropTypes.shape({ id: PropTypes.string.isRequired, label: PropTypes.string.isRequired, count: PropTypes.number })),
  columns: PropTypes.oneOfType([PropTypes.array, PropTypes.object]).isRequired,
  data: PropTypes.oneOfType([PropTypes.array, PropTypes.object]).isRequired,
  defaultTab: PropTypes.string,
  onTabChange: PropTypes.func,
  onRowClick: PropTypes.func,
  loading: PropTypes.bool,
  emptyMessage: PropTypes.string,
  ariaLabel: PropTypes.string,
};

export default DataTable;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm test -- DataTable.test.jsx`
Expected: `PASS` (4 tests)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/common/Table
git commit -m "feat(frontend): add DataTable common component (copied from CRM)"
```

---

### Task 11: `components/auth` — `PrivateRoute`, `PermissionRoute`, `AdminRoute`

**Files:**
- Create: `frontend/src/components/auth/PrivateRoute.jsx`
- Create: `frontend/src/components/auth/PermissionRoute.jsx`
- Create: `frontend/src/components/auth/AdminRoute.jsx`
- Test: `frontend/src/components/auth/PrivateRoute.test.jsx`
- Test: `frontend/src/components/auth/PermissionRoute.test.jsx`
- Test: `frontend/src/components/auth/AdminRoute.test.jsx`

**Interfaces:**
- Consumes: `useAuth()` (Task 6) — `isAuthenticated`, `isLoading`, `tienePermiso(modulo, accion)`, `isAdmin`.
- Produces: `PrivateRoute({ children })` — renders `null` while `isLoading`, redirects to `/login` (preserving `location` in `state.from`) if not authenticated, else renders `children`. Produces: `PermissionRoute({ modulo, accion, children })` — redirects to `/inicio` if `!tienePermiso(modulo, accion)`, else renders `children`. Produces: `AdminRoute({ children })` — redirects to `/inicio` if `!isAdmin`, else renders `children`.

- [ ] **Step 1: Write the failing test — `frontend/src/components/auth/PrivateRoute.test.jsx`**

```jsx
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { vi } from 'vitest';
import { PrivateRoute } from './PrivateRoute';
import { useAuth } from '../../context/AuthContext';

vi.mock('../../context/AuthContext');

function renderConRuta(initialPath = '/protegida') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/login" element={<p>Página de login</p>} />
        <Route
          path="/protegida"
          element={
            <PrivateRoute>
              <p>Contenido protegido</p>
            </PrivateRoute>
          }
        />
      </Routes>
    </MemoryRouter>
  );
}

describe('PrivateRoute', () => {
  it('renders nothing while auth state is loading', () => {
    useAuth.mockReturnValue({ isAuthenticated: false, isLoading: true });
    renderConRuta();
    expect(screen.queryByText('Contenido protegido')).not.toBeInTheDocument();
    expect(screen.queryByText('Página de login')).not.toBeInTheDocument();
  });

  it('redirects to /login when not authenticated', () => {
    useAuth.mockReturnValue({ isAuthenticated: false, isLoading: false });
    renderConRuta();
    expect(screen.getByText('Página de login')).toBeInTheDocument();
  });

  it('renders children when authenticated', () => {
    useAuth.mockReturnValue({ isAuthenticated: true, isLoading: false });
    renderConRuta();
    expect(screen.getByText('Contenido protegido')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Write the failing test — `frontend/src/components/auth/PermissionRoute.test.jsx`**

```jsx
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { vi } from 'vitest';
import { PermissionRoute } from './PermissionRoute';
import { useAuth } from '../../context/AuthContext';

vi.mock('../../context/AuthContext');

function renderConRuta() {
  return render(
    <MemoryRouter initialEntries={['/documentos']}>
      <Routes>
        <Route path="/inicio" element={<p>Inicio</p>} />
        <Route
          path="/documentos"
          element={
            <PermissionRoute modulo="documentos" accion="ver">
              <p>Documentos</p>
            </PermissionRoute>
          }
        />
      </Routes>
    </MemoryRouter>
  );
}

describe('PermissionRoute', () => {
  it('redirects to /inicio when the user lacks the permission', () => {
    useAuth.mockReturnValue({ tienePermiso: () => false });
    renderConRuta();
    expect(screen.getByText('Inicio')).toBeInTheDocument();
  });

  it('renders children when the user has the permission', () => {
    useAuth.mockReturnValue({ tienePermiso: (modulo, accion) => modulo === 'documentos' && accion === 'ver' });
    renderConRuta();
    expect(screen.getByText('Documentos')).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Write the failing test — `frontend/src/components/auth/AdminRoute.test.jsx`**

```jsx
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { vi } from 'vitest';
import { AdminRoute } from './AdminRoute';
import { useAuth } from '../../context/AuthContext';

vi.mock('../../context/AuthContext');

function renderConRuta() {
  return render(
    <MemoryRouter initialEntries={['/administracion']}>
      <Routes>
        <Route path="/inicio" element={<p>Inicio</p>} />
        <Route
          path="/administracion"
          element={
            <AdminRoute>
              <p>Panel admin</p>
            </AdminRoute>
          }
        />
      </Routes>
    </MemoryRouter>
  );
}

describe('AdminRoute', () => {
  it('redirects non-admins to /inicio', () => {
    useAuth.mockReturnValue({ isAdmin: false });
    renderConRuta();
    expect(screen.getByText('Inicio')).toBeInTheDocument();
  });

  it('renders children for admins', () => {
    useAuth.mockReturnValue({ isAdmin: true });
    renderConRuta();
    expect(screen.getByText('Panel admin')).toBeInTheDocument();
  });
});
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `cd frontend && npm test -- PrivateRoute.test.jsx PermissionRoute.test.jsx AdminRoute.test.jsx`
Expected: FAIL — modules not found

- [ ] **Step 5: Write `frontend/src/components/auth/PrivateRoute.jsx`**

```jsx
import { Navigate, useLocation } from 'react-router-dom';
import PropTypes from 'prop-types';
import { useAuth } from '../../context/AuthContext';

export function PrivateRoute({ children }) {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) return null;
  if (!isAuthenticated) return <Navigate to="/login" state={{ from: location }} replace />;
  return children;
}

PrivateRoute.propTypes = { children: PropTypes.node.isRequired };
```

- [ ] **Step 6: Write `frontend/src/components/auth/PermissionRoute.jsx`**

```jsx
import { Navigate } from 'react-router-dom';
import PropTypes from 'prop-types';
import { useAuth } from '../../context/AuthContext';

export function PermissionRoute({ modulo, accion, children }) {
  const { tienePermiso } = useAuth();
  if (!tienePermiso(modulo, accion)) return <Navigate to="/inicio" replace />;
  return children;
}

PermissionRoute.propTypes = {
  modulo: PropTypes.string.isRequired,
  accion: PropTypes.string.isRequired,
  children: PropTypes.node.isRequired,
};
```

- [ ] **Step 7: Write `frontend/src/components/auth/AdminRoute.jsx`**

```jsx
import { Navigate } from 'react-router-dom';
import PropTypes from 'prop-types';
import { useAuth } from '../../context/AuthContext';

export function AdminRoute({ children }) {
  const { isAdmin } = useAuth();
  if (!isAdmin) return <Navigate to="/inicio" replace />;
  return children;
}

AdminRoute.propTypes = { children: PropTypes.node.isRequired };
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `cd frontend && npm test -- PrivateRoute.test.jsx PermissionRoute.test.jsx AdminRoute.test.jsx`
Expected: `PASS` (7 tests)

- [ ] **Step 9: Commit**

```bash
git add frontend/src/components/auth
git commit -m "feat(frontend): add PrivateRoute, PermissionRoute, and AdminRoute"
```

---

### Task 12: `context/ThemeContext` (dark mode)

**Files:**
- Create: `frontend/src/context/ThemeContext.jsx`
- Test: `frontend/src/context/ThemeContext.test.jsx`

**Interfaces:**
- Produces: `ThemeProvider` and `useTheme()` → `{ isDark, toggleTheme }`. Toggling adds/removes the `dark` class on `document.documentElement` (the selector `index.css`'s `@variant dark (&:is(.dark *));` matches against) and persists the choice to `localStorage` under `cod_theme`.

- [ ] **Step 1: Write the failing test — `frontend/src/context/ThemeContext.test.jsx`**

```jsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider, useTheme } from './ThemeContext';

function Consumidor() {
  const { isDark, toggleTheme } = useTheme();
  return (
    <div>
      <p>{isDark ? 'oscuro' : 'claro'}</p>
      <button onClick={toggleTheme}>alternar</button>
    </div>
  );
}

describe('ThemeContext', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
  });

  it('defaults to light theme with no dark class applied', () => {
    render(
      <ThemeProvider>
        <Consumidor />
      </ThemeProvider>
    );
    expect(screen.getByText('claro')).toBeInTheDocument();
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('toggling adds the dark class and persists the preference', async () => {
    render(
      <ThemeProvider>
        <Consumidor />
      </ThemeProvider>
    );
    await userEvent.click(screen.getByText('alternar'));
    expect(screen.getByText('oscuro')).toBeInTheDocument();
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(localStorage.getItem('cod_theme')).toBe('dark');
  });

  it('starts dark when cod_theme was previously saved as dark', () => {
    localStorage.setItem('cod_theme', 'dark');
    render(
      <ThemeProvider>
        <Consumidor />
      </ThemeProvider>
    );
    expect(screen.getByText('oscuro')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- ThemeContext.test.jsx`
Expected: FAIL — `Cannot find module './ThemeContext'`

- [ ] **Step 3: Write `frontend/src/context/ThemeContext.jsx`**

```jsx
import { createContext, useContext, useEffect, useState } from 'react';
import PropTypes from 'prop-types';

const ThemeContext = createContext(null);
const THEME_KEY = 'cod_theme';

export function ThemeProvider({ children }) {
  const [isDark, setIsDark] = useState(() => localStorage.getItem(THEME_KEY) === 'dark');

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
    localStorage.setItem(THEME_KEY, isDark ? 'dark' : 'light');
  }, [isDark]);

  function toggleTheme() {
    setIsDark((prev) => !prev);
  }

  return <ThemeContext.Provider value={{ isDark, toggleTheme }}>{children}</ThemeContext.Provider>;
}

ThemeProvider.propTypes = { children: PropTypes.node.isRequired };

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme debe usarse dentro de ThemeProvider');
  return context;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm test -- ThemeContext.test.jsx`
Expected: `PASS` (3 tests)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/context/ThemeContext.jsx frontend/src/context/ThemeContext.test.jsx
git commit -m "feat(frontend): add ThemeContext for dark mode"
```

---

### Task 13: `hooks/useViewMode` and `components/common/ViewToggle`

**Files:**
- Create: `frontend/src/hooks/useViewMode.js`
- Create: `frontend/src/components/common/ViewToggle.jsx`
- Test: `frontend/src/hooks/useViewMode.test.js`
- Test: `frontend/src/components/common/ViewToggle.test.jsx`

**Interfaces:**
- Produces: `useViewMode(storageKey)` → `{ modo, setModo, esVistaMovil }`. `modo` is `'lista'` by default (persisted per `storageKey` in `localStorage`), and is forced to `'tarjetas'` whenever the viewport is narrower than 768px, regardless of the stored preference (the preference itself is untouched — it's respected again once the viewport widens). Produces: `ViewToggle({ modo, onChange })` — two icon buttons (list/grid) that call `onChange('lista' | 'tarjetas')`.

- [ ] **Step 1: Write the failing test — `frontend/src/hooks/useViewMode.test.js`**

```jsx
import { renderHook, act } from '@testing-library/react';
import { useViewMode } from './useViewMode';

function setViewportWidth(width) {
  window.innerWidth = width;
  window.dispatchEvent(new Event('resize'));
}

describe('useViewMode', () => {
  beforeEach(() => {
    localStorage.clear();
    setViewportWidth(1280);
  });

  it('defaults to lista when nothing is stored', () => {
    const { result } = renderHook(() => useViewMode('cod_view_test'));
    expect(result.current.modo).toBe('lista');
    expect(result.current.esVistaMovil).toBe(false);
  });

  it('persists the chosen mode in localStorage under the given key', () => {
    const { result } = renderHook(() => useViewMode('cod_view_test'));
    act(() => result.current.setModo('tarjetas'));
    expect(result.current.modo).toBe('tarjetas');
    expect(localStorage.getItem('cod_view_test')).toBe('tarjetas');
  });

  it('forces tarjetas on mobile viewport regardless of the stored preference', () => {
    localStorage.setItem('cod_view_test', 'lista');
    const { result, rerender } = renderHook(() => useViewMode('cod_view_test'));
    expect(result.current.modo).toBe('lista');

    act(() => setViewportWidth(500));
    rerender();

    expect(result.current.modo).toBe('tarjetas');
    expect(result.current.esVistaMovil).toBe(true);
    expect(localStorage.getItem('cod_view_test')).toBe('lista');
  });
});
```

- [ ] **Step 2: Write the failing test — `frontend/src/components/common/ViewToggle.test.jsx`**

```jsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import ViewToggle from './ViewToggle';

describe('ViewToggle', () => {
  it('calls onChange with the clicked mode', async () => {
    const onChange = vi.fn();
    render(<ViewToggle modo="lista" onChange={onChange} />);
    await userEvent.click(screen.getByLabelText('Ver como tarjetas'));
    expect(onChange).toHaveBeenCalledWith('tarjetas');
  });

  it('marks the active mode as pressed', () => {
    render(<ViewToggle modo="tarjetas" onChange={vi.fn()} />);
    expect(screen.getByLabelText('Ver como tarjetas')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('Ver como lista')).toHaveAttribute('aria-pressed', 'false');
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd frontend && npm test -- useViewMode.test.js ViewToggle.test.jsx`
Expected: FAIL — modules not found

- [ ] **Step 4: Write `frontend/src/hooks/useViewMode.js`**

```js
import { useEffect, useState } from 'react';

const MOBILE_BREAKPOINT_PX = 768;

function esMobil() {
  return typeof window !== 'undefined' && window.innerWidth < MOBILE_BREAKPOINT_PX;
}

export function useViewMode(storageKey) {
  const [modoGuardado, setModoGuardado] = useState(() => localStorage.getItem(storageKey) || 'lista');
  const [esVistaMovil, setEsVistaMovil] = useState(esMobil());

  useEffect(() => {
    function handleResize() {
      setEsVistaMovil(esMobil());
    }
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  function setModo(modo) {
    setModoGuardado(modo);
    localStorage.setItem(storageKey, modo);
  }

  const modoEfectivo = esVistaMovil ? 'tarjetas' : modoGuardado;

  return { modo: modoEfectivo, setModo, esVistaMovil };
}
```

- [ ] **Step 5: Write `frontend/src/components/common/ViewToggle.jsx`**

```jsx
import { List, LayoutGrid } from 'lucide-react';
import PropTypes from 'prop-types';

export default function ViewToggle({ modo, onChange }) {
  return (
    <div className="inline-flex rounded-xl border border-slate-200 dark:border-slate-600 overflow-hidden">
      <button
        type="button"
        onClick={() => onChange('lista')}
        aria-pressed={modo === 'lista'}
        aria-label="Ver como lista"
        className={`p-2 ${modo === 'lista' ? 'bg-orange-500 text-white' : 'bg-white dark:bg-centhrix-card text-slate-500 dark:text-slate-300'}`}
      >
        <List className="w-4 h-4" />
      </button>
      <button
        type="button"
        onClick={() => onChange('tarjetas')}
        aria-pressed={modo === 'tarjetas'}
        aria-label="Ver como tarjetas"
        className={`p-2 ${modo === 'tarjetas' ? 'bg-orange-500 text-white' : 'bg-white dark:bg-centhrix-card text-slate-500 dark:text-slate-300'}`}
      >
        <LayoutGrid className="w-4 h-4" />
      </button>
    </div>
  );
}

ViewToggle.propTypes = {
  modo: PropTypes.oneOf(['lista', 'tarjetas']).isRequired,
  onChange: PropTypes.func.isRequired,
};
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd frontend && npm test -- useViewMode.test.js ViewToggle.test.jsx`
Expected: `PASS` (5 tests)

- [ ] **Step 7: Commit**

```bash
git add frontend/src/hooks/useViewMode.js frontend/src/hooks/useViewMode.test.js frontend/src/components/common/ViewToggle.jsx frontend/src/components/common/ViewToggle.test.jsx
git commit -m "feat(frontend): add useViewMode hook and ViewToggle component"
```

---

### Task 14: `components/layout` — `FloatingHeader`, `Sidebar`, `ProtectedLayout`

**Files:**
- Create: `frontend/src/components/layout/FloatingHeader.jsx`
- Create: `frontend/src/components/layout/Sidebar.jsx`
- Create: `frontend/src/components/layout/ProtectedLayout.jsx`
- Test: `frontend/src/components/layout/FloatingHeader.test.jsx`
- Test: `frontend/src/components/layout/Sidebar.test.jsx`

**Interfaces:**
- Consumes: `useAuth()` (Task 6), `useTheme()` (Task 12).
- Produces: `FloatingHeader({ onToggleSidebar, currentPath })` — shows the current module's title, a sidebar-toggle button, a theme toggle, and the user menu (name, rol, logout). Produces: `Sidebar({ collapsed })` — one `NavLink` per module the user has `'ver'` on (per `MODULOS`' real backend catalog keys — `inicio`, `areas`, `documentos`, `solicitudes`, `proveedores`, `formularios`, `reportes` — plus `administracion`, shown only if the user has `'ver'` on any of `usuarios`/`roles`/`matriz_accesos`/`sesiones`/`auditoria`). Produces: `ProtectedLayout` — composes both plus `<Outlet />`, used as the element for the authenticated route subtree in Task 15.

- [ ] **Step 1: Write the failing test — `frontend/src/components/layout/FloatingHeader.test.jsx`**

```jsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import FloatingHeader from './FloatingHeader';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';

vi.mock('../../context/AuthContext');
vi.mock('../../context/ThemeContext');

describe('FloatingHeader', () => {
  beforeEach(() => {
    useAuth.mockReturnValue({ user: { nombre: 'Ana', rol: 'admin' }, logout: vi.fn() });
    useTheme.mockReturnValue({ isDark: false, toggleTheme: vi.fn() });
  });

  it('renders the module title for the current path', () => {
    render(<FloatingHeader onToggleSidebar={vi.fn()} currentPath="/areas" />);
    expect(screen.getByText('Áreas')).toBeInTheDocument();
  });

  it('calls onToggleSidebar when the menu button is clicked', async () => {
    const onToggleSidebar = vi.fn();
    render(<FloatingHeader onToggleSidebar={onToggleSidebar} currentPath="/inicio" />);
    await userEvent.click(screen.getByLabelText('Alternar menú lateral'));
    expect(onToggleSidebar).toHaveBeenCalledTimes(1);
  });

  it('calls toggleTheme when the theme button is clicked', async () => {
    const toggleTheme = vi.fn();
    useTheme.mockReturnValue({ isDark: false, toggleTheme });
    render(<FloatingHeader onToggleSidebar={vi.fn()} currentPath="/inicio" />);
    await userEvent.click(screen.getByLabelText('Cambiar a tema oscuro'));
    expect(toggleTheme).toHaveBeenCalledTimes(1);
  });

  it('calls logout when the logout button is clicked', async () => {
    const logout = vi.fn();
    useAuth.mockReturnValue({ user: { nombre: 'Ana', rol: 'admin' }, logout });
    render(<FloatingHeader onToggleSidebar={vi.fn()} currentPath="/inicio" />);
    await userEvent.click(screen.getByLabelText('Cerrar sesión'));
    expect(logout).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Write the failing test — `frontend/src/components/layout/Sidebar.test.jsx`**

```jsx
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import Sidebar from './Sidebar';
import { useAuth } from '../../context/AuthContext';

vi.mock('../../context/AuthContext');

describe('Sidebar', () => {
  it('shows only the modules the user has ver on', () => {
    useAuth.mockReturnValue({
      tienePermiso: (modulo, accion) => accion === 'ver' && ['inicio', 'areas'].includes(modulo),
    });
    render(<Sidebar collapsed={false} />, { wrapper: MemoryRouter });

    expect(screen.getByText('Inicio')).toBeInTheDocument();
    expect(screen.getByText('Áreas')).toBeInTheDocument();
    expect(screen.queryByText('Documentos')).not.toBeInTheDocument();
    expect(screen.queryByText('Administración')).not.toBeInTheDocument();
  });

  it('shows Administración when the user has ver on any admin sub-module', () => {
    useAuth.mockReturnValue({
      tienePermiso: (modulo, accion) => accion === 'ver' && ['inicio', 'auditoria'].includes(modulo),
    });
    render(<Sidebar collapsed={false} />, { wrapper: MemoryRouter });

    expect(screen.getByText('Administración')).toBeInTheDocument();
  });

  it('hides labels when collapsed', () => {
    useAuth.mockReturnValue({ tienePermiso: () => true });
    render(<Sidebar collapsed />, { wrapper: MemoryRouter });
    expect(screen.queryByText('Inicio')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd frontend && npm test -- FloatingHeader.test.jsx Sidebar.test.jsx`
Expected: FAIL — modules not found

- [ ] **Step 4: Write `frontend/src/components/layout/FloatingHeader.jsx`**

```jsx
import { Menu, LogOut, Moon, Sun, UserCircle } from 'lucide-react';
import PropTypes from 'prop-types';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';

const TITULOS_MODULO = {
  '/inicio': 'Inicio',
  '/areas': 'Áreas',
  '/documentos': 'Documentos',
  '/solicitudes': 'Solicitudes',
  '/proveedores': 'Proveedores y contratistas',
  '/formularios': 'Formularios',
  '/reportes': 'Reportes',
  '/administracion': 'Administración',
};

export default function FloatingHeader({ onToggleSidebar, currentPath }) {
  const { user, logout } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const titulo = TITULOS_MODULO[currentPath] || 'COD';

  return (
    <header className="fixed top-4 left-4 right-4 z-40 bg-white/90 dark:bg-centhrix-card/90 backdrop-blur-md rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 px-4 py-3 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onToggleSidebar}
          aria-label="Alternar menú lateral"
          className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-centhrix-surface text-slate-600 dark:text-slate-300"
        >
          <Menu className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-display font-semibold text-slate-800 dark:text-slate-100">{titulo}</h1>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={toggleTheme}
          aria-label={isDark ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
          className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-centhrix-surface text-slate-600 dark:text-slate-300"
        >
          {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
        </button>

        <div className="flex items-center gap-2 pl-2 border-l border-slate-200 dark:border-slate-600">
          <UserCircle className="w-6 h-6 text-slate-400" />
          <div className="hidden sm:block text-sm">
            <p className="font-medium text-slate-700 dark:text-slate-200">{user?.nombre}</p>
            <p className="text-xs text-slate-400 dark:text-slate-500">{user?.rol}</p>
          </div>
          <button
            type="button"
            onClick={logout}
            aria-label="Cerrar sesión"
            className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-centhrix-surface text-slate-600 dark:text-slate-300"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </div>
    </header>
  );
}

FloatingHeader.propTypes = {
  onToggleSidebar: PropTypes.func.isRequired,
  currentPath: PropTypes.string.isRequired,
};
```

- [ ] **Step 5: Write `frontend/src/components/layout/Sidebar.jsx`**

```jsx
import { NavLink } from 'react-router-dom';
import PropTypes from 'prop-types';
import { Home, Building2, FileText, ClipboardList, Truck, FileSpreadsheet, BarChart3, Settings } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

const MODULOS = [
  { path: '/inicio', label: 'Inicio', icon: Home, modulo: 'inicio' },
  { path: '/areas', label: 'Áreas', icon: Building2, modulo: 'areas' },
  { path: '/documentos', label: 'Documentos', icon: FileText, modulo: 'documentos' },
  { path: '/solicitudes', label: 'Solicitudes', icon: ClipboardList, modulo: 'solicitudes' },
  { path: '/proveedores', label: 'Proveedores', icon: Truck, modulo: 'proveedores' },
  { path: '/formularios', label: 'Formularios', icon: FileSpreadsheet, modulo: 'formularios' },
  { path: '/reportes', label: 'Reportes', icon: BarChart3, modulo: 'reportes' },
  { path: '/administracion', label: 'Administración', icon: Settings, modulo: 'administracion' },
];

const ADMIN_SUBMODULOS = ['usuarios', 'roles', 'matriz_accesos', 'sesiones', 'auditoria'];

export default function Sidebar({ collapsed }) {
  const { tienePermiso } = useAuth();

  const modulosVisibles = MODULOS.filter(({ modulo }) => {
    if (modulo === 'administracion') {
      return ADMIN_SUBMODULOS.some((sub) => tienePermiso(sub, 'ver'));
    }
    return tienePermiso(modulo, 'ver');
  });

  return (
    <aside
      className={`fixed top-24 left-4 bottom-4 z-30 bg-white dark:bg-centhrix-card rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 transition-all duration-200 ${collapsed ? 'w-16' : 'w-56'} overflow-y-auto`}
    >
      <nav aria-label="Navegación principal" className="p-2 flex flex-col gap-1">
        {modulosVisibles.map(({ path, label, icon: Icon }) => (
          <NavLink
            key={path}
            to={path}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-orange-500 text-white'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-centhrix-surface'
              }`
            }
          >
            <Icon className="w-5 h-5 shrink-0" />
            {!collapsed && <span>{label}</span>}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}

Sidebar.propTypes = { collapsed: PropTypes.bool.isRequired };
```

- [ ] **Step 6: Write `frontend/src/components/layout/ProtectedLayout.jsx`**

```jsx
import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import FloatingHeader from './FloatingHeader';
import Sidebar from './Sidebar';

export default function ProtectedLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-centhrix-bg dark:to-centhrix-bg">
      <FloatingHeader onToggleSidebar={() => setCollapsed((prev) => !prev)} currentPath={location.pathname} />
      <Sidebar collapsed={collapsed} />
      <main className={`pt-28 pb-8 px-4 transition-all duration-200 ${collapsed ? 'pl-24' : 'pl-64'}`}>
        <div className="max-w-[1400px] mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd frontend && npm test -- FloatingHeader.test.jsx Sidebar.test.jsx`
Expected: `PASS` (7 tests)

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/layout
git commit -m "feat(frontend): add FloatingHeader, Sidebar, and ProtectedLayout"
```

---

### Task 15: Login page, `ProximamentePage`, and full router wiring in `App.jsx`

**Files:**
- Create: `frontend/src/pages/auth/Login.jsx`
- Create: `frontend/src/pages/proximamente/ProximamentePage.jsx`
- Modify: `frontend/src/App.jsx`
- Test: `frontend/src/pages/auth/Login.test.jsx`
- Test: `frontend/src/pages/proximamente/ProximamentePage.test.jsx`

**Interfaces:**
- Consumes: `useAuth()` (Task 6), `Button`/`Input` (Task 7), `PrivateRoute`/`PermissionRoute` (Task 11), `ProtectedLayout` (Task 14).
- Produces: `Login` — on successful `login()`, navigates to `location.state.from.pathname` or `/inicio`. Produces: `ProximamentePage({ nombre })` — shared placeholder for the 6 not-yet-built modules plus `/administracion`. Produces: the full route tree in `App.jsx` — `/login` public; everything else behind `PrivateRoute` + `ProtectedLayout`, with `/areas` and the 6 placeholder module routes additionally behind `PermissionRoute`.

- [ ] **Step 1: Write the failing test — `frontend/src/pages/auth/Login.test.jsx`**

```jsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { vi } from 'vitest';
import Login from './Login';
import { useAuth } from '../../context/AuthContext';

vi.mock('../../context/AuthContext');

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/inicio" element={<p>Panel de inicio</p>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('Login', () => {
  it('shows validation errors when submitted empty', async () => {
    useAuth.mockReturnValue({ login: vi.fn() });
    renderLogin();
    await userEvent.click(screen.getByRole('button', { name: 'Ingresar' }));
    expect(await screen.findByText('El usuario es obligatorio')).toBeInTheDocument();
    expect(screen.getByText('La contraseña es obligatoria')).toBeInTheDocument();
  });

  it('navigates to /inicio after a successful login', async () => {
    const login = vi.fn().mockResolvedValue({ username: 'admin' });
    useAuth.mockReturnValue({ login });
    renderLogin();

    await userEvent.type(screen.getByLabelText('Usuario'), 'admin');
    await userEvent.type(screen.getByLabelText('Contraseña'), 'CambiarAhora123!');
    await userEvent.click(screen.getByRole('button', { name: 'Ingresar' }));

    await waitFor(() => expect(screen.getByText('Panel de inicio')).toBeInTheDocument());
    expect(login).toHaveBeenCalledWith('admin', 'CambiarAhora123!');
  });

  it('shows the API error message on failed login', async () => {
    const login = vi.fn().mockRejectedValue({ message: 'Usuario o contraseña incorrectos' });
    useAuth.mockReturnValue({ login });
    renderLogin();

    await userEvent.type(screen.getByLabelText('Usuario'), 'admin');
    await userEvent.type(screen.getByLabelText('Contraseña'), 'mala');
    await userEvent.click(screen.getByRole('button', { name: 'Ingresar' }));

    expect(await screen.findByText('Usuario o contraseña incorrectos')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Write the failing test — `frontend/src/pages/proximamente/ProximamentePage.test.jsx`**

```jsx
import { render, screen } from '@testing-library/react';
import ProximamentePage from './ProximamentePage';

describe('ProximamentePage', () => {
  it('renders the module name and an in-construction message', () => {
    render(<ProximamentePage nombre="Documentos" />);
    expect(screen.getByText('Documentos')).toBeInTheDocument();
    expect(screen.getByText('Módulo en construcción.')).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd frontend && npm test -- Login.test.jsx ProximamentePage.test.jsx`
Expected: FAIL — modules not found

- [ ] **Step 4: Write `frontend/src/pages/auth/Login.jsx`**

```jsx
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import Button from '../../components/common/Button/Button';
import Input from '../../components/common/Input/Input';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [errorApi, setErrorApi] = useState('');
  const [enviando, setEnviando] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm();

  async function onSubmit({ username, password }) {
    setErrorApi('');
    setEnviando(true);
    try {
      await login(username, password);
      const destino = location.state?.from?.pathname || '/inicio';
      navigate(destino, { replace: true });
    } catch (error) {
      setErrorApi(error?.message || 'Usuario o contraseña incorrectos');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-centhrix-bg dark:to-centhrix-bg px-4">
      <div className="w-full max-w-sm bg-white dark:bg-centhrix-card rounded-2xl shadow-lg border border-gray-100 dark:border-slate-700 p-8">
        <h1 className="text-2xl font-display font-bold text-slate-800 dark:text-slate-100 mb-1 text-center">COD</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 text-center mb-6">Centro Operativo Documental</p>

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          <Input label="Usuario" error={errors.username?.message} {...register('username', { required: 'El usuario es obligatorio' })} />
          <Input
            label="Contraseña"
            type="password"
            error={errors.password?.message}
            {...register('password', { required: 'La contraseña es obligatoria' })}
          />

          {errorApi && (
            <p role="alert" className="text-sm text-red-500">
              {errorApi}
            </p>
          )}

          <Button type="submit" fullWidth loading={enviando}>
            Ingresar
          </Button>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Write `frontend/src/pages/proximamente/ProximamentePage.jsx`**

```jsx
import PropTypes from 'prop-types';
import { Construction } from 'lucide-react';

export default function ProximamentePage({ nombre }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="w-16 h-16 bg-white dark:bg-centhrix-surface rounded-full flex items-center justify-center shadow-sm mb-4">
        <Construction className="w-8 h-8 text-slate-400 dark:text-slate-500" />
      </div>
      <h2 className="text-xl font-display font-semibold text-slate-800 dark:text-slate-100 mb-1">{nombre}</h2>
      <p className="text-sm text-slate-500 dark:text-slate-400">Módulo en construcción.</p>
    </div>
  );
}

ProximamentePage.propTypes = { nombre: PropTypes.string.isRequired };
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd frontend && npm test -- Login.test.jsx ProximamentePage.test.jsx`
Expected: `PASS` (4 tests)

- [ ] **Step 7: Replace `frontend/src/App.jsx` with the full route tree**

This replaces Task 1's placeholder `App.jsx` entirely — `AreasListado`/`Dashboard` don't exist yet (Tasks 16–17 create them), so this step alone will fail to compile until those land; that's expected and resolved by Step 8 below re-running the whole suite only after Task 17.

```jsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { SnackbarProvider } from 'notistack';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { PrivateRoute } from './components/auth/PrivateRoute';
import { PermissionRoute } from './components/auth/PermissionRoute';
import ProtectedLayout from './components/layout/ProtectedLayout';
import Login from './pages/auth/Login';
import Dashboard from './pages/inicio/Dashboard';
import AreasListado from './pages/areas/AreasListado';
import ProximamentePage from './pages/proximamente/ProximamentePage';

function App() {
  return (
    <AuthProvider>
      <ThemeProvider>
        <SnackbarProvider maxSnack={3}>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<Login />} />

              <Route
                element={
                  <PrivateRoute>
                    <ProtectedLayout />
                  </PrivateRoute>
                }
              >
                <Route path="/" element={<Navigate to="/inicio" replace />} />
                <Route path="/inicio" element={<Dashboard />} />
                <Route
                  path="/areas"
                  element={
                    <PermissionRoute modulo="areas" accion="ver">
                      <AreasListado />
                    </PermissionRoute>
                  }
                />
                <Route
                  path="/documentos"
                  element={
                    <PermissionRoute modulo="documentos" accion="ver">
                      <ProximamentePage nombre="Documentos" />
                    </PermissionRoute>
                  }
                />
                <Route
                  path="/solicitudes"
                  element={
                    <PermissionRoute modulo="solicitudes" accion="ver">
                      <ProximamentePage nombre="Solicitudes" />
                    </PermissionRoute>
                  }
                />
                <Route
                  path="/proveedores"
                  element={
                    <PermissionRoute modulo="proveedores" accion="ver">
                      <ProximamentePage nombre="Proveedores y contratistas" />
                    </PermissionRoute>
                  }
                />
                <Route
                  path="/formularios"
                  element={
                    <PermissionRoute modulo="formularios" accion="ver">
                      <ProximamentePage nombre="Formularios" />
                    </PermissionRoute>
                  }
                />
                <Route
                  path="/reportes"
                  element={
                    <PermissionRoute modulo="reportes" accion="ver">
                      <ProximamentePage nombre="Reportes" />
                    </PermissionRoute>
                  }
                />
                <Route path="/administracion" element={<ProximamentePage nombre="Administración" />} />
              </Route>

              <Route path="*" element={<Navigate to="/inicio" replace />} />
            </Routes>
          </BrowserRouter>
        </SnackbarProvider>
      </ThemeProvider>
    </AuthProvider>
  );
}

export default App;
```

Note: `/administracion` is gated only by the outer `PrivateRoute` (any authenticated user reaches the placeholder) rather than a `PermissionRoute`, since there is no single `administracion` catalog key on the backend (see Global Constraints) — real per-sub-section permission enforcement arrives when Administración's actual sub-pages are built.

- [ ] **Step 8: Delete the now-obsolete `frontend/src/App.test.jsx`**

Task 1's smoke test asserted on the placeholder `<div>COD</div>` markup, which no longer exists. Remove it — `Login.test.jsx`, `Dashboard.test.jsx` (Task 16), and `AreasListado.test.jsx` (Task 17) cover the routes it used to stand in for.

Run: `rm frontend/src/App.test.jsx` (or delete via your editor)

- [ ] **Step 9: Commit**

This task's full test suite only goes green once Tasks 16–17 (`Dashboard`, `AreasListado`) exist — commit Steps 1–8 now, and run the complete verification in Task 17's Step 8 (full suite) once every page exists.

```bash
git add frontend/src/pages/auth/Login.jsx frontend/src/pages/auth/Login.test.jsx frontend/src/pages/proximamente frontend/src/App.jsx
git rm frontend/src/App.test.jsx
git commit -m "feat(frontend): add Login page, ProximamentePage, and full route tree"
```

---

### Task 16: Dashboard Inicio (sample KPIs)

**Files:**
- Create: `frontend/src/pages/inicio/Dashboard.jsx`
- Test: `frontend/src/pages/inicio/Dashboard.test.jsx`

**Interfaces:**
- Consumes: `KpiCard` (Task 9).
- Produces: `Dashboard` — renders 3 `KpiCard`s with fixed sample values (aprobaciones pendientes, alertas de vigencia documental, % documentos al día) and a small "Datos de muestra" badge, per the design spec's explicit decision to mock all three rather than mix real Área data into this page.

- [ ] **Step 1: Write the failing test — `frontend/src/pages/inicio/Dashboard.test.jsx`**

```jsx
import { render, screen } from '@testing-library/react';
import Dashboard from './Dashboard';

describe('Dashboard', () => {
  it('renders the three sample KPI cards labeled as sample data', () => {
    render(<Dashboard />);
    expect(screen.getByText('Aprobaciones pendientes')).toBeInTheDocument();
    expect(screen.getByText('Alertas de vigencia documental')).toBeInTheDocument();
    expect(screen.getByText('% documentos al día')).toBeInTheDocument();
    expect(screen.getByText('Datos de muestra')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- Dashboard.test.jsx`
Expected: FAIL — `Cannot find module './Dashboard'`

- [ ] **Step 3: Write `frontend/src/pages/inicio/Dashboard.jsx`**

```jsx
import { ClipboardList, AlertTriangle, CheckCircle2 } from 'lucide-react';
import KpiCard from '../../components/common/Card/KpiCard';

const KPIS_DE_MUESTRA = [
  {
    titulo: 'Aprobaciones pendientes',
    valor: 4,
    icono: ClipboardList,
    iconBg: 'bg-violet-100 dark:bg-violet-900/30',
    iconColor: 'text-violet-600 dark:text-violet-400',
  },
  {
    titulo: 'Alertas de vigencia documental',
    valor: 7,
    icono: AlertTriangle,
    iconBg: 'bg-amber-100 dark:bg-amber-900/30',
    iconColor: 'text-amber-600 dark:text-amber-400',
  },
  {
    titulo: '% documentos al día',
    valor: '82%',
    icono: CheckCircle2,
    iconBg: 'bg-emerald-100 dark:bg-emerald-900/30',
    iconColor: 'text-emerald-600 dark:text-emerald-400',
  },
];

export default function Dashboard() {
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-display font-semibold text-slate-800 dark:text-slate-100">Inicio</h2>
        <span className="text-xs px-2.5 py-1 rounded-full bg-slate-100 dark:bg-centhrix-surface text-slate-500 dark:text-slate-400">
          Datos de muestra
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {KPIS_DE_MUESTRA.map((kpi) => (
          <KpiCard key={kpi.titulo} title={kpi.titulo} value={kpi.valor} icon={kpi.icono} iconBg={kpi.iconBg} iconColor={kpi.iconColor} />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm test -- Dashboard.test.jsx`
Expected: `PASS` (1 test)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/inicio
git commit -m "feat(frontend): add Dashboard Inicio with sample KPIs"
```

---

### Task 17: Áreas — real page (list/card view, create modal, admin-only)

**Files:**
- Create: `frontend/src/pages/areas/AreasListado.jsx`
- Test: `frontend/src/pages/areas/AreasListado.test.jsx`

**Interfaces:**
- Consumes: `areaService` (Task 5), `useAuth()` (Task 6), `useViewMode` (Task 13), `Button`/`Input`/`Modal`/`EmptyState`/`DataTable`/`StatusChip`/`ViewToggle` (Tasks 7–10, 13).
- Produces: `AreasListado` — the last page this plan builds; wired into `App.jsx` already (Task 15) behind `PermissionRoute modulo="areas" accion="ver"`.

- [ ] **Step 1: Write the failing test — `frontend/src/pages/areas/AreasListado.test.jsx`**

```jsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { SnackbarProvider } from 'notistack';
import AreasListado from './AreasListado';
import areaService from '../../api/area.service';
import { useAuth } from '../../context/AuthContext';

vi.mock('../../api/area.service');
vi.mock('../../context/AuthContext');

function renderPagina() {
  return render(
    <SnackbarProvider>
      <AreasListado />
    </SnackbarProvider>
  );
}

describe('AreasListado', () => {
  beforeEach(() => {
    localStorage.clear();
    window.innerWidth = 1280;
  });

  it('renders the empty state when there are no areas', async () => {
    useAuth.mockReturnValue({ isAdmin: false });
    areaService.listar.mockResolvedValue([]);
    renderPagina();
    expect(await screen.findByText('Sin áreas todavía')).toBeInTheDocument();
  });

  it('renders areas in list view by default', async () => {
    useAuth.mockReturnValue({ isAdmin: false });
    areaService.listar.mockResolvedValue([{ id: 1, nombre: 'Financiera', codigo: 'FIN', saludDocumentalPct: '92.0' }]);
    renderPagina();
    expect(await screen.findByText('Financiera')).toBeInTheDocument();
    expect(screen.getByText('92.0%')).toBeInTheDocument();
  });

  it('hides the "Crear área" button for non-admins', async () => {
    useAuth.mockReturnValue({ isAdmin: false });
    areaService.listar.mockResolvedValue([]);
    renderPagina();
    await screen.findByText('Sin áreas todavía');
    expect(screen.queryByRole('button', { name: /crear área/i })).not.toBeInTheDocument();
  });

  it('shows the "Crear área" button for admins and creates an area on submit', async () => {
    useAuth.mockReturnValue({ isAdmin: true });
    areaService.listar.mockResolvedValue([]);
    areaService.crear.mockResolvedValue({ id: 1, nombre: 'SGI', codigo: 'SGI' });
    renderPagina();

    await screen.findByText('Sin áreas todavía');
    await userEvent.click(screen.getByRole('button', { name: /crear área/i }));

    await userEvent.type(screen.getByLabelText('Nombre'), 'SGI');
    await userEvent.type(screen.getByLabelText('Código'), 'SGI');

    areaService.listar.mockResolvedValue([{ id: 1, nombre: 'SGI', codigo: 'SGI', saludDocumentalPct: '100.0' }]);
    await userEvent.click(screen.getByRole('button', { name: 'Crear' }));

    await waitFor(() => expect(areaService.crear).toHaveBeenCalledWith({ nombre: 'SGI', codigo: 'SGI' }));
    expect(await screen.findByText('SGI')).toBeInTheDocument();
    expect(await screen.findByText('Área creada exitosamente')).toBeInTheDocument();
  });

  it('switches to tarjetas view via ViewToggle', async () => {
    useAuth.mockReturnValue({ isAdmin: false });
    areaService.listar.mockResolvedValue([{ id: 1, nombre: 'Financiera', codigo: 'FIN', saludDocumentalPct: '30.0' }]);
    renderPagina();

    await screen.findByText('Financiera');
    await userEvent.click(screen.getByLabelText('Ver como tarjetas'));

    expect(screen.getByText('30.0% al día')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- AreasListado.test.jsx`
Expected: FAIL — `Cannot find module './AreasListado'`

- [ ] **Step 3: Write `frontend/src/pages/areas/AreasListado.jsx`**

```jsx
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useSnackbar } from 'notistack';
import { Plus, Building2 } from 'lucide-react';
import areaService from '../../api/area.service';
import { useAuth } from '../../context/AuthContext';
import { useViewMode } from '../../hooks/useViewMode';
import Button from '../../components/common/Button/Button';
import Input from '../../components/common/Input/Input';
import Modal from '../../components/common/Modal/Modal';
import EmptyState from '../../components/common/EmptyState/EmptyState';
import DataTable from '../../components/common/Table/DataTable';
import ViewToggle from '../../components/common/ViewToggle';
import StatusChip from '../../components/common/StatusChip/StatusChip';

function nivelSalud(pct) {
  const valor = Number(pct);
  if (valor >= 80) return 'saludable';
  if (valor >= 50) return 'atencion';
  return 'critico';
}

function AreaCard({ area }) {
  return (
    <div className="bg-white dark:bg-centhrix-card rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-slate-700">
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="font-semibold text-slate-800 dark:text-slate-100">{area.nombre}</p>
          <p className="text-xs text-slate-400 dark:text-slate-500">{area.codigo}</p>
        </div>
        <Building2 className="w-8 h-8 text-slate-300 dark:text-slate-600" />
      </div>
      <StatusChip status={nivelSalud(area.saludDocumentalPct)} customLabel={`${area.saludDocumentalPct}% al día`} />
    </div>
  );
}

export default function AreasListado() {
  const { isAdmin } = useAuth();
  const { enqueueSnackbar } = useSnackbar();
  const { modo, setModo, esVistaMovil } = useViewMode('cod_view_areas');
  const [areas, setAreas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [modalAbierto, setModalAbierto] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm();

  async function cargarAreas() {
    setCargando(true);
    const data = await areaService.listar();
    setAreas(data);
    setCargando(false);
  }

  useEffect(() => {
    cargarAreas();
  }, []);

  async function onCrear({ nombre, codigo }) {
    await areaService.crear({ nombre, codigo });
    enqueueSnackbar('Área creada exitosamente', { variant: 'success' });
    reset();
    setModalAbierto(false);
    await cargarAreas();
  }

  const columnas = [
    { key: 'nombre', label: 'Nombre' },
    { key: 'codigo', label: 'Código' },
    {
      key: 'saludDocumentalPct',
      label: 'Salud documental',
      render: (valor) => <StatusChip status={nivelSalud(valor)} customLabel={`${valor}%`} />,
    },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-display font-semibold text-slate-800 dark:text-slate-100">Áreas</h2>
        <div className="flex items-center gap-3">
          {!esVistaMovil && <ViewToggle modo={modo} onChange={setModo} />}
          {isAdmin && (
            <Button icon={Plus} onClick={() => setModalAbierto(true)}>
              Crear área
            </Button>
          )}
        </div>
      </div>

      {!cargando && areas.length === 0 && (
        <EmptyState icon={Building2} title="Sin áreas todavía" description="Crea la primera área para empezar a organizar documentos y solicitudes." />
      )}

      {areas.length > 0 && modo === 'lista' && <DataTable columns={columnas} data={areas} loading={cargando} emptyMessage="Sin áreas todavía" />}

      {areas.length > 0 && modo === 'tarjetas' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {areas.map((area) => (
            <AreaCard key={area.id} area={area} />
          ))}
        </div>
      )}

      <Modal
        isOpen={modalAbierto}
        onClose={() => setModalAbierto(false)}
        title="Crear área"
        footer={
          <>
            <Button variant="outline" onClick={() => setModalAbierto(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit(onCrear)}>Crear</Button>
          </>
        }
      >
        <form className="space-y-4">
          <Input label="Nombre" error={errors.nombre?.message} {...register('nombre', { required: 'El nombre es obligatorio' })} />
          <Input label="Código" error={errors.codigo?.message} {...register('codigo', { required: 'El código es obligatorio' })} />
        </form>
      </Modal>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm test -- AreasListado.test.jsx`
Expected: `PASS` (5 tests)

- [ ] **Step 5: Verify the full route tree from Task 15 now compiles**

Run: `cd frontend && npm run build`
Expected: build succeeds with no errors (this is the first point at which `App.jsx`'s imports of `Dashboard` and `AreasListado`, both now created, actually resolve).

- [ ] **Step 6: Manual smoke check**

Run: `cd frontend && npm run dev` (in one terminal) and `cd server && npm run dev` (in another, if not already running)
Expected: visiting `http://localhost:5173/` redirects to `/login`; logging in as `admin` / the seeded password redirects to `/inicio` showing the 3 sample KPI cards; the Sidebar shows all 8 modules for `admin`; clicking "Áreas" shows the list view with any seeded areas and a working "Crear área" button; clicking each of the other 6 modules shows their "Módulo en construcción" placeholder. Stop both dev servers once confirmed (e.g. Ctrl+C).

- [ ] **Step 7: Run the complete frontend test suite**

Run: `cd frontend && npm test`
Expected: all suites `PASS` — this is the first run of every test written across Tasks 1–17 together.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/pages/areas
git commit -m "feat(frontend): add real Áreas page with list/card view and admin-gated creation"
```

---

### Task 18: Documentation and final verification

**Files:**
- Modify: `README.md`

**Interfaces:** none (documentation + verification only).

- [ ] **Step 1: Update `README.md`'s "Documentación" and add a "Frontend" section**

Modify `README.md`: add a line under "Documentación" pointing at this plan's design spec, and add a `## Frontend (\`frontend/\`)` section (mirroring the existing `## Backend (\`server/\`)` section) with:

```markdown
- Diseño del frontend (scaffold, auth, layout, Dashboard Inicio, Áreas): `docs/superpowers/specs/2026-07-06-cod-frontend-foundation-design.md`
```

and:

````markdown
## Frontend (`frontend/`)

```bash
cd frontend
npm install
cp .env.example .env   # ajustar VITE_API_URL si el backend no corre en localhost:5000
npm run dev
```

Tests:

```bash
cd frontend
npm test
```
````

- [ ] **Step 2: Run both test suites once more, back to back, to confirm neither broke the other**

Run: `cd server && npm test`
Expected: all suites `PASS`

Run: `cd frontend && npm test`
Expected: all suites `PASS`

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: add frontend setup instructions and design spec link"
```

---

## Not covered by this plan (deliberately out of scope)

- Real pages for Documentos, Solicitudes, Proveedores, Formularios, Reportes, Administración, and the área-detail drill-down — all remain the shared `ProximamentePage` placeholder.
- The mandatory password-change flow for `requiereCambioPassword` — explicitly deferred per the design spec.
- Global search, notifications, and CRM-style keyboard shortcuts.
- Resolving `Area.liderUsuarioId` to a user's name anywhere in the UI — no users-listing endpoint exists yet.
- `crmClient.js` — only documented (`docs/architecture/crm-integration.md`), not implemented.
- Deployment/CI for the frontend (Vercel or otherwise).

