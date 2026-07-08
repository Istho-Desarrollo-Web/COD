# COD Usuario al Crear Área Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Usuarios CRUD module (backend + `Administración > Usuarios` screen) and integrate it into Área creation, letting an admin assign a líder either by creating a new user inline or picking an existing one — all inside a single database transaction.

**Architecture:** Follow the Áreas/Documentos modules' established patterns exactly (service/controller/routes layering on the backend, `useForm` + `Modal` + `useViewMode` on the frontend). Two small pieces of infrastructure not in the original spec text turned out to be required and are called out explicitly below: a read-only `GET /roles` catalog endpoint (the Rol `<select>` needs data from somewhere, same pattern as the existing read-only `GET /tipos-documento`), and a minimal `AdministracionInicio.jsx` hub page (today `/administracion` is a single flat placeholder with no internal links, so the new `/administracion/usuarios` route would otherwise be unreachable from the UI).

**Tech Stack:** Express, Sequelize (MySQL), `bcryptjs`, `sequelize.transaction()` (first use in this codebase); React 19, react-hook-form, react-router-dom 7, Vitest + Testing Library + axios-mock-adapter.

## Global Constraints

- Every new backend module follows the exact layering already used by Área/Documento: `services/`, `controllers/`, `routes/`, mounted in `server/src/routes/index.js`.
- Password hashing uses `bcryptjs` with cost factor `10`, exactly matching `seedRolesPermisos.js` and `auth.service.js`.
- `Usuario`'s `defaultScope` excludes `passwordHash` from every `find*` query (`findAll`/`findByPk`/`findOne`) — never add `.unscoped()` in the new Usuario CRUD code. **This exclusion does NOT apply to instances returned by `.create()` or after calling `.update()` on an already-loaded instance** — Sequelize builds those in-memory from the values you explicitly passed, bypassing the scope's attribute filter entirely, so an instance you just set `passwordHash` on will still carry it in `.toJSON()`. Whenever a request sets or changes `passwordHash` (`crear`, and `editar` when a new `password` is supplied), re-fetch the record with a plain `Usuario.findByPk(id)` before building the response or the audit payload, so the scoped (hash-free) copy is what gets serialized. The hash must never appear in any HTTP response or audit log entry.
- Duplicate `username`/`email` (already `unique: true` on the model) must surface as HTTP 409 exactly like the existing `codigo` duplicate handling on Área — this already works for free via the global error handler in `server.js` (`SequelizeUniqueConstraintError` → `conflict()`), no new error-handling code needed.
- The `usuarios` and `roles` permission modules already exist in full in `Permiso.js`'s `CATALOGO_MODULOS` (`usuarios: ['ver','crear','editar','eliminar']`, `roles: ['ver','crear','editar','eliminar']`), and `seedRolesPermisos.js`'s `admin` role is assigned the ENTIRE `CATALOGO_MODULOS` object directly (`admin: CATALOGO_MODULOS`) — admin already has `usuarios.*` and `roles.ver` with zero seed changes required. Do not modify `seedRolesPermisos.js`.
- Frontend permission gating uses `tienePermiso('usuarios', accion)` per action (`ver`/`crear`/`editar`/`eliminar`) — never `isAdmin`.
- Área creation (`POST /areas`) stays gated by the existing `soloAdmin` middleware — unchanged. Because only `admin` can reach this endpoint and `admin`'s permissions already cover `usuarios.*`, no additional permission check is added for the nested user-creation path inside that same request.
- `nuevoUsuario` and `liderUsuarioId` in the `POST /areas` body are mutually exclusive — sending both is a 400.
- The username is generated client-side only (`sugerirUsername(nombre, apellido)` — first letter of `nombre` + `apellido`, accents stripped, lowercased, no spaces) and is always editable before submit. The backend never generates or normalizes usernames — it only validates uniqueness via the existing unique constraint.
- `requiereCambioPassword` defaults to `true` whenever a new Usuario is created (both via the standalone Usuarios screen and via the inline "Usuario nuevo" flow in Crear Área) unless the request body explicitly overrides it.
- All new list/detail responses use the existing envelope (`success`/`created` from `utils/responses.js`) — no pagination needed for Usuarios or Roles (both are expected to stay small, matching how `tipos-documento` and `carpetas` are unpaginated today).
- Testing convention: backend — real-MySQL integration tests via `supertest` against the exported `app`, no mocks (see `server/tests/integration/area.routes.test.js` for the exact login/seed setup to copy). Frontend — Vitest + Testing Library + `axios-mock-adapter` for services, `vi.mock` for page-level tests, following `AreasListado.test.jsx`/`area.service.test.js`.
- Every new file ships with its test sibling in the same commit.

---

### Task 1: Read-only Roles endpoint

**Files:**
- Create: `server/src/controllers/rol.controller.js`
- Create: `server/src/routes/rol.routes.js`
- Modify: `server/src/routes/index.js`
- Test: `server/tests/integration/rol.routes.test.js`

**Interfaces:**
- Produces: `GET /api/v1/roles` → `{success, data: Rol[], message: null, errors: [], code: null}` where each `Rol` has `id`, `nombre`, `nivel`, `descripcion`, `activo`. Consumed by Task 4's `rol.service.js`.

- [ ] **Step 1: Write the failing test**

```js
// server/tests/integration/rol.routes.test.js
const request = require('supertest');
const { sequelize } = require('../../src/config/database');
const { createMigrator } = require('../../src/config/migrator');
const seedRolesPermisos = require('../../src/scripts/seedRolesPermisos');
const { app } = require('../../server');

let token;

beforeAll(async () => {
  await sequelize.authenticate();
  await createMigrator(sequelize).up();
  await seedRolesPermisos();
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ username: 'admin', password: process.env.SEED_PASSWORD_ADMIN || 'CambiarAhora123!' });
  token = res.body.data.token;
});

afterAll(async () => {
  await sequelize.close();
});

describe('Roles API', () => {
  it('lists the seeded roles', async () => {
    const res = await request(app).get('/api/v1/roles').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.some((r) => r.nombre === 'lider_area')).toBe(true);
    expect(res.body.data.some((r) => r.nombre === 'admin')).toBe(true);
  });

  it('returns 401 without a token', async () => {
    const res = await request(app).get('/api/v1/roles');
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npm test -- rol.routes`
Expected: FAIL — `Cannot find module '../../src/routes/rol.routes'` (route not mounted yet, 404 on the request)

- [ ] **Step 3: Write the implementation**

```js
// server/src/controllers/rol.controller.js
const { Rol } = require('../models');
const { success } = require('../utils/responses');

async function listar(req, res) {
  const roles = await Rol.findAll({ where: { activo: true }, order: [['nivel', 'DESC']] });
  return success(res, roles);
}

module.exports = { listar };
```

```js
// server/src/routes/rol.routes.js
const express = require('express');
const router = express.Router();
const { verificarToken } = require('../middlewares/auth');
const { requierePermiso } = require('../middlewares/roles');
const controller = require('../controllers/rol.controller');
const asyncHandler = require('../utils/asyncHandler');

router.get('/', verificarToken, requierePermiso('roles', 'ver'), asyncHandler(controller.listar));

module.exports = router;
```

Modify `server/src/routes/index.js` — add one line after the existing `router.use('/documentos', ...)`:

```js
const express = require('express');
const router = express.Router();

router.use('/auth', require('./auth.routes'));
router.use('/areas', require('./area.routes'));
router.use('/tipos-documento', require('./tipoDocumento.routes'));
router.use('/carpetas', require('./carpeta.routes'));
router.use('/documentos', require('./documento.routes'));
router.use('/roles', require('./rol.routes'));

module.exports = router;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npm test -- rol.routes`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add server/src/controllers/rol.controller.js server/src/routes/rol.routes.js server/src/routes/index.js server/tests/integration/rol.routes.test.js
git commit -m "feat(server): add read-only GET /roles endpoint"
```

---

### Task 2: Usuario CRUD (backend)

**Files:**
- Create: `server/src/services/usuario.service.js`
- Create: `server/src/controllers/usuario.controller.js`
- Create: `server/src/routes/usuario.routes.js`
- Modify: `server/src/routes/index.js`
- Test: `server/tests/integration/usuario.routes.test.js`

**Interfaces:**
- Consumes: `Usuario`, `Rol`, `Auditoria` models from `../models`; `bcryptjs`.
- Produces: `hashearPassword(password)` → `Promise<string>` in `usuario.service.js`, reused by Task 3's Área integration. Endpoints:
  - `GET /api/v1/usuarios` → `usuarios.ver` → paginated-free list of active usuarios
  - `GET /api/v1/usuarios/:id` → `usuarios.ver`
  - `POST /api/v1/usuarios` → `usuarios.crear`
  - `PUT /api/v1/usuarios/:id` → `usuarios.editar`
  - `DELETE /api/v1/usuarios/:id` → `usuarios.eliminar`

- [ ] **Step 1: Write the failing tests**

```js
// server/tests/integration/usuario.routes.test.js
const request = require('supertest');
const bcrypt = require('bcryptjs');
const { sequelize } = require('../../src/config/database');
const { createMigrator } = require('../../src/config/migrator');
const seedRolesPermisos = require('../../src/scripts/seedRolesPermisos');
const { Usuario, Rol } = require('../../src/models');
const { app } = require('../../server');

let token;
let solicitanteToken;
let rolLiderAreaId;

beforeAll(async () => {
  await sequelize.authenticate();
  await createMigrator(sequelize).up();
  await seedRolesPermisos();
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ username: 'admin', password: process.env.SEED_PASSWORD_ADMIN || 'CambiarAhora123!' });
  token = res.body.data.token;

  const solicitanteRol = await Rol.findOne({ where: { nombre: 'solicitante' } });
  const solicitanteUsername = `solicitante_usu_test_${Date.now()}`;
  await Usuario.create({
    username: solicitanteUsername,
    email: `${solicitanteUsername}@istho.com.co`,
    passwordHash: await bcrypt.hash('ClaveSolicitante123!', 10),
    nombre: 'Solicitante',
    apellido: 'Prueba',
    rolId: solicitanteRol.id,
  });
  const loginRes = await request(app)
    .post('/api/v1/auth/login')
    .send({ username: solicitanteUsername, password: 'ClaveSolicitante123!' });
  solicitanteToken = loginRes.body.data.token;

  const liderRol = await Rol.findOne({ where: { nombre: 'lider_area' } });
  rolLiderAreaId = liderRol.id;
});

afterAll(async () => {
  await sequelize.close();
});

function datosUsuario(sufijo) {
  return {
    username: `usuario_${sufijo}`,
    email: `usuario_${sufijo}@istho.com.co`,
    nombre: 'Ana',
    apellido: 'Gómez',
    password: 'ClaveSegura123!',
    rolId: rolLiderAreaId,
  };
}

describe('Usuarios API', () => {
  it('creates and lists a usuario, defaulting requiereCambioPassword to true and never exposing passwordHash', async () => {
    const datos = datosUsuario(`crea_${Date.now()}`);
    const createRes = await request(app).post('/api/v1/usuarios').set('Authorization', `Bearer ${token}`).send(datos);
    expect(createRes.status).toBe(201);
    expect(createRes.body.data.requiereCambioPassword).toBe(true);
    expect(createRes.body.data.passwordHash).toBeUndefined();

    const listRes = await request(app).get('/api/v1/usuarios').set('Authorization', `Bearer ${token}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.data.some((u) => u.username === datos.username)).toBe(true);
  });

  it('gets a single usuario by id', async () => {
    const datos = datosUsuario(`obt_${Date.now()}`);
    const createRes = await request(app).post('/api/v1/usuarios').set('Authorization', `Bearer ${token}`).send(datos);
    const getRes = await request(app).get(`/api/v1/usuarios/${createRes.body.data.id}`).set('Authorization', `Bearer ${token}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.data.username).toBe(datos.username);
  });

  it('returns 409 when username already exists', async () => {
    const datos = datosUsuario(`dup_${Date.now()}`);
    const first = await request(app).post('/api/v1/usuarios').set('Authorization', `Bearer ${token}`).send(datos);
    expect(first.status).toBe(201);

    const second = await request(app)
      .post('/api/v1/usuarios')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...datos, email: `otro_${Date.now()}@istho.com.co` });
    expect(second.status).toBe(409);
  });

  it('returns 400 when required fields are missing', async () => {
    const res = await request(app)
      .post('/api/v1/usuarios')
      .set('Authorization', `Bearer ${token}`)
      .send({ username: `incompleto_${Date.now()}` });
    expect(res.status).toBe(400);
  });

  it('returns 404 when rolId does not exist', async () => {
    const datos = datosUsuario(`rol404_${Date.now()}`);
    const res = await request(app)
      .post('/api/v1/usuarios')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...datos, rolId: 999999 });
    expect(res.status).toBe(404);
  });

  it('edits a usuario, allowing password reset without exposing the new hash', async () => {
    const datos = datosUsuario(`edit_${Date.now()}`);
    const createRes = await request(app).post('/api/v1/usuarios').set('Authorization', `Bearer ${token}`).send(datos);
    const id = createRes.body.data.id;

    const editRes = await request(app)
      .put(`/api/v1/usuarios/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ nombre: 'Ana Actualizada', password: 'NuevaClave123!', requiereCambioPassword: false });
    expect(editRes.status).toBe(200);
    expect(editRes.body.data.nombre).toBe('Ana Actualizada');
    expect(editRes.body.data.requiereCambioPassword).toBe(false);
    expect(editRes.body.data.passwordHash).toBeUndefined();

    const loginRes = await request(app).post('/api/v1/auth/login').send({ username: datos.username, password: 'NuevaClave123!' });
    expect(loginRes.status).toBe(200);
  });

  it('soft-deletes a usuario and excludes it from the list', async () => {
    const datos = datosUsuario(`del_${Date.now()}`);
    const createRes = await request(app).post('/api/v1/usuarios').set('Authorization', `Bearer ${token}`).send(datos);
    const id = createRes.body.data.id;

    const delRes = await request(app).delete(`/api/v1/usuarios/${id}`).set('Authorization', `Bearer ${token}`);
    expect(delRes.status).toBe(200);

    const listRes = await request(app).get('/api/v1/usuarios').set('Authorization', `Bearer ${token}`);
    expect(listRes.body.data.some((u) => u.id === id)).toBe(false);
  });

  it('returns 403 when a non-admin role without usuarios permission tries to create', async () => {
    const datos = datosUsuario(`403_${Date.now()}`);
    const res = await request(app).post('/api/v1/usuarios').set('Authorization', `Bearer ${solicitanteToken}`).send(datos);
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && npm test -- usuario.routes`
Expected: FAIL — modules don't exist yet (404s / import errors)

- [ ] **Step 3: Write the implementation**

```js
// server/src/services/usuario.service.js
const bcrypt = require('bcryptjs');

async function hashearPassword(password) {
  return bcrypt.hash(password, 10);
}

module.exports = { hashearPassword };
```

```js
// server/src/controllers/usuario.controller.js
const { Usuario, Rol, Auditoria } = require('../models');
const { success, created, notFound, badRequest } = require('../utils/responses');
const { hashearPassword } = require('../services/usuario.service');

async function listar(req, res) {
  const usuarios = await Usuario.findAll({ where: { activo: true }, order: [['nombre', 'ASC']] });
  return success(res, usuarios);
}

async function obtener(req, res) {
  const usuario = await Usuario.findByPk(req.params.id);
  if (!usuario || !usuario.activo) return notFound(res, 'Usuario no encontrado');
  return success(res, usuario);
}

async function crear(req, res) {
  const { username, email, nombre, apellido, password, rolId, requiereCambioPassword } = req.body;

  if (!username || !email || !nombre || !apellido || !password || !rolId) {
    return badRequest(res, 'username, email, nombre, apellido, password y rolId son obligatorios');
  }

  const rol = await Rol.findByPk(rolId);
  if (!rol || !rol.activo) return notFound(res, 'Rol no encontrado');

  const passwordHash = await hashearPassword(password);
  const usuarioCreado = await Usuario.create({
    username,
    email,
    nombre,
    apellido,
    rolId,
    passwordHash,
    requiereCambioPassword: requiereCambioPassword !== undefined ? requiereCambioPassword : true,
  });

  // Usuario.create() returns an in-memory instance built from the values we just
  // passed (including passwordHash) — it does NOT go through defaultScope's
  // attribute exclusion. Re-fetch via findByPk so the hash never reaches the
  // response or the audit log.
  const usuario = await Usuario.findByPk(usuarioCreado.id);

  await Auditoria.registrar({
    tabla: 'usuarios', registroId: usuario.id, accion: 'crear',
    usuarioId: req.user.id, usuarioNombre: req.user.nombreCompleto, datosNuevos: usuario.toJSON(),
  });

  return created(res, 'Usuario creado', usuario);
}

async function editar(req, res) {
  const usuario = await Usuario.findByPk(req.params.id);
  if (!usuario || !usuario.activo) return notFound(res, 'Usuario no encontrado');

  const { nombre, apellido, email, rolId, password, requiereCambioPassword, activo } = req.body;

  if (rolId !== undefined) {
    const rol = await Rol.findByPk(rolId);
    if (!rol || !rol.activo) return notFound(res, 'Rol no encontrado');
  }

  const datosAnteriores = usuario.toJSON();
  const cambios = {};
  if (nombre !== undefined) cambios.nombre = nombre;
  if (apellido !== undefined) cambios.apellido = apellido;
  if (email !== undefined) cambios.email = email;
  if (rolId !== undefined) cambios.rolId = rolId;
  if (activo !== undefined) cambios.activo = activo;
  if (requiereCambioPassword !== undefined) cambios.requiereCambioPassword = requiereCambioPassword;
  if (password) cambios.passwordHash = await hashearPassword(password);

  await usuario.update(cambios);

  // Same reasoning as crear(): if `cambios.passwordHash` was set above, the
  // in-memory `usuario` instance now carries it, bypassing defaultScope's
  // exclusion. Re-fetch via findByPk before returning/auditing.
  const usuarioActualizado = await Usuario.findByPk(usuario.id);

  await Auditoria.registrar({
    tabla: 'usuarios', registroId: usuario.id, accion: 'actualizar',
    usuarioId: req.user.id, usuarioNombre: req.user.nombreCompleto, datosAnteriores, datosNuevos: usuarioActualizado.toJSON(),
  });

  return success(res, usuarioActualizado);
}

async function eliminar(req, res) {
  const usuario = await Usuario.findByPk(req.params.id);
  if (!usuario || !usuario.activo) return notFound(res, 'Usuario no encontrado');

  const datosAnteriores = usuario.toJSON();
  await usuario.update({ activo: false });
  await Auditoria.registrar({
    tabla: 'usuarios', registroId: usuario.id, accion: 'eliminar',
    usuarioId: req.user.id, usuarioNombre: req.user.nombreCompleto, datosAnteriores,
  });

  return success(res, null, 'Usuario eliminado');
}

module.exports = { listar, obtener, crear, editar, eliminar };
```

```js
// server/src/routes/usuario.routes.js
const express = require('express');
const router = express.Router();
const { verificarToken } = require('../middlewares/auth');
const { requierePermiso } = require('../middlewares/roles');
const controller = require('../controllers/usuario.controller');
const asyncHandler = require('../utils/asyncHandler');

router.get('/', verificarToken, requierePermiso('usuarios', 'ver'), asyncHandler(controller.listar));
router.get('/:id', verificarToken, requierePermiso('usuarios', 'ver'), asyncHandler(controller.obtener));
router.post('/', verificarToken, requierePermiso('usuarios', 'crear'), asyncHandler(controller.crear));
router.put('/:id', verificarToken, requierePermiso('usuarios', 'editar'), asyncHandler(controller.editar));
router.delete('/:id', verificarToken, requierePermiso('usuarios', 'eliminar'), asyncHandler(controller.eliminar));

module.exports = router;
```

Modify `server/src/routes/index.js` — add one line:

```js
const express = require('express');
const router = express.Router();

router.use('/auth', require('./auth.routes'));
router.use('/areas', require('./area.routes'));
router.use('/tipos-documento', require('./tipoDocumento.routes'));
router.use('/carpetas', require('./carpeta.routes'));
router.use('/documentos', require('./documento.routes'));
router.use('/roles', require('./rol.routes'));
router.use('/usuarios', require('./usuario.routes'));

module.exports = router;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd server && npm test -- usuario.routes`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add server/src/services/usuario.service.js server/src/controllers/usuario.controller.js server/src/routes/usuario.routes.js server/src/routes/index.js server/tests/integration/usuario.routes.test.js
git commit -m "feat(server): add Usuarios CRUD API"
```

---

### Task 3: Área creation with a líder usuario (transactional)

**Files:**
- Modify: `server/src/controllers/area.controller.js`
- Modify: `server/tests/integration/area.routes.test.js`

**Interfaces:**
- Consumes: `hashearPassword` from Task 2's `usuario.service.js`; `sequelize`, `Usuario`, `Rol` from `../models`.
- Produces: `POST /areas` now accepts `{nombre, codigo, liderUsuarioId?, nuevoUsuario?}` where `nuevoUsuario` is `{username, email, nombre, apellido, password, rolId, requiereCambioPassword?}`. No new exports — this is the same `crear` function, extended.

- [ ] **Step 1: Write the failing tests**

Append to `server/tests/integration/area.routes.test.js`'s `describe('Areas API', ...)` block (the file already imports `{ RolPermiso, Usuario, Rol }` from `'../../src/models'` — add `Area` to that import list):

```js
const { RolPermiso, Usuario, Rol, Area } = require('../../src/models');
```

```js
  it('creates an area together with a new lider usuario in one transaction', async () => {
    const liderRol = await Rol.findOne({ where: { nombre: 'lider_area' } });
    const sufijo = Date.now();
    const nuevoUsuario = {
      username: `lider_${sufijo}`,
      email: `lider_${sufijo}@istho.com.co`,
      nombre: 'Carlos',
      apellido: 'Ruiz',
      password: 'ClaveLider123!',
      rolId: liderRol.id,
    };

    const res = await request(app)
      .post('/api/v1/areas')
      .set('Authorization', `Bearer ${token}`)
      .send({ nombre: 'RRHH', codigo: `RRHH${sufijo}`, nuevoUsuario });
    expect(res.status).toBe(201);

    const usuarioCreado = await Usuario.findOne({ where: { username: nuevoUsuario.username } });
    expect(usuarioCreado).not.toBeNull();
    expect(res.body.data.liderUsuarioId).toBe(usuarioCreado.id);
  });

  it('rolls back both the area and the usuario when nuevoUsuario has a duplicate username', async () => {
    const liderRol = await Rol.findOne({ where: { nombre: 'lider_area' } });
    const sufijo = Date.now();
    const usernameDuplicado = `duplicado_${sufijo}`;
    await Usuario.create({
      username: usernameDuplicado,
      email: `existente_${sufijo}@istho.com.co`,
      passwordHash: await bcrypt.hash('ClaveExistente123!', 10),
      nombre: 'Ya',
      apellido: 'Existe',
      rolId: liderRol.id,
    });

    const codigoIntento = `ROLLBACK${sufijo}`;
    const res = await request(app)
      .post('/api/v1/areas')
      .set('Authorization', `Bearer ${token}`)
      .send({
        nombre: 'No debería crearse',
        codigo: codigoIntento,
        nuevoUsuario: {
          username: usernameDuplicado,
          email: `nuevo_${sufijo}@istho.com.co`,
          nombre: 'Otro',
          apellido: 'Usuario',
          password: 'ClaveNueva123!',
          rolId: liderRol.id,
        },
      });
    expect(res.status).toBe(409);

    const areaCreada = await Area.findOne({ where: { codigo: codigoIntento } });
    expect(areaCreada).toBeNull();
  });

  it('creates an area with an existing usuario as líder (no nuevoUsuario)', async () => {
    const liderRol = await Rol.findOne({ where: { nombre: 'lider_area' } });
    const sufijo = Date.now();
    const usuarioExistente = await Usuario.create({
      username: `existente_lider_${sufijo}`,
      email: `existente_lider_${sufijo}@istho.com.co`,
      passwordHash: await bcrypt.hash('ClaveExistente123!', 10),
      nombre: 'Lider',
      apellido: 'Existente',
      rolId: liderRol.id,
    });

    const res = await request(app)
      .post('/api/v1/areas')
      .set('Authorization', `Bearer ${token}`)
      .send({ nombre: 'Financiera 2', codigo: `FIN2_${sufijo}`, liderUsuarioId: usuarioExistente.id });
    expect(res.status).toBe(201);
    expect(res.body.data.liderUsuarioId).toBe(usuarioExistente.id);
  });

  it('returns 400 when both liderUsuarioId and nuevoUsuario are sent', async () => {
    const liderRol = await Rol.findOne({ where: { nombre: 'lider_area' } });
    const sufijo = Date.now();
    const res = await request(app)
      .post('/api/v1/areas')
      .set('Authorization', `Bearer ${token}`)
      .send({
        nombre: 'Área inválida',
        codigo: `AMBOS${sufijo}`,
        liderUsuarioId: 1,
        nuevoUsuario: {
          username: `ambos_${sufijo}`,
          email: `ambos_${sufijo}@istho.com.co`,
          nombre: 'X',
          apellido: 'Y',
          password: 'Clave123!',
          rolId: liderRol.id,
        },
      });
    expect(res.status).toBe(400);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && npm test -- area.routes`
Expected: FAIL — the new tests fail (`liderUsuarioId`/`nuevoUsuario` handling doesn't exist yet); the 5 pre-existing tests in this file must still pass

- [ ] **Step 3: Write the implementation**

Replace `server/src/controllers/area.controller.js` entirely:

```js
// server/src/controllers/area.controller.js
const { Area, Usuario, Rol, Auditoria, sequelize } = require('../models');
const { success, created, notFound, badRequest } = require('../utils/responses');
const { hashearPassword } = require('../services/usuario.service');

async function listar(req, res) {
  const areas = await Area.findAll({ where: { activo: true }, order: [['nombre', 'ASC']] });
  return success(res, areas);
}

async function crear(req, res) {
  const { nombre, codigo, liderUsuarioId, nuevoUsuario } = req.body;

  if (liderUsuarioId && nuevoUsuario) {
    return badRequest(res, 'Envía liderUsuarioId o nuevoUsuario, no ambos');
  }

  if (nuevoUsuario) {
    const { username, email, nombre: nombreUsuario, apellido, password, rolId } = nuevoUsuario;
    if (!username || !email || !nombreUsuario || !apellido || !password || !rolId) {
      return badRequest(res, 'nuevoUsuario requiere username, email, nombre, apellido, password y rolId');
    }
    const rol = await Rol.findByPk(rolId);
    if (!rol || !rol.activo) return notFound(res, 'Rol no encontrado');
  }

  if (liderUsuarioId) {
    const lider = await Usuario.findByPk(liderUsuarioId);
    if (!lider || !lider.activo) return notFound(res, 'Usuario líder no encontrado');
  }

  const area = await sequelize.transaction(async (t) => {
    let liderId = liderUsuarioId || null;

    if (nuevoUsuario) {
      const passwordHash = await hashearPassword(nuevoUsuario.password);
      const usuarioCreado = await Usuario.create(
        {
          username: nuevoUsuario.username,
          email: nuevoUsuario.email,
          nombre: nuevoUsuario.nombre,
          apellido: nuevoUsuario.apellido,
          rolId: nuevoUsuario.rolId,
          passwordHash,
          requiereCambioPassword: nuevoUsuario.requiereCambioPassword !== undefined ? nuevoUsuario.requiereCambioPassword : true,
        },
        { transaction: t }
      );
      liderId = usuarioCreado.id;
    }

    return Area.create({ nombre, codigo, liderUsuarioId: liderId }, { transaction: t });
  });

  await Auditoria.registrar({
    tabla: 'areas', registroId: area.id, accion: 'crear',
    usuarioId: req.user.id, usuarioNombre: req.user.nombreCompleto, datosNuevos: area.toJSON(),
  });

  return created(res, 'Área creada', area);
}

async function obtener(req, res) {
  const area = await Area.findByPk(req.params.id);
  if (!area) return notFound(res, 'Área no encontrada');
  return success(res, area);
}

module.exports = { listar, crear, obtener };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd server && npm test -- area.routes`
Expected: PASS (9 tests — the original 5 plus 4 new)

- [ ] **Step 5: Commit**

```bash
git add server/src/controllers/area.controller.js server/tests/integration/area.routes.test.js
git commit -m "feat(server): create a lider usuario transactionally when creating an Area"
```

---

### Task 4: Frontend API services (rol, usuario) and username suggestion util

**Files:**
- Create: `frontend/src/api/rol.service.js`
- Create: `frontend/src/api/usuario.service.js`
- Create: `frontend/src/api/usuario.service.test.js`
- Create: `frontend/src/utils/sugerirUsername.js`
- Create: `frontend/src/utils/sugerirUsername.test.js`

**Interfaces:**
- Consumes: `apiClient` default export from `frontend/src/api/client.js` (same interceptor behavior already used by every other service).
- Produces (consumed by Tasks 5 and 6):
  - `rolService.listar()` → `Promise<Rol[]>`
  - `usuarioService.listar()` → `Promise<Usuario[]>`
  - `usuarioService.obtener(id)` → `Promise<Usuario>`
  - `usuarioService.crear(datos)` → `Promise<Usuario>`
  - `usuarioService.editar(id, datos)` → `Promise<Usuario>`
  - `usuarioService.eliminar(id)` → `Promise<null>`
  - `sugerirUsername(nombre, apellido)` → `string` (first letter of `nombre` + `apellido`, accents stripped, lowercased, no spaces; returns `''` if either argument is empty)

- [ ] **Step 1: Write the failing tests**

```js
// frontend/src/utils/sugerirUsername.test.js
import { sugerirUsername } from './sugerirUsername';

describe('sugerirUsername', () => {
  it('builds username from first initial + apellido', () => {
    expect(sugerirUsername('Juan', 'Pérez')).toBe('jperez');
  });

  it('strips accents and lowercases', () => {
    expect(sugerirUsername('María', 'Núñez')).toBe('mnunez');
  });

  it('removes spaces from compound apellidos', () => {
    expect(sugerirUsername('Ana', 'De La Cruz')).toBe('adelacruz');
  });

  it('returns an empty string when nombre or apellido is missing', () => {
    expect(sugerirUsername('', 'Pérez')).toBe('');
    expect(sugerirUsername('Juan', '')).toBe('');
  });
});
```

```js
// frontend/src/api/usuario.service.test.js
import MockAdapter from 'axios-mock-adapter';
import apiClient from './client';
import usuarioService from './usuario.service';

describe('usuario.service', () => {
  let mock;

  beforeEach(() => {
    mock = new MockAdapter(apiClient);
  });

  afterEach(() => {
    mock.restore();
  });

  it('listar returns the usuarios array', async () => {
    mock.onGet('/usuarios').reply(200, { success: true, data: [{ id: 1, username: 'jperez' }] });
    const usuarios = await usuarioService.listar();
    expect(usuarios).toEqual([{ id: 1, username: 'jperez' }]);
  });

  it('obtener returns a single usuario', async () => {
    mock.onGet('/usuarios/5').reply(200, { success: true, data: { id: 5, username: 'jperez' } });
    const usuario = await usuarioService.obtener(5);
    expect(usuario).toEqual({ id: 5, username: 'jperez' });
  });

  it('crear posts the given data and returns the created usuario', async () => {
    const datos = { username: 'jperez', email: 'jperez@istho.com.co', nombre: 'Juan', apellido: 'Pérez', password: 'Clave123!', rolId: 3 };
    mock.onPost('/usuarios').reply(201, { success: true, data: { id: 1, ...datos } });
    const usuario = await usuarioService.crear(datos);
    expect(usuario).toEqual({ id: 1, ...datos });
    expect(JSON.parse(mock.history.post[0].data)).toEqual(datos);
  });

  it('editar PUTs the changes and returns the updated usuario', async () => {
    mock.onPut('/usuarios/1').reply(200, { success: true, data: { id: 1, nombre: 'Juan Actualizado' } });
    const usuario = await usuarioService.editar(1, { nombre: 'Juan Actualizado' });
    expect(usuario).toEqual({ id: 1, nombre: 'Juan Actualizado' });
  });

  it('eliminar deletes and returns null', async () => {
    mock.onDelete('/usuarios/1').reply(200, { success: true, data: null, message: 'Usuario eliminado' });
    const resultado = await usuarioService.eliminar(1);
    expect(resultado).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npm test -- sugerirUsername usuario.service`
Expected: FAIL — modules don't exist yet

- [ ] **Step 3: Write the implementations**

```js
// frontend/src/utils/sugerirUsername.js
function quitarAcentos(texto) {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export function sugerirUsername(nombre, apellido) {
  if (!nombre || !apellido) return '';
  const inicialNombre = quitarAcentos(nombre.trim()).charAt(0).toLowerCase();
  const apellidoNormalizado = quitarAcentos(apellido.trim()).toLowerCase().replace(/\s+/g, '');
  return `${inicialNombre}${apellidoNormalizado}`;
}
```

```js
// frontend/src/api/rol.service.js
import apiClient from './client';

async function listar() {
  const response = await apiClient.get('/roles');
  return response.data;
}

export default { listar };
```

```js
// frontend/src/api/usuario.service.js
import apiClient from './client';

async function listar() {
  const response = await apiClient.get('/usuarios');
  return response.data;
}

async function obtener(id) {
  const response = await apiClient.get(`/usuarios/${id}`);
  return response.data;
}

async function crear(datos) {
  const response = await apiClient.post('/usuarios', datos);
  return response.data;
}

async function editar(id, datos) {
  const response = await apiClient.put(`/usuarios/${id}`, datos);
  return response.data;
}

async function eliminar(id) {
  const response = await apiClient.delete(`/usuarios/${id}`);
  return response.data;
}

export default { listar, obtener, crear, editar, eliminar };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npm test -- sugerirUsername usuario.service`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api/rol.service.js frontend/src/api/usuario.service.js frontend/src/api/usuario.service.test.js frontend/src/utils/sugerirUsername.js frontend/src/utils/sugerirUsername.test.js
git commit -m "feat(frontend): add rol/usuario API services and username suggestion util"
```

---

### Task 5: Usuarios screen and Administración hub

**Files:**
- Create: `frontend/src/pages/administracion/UsuariosListado.jsx`
- Create: `frontend/src/pages/administracion/UsuariosListado.test.jsx`
- Create: `frontend/src/pages/administracion/AdministracionInicio.jsx`
- Create: `frontend/src/pages/administracion/AdministracionInicio.test.jsx`
- Modify: `frontend/src/App.jsx`

**Interfaces:**
- Consumes: `usuarioService`, `rolService` (Task 4), `sugerirUsername` (Task 4), `useAuth().tienePermiso`, `useViewMode`, `StatusChip`, `DataTable`, `Button`, `Input`, `Modal`, `EmptyState`, `ViewToggle`.
- Produces: default exports `UsuariosListado` and `AdministracionInicio` (no props). No interfaces consumed by later tasks.

- [ ] **Step 1: Write the failing tests**

```jsx
// frontend/src/pages/administracion/UsuariosListado.test.jsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SnackbarProvider } from 'notistack';
import UsuariosListado from './UsuariosListado';
import usuarioService from '../../api/usuario.service';
import rolService from '../../api/rol.service';
import { useAuth } from '../../context/AuthContext';

vi.mock('../../api/usuario.service');
vi.mock('../../api/rol.service');
vi.mock('../../context/AuthContext');

const ROLES = [{ id: 3, nombre: 'lider_area' }];

function renderPagina() {
  return render(
    <SnackbarProvider>
      <UsuariosListado />
    </SnackbarProvider>
  );
}

describe('UsuariosListado', () => {
  beforeEach(() => {
    localStorage.clear();
    window.innerWidth = 1280;
    rolService.listar.mockResolvedValue(ROLES);
  });

  it('renders the empty state when there are no usuarios', async () => {
    useAuth.mockReturnValue({ tienePermiso: () => false });
    usuarioService.listar.mockResolvedValue([]);
    renderPagina();
    expect(await screen.findByText('Sin usuarios todavía')).toBeInTheDocument();
  });

  it('renders usuarios resolving the rol name', async () => {
    useAuth.mockReturnValue({ tienePermiso: () => false });
    usuarioService.listar.mockResolvedValue([
      { id: 1, nombre: 'Juan', apellido: 'Pérez', username: 'jperez', email: 'jperez@istho.com.co', rolId: 3, activo: true },
    ]);
    renderPagina();
    expect(await screen.findByText('lider_area')).toBeInTheDocument();
  });

  it('hides "Crear usuario" without the crear permission', async () => {
    useAuth.mockReturnValue({ tienePermiso: () => false });
    usuarioService.listar.mockResolvedValue([]);
    renderPagina();
    await screen.findByText('Sin usuarios todavía');
    expect(screen.queryByRole('button', { name: /crear usuario/i })).not.toBeInTheDocument();
  });

  it('suggests a username from nombre+apellido and creates the usuario', async () => {
    useAuth.mockReturnValue({ tienePermiso: (modulo, accion) => modulo === 'usuarios' && accion === 'crear' });
    usuarioService.listar.mockResolvedValue([]);
    usuarioService.crear.mockResolvedValue({ id: 1, username: 'jperez' });
    renderPagina();

    await screen.findByText('Sin usuarios todavía');
    await userEvent.click(screen.getByRole('button', { name: /crear usuario/i }));

    await userEvent.type(screen.getByLabelText('Nombre'), 'Juan');
    await userEvent.type(screen.getByLabelText('Apellido'), 'Pérez');
    await userEvent.tab();

    expect(screen.getByLabelText('Username')).toHaveValue('jperez');

    await userEvent.type(screen.getByLabelText('Email'), 'jperez@istho.com.co');
    await userEvent.type(screen.getByLabelText('Contraseña'), 'Clave123!');
    await userEvent.selectOptions(screen.getByLabelText('Rol'), '3');

    usuarioService.listar.mockResolvedValue([
      { id: 1, nombre: 'Juan', apellido: 'Pérez', username: 'jperez', email: 'jperez@istho.com.co', rolId: 3, activo: true },
    ]);
    await userEvent.click(screen.getByRole('button', { name: 'Crear' }));

    await waitFor(() =>
      expect(usuarioService.crear).toHaveBeenCalledWith(
        expect.objectContaining({
          username: 'jperez',
          nombre: 'Juan',
          apellido: 'Pérez',
          email: 'jperez@istho.com.co',
          password: 'Clave123!',
          rolId: 3,
          requiereCambioPassword: true,
        })
      )
    );
    expect(await screen.findByText('Usuario creado exitosamente')).toBeInTheDocument();
  });

  it('edits an existing usuario without requiring a new password', async () => {
    useAuth.mockReturnValue({ tienePermiso: (modulo, accion) => modulo === 'usuarios' && ['ver', 'editar'].includes(accion) });
    usuarioService.listar.mockResolvedValue([
      { id: 1, nombre: 'Juan', apellido: 'Pérez', username: 'jperez', email: 'jperez@istho.com.co', rolId: 3, activo: true, requiereCambioPassword: true },
    ]);
    usuarioService.editar.mockResolvedValue({ id: 1, nombre: 'Juan Carlos' });
    renderPagina();

    await screen.findByText('jperez');
    await userEvent.click(screen.getByText('jperez'));

    const nombreInput = screen.getByLabelText('Nombre');
    await userEvent.clear(nombreInput);
    await userEvent.type(nombreInput, 'Juan Carlos');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(usuarioService.editar).toHaveBeenCalledWith(1, expect.objectContaining({ nombre: 'Juan Carlos' })));
    const cambiosEnviados = usuarioService.editar.mock.calls[0][1];
    expect(cambiosEnviados.password).toBeUndefined();
  });

  it('deletes a usuario after confirmation', async () => {
    useAuth.mockReturnValue({ tienePermiso: (modulo, accion) => modulo === 'usuarios' && ['ver', 'editar', 'eliminar'].includes(accion) });
    usuarioService.listar.mockResolvedValue([
      { id: 1, nombre: 'Juan', apellido: 'Pérez', username: 'jperez', email: 'jperez@istho.com.co', rolId: 3, activo: true },
    ]);
    usuarioService.eliminar.mockResolvedValue(null);
    window.confirm = vi.fn(() => true);
    renderPagina();

    await screen.findByText('jperez');
    await userEvent.click(screen.getByText('jperez'));
    await userEvent.click(screen.getByRole('button', { name: 'Eliminar' }));

    await waitFor(() => expect(usuarioService.eliminar).toHaveBeenCalledWith(1));
  });

  it('shows an error when loading usuarios fails', async () => {
    useAuth.mockReturnValue({ tienePermiso: () => false });
    usuarioService.listar.mockRejectedValue(new Error('Network error'));
    renderPagina();
    expect(await screen.findByText('Sin usuarios todavía')).toBeInTheDocument();
    expect(await screen.findByText('Network error')).toBeInTheDocument();
  });
});
```

```jsx
// frontend/src/pages/administracion/AdministracionInicio.test.jsx
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AdministracionInicio from './AdministracionInicio';
import { useAuth } from '../../context/AuthContext';

vi.mock('../../context/AuthContext');

function renderPagina() {
  return render(
    <MemoryRouter>
      <AdministracionInicio />
    </MemoryRouter>
  );
}

describe('AdministracionInicio', () => {
  it('shows a link to Usuarios when the user has usuarios.ver', () => {
    useAuth.mockReturnValue({ tienePermiso: (modulo, accion) => modulo === 'usuarios' && accion === 'ver' });
    renderPagina();
    expect(screen.getByRole('link', { name: /usuarios/i })).toHaveAttribute('href', '/administracion/usuarios');
  });

  it('shows a message when the user has no admin submodule access', () => {
    useAuth.mockReturnValue({ tienePermiso: () => false });
    renderPagina();
    expect(screen.getByText('No tienes acceso a ningún submódulo de administración todavía.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /usuarios/i })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npm test -- UsuariosListado AdministracionInicio`
Expected: FAIL — modules don't exist yet

- [ ] **Step 3: Write the implementations**

```jsx
// frontend/src/pages/administracion/UsuariosListado.jsx
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useSnackbar } from 'notistack';
import { Plus, UserRound } from 'lucide-react';
import usuarioService from '../../api/usuario.service';
import rolService from '../../api/rol.service';
import { useAuth } from '../../context/AuthContext';
import { useViewMode } from '../../hooks/useViewMode';
import { sugerirUsername } from '../../utils/sugerirUsername';
import Button from '../../components/common/Button/Button';
import Input from '../../components/common/Input/Input';
import Modal from '../../components/common/Modal/Modal';
import EmptyState from '../../components/common/EmptyState/EmptyState';
import DataTable from '../../components/common/Table/DataTable';
import ViewToggle from '../../components/common/ViewToggle';
import StatusChip from '../../components/common/StatusChip/StatusChip';

function UsuarioCard({ usuario, nombreRol, onEditar }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onEditar}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onEditar()}
      className="bg-white dark:bg-centhrix-card rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-slate-700 cursor-pointer"
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="font-semibold text-slate-800 dark:text-slate-100">
            {usuario.nombre} {usuario.apellido}
          </p>
          <p className="text-xs text-slate-400 dark:text-slate-500">@{usuario.username}</p>
        </div>
        <UserRound className="w-8 h-8 text-slate-300 dark:text-slate-600" />
      </div>
      <StatusChip status={usuario.activo ? 'activo' : 'inactivo'} customLabel={nombreRol} />
    </div>
  );
}

export default function UsuariosListado() {
  const { tienePermiso } = useAuth();
  const { enqueueSnackbar } = useSnackbar();
  const { modo, setModo, esVistaMovil } = useViewMode('cod_view_usuarios');

  const [usuarios, setUsuarios] = useState([]);
  const [roles, setRoles] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [usuarioEditando, setUsuarioEditando] = useState(null);
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm();

  const nombreForm = watch('nombre');
  const apellidoForm = watch('apellido');

  async function cargarUsuarios() {
    setCargando(true);
    try {
      const data = await usuarioService.listar();
      setUsuarios(data);
    } catch (error) {
      setUsuarios([]);
      enqueueSnackbar(error?.message || 'No se pudieron cargar los usuarios', { variant: 'error' });
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargarUsuarios();
  }, []);

  useEffect(() => {
    async function cargarRoles() {
      try {
        const data = await rolService.listar();
        setRoles(data);
      } catch {
        setRoles([]);
      }
    }
    cargarRoles();
  }, []);

  function abrirCrear() {
    setUsuarioEditando(null);
    reset({ nombre: '', apellido: '', email: '', username: '', password: '', rolId: '', requiereCambioPassword: true, activo: true });
    setModalAbierto(true);
  }

  function abrirEditar(usuario) {
    setUsuarioEditando(usuario);
    reset({
      nombre: usuario.nombre,
      apellido: usuario.apellido,
      email: usuario.email,
      username: usuario.username,
      password: '',
      rolId: String(usuario.rolId),
      requiereCambioPassword: usuario.requiereCambioPassword,
      activo: usuario.activo,
    });
    setModalAbierto(true);
  }

  function onApellidoBlur() {
    if (!usuarioEditando && nombreForm && apellidoForm) {
      setValue('username', sugerirUsername(nombreForm, apellidoForm));
    }
  }

  async function onGuardar(valores) {
    try {
      if (usuarioEditando) {
        const cambios = {
          nombre: valores.nombre,
          apellido: valores.apellido,
          email: valores.email,
          rolId: Number(valores.rolId),
          requiereCambioPassword: valores.requiereCambioPassword,
          activo: valores.activo,
        };
        if (valores.password) cambios.password = valores.password;
        await usuarioService.editar(usuarioEditando.id, cambios);
        enqueueSnackbar('Usuario actualizado', { variant: 'success' });
      } else {
        await usuarioService.crear({
          username: valores.username,
          email: valores.email,
          nombre: valores.nombre,
          apellido: valores.apellido,
          password: valores.password,
          rolId: Number(valores.rolId),
          requiereCambioPassword: valores.requiereCambioPassword,
        });
        enqueueSnackbar('Usuario creado exitosamente', { variant: 'success' });
      }
      reset();
      setModalAbierto(false);
      await cargarUsuarios();
    } catch (error) {
      enqueueSnackbar(error?.message || 'No se pudo guardar el usuario', { variant: 'error' });
    }
  }

  async function onEliminar(id) {
    if (!window.confirm('¿Eliminar este usuario? Esta acción no se puede deshacer.')) return;
    try {
      await usuarioService.eliminar(id);
      enqueueSnackbar('Usuario eliminado', { variant: 'success' });
      setModalAbierto(false);
      await cargarUsuarios();
    } catch (error) {
      enqueueSnackbar(error?.message || 'No se pudo eliminar el usuario', { variant: 'error' });
    }
  }

  const nombresPorRolId = Object.fromEntries(roles.map((r) => [r.id, r.nombre]));

  const columnas = [
    { key: 'nombre', label: 'Nombre', render: (valor, row) => `${row.nombre} ${row.apellido}` },
    { key: 'username', label: 'Usuario' },
    { key: 'email', label: 'Email' },
    { key: 'rolId', label: 'Rol', render: (valor) => nombresPorRolId[valor] || valor },
    { key: 'activo', label: 'Estado', render: (valor) => <StatusChip status={valor ? 'activo' : 'inactivo'} /> },
  ];

  const puedeEditar = tienePermiso('usuarios', 'editar');

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-display font-semibold text-slate-800 dark:text-slate-100">Usuarios</h2>
        <div className="flex items-center gap-3">
          {!esVistaMovil && <ViewToggle modo={modo} onChange={setModo} />}
          {tienePermiso('usuarios', 'crear') && (
            <Button icon={Plus} onClick={abrirCrear}>
              Crear usuario
            </Button>
          )}
        </div>
      </div>

      {!cargando && usuarios.length === 0 && (
        <EmptyState icon={UserRound} title="Sin usuarios todavía" description="Crea el primer usuario para empezar a dar acceso al sistema." />
      )}

      {usuarios.length > 0 && modo === 'lista' && (
        <DataTable
          columns={columnas}
          data={usuarios}
          loading={cargando}
          emptyMessage="Sin usuarios todavía"
          onRowClick={puedeEditar ? (row) => abrirEditar(row) : undefined}
        />
      )}

      {usuarios.length > 0 && modo === 'tarjetas' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {usuarios.map((usuario) => (
            <UsuarioCard
              key={usuario.id}
              usuario={usuario}
              nombreRol={nombresPorRolId[usuario.rolId] || usuario.rolId}
              onEditar={puedeEditar ? () => abrirEditar(usuario) : () => {}}
            />
          ))}
        </div>
      )}

      <Modal
        isOpen={modalAbierto}
        onClose={() => setModalAbierto(false)}
        title={usuarioEditando ? 'Editar usuario' : 'Crear usuario'}
        footer={
          <>
            <Button variant="outline" onClick={() => setModalAbierto(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit(onGuardar)}>{usuarioEditando ? 'Guardar' : 'Crear'}</Button>
            {usuarioEditando && tienePermiso('usuarios', 'eliminar') && (
              <Button variant="danger" onClick={() => onEliminar(usuarioEditando.id)}>
                Eliminar
              </Button>
            )}
          </>
        }
      >
        <form className="space-y-4">
          <Input label="Nombre" error={errors.nombre?.message} {...register('nombre', { required: 'El nombre es obligatorio' })} />
          <Input
            label="Apellido"
            error={errors.apellido?.message}
            {...register('apellido', { required: 'El apellido es obligatorio', onBlur: onApellidoBlur })}
          />
          <Input label="Email" type="email" error={errors.email?.message} {...register('email', { required: 'El email es obligatorio' })} />
          <Input
            label="Username"
            error={errors.username?.message}
            disabled={!!usuarioEditando}
            {...register('username', { required: 'El username es obligatorio' })}
          />
          <Input
            label={usuarioEditando ? 'Nueva contraseña (dejar vacío para no cambiar)' : 'Contraseña'}
            type="password"
            error={errors.password?.message}
            {...register('password', { required: usuarioEditando ? false : 'La contraseña es obligatoria' })}
          />

          <div>
            <label htmlFor="usuario-rolId" className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
              Rol
            </label>
            <select
              id="usuario-rolId"
              className="w-full py-2.5 px-4 border border-slate-200 dark:border-slate-600 rounded-xl text-sm bg-white dark:bg-centhrix-surface text-slate-900 dark:text-slate-100"
              {...register('rolId', { required: true })}
            >
              <option value="">Selecciona un rol</option>
              {roles.map((rol) => (
                <option key={rol.id} value={rol.id}>
                  {rol.nombre}
                </option>
              ))}
            </select>
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
            <input type="checkbox" {...register('requiereCambioPassword')} />
            Requiere cambio de contraseña en el próximo inicio de sesión
          </label>

          {usuarioEditando && (
            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
              <input type="checkbox" {...register('activo')} />
              Usuario activo
            </label>
          )}
        </form>
      </Modal>
    </div>
  );
}
```

```jsx
// frontend/src/pages/administracion/AdministracionInicio.jsx
import { Link } from 'react-router-dom';
import { Users } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

const SUBMODULOS = [{ path: '/administracion/usuarios', label: 'Usuarios', icon: Users, modulo: 'usuarios' }];

export default function AdministracionInicio() {
  const { tienePermiso } = useAuth();
  const visibles = SUBMODULOS.filter(({ modulo }) => tienePermiso(modulo, 'ver'));

  return (
    <div>
      <h2 className="text-xl font-display font-semibold text-slate-800 dark:text-slate-100 mb-6">Administración</h2>

      {visibles.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">No tienes acceso a ningún submódulo de administración todavía.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {visibles.map(({ path, label, icon: Icon }) => (
            <Link
              key={path}
              to={path}
              className="bg-white dark:bg-centhrix-card rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-slate-700 flex items-center gap-3 hover:border-orange-300 dark:hover:border-orange-500/40 transition-colors"
            >
              <Icon className="w-6 h-6 text-orange-500" />
              <span className="font-medium text-slate-800 dark:text-slate-100">{label}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npm test -- UsuariosListado AdministracionInicio`
Expected: PASS (8 + 2 tests)

- [ ] **Step 5: Wire the routes in `App.jsx`**

Replace the `/administracion` route's element and add `/administracion/usuarios` right after it:

```jsx
                <Route path="/administracion" element={<AdministracionInicio />} />
                <Route
                  path="/administracion/usuarios"
                  element={
                    <PermissionRoute modulo="usuarios" accion="ver">
                      <UsuariosListado />
                    </PermissionRoute>
                  }
                />
```

Add the imports (with the other page imports):

```jsx
import AdministracionInicio from './pages/administracion/AdministracionInicio';
import UsuariosListado from './pages/administracion/UsuariosListado';
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/administracion/UsuariosListado.jsx frontend/src/pages/administracion/UsuariosListado.test.jsx frontend/src/pages/administracion/AdministracionInicio.jsx frontend/src/pages/administracion/AdministracionInicio.test.jsx frontend/src/App.jsx
git commit -m "feat(frontend): add Usuarios screen and an Administración hub to reach it"
```

---

### Task 6: "Asignar líder de área" in Crear Área

**Files:**
- Modify: `frontend/src/pages/areas/AreasListado.jsx`
- Modify: `frontend/src/pages/areas/AreasListado.test.jsx`
- Modify: `frontend/src/api/area.service.js`
- Modify: `frontend/src/api/area.service.test.js`

**Interfaces:**
- Consumes: `usuarioService.listar()`, `rolService.listar()` (Task 4).
- Produces: `areaService.crear(datos)` now accepts `{nombre, codigo, liderUsuarioId?, nuevoUsuario?}` — no other exports change.

- [ ] **Step 1: Write the failing tests**

Replace `frontend/src/api/area.service.test.js`'s `crear` test with one that also covers the extended payload:

```js
// frontend/src/api/area.service.test.js
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

  it('crear forwards nuevoUsuario when creating a lider inline', async () => {
    const nuevoUsuario = { username: 'jperez', email: 'jperez@istho.com.co', nombre: 'Juan', apellido: 'Pérez', password: 'Clave123!', rolId: 3 };
    mock.onPost('/areas').reply(201, { success: true, data: { id: 3, nombre: 'RRHH', codigo: 'RRHH', liderUsuarioId: 10 } });
    const area = await areaService.crear({ nombre: 'RRHH', codigo: 'RRHH', nuevoUsuario });
    expect(area).toEqual({ id: 3, nombre: 'RRHH', codigo: 'RRHH', liderUsuarioId: 10 });
    expect(JSON.parse(mock.history.post[0].data)).toEqual({ nombre: 'RRHH', codigo: 'RRHH', nuevoUsuario });
  });

  it('crear forwards liderUsuarioId when assigning an existing usuario', async () => {
    mock.onPost('/areas').reply(201, { success: true, data: { id: 4, nombre: 'TI', codigo: 'TI', liderUsuarioId: 7 } });
    const area = await areaService.crear({ nombre: 'TI', codigo: 'TI', liderUsuarioId: 7 });
    expect(area).toEqual({ id: 4, nombre: 'TI', codigo: 'TI', liderUsuarioId: 7 });
    expect(JSON.parse(mock.history.post[0].data)).toEqual({ nombre: 'TI', codigo: 'TI', liderUsuarioId: 7 });
  });
});
```

Append to `frontend/src/pages/areas/AreasListado.test.jsx`'s `describe('AreasListado', ...)` block. First add the two new mocks near the top of the file:

```js
vi.mock('../../api/usuario.service');
vi.mock('../../api/rol.service');
```

and their imports:

```js
import usuarioService from '../../api/usuario.service';
import rolService from '../../api/rol.service';
```

and a `beforeEach` default so every existing test still passes without modification:

```js
  beforeEach(() => {
    localStorage.clear();
    window.innerWidth = 1280;
    usuarioService.listar.mockResolvedValue([]);
    rolService.listar.mockResolvedValue([]);
  });
```

Then append these new tests:

```js
  it('creates an area without a líder when the checkbox is left unchecked', async () => {
    useAuth.mockReturnValue({ isAdmin: true });
    areaService.listar.mockResolvedValue([]);
    areaService.crear.mockResolvedValue({ id: 1, nombre: 'SGI', codigo: 'SGI' });
    renderPagina();

    await screen.findByText('Sin áreas todavía');
    await userEvent.click(screen.getByRole('button', { name: /crear área/i }));
    await userEvent.type(screen.getByLabelText('Nombre'), 'SGI');
    await userEvent.type(screen.getByLabelText('Código'), 'SGI');
    await userEvent.click(screen.getByRole('button', { name: 'Crear' }));

    await waitFor(() => expect(areaService.crear).toHaveBeenCalledWith({ nombre: 'SGI', codigo: 'SGI' }));
  });

  it('creates a new lider usuario inline when "Asignar líder de área" and "Usuario nuevo" are used', async () => {
    useAuth.mockReturnValue({ isAdmin: true });
    areaService.listar.mockResolvedValue([]);
    rolService.listar.mockResolvedValue([{ id: 3, nombre: 'lider_area' }]);
    areaService.crear.mockResolvedValue({ id: 1, nombre: 'RRHH', codigo: 'RRHH', liderUsuarioId: 10 });
    renderPagina();

    await screen.findByText('Sin áreas todavía');
    await userEvent.click(screen.getByRole('button', { name: /crear área/i }));
    await userEvent.type(screen.getByLabelText('Nombre'), 'RRHH');
    await userEvent.type(screen.getByLabelText('Código'), 'RRHH');

    await userEvent.click(screen.getByLabelText('Asignar líder de área'));
    await userEvent.type(screen.getByLabelText('Nombre del líder'), 'Juan');
    await userEvent.type(screen.getByLabelText('Apellido del líder'), 'Pérez');
    await userEvent.type(screen.getByLabelText('Email del líder'), 'jperez@istho.com.co');
    await userEvent.type(screen.getByLabelText('Contraseña del líder'), 'Clave123!');
    await userEvent.selectOptions(screen.getByLabelText('Rol del líder'), '3');

    await userEvent.click(screen.getByRole('button', { name: 'Crear' }));

    await waitFor(() =>
      expect(areaService.crear).toHaveBeenCalledWith({
        nombre: 'RRHH',
        codigo: 'RRHH',
        nuevoUsuario: {
          username: 'jperez',
          email: 'jperez@istho.com.co',
          nombre: 'Juan',
          apellido: 'Pérez',
          password: 'Clave123!',
          rolId: 3,
          requiereCambioPassword: true,
        },
      })
    );
  });

  it('assigns an existing usuario as líder when "Usuario existente" is selected', async () => {
    useAuth.mockReturnValue({ isAdmin: true });
    areaService.listar.mockResolvedValue([]);
    usuarioService.listar.mockResolvedValue([{ id: 7, nombre: 'Ana', apellido: 'Gómez', username: 'agomez' }]);
    areaService.crear.mockResolvedValue({ id: 1, nombre: 'TI', codigo: 'TI', liderUsuarioId: 7 });
    renderPagina();

    await screen.findByText('Sin áreas todavía');
    await userEvent.click(screen.getByRole('button', { name: /crear área/i }));
    await userEvent.type(screen.getByLabelText('Nombre'), 'TI');
    await userEvent.type(screen.getByLabelText('Código'), 'TI');

    await userEvent.click(screen.getByLabelText('Asignar líder de área'));
    await userEvent.click(screen.getByLabelText('Usuario existente'));
    await userEvent.selectOptions(screen.getByLabelText('Usuario líder'), '7');

    await userEvent.click(screen.getByRole('button', { name: 'Crear' }));

    await waitFor(() => expect(areaService.crear).toHaveBeenCalledWith({ nombre: 'TI', codigo: 'TI', liderUsuarioId: 7 }));
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npm test -- AreasListado area.service`
Expected: FAIL — the checkbox/radio/selects don't exist yet in `AreasListado.jsx`, and `area.service.js` doesn't forward the extended payload

- [ ] **Step 3: Write the implementation**

Replace `frontend/src/api/area.service.js` entirely:

```js
// frontend/src/api/area.service.js
import apiClient from './client';

async function listar() {
  const response = await apiClient.get('/areas');
  return response.data;
}

async function crear(datos) {
  const response = await apiClient.post('/areas', datos);
  return response.data;
}

export default { listar, crear };
```

Replace `frontend/src/pages/areas/AreasListado.jsx` entirely:

```jsx
// frontend/src/pages/areas/AreasListado.jsx
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useSnackbar } from 'notistack';
import { Plus, Building2 } from 'lucide-react';
import areaService from '../../api/area.service';
import usuarioService from '../../api/usuario.service';
import rolService from '../../api/rol.service';
import { sugerirUsername } from '../../utils/sugerirUsername';
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
  const [asignarLider, setAsignarLider] = useState(false);
  const [modoLider, setModoLider] = useState('nuevo');
  const [roles, setRoles] = useState([]);
  const [usuariosExistentes, setUsuariosExistentes] = useState([]);
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm();

  const nombreLiderForm = watch('liderNombre');
  const apellidoLiderForm = watch('liderApellido');

  async function cargarAreas() {
    setCargando(true);
    try {
      const data = await areaService.listar();
      setAreas(data);
    } catch (error) {
      setAreas([]);
      enqueueSnackbar(error?.message || 'No se pudieron cargar las áreas', { variant: 'error' });
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargarAreas();
  }, []);

  useEffect(() => {
    if (!asignarLider) return;
    async function cargarCatalogosLider() {
      try {
        const [rolesData, usuariosData] = await Promise.all([rolService.listar(), usuarioService.listar()]);
        setRoles(rolesData);
        setUsuariosExistentes(usuariosData);
      } catch {
        setRoles([]);
        setUsuariosExistentes([]);
      }
    }
    cargarCatalogosLider();
  }, [asignarLider]);

  function onApellidoLiderBlur() {
    if (nombreLiderForm && apellidoLiderForm) {
      setValue('liderUsername', sugerirUsername(nombreLiderForm, apellidoLiderForm));
    }
  }

  function cerrarModal() {
    setModalAbierto(false);
    setAsignarLider(false);
    setModoLider('nuevo');
    reset();
  }

  async function onCrear(valores) {
    const payload = { nombre: valores.nombre, codigo: valores.codigo };

    if (asignarLider && modoLider === 'nuevo') {
      payload.nuevoUsuario = {
        username: valores.liderUsername,
        email: valores.liderEmail,
        nombre: valores.liderNombre,
        apellido: valores.liderApellido,
        password: valores.liderPassword,
        rolId: Number(valores.liderRolId),
        requiereCambioPassword: true,
      };
    } else if (asignarLider && modoLider === 'existente') {
      payload.liderUsuarioId = Number(valores.liderUsuarioId);
    }

    try {
      await areaService.crear(payload);
      enqueueSnackbar('Área creada exitosamente', { variant: 'success' });
      cerrarModal();
      await cargarAreas();
    } catch (error) {
      enqueueSnackbar(error?.message || 'No se pudo crear el área', { variant: 'error' });
    }
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
        onClose={cerrarModal}
        title="Crear área"
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={cerrarModal}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit(onCrear)}>Crear</Button>
          </>
        }
      >
        <form className="space-y-4">
          <Input label="Nombre" error={errors.nombre?.message} {...register('nombre', { required: 'El nombre es obligatorio' })} />
          <Input label="Código" error={errors.codigo?.message} {...register('codigo', { required: 'El código es obligatorio' })} />

          <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
            <input type="checkbox" checked={asignarLider} onChange={(e) => setAsignarLider(e.target.checked)} />
            Asignar líder de área
          </label>

          {asignarLider && (
            <div className="space-y-4 pl-4 border-l-2 border-slate-100 dark:border-slate-700">
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                  <input type="radio" name="modoLider" checked={modoLider === 'nuevo'} onChange={() => setModoLider('nuevo')} />
                  Usuario nuevo
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                  <input type="radio" name="modoLider" checked={modoLider === 'existente'} onChange={() => setModoLider('existente')} />
                  Usuario existente
                </label>
              </div>

              {modoLider === 'nuevo' && (
                <>
                  <Input label="Nombre del líder" {...register('liderNombre', { required: asignarLider && modoLider === 'nuevo' })} />
                  <Input
                    label="Apellido del líder"
                    {...register('liderApellido', { required: asignarLider && modoLider === 'nuevo', onBlur: onApellidoLiderBlur })}
                  />
                  <Input label="Email del líder" type="email" {...register('liderEmail', { required: asignarLider && modoLider === 'nuevo' })} />
                  <Input label="Username del líder" {...register('liderUsername', { required: asignarLider && modoLider === 'nuevo' })} />
                  <Input
                    label="Contraseña del líder"
                    type="password"
                    {...register('liderPassword', { required: asignarLider && modoLider === 'nuevo' })}
                  />
                  <div>
                    <label htmlFor="lider-rolId" className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
                      Rol del líder
                    </label>
                    <select
                      id="lider-rolId"
                      className="w-full py-2.5 px-4 border border-slate-200 dark:border-slate-600 rounded-xl text-sm bg-white dark:bg-centhrix-surface text-slate-900 dark:text-slate-100"
                      {...register('liderRolId', { required: asignarLider && modoLider === 'nuevo' })}
                    >
                      <option value="">Selecciona un rol</option>
                      {roles.map((rol) => (
                        <option key={rol.id} value={rol.id}>
                          {rol.nombre}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              {modoLider === 'existente' && (
                <div>
                  <label htmlFor="lider-usuarioId" className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
                    Usuario líder
                  </label>
                  <select
                    id="lider-usuarioId"
                    className="w-full py-2.5 px-4 border border-slate-200 dark:border-slate-600 rounded-xl text-sm bg-white dark:bg-centhrix-surface text-slate-900 dark:text-slate-100"
                    {...register('liderUsuarioId', { required: asignarLider && modoLider === 'existente' })}
                  >
                    <option value="">Selecciona un usuario</option>
                    {usuariosExistentes.map((usuario) => (
                      <option key={usuario.id} value={usuario.id}>
                        {usuario.nombre} {usuario.apellido} ({usuario.username})
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}
        </form>
      </Modal>
    </div>
  );
}
```

Note: the `liderUsername` field is registered as a plain `Input` (not autosuggested-and-locked) so the admin can still edit it before submit, matching the Global Constraint that the suggestion is always editable.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npm test -- AreasListado area.service`
Expected: PASS (9 + 4 tests)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/areas/AreasListado.jsx frontend/src/pages/areas/AreasListado.test.jsx frontend/src/api/area.service.js frontend/src/api/area.service.test.js
git commit -m "feat(frontend): assign a líder to an área, creating a new usuario or picking an existing one"
```

---

### Task 7: Documentation and final verification

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: nothing (documentation only).
- Produces: nothing consumed by other tasks — final task.

- [ ] **Step 1: Update the README**

In the `## Documentación` section, add a new bullet right after the Documentos frontend design spec line:

```markdown
- Diseño de creación de usuario al crear un Área (módulo de Usuarios CRUD, endpoint de Roles de solo lectura, asignación de líder): `docs/superpowers/specs/2026-07-08-cod-usuario-al-crear-area-design.md`
```

In the `## Backend (\`server/\`)` section, add a short note (create this note as a new paragraph after the existing backend content, before the `## Frontend` heading):

```markdown

Los módulos de Usuarios (`/usuarios`) y Roles de solo lectura (`/roles`) ya están implementados. Crear un Área acepta opcionalmente `liderUsuarioId` (usuario existente) o `nuevoUsuario` (crea el usuario y el área en una sola transacción).
```

In the `## Frontend (\`frontend/\`)` section, add a short note after the existing Documentos note:

```markdown

El módulo de Usuarios (`Administración > Usuarios`) ya está implementado: listado, creación, edición (incluye reseteo de contraseña) y baja lógica. El modal "Crear área" permite asignar un líder creando un usuario nuevo inline o eligiendo uno existente.
```

- [ ] **Step 2: Run the full test suites**

Run: `cd server && npm test`
Expected: PASS — all backend tests green, including every test added in Tasks 1-3

Run: `cd frontend && npm test`
Expected: PASS — all frontend tests green, including every test added in Tasks 4-6

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: document the Usuarios module and líder-al-crear-área flow"
```

---

## Not covered by this plan (deliberately, per the design spec)

- Editing/deleting Roles or the Matriz de Accesos (still placeholders).
- Blocking deletion of a usuario who is currently a líder of an active área.
- Forcing a password change at login (`requiereCambioPassword` is set but not enforced in `auth.controller.js`).
- Emailing credentials (no email service exists).
- The "Detalle de Área" module (separate spec, next in the queue).
