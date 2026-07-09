# Módulo de Proveedores Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Proveedores y Contratistas module end to end: backend CRUD for
`Proveedor`, a read-only `RequisitoProveedor` catalog endpoint, the provider's
expediente documental (`ProveedorDocumento` upload/list/download/delete with
vigencia tracking), a daily recalculation job extension, and the corresponding
frontend pages (`ProveedoresListado`, `ProveedorDetalle`).

**Architecture:** The data model (`Proveedor`, `RequisitoProveedor`,
`ProveedorDocumento`, `EvaluacionProveedor`) and its migrations already exist and
are already run — this plan only adds the missing controller/route/service/page
layer on top of them. `ProveedorDocumento` is the expediente documental itself
(no `Carpeta` reuse needed). File uploads reuse the existing
`middlewares/upload.js` (`subirArchivoUnico`) and
`services/almacenamiento.service.js` (`guardarArchivo`) exactly as `Documento`
already does.

**Tech Stack:** Express + Sequelize (backend), React 19 + Vite 7 + Tailwind v4 +
react-router-dom v7 + react-hook-form (frontend), Jest + supertest (backend
tests), Vitest + Testing Library (frontend tests).

## Global Constraints

- No backend model/migration changes — `Proveedor`, `RequisitoProveedor`,
  `ProveedorDocumento`, `EvaluacionProveedor` and their migrations stay exactly
  as they are today.
- Read-only `RequisitoProveedor` catalog in this cycle — no admin CRUD UI for
  it (same as `TipoDocumento` today).
- `financiera` role gains `proveedores: ['ver', 'crear', 'editar']` (today only
  `['ver']`); `operaciones` keeps its current `['ver', 'crear', 'editar',
  'evaluar']`.
- Expediente document deletion is a real delete (`ProveedorDocumento` has no
  `activo` column, unlike `Documento`) — not a "baja lógica" toggle.
- Vigencia alert threshold for `ProveedorDocumento` is a fixed 30-day constant
  (no per-requisito configurable field, unlike `TipoDocumento`).
- `EvaluacionProveedor` (evaluación de proveedores) is explicitly out of scope
  for this plan — no controller, route, or UI for it.
- Testing convention: Vitest + Testing Library, `describe`/`it` in English for
  frontend; Jest `describe`/`it` (mixed Spanish domain terms are fine, matches
  existing backend tests) for backend, real DB via `createMigrator(...).up()`
  (no per-test reset — use `Date.now()`-suffixed unique values, same as
  `area.routes.test.js`).
- Every new file ships with its test in the same commit.

---

### Task 1: `calcularEstadoProveedorDocumento` service

**Files:**
- Create: `server/src/services/proveedorDocumento.service.js`
- Test: `server/tests/unit/proveedorDocumento.service.test.js`

**Interfaces:**
- Produces: `calcularEstadoProveedorDocumento({ vigenciaHasta, hoy = new Date() }) => 'vigente' | 'por_vencer' | 'vencido'`.
  Consumed by Task 3 (upload endpoint) and Task 4 (daily job).

- [ ] **Step 1: Write the failing test**

Create `server/tests/unit/proveedorDocumento.service.test.js`:

```js
const { calcularEstadoProveedorDocumento } = require('../../src/services/proveedorDocumento.service');

function fechaEnDias(dias) {
  return new Date(Date.now() + dias * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

describe('calcularEstadoProveedorDocumento', () => {
  it('returns vigente when there is no vigenciaHasta', () => {
    expect(calcularEstadoProveedorDocumento({ vigenciaHasta: null })).toBe('vigente');
  });

  it('returns vigente when vigenciaHasta is more than 30 days away', () => {
    expect(calcularEstadoProveedorDocumento({ vigenciaHasta: fechaEnDias(45) })).toBe('vigente');
  });

  it('returns por_vencer when vigenciaHasta is within 30 days', () => {
    expect(calcularEstadoProveedorDocumento({ vigenciaHasta: fechaEnDias(15) })).toBe('por_vencer');
  });

  it('returns vencido when vigenciaHasta already passed', () => {
    expect(calcularEstadoProveedorDocumento({ vigenciaHasta: fechaEnDias(-1) })).toBe('vencido');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx jest tests/unit/proveedorDocumento.service.test.js`
Expected: FAIL — the module does not exist yet.

- [ ] **Step 3: Write the implementation**

Create `server/src/services/proveedorDocumento.service.js`:

```js
const DIA_MS = 24 * 60 * 60 * 1000;
const DIAS_ALERTA_VENCIMIENTO = 30;

function calcularEstadoProveedorDocumento({ vigenciaHasta, hoy = new Date() }) {
  if (!vigenciaHasta) return 'vigente';
  const fechaVencimiento = new Date(`${vigenciaHasta}T00:00:00`);
  const diasRestantes = Math.floor((fechaVencimiento.getTime() - hoy.getTime()) / DIA_MS);
  if (diasRestantes < 0) return 'vencido';
  if (diasRestantes <= DIAS_ALERTA_VENCIMIENTO) return 'por_vencer';
  return 'vigente';
}

module.exports = { calcularEstadoProveedorDocumento };
```

(Unlike `Documento`, `ProveedorDocumento.estado`'s ENUM has no `sin_vigencia`
value — see the migration `20260702100800-crear-proveedores.js` — so a document
with no `vigenciaHasta` is treated as `vigente` by default.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx jest tests/unit/proveedorDocumento.service.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add server/src/services/proveedorDocumento.service.js server/tests/unit/proveedorDocumento.service.test.js
git commit -m "feat(backend): add calcularEstadoProveedorDocumento for expediente vigencia"
```

---

### Task 2: Proveedor CRUD + RequisitoProveedor catalog + permission seed

**Files:**
- Create: `server/src/controllers/proveedor.controller.js`
- Create: `server/src/routes/proveedor.routes.js`
- Create: `server/src/controllers/requisitoProveedor.controller.js`
- Create: `server/src/routes/requisitoProveedor.routes.js`
- Modify: `server/src/routes/index.js`
- Modify: `server/src/scripts/seedRolesPermisos.js`
- Test: `server/tests/integration/proveedor.routes.test.js`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `GET/POST /api/v1/proveedores`, `GET/PUT/DELETE
  /api/v1/proveedores/:id`, `GET /api/v1/requisitos-proveedor`. Router object
  exported from `proveedor.routes.js` — Task 3 extends this same file with
  `/:id/documentos` sub-routes. `financiera` role now has `proveedores: ['ver',
  'crear', 'editar']`.

- [ ] **Step 1: Write the failing test**

Create `server/tests/integration/proveedor.routes.test.js`:

```js
const request = require('supertest');
const bcrypt = require('bcryptjs');
const { sequelize } = require('../../src/config/database');
const { createMigrator } = require('../../src/config/migrator');
const seedRolesPermisos = require('../../src/scripts/seedRolesPermisos');
const seedRequisitosProveedor = require('../../src/scripts/seedRequisitosProveedor');
const { Rol, Usuario } = require('../../src/models');
const { invalidarCachePermisos } = require('../../src/middlewares/roles');
const { app } = require('../../server');

let token;
let financieraToken;
let solicitanteToken;

beforeAll(async () => {
  await sequelize.authenticate();
  await createMigrator(sequelize).up();
  await seedRolesPermisos();
  await seedRequisitosProveedor();
  invalidarCachePermisos();

  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ username: 'admin', password: process.env.SEED_PASSWORD_ADMIN || 'CambiarAhora123!' });
  token = res.body.data.token;

  const financieraRol = await Rol.findOne({ where: { nombre: 'financiera' } });
  const financieraUsername = `financiera_prov_${Date.now()}`;
  await Usuario.create({
    username: financieraUsername,
    email: `${financieraUsername}@istho.com.co`,
    passwordHash: await bcrypt.hash('ClaveFinanciera123!', 10),
    nombre: 'Financiera',
    apellido: 'Prueba',
    rolId: financieraRol.id,
  });
  const financieraLogin = await request(app)
    .post('/api/v1/auth/login')
    .send({ username: financieraUsername, password: 'ClaveFinanciera123!' });
  financieraToken = financieraLogin.body.data.token;

  const solicitanteRol = await Rol.findOne({ where: { nombre: 'solicitante' } });
  const solicitanteUsername = `solicitante_prov_${Date.now()}`;
  await Usuario.create({
    username: solicitanteUsername,
    email: `${solicitanteUsername}@istho.com.co`,
    passwordHash: await bcrypt.hash('ClaveSolicitante123!', 10),
    nombre: 'Solicitante',
    apellido: 'Prueba',
    rolId: solicitanteRol.id,
  });
  const solicitanteLogin = await request(app)
    .post('/api/v1/auth/login')
    .send({ username: solicitanteUsername, password: 'ClaveSolicitante123!' });
  solicitanteToken = solicitanteLogin.body.data.token;
});

afterAll(async () => {
  await sequelize.close();
});

describe('Proveedores API', () => {
  it('creates and lists a proveedor, defaulting estado to en_evaluacion', async () => {
    const documentoIdentificacion = `900${Date.now()}`;
    const createRes = await request(app)
      .post('/api/v1/proveedores')
      .set('Authorization', `Bearer ${token}`)
      .send({ tipo: 'proveedor', documentoIdentificacion, razonSocial: 'Insumos ABC SAS', criticidad: 'media' });
    expect(createRes.status).toBe(201);
    expect(createRes.body.data.estado).toBe('en_evaluacion');

    const listRes = await request(app).get('/api/v1/proveedores').set('Authorization', `Bearer ${token}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.data.some((p) => p.documentoIdentificacion === documentoIdentificacion)).toBe(true);
  });

  it('returns 409 (not a hang) when documentoIdentificacion already exists', async () => {
    const documentoIdentificacion = `901${Date.now()}`;
    const first = await request(app)
      .post('/api/v1/proveedores')
      .set('Authorization', `Bearer ${token}`)
      .send({ tipo: 'proveedor', documentoIdentificacion, razonSocial: 'Duplicado SAS' });
    expect(first.status).toBe(201);

    const second = await request(app)
      .post('/api/v1/proveedores')
      .set('Authorization', `Bearer ${token}`)
      .send({ tipo: 'proveedor', documentoIdentificacion, razonSocial: 'Duplicado Otra Vez SAS' });
    expect(second.status).toBe(409);
  });

  it('returns 400 when razonSocial is missing', async () => {
    const res = await request(app)
      .post('/api/v1/proveedores')
      .set('Authorization', `Bearer ${token}`)
      .send({ tipo: 'proveedor', documentoIdentificacion: `902${Date.now()}` });
    expect(res.status).toBe(400);
  });

  it('allows financiera to create a proveedor', async () => {
    const res = await request(app)
      .post('/api/v1/proveedores')
      .set('Authorization', `Bearer ${financieraToken}`)
      .send({ tipo: 'contratista', documentoIdentificacion: `903${Date.now()}`, razonSocial: 'Contratista Financiera SAS' });
    expect(res.status).toBe(201);
  });

  it('returns 403 when solicitante tries to create a proveedor', async () => {
    const res = await request(app)
      .post('/api/v1/proveedores')
      .set('Authorization', `Bearer ${solicitanteToken}`)
      .send({ tipo: 'proveedor', documentoIdentificacion: `904${Date.now()}`, razonSocial: 'No autorizado SAS' });
    expect(res.status).toBe(403);
  });

  it('edits a proveedor and gives it a logical baja on delete', async () => {
    const createRes = await request(app)
      .post('/api/v1/proveedores')
      .set('Authorization', `Bearer ${token}`)
      .send({ tipo: 'proveedor', documentoIdentificacion: `905${Date.now()}`, razonSocial: 'Editable SAS' });
    const id = createRes.body.data.id;

    const editRes = await request(app)
      .put(`/api/v1/proveedores/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ razonSocial: 'Editable SAS Modificada' });
    expect(editRes.status).toBe(200);
    expect(editRes.body.data.razonSocial).toBe('Editable SAS Modificada');

    const deleteRes = await request(app).delete(`/api/v1/proveedores/${id}`).set('Authorization', `Bearer ${token}`);
    expect(deleteRes.status).toBe(200);

    const obtenerRes = await request(app).get(`/api/v1/proveedores/${id}`).set('Authorization', `Bearer ${token}`);
    expect(obtenerRes.body.data.estado).toBe('inactivo');
  });
});

describe('Requisitos de Proveedor API', () => {
  it('lists the seeded requisitos', async () => {
    const res = await request(app).get('/api/v1/requisitos-proveedor').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(5);
    expect(res.body.data.some((r) => r.nombre === 'Certificado SARLAFT')).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && npx jest tests/integration/proveedor.routes.test.js`
Expected: FAIL — none of the routes/controllers exist yet.

- [ ] **Step 3: Write the controllers and routes**

Create `server/src/controllers/proveedor.controller.js`:

```js
const { Proveedor, Auditoria } = require('../models');
const { success, created, notFound, badRequest } = require('../utils/responses');

async function listar(req, res) {
  const { estado, tipo, criticidad } = req.query;
  const where = {};
  if (estado) where.estado = estado;
  if (tipo) where.tipo = tipo;
  if (criticidad) where.criticidad = criticidad;

  const proveedores = await Proveedor.findAll({ where, order: [['razonSocial', 'ASC']] });
  return success(res, proveedores);
}

async function obtener(req, res) {
  const proveedor = await Proveedor.findByPk(req.params.id);
  if (!proveedor) return notFound(res, 'Proveedor no encontrado');
  return success(res, proveedor);
}

async function crear(req, res) {
  const { tipo, documentoIdentificacion, razonSocial, criticidad, categoria, responsableUsuarioId } = req.body;

  if (!tipo || !documentoIdentificacion || !razonSocial) {
    return badRequest(res, 'tipo, documentoIdentificacion y razonSocial son obligatorios');
  }

  // La unicidad de documentoIdentificacion la aplica la restricción UNIQUE de
  // la tabla; un duplicado lanza SequelizeUniqueConstraintError, que el
  // middleware de errores global (server.js) ya traduce a 409 — mismo
  // mecanismo que usa Area.codigo, sin necesidad de un pre-chequeo manual aquí.
  const proveedor = await Proveedor.create({
    tipo, documentoIdentificacion, razonSocial,
    criticidad: criticidad || 'media',
    categoria: categoria || null,
    responsableUsuarioId: responsableUsuarioId || null,
  });

  await Auditoria.registrar({
    tabla: 'proveedores', registroId: proveedor.id, accion: 'crear',
    usuarioId: req.user.id, usuarioNombre: req.user.nombreCompleto, datosNuevos: proveedor.toJSON(),
  });

  return created(res, 'Proveedor creado', proveedor);
}

async function editar(req, res) {
  const proveedor = await Proveedor.findByPk(req.params.id);
  if (!proveedor) return notFound(res, 'Proveedor no encontrado');

  const { razonSocial, criticidad, categoria, responsableUsuarioId, estado } = req.body;

  const datosAnteriores = proveedor.toJSON();
  const cambios = {};
  if (razonSocial !== undefined) cambios.razonSocial = razonSocial;
  if (criticidad !== undefined) cambios.criticidad = criticidad;
  if (categoria !== undefined) cambios.categoria = categoria;
  if (responsableUsuarioId !== undefined) cambios.responsableUsuarioId = responsableUsuarioId;
  if (estado !== undefined) cambios.estado = estado;

  await proveedor.update(cambios);

  await Auditoria.registrar({
    tabla: 'proveedores', registroId: proveedor.id, accion: 'actualizar',
    usuarioId: req.user.id, usuarioNombre: req.user.nombreCompleto, datosAnteriores, datosNuevos: proveedor.toJSON(),
  });

  return success(res, proveedor);
}

async function eliminar(req, res) {
  const proveedor = await Proveedor.findByPk(req.params.id);
  if (!proveedor) return notFound(res, 'Proveedor no encontrado');

  const datosAnteriores = proveedor.toJSON();
  await proveedor.update({ estado: 'inactivo' });
  await Auditoria.registrar({
    tabla: 'proveedores', registroId: proveedor.id, accion: 'eliminar',
    usuarioId: req.user.id, usuarioNombre: req.user.nombreCompleto, datosAnteriores,
  });

  return success(res, null, 'Proveedor dado de baja');
}

module.exports = { listar, obtener, crear, editar, eliminar };
```

(`listar` has no default `estado` filter, unlike `Area`/`Documento`'s
`where: { activo: true }` — `Proveedor` has no boolean `activo` flag, `estado`
is itself a first-class filterable field with 4 values, not a hidden
soft-delete flag, so by default the list shows every estado unless the caller
filters.)

Create `server/src/routes/proveedor.routes.js`:

```js
const express = require('express');
const router = express.Router();
const { verificarToken } = require('../middlewares/auth');
const { requierePermiso } = require('../middlewares/roles');
const controller = require('../controllers/proveedor.controller');
const asyncHandler = require('../utils/asyncHandler');

router.get('/', verificarToken, requierePermiso('proveedores', 'ver'), asyncHandler(controller.listar));
router.post('/', verificarToken, requierePermiso('proveedores', 'crear'), asyncHandler(controller.crear));
router.get('/:id', verificarToken, requierePermiso('proveedores', 'ver'), asyncHandler(controller.obtener));
router.put('/:id', verificarToken, requierePermiso('proveedores', 'editar'), asyncHandler(controller.editar));
router.delete('/:id', verificarToken, requierePermiso('proveedores', 'eliminar'), asyncHandler(controller.eliminar));

module.exports = router;
```

Create `server/src/controllers/requisitoProveedor.controller.js`:

```js
const { RequisitoProveedor } = require('../models');
const { success } = require('../utils/responses');

async function listar(req, res) {
  const requisitos = await RequisitoProveedor.findAll({ where: { activo: true }, order: [['nombre', 'ASC']] });
  return success(res, requisitos);
}

module.exports = { listar };
```

Create `server/src/routes/requisitoProveedor.routes.js`:

```js
const express = require('express');
const router = express.Router();
const { verificarToken } = require('../middlewares/auth');
const { requierePermiso } = require('../middlewares/roles');
const controller = require('../controllers/requisitoProveedor.controller');
const asyncHandler = require('../utils/asyncHandler');

router.get('/', verificarToken, requierePermiso('proveedores', 'ver'), asyncHandler(controller.listar));

module.exports = router;
```

Modify `server/src/routes/index.js` — add two lines after the `/usuarios` line:

```js
router.use('/proveedores', require('./proveedor.routes'));
router.use('/requisitos-proveedor', require('./requisitoProveedor.routes'));
```

Modify `server/src/scripts/seedRolesPermisos.js` — replace the file in full:

```js
const bcrypt = require('bcryptjs');
const { Rol, Usuario, RolPermiso } = require('../models');
const { CATALOGO_MODULOS } = require('../models/Permiso')();

const ROLES = [
  { nombre: 'admin', nivel: 100, descripcion: 'Acceso total' },
  { nombre: 'financiera', nivel: 80, descripcion: 'Aprueba solicitudes, gestión de compras' },
  { nombre: 'lider_area', nivel: 60, descripcion: 'Gestiona documentos y solicitudes de su área' },
  { nombre: 'operaciones', nivel: 50, descripcion: 'Crea/valida proveedores de transporte' },
  { nombre: 'solicitante', nivel: 30, descripcion: 'Inicia solicitudes, consulta documentos' },
  { nombre: 'auditor', nivel: 20, descripcion: 'Solo lectura + auditoría' },
];

// Matriz inicial — ajustable después desde Administración > Matriz de accesos.
const PERMISOS_POR_ROL = {
  admin: CATALOGO_MODULOS,
  financiera: {
    inicio: ['ver'], areas: ['ver'], documentos: ['ver'],
    solicitudes: ['ver', 'crear', 'comentar', 'cotizar', 'aprobar', 'confirmar', 'exportar'],
    proveedores: ['ver', 'crear', 'editar'], formularios: ['ver'], reportes: ['ver', 'exportar'], perfil: ['ver', 'cambiar_password'],
  },
  lider_area: {
    inicio: ['ver'], areas: ['ver'], area_detalle: ['ver'],
    documentos: ['ver', 'crear', 'editar', 'aprobar_version', 'exportar'],
    solicitudes: ['ver', 'crear', 'comentar', 'exportar'],
    formularios: ['ver', 'crear', 'editar'], reportes: ['ver', 'exportar'], perfil: ['ver', 'cambiar_password'],
  },
  operaciones: {
    inicio: ['ver'], proveedores: ['ver', 'crear', 'editar', 'evaluar'],
    solicitudes: ['ver', 'crear', 'comentar'], perfil: ['ver', 'cambiar_password'],
  },
  solicitante: {
    inicio: ['ver'], areas: ['ver'], area_detalle: ['ver'], documentos: ['ver'],
    solicitudes: ['ver', 'crear', 'comentar'], formularios: ['ver'], perfil: ['ver', 'cambiar_password'],
  },
  auditor: { inicio: ['ver'], auditoria: ['ver'], perfil: ['ver', 'cambiar_password'] },
};

module.exports = async function seedRolesPermisos() {
  for (const rolDef of ROLES) {
    const [rol] = await Rol.findOrCreate({ where: { nombre: rolDef.nombre }, defaults: rolDef });

    const permisos = PERMISOS_POR_ROL[rolDef.nombre] || {};
    for (const [modulo, acciones] of Object.entries(permisos)) {
      await RolPermiso.findOrCreate({
        where: { rolId: rol.id, modulo },
        defaults: { rolId: rol.id, modulo, acciones },
      });
    }
  }

  // findOrCreate arriba no actualiza filas que ya existían con una matriz de
  // permisos anterior. `financiera` tenía `proveedores: ['ver']` desde el
  // diseño original de RBAC; este módulo le agrega `crear`/`editar`, así que
  // cualquier entorno donde el seed ya corrió antes necesita esta corrección
  // explícita para que el cambio realmente tome efecto (en vez de quedar
  // silenciosamente ignorado por el findOrCreate de arriba).
  const financieraRol = await Rol.findOne({ where: { nombre: 'financiera' } });
  if (financieraRol) {
    await RolPermiso.update(
      { acciones: PERMISOS_POR_ROL.financiera.proveedores },
      { where: { rolId: financieraRol.id, modulo: 'proveedores' } }
    );
  }

  const adminRol = await Rol.findOne({ where: { nombre: 'admin' } });
  const existingAdmin = await Usuario.unscoped().findOne({ where: { username: 'admin' } });
  if (!existingAdmin) {
    const passwordHash = await bcrypt.hash(process.env.SEED_PASSWORD_ADMIN || 'CambiarAhora123!', 10);
    await Usuario.create({
      username: 'admin',
      email: 'admin@istho.com.co',
      passwordHash,
      nombre: 'Administrador',
      apellido: 'COD',
      rolId: adminRol.id,
      requiereCambioPassword: true,
    });
  }
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd server && npx jest tests/integration/proveedor.routes.test.js`
Expected: PASS (7 tests)

- [ ] **Step 5: Run the full backend test suite**

Run: `cd server && npm test`
Expected: all tests pass, no regressions in `rbac.test.js` or other suites.

- [ ] **Step 6: Commit**

```bash
git add server/src/controllers/proveedor.controller.js server/src/routes/proveedor.routes.js server/src/controllers/requisitoProveedor.controller.js server/src/routes/requisitoProveedor.routes.js server/src/routes/index.js server/src/scripts/seedRolesPermisos.js server/tests/integration/proveedor.routes.test.js
git commit -m "feat(backend): add Proveedor CRUD, RequisitoProveedor catalog, and financiera permissions"
```

---

### Task 3: Expediente documental — `ProveedorDocumento` upload/list/download/delete

**Files:**
- Create: `server/src/controllers/proveedorDocumento.controller.js`
- Modify: `server/src/routes/proveedor.routes.js`
- Test: `server/tests/integration/proveedorDocumento.routes.test.js`

**Interfaces:**
- Consumes: `calcularEstadoProveedorDocumento` (Task 1); `Proveedor` CRUD routes
  already registered at `/proveedores` (Task 2, same router file extended
  here); existing `subirArchivoUnico` middleware
  (`server/src/middlewares/upload.js`, unchanged) and `guardarArchivo`/
  `obtenerRutaAbsoluta` (`server/src/services/almacenamiento.service.js`,
  unchanged).
- Produces: `GET /api/v1/proveedores/:id/documentos`, `POST
  /api/v1/proveedores/:id/documentos`, `GET
  /api/v1/proveedores/:id/documentos/:docId/descargar`, `DELETE
  /api/v1/proveedores/:id/documentos/:docId`. Consumed by Task 5's
  `proveedorDocumento.service.js` (frontend) and Task 7's `ProveedorDetalle.jsx`.

- [ ] **Step 1: Write the failing test**

Create `server/tests/integration/proveedorDocumento.routes.test.js`:

```js
const request = require('supertest');
const path = require('path');
const { sequelize } = require('../../src/config/database');
const { createMigrator } = require('../../src/config/migrator');
const seedRolesPermisos = require('../../src/scripts/seedRolesPermisos');
const seedRequisitosProveedor = require('../../src/scripts/seedRequisitosProveedor');
const { Proveedor, RequisitoProveedor } = require('../../src/models');
const { app } = require('../../server');

let token;
let proveedor;
let requisitoRut;

beforeAll(async () => {
  await sequelize.authenticate();
  await createMigrator(sequelize).up();
  await seedRolesPermisos();
  await seedRequisitosProveedor();

  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ username: 'admin', password: process.env.SEED_PASSWORD_ADMIN || 'CambiarAhora123!' });
  token = res.body.data.token;

  proveedor = await Proveedor.create({
    tipo: 'proveedor', documentoIdentificacion: `910${Date.now()}`, razonSocial: 'Expediente SAS',
  });
  requisitoRut = await RequisitoProveedor.findOne({ where: { nombre: 'RUT' } });
});

afterAll(async () => {
  await sequelize.close();
});

describe('Expediente documental del proveedor', () => {
  it('uploads a document linked to a requisito and computes estado vigente', async () => {
    const res = await request(app)
      .post(`/api/v1/proveedores/${proveedor.id}/documentos`)
      .set('Authorization', `Bearer ${token}`)
      .field('requisitoId', String(requisitoRut.id))
      .field('vigenciaDesde', '2026-01-01')
      .field('vigenciaHasta', '2099-01-01')
      .attach('archivo', path.join(__dirname, '../fixtures/documento-prueba.pdf'));

    expect(res.status).toBe(201);
    expect(res.body.data.estado).toBe('vigente');
    expect(res.body.data.s3Key).toMatch(/proveedores/);
  });

  it('returns 400 when vigenciaHasta is not after vigenciaDesde', async () => {
    const res = await request(app)
      .post(`/api/v1/proveedores/${proveedor.id}/documentos`)
      .set('Authorization', `Bearer ${token}`)
      .field('vigenciaDesde', '2026-06-01')
      .field('vigenciaHasta', '2026-01-01')
      .attach('archivo', path.join(__dirname, '../fixtures/documento-prueba.pdf'));
    expect(res.status).toBe(400);
  });

  it('returns 404 when requisitoId does not exist', async () => {
    const res = await request(app)
      .post(`/api/v1/proveedores/${proveedor.id}/documentos`)
      .set('Authorization', `Bearer ${token}`)
      .field('requisitoId', '999999')
      .attach('archivo', path.join(__dirname, '../fixtures/documento-prueba.pdf'));
    expect(res.status).toBe(404);
  });

  it('lists the documents uploaded for a proveedor, including the linked requisito', async () => {
    const res = await request(app)
      .get(`/api/v1/proveedores/${proveedor.id}/documentos`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    expect(res.body.data[0].RequisitoProveedor).toBeDefined();
  });

  it('downloads an uploaded document', async () => {
    const uploadRes = await request(app)
      .post(`/api/v1/proveedores/${proveedor.id}/documentos`)
      .set('Authorization', `Bearer ${token}`)
      .attach('archivo', path.join(__dirname, '../fixtures/documento-prueba.pdf'));
    const docId = uploadRes.body.data.id;

    const descargarRes = await request(app)
      .get(`/api/v1/proveedores/${proveedor.id}/documentos/${docId}/descargar`)
      .set('Authorization', `Bearer ${token}`);
    expect(descargarRes.status).toBe(200);
  });

  it('deletes an uploaded document', async () => {
    const uploadRes = await request(app)
      .post(`/api/v1/proveedores/${proveedor.id}/documentos`)
      .set('Authorization', `Bearer ${token}`)
      .attach('archivo', path.join(__dirname, '../fixtures/documento-prueba.pdf'));
    const docId = uploadRes.body.data.id;

    const deleteRes = await request(app)
      .delete(`/api/v1/proveedores/${proveedor.id}/documentos/${docId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(deleteRes.status).toBe(200);

    const descargarRes = await request(app)
      .get(`/api/v1/proveedores/${proveedor.id}/documentos/${docId}/descargar`)
      .set('Authorization', `Bearer ${token}`);
    expect(descargarRes.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx jest tests/integration/proveedorDocumento.routes.test.js`
Expected: FAIL — the `/documentos` sub-routes don't exist yet.

- [ ] **Step 3: Write the controller**

Create `server/src/controllers/proveedorDocumento.controller.js`:

```js
const { Proveedor, ProveedorDocumento, RequisitoProveedor, Auditoria } = require('../models');
const { success, created, notFound, badRequest } = require('../utils/responses');
const { calcularEstadoProveedorDocumento } = require('../services/proveedorDocumento.service');
const { guardarArchivo, obtenerRutaAbsoluta } = require('../services/almacenamiento.service');

async function listar(req, res) {
  const proveedor = await Proveedor.findByPk(req.params.id);
  if (!proveedor) return notFound(res, 'Proveedor no encontrado');

  const documentos = await ProveedorDocumento.findAll({
    where: { proveedorId: proveedor.id },
    include: [{ model: RequisitoProveedor }],
    order: [['createdAt', 'DESC']],
  });
  return success(res, documentos);
}

async function crear(req, res) {
  const proveedor = await Proveedor.findByPk(req.params.id);
  if (!proveedor) return notFound(res, 'Proveedor no encontrado');
  if (!req.file) return badRequest(res, 'El archivo es obligatorio');

  const { requisitoId, vigenciaDesde, vigenciaHasta } = req.body;
  if (vigenciaDesde && vigenciaHasta && new Date(vigenciaHasta) <= new Date(vigenciaDesde)) {
    return badRequest(res, 'vigenciaHasta debe ser posterior a vigenciaDesde');
  }

  if (requisitoId) {
    const requisito = await RequisitoProveedor.findByPk(requisitoId);
    if (!requisito || !requisito.activo) return notFound(res, 'Requisito no encontrado');
  }

  // Reutiliza guardarArchivo() tal cual (server/src/services/almacenamiento.service.js),
  // pasando 'proveedores/<id>' como subdirectorio — los archivos terminan en
  // uploads/documentos/proveedores/<id>/, conviviendo con los de Documento en
  // vez de abrir un árbol de carpetas propio; es una reutilización deliberada
  // del helper existente, no una carpeta "incorrecta".
  const { ruta } = guardarArchivo(req.file, `proveedores/${proveedor.id}`);
  const estado = calcularEstadoProveedorDocumento({ vigenciaHasta });

  const documento = await ProveedorDocumento.create({
    proveedorId: proveedor.id,
    requisitoId: requisitoId || null,
    s3Key: ruta,
    vigenciaDesde: vigenciaDesde || null,
    vigenciaHasta: vigenciaHasta || null,
    estado,
  });

  await Auditoria.registrar({
    tabla: 'proveedor_documentos', registroId: documento.id, accion: 'crear',
    usuarioId: req.user.id, usuarioNombre: req.user.nombreCompleto, datosNuevos: documento.toJSON(),
  });

  return created(res, 'Documento del expediente subido', documento);
}

async function descargar(req, res) {
  const documento = await ProveedorDocumento.findOne({ where: { id: req.params.docId, proveedorId: req.params.id } });
  if (!documento) return notFound(res, 'Documento no encontrado');
  if (!documento.s3Key) return notFound(res, 'El documento no tiene un archivo asociado');
  return res.download(obtenerRutaAbsoluta(documento.s3Key));
}

async function eliminar(req, res) {
  const documento = await ProveedorDocumento.findOne({ where: { id: req.params.docId, proveedorId: req.params.id } });
  if (!documento) return notFound(res, 'Documento no encontrado');

  const datosAnteriores = documento.toJSON();
  // ProveedorDocumento no tiene columna `activo` (a diferencia de Documento) —
  // no hay baja lógica posible aquí, se hace un delete real. Auditoria conserva
  // datosAnteriores como snapshot, así que el rastro de auditoría no se pierde.
  await documento.destroy();
  await Auditoria.registrar({
    tabla: 'proveedor_documentos', registroId: documento.id, accion: 'eliminar',
    usuarioId: req.user.id, usuarioNombre: req.user.nombreCompleto, datosAnteriores,
  });

  return success(res, null, 'Documento eliminado');
}

module.exports = { listar, crear, descargar, eliminar };
```

- [ ] **Step 4: Wire the routes**

Modify `server/src/routes/proveedor.routes.js` — replace the file in full:

```js
const express = require('express');
const router = express.Router();
const { verificarToken } = require('../middlewares/auth');
const { requierePermiso } = require('../middlewares/roles');
const { subirArchivoUnico } = require('../middlewares/upload');
const controller = require('../controllers/proveedor.controller');
const documentoController = require('../controllers/proveedorDocumento.controller');
const asyncHandler = require('../utils/asyncHandler');

router.get('/', verificarToken, requierePermiso('proveedores', 'ver'), asyncHandler(controller.listar));
router.post('/', verificarToken, requierePermiso('proveedores', 'crear'), asyncHandler(controller.crear));
router.get('/:id', verificarToken, requierePermiso('proveedores', 'ver'), asyncHandler(controller.obtener));
router.put('/:id', verificarToken, requierePermiso('proveedores', 'editar'), asyncHandler(controller.editar));
router.delete('/:id', verificarToken, requierePermiso('proveedores', 'eliminar'), asyncHandler(controller.eliminar));

router.get('/:id/documentos', verificarToken, requierePermiso('proveedores', 'ver'), asyncHandler(documentoController.listar));
router.post('/:id/documentos', verificarToken, requierePermiso('proveedores', 'editar'), subirArchivoUnico, asyncHandler(documentoController.crear));
router.get('/:id/documentos/:docId/descargar', verificarToken, requierePermiso('proveedores', 'ver'), asyncHandler(documentoController.descargar));
router.delete('/:id/documentos/:docId', verificarToken, requierePermiso('proveedores', 'editar'), asyncHandler(documentoController.eliminar));

module.exports = router;
```

(Uploading/deleting expediente documents is gated by `proveedores:editar` — the
catalog has no separate action for expediente management, and `editar` is the
natural gate, matching the spec's Componentes section.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd server && npx jest tests/integration/proveedorDocumento.routes.test.js`
Expected: PASS (6 tests)

- [ ] **Step 6: Run the full backend test suite**

Run: `cd server && npm test`
Expected: all tests pass, including Task 2's `proveedor.routes.test.js`.

- [ ] **Step 7: Commit**

```bash
git add server/src/controllers/proveedorDocumento.controller.js server/src/routes/proveedor.routes.js server/tests/integration/proveedorDocumento.routes.test.js
git commit -m "feat(backend): add the proveedor expediente documental (upload/list/download/delete)"
```

---

### Task 4: Extend the daily recalculation job to `ProveedorDocumento`

**Files:**
- Modify: `server/src/jobs/recalcularEstadosDocumentos.job.js`
- Modify: `server/src/scripts/ejecutarRecalculoEstados.js`
- Test: `server/tests/unit/recalcularEstadosDocumentos.job.test.js`

**Interfaces:**
- Consumes: `calcularEstadoProveedorDocumento` (Task 1).
- Produces: `ejecutarProveedores() => Promise<{ documentosActualizados: number }>`,
  exported alongside the existing `ejecutar`/`programar` from
  `recalcularEstadosDocumentos.job.js`. Not consumed by any later task in this
  plan — it's a standalone cron/manual-trigger entry point.

- [ ] **Step 1: Write the failing test**

Modify `server/tests/unit/recalcularEstadosDocumentos.job.test.js` — add this
import near the top (alongside the existing `Area, Carpeta, TipoDocumento,
Documento` import):

```js
const { Proveedor, ProveedorDocumento } = require('../../src/models');
```

Change the job import line to:

```js
const { ejecutar, ejecutarProveedores } = require('../../src/jobs/recalcularEstadosDocumentos.job');
```

Add this new `describe` block at the end of the file:

```js
describe('recalcularEstadosDocumentos.job — ejecutarProveedores', () => {
  it('flips a proveedor document from vigente to vencido when its vigencia already passed', async () => {
    const proveedor = await Proveedor.create({
      tipo: 'proveedor', documentoIdentificacion: `920${Date.now()}`, razonSocial: 'Job Proveedor SAS',
    });
    const documento = await ProveedorDocumento.create({
      proveedorId: proveedor.id,
      vigenciaHasta: fechaEnDias(-1),
      estado: 'vigente',
    });

    const resultado = await ejecutarProveedores();

    await documento.reload();
    expect(documento.estado).toBe('vencido');
    expect(resultado.documentosActualizados).toBeGreaterThanOrEqual(1);
  });

  it('leaves an already-correct estado untouched', async () => {
    const proveedor = await Proveedor.create({
      tipo: 'proveedor', documentoIdentificacion: `921${Date.now()}`, razonSocial: 'Job Proveedor Vigente SAS',
    });
    const documento = await ProveedorDocumento.create({
      proveedorId: proveedor.id,
      vigenciaHasta: fechaEnDias(365),
      estado: 'vigente',
    });

    await ejecutarProveedores();

    await documento.reload();
    expect(documento.estado).toBe('vigente');
  });
});
```

(`fechaEnDias` is already defined at the top of this file for the existing
`Documento` tests — reuse it as-is.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx jest tests/unit/recalcularEstadosDocumentos.job.test.js`
Expected: FAIL — `ejecutarProveedores` is not exported yet.

- [ ] **Step 3: Implement `ejecutarProveedores`**

Modify `server/src/jobs/recalcularEstadosDocumentos.job.js` — replace the file
in full:

```js
const cron = require('node-cron');

async function ejecutar() {
  const { Documento, TipoDocumento } = require('../models');
  const { calcularEstadoDocumento } = require('../services/documento.service');
  const { recalcularSaludArea } = require('../services/area.service');

  const documentos = await Documento.findAll({ where: { activo: true }, include: [{ model: TipoDocumento }] });
  const areasAfectadas = new Set();
  let documentosActualizados = 0;

  for (const documento of documentos) {
    const diasAlerta = documento.diasAlertaVencimiento ?? documento.TipoDocumento.diasAlertaVencimientoDefault;
    const estado = calcularEstadoDocumento({ vigenciaHasta: documento.vigenciaHasta, diasAlerta });
    if (estado !== documento.estado) {
      await documento.update({ estado });
      areasAfectadas.add(documento.areaId);
      documentosActualizados += 1;
    }
  }

  for (const areaId of areasAfectadas) {
    await recalcularSaludArea(areaId);
  }

  return { documentosActualizados, areasRecalculadas: areasAfectadas.size };
}

async function ejecutarProveedores() {
  const { ProveedorDocumento } = require('../models');
  const { calcularEstadoProveedorDocumento } = require('../services/proveedorDocumento.service');

  const documentos = await ProveedorDocumento.findAll();
  let documentosActualizados = 0;

  for (const documento of documentos) {
    const estado = calcularEstadoProveedorDocumento({ vigenciaHasta: documento.vigenciaHasta });
    if (estado !== documento.estado) {
      await documento.update({ estado });
      documentosActualizados += 1;
    }
  }

  return { documentosActualizados };
}

function programar() {
  const expresion = process.env.CRON_RECALCULO_ESTADOS || '0 3 * * *';
  cron.schedule(expresion, () => {
    ejecutar().catch((err) => console.error('Error en job recalcularEstadosDocumentos:', err));
    ejecutarProveedores().catch((err) => console.error('Error en job recalcularEstadosDocumentos (proveedores):', err));
  });
}

module.exports = { ejecutar, ejecutarProveedores, programar };
```

Modify `server/src/scripts/ejecutarRecalculoEstados.js` — replace the file in
full (extends the manual `npm run job:recalcular-estados` trigger to also
cover proveedores):

```js
require('dotenv').config();
const { sequelize } = require('../config/database');
const { ejecutar, ejecutarProveedores } = require('../jobs/recalcularEstadosDocumentos.job');

Promise.all([ejecutar(), ejecutarProveedores()])
  .then(([resultadoDocumentos, resultadoProveedores]) => {
    console.log('Recálculo de estados completado:', resultadoDocumentos);
    console.log('Recálculo de estados de proveedores completado:', resultadoProveedores);
    return sequelize.close();
  })
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Error ejecutando el recálculo de estados:', err);
    process.exit(1);
  });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd server && npx jest tests/unit/recalcularEstadosDocumentos.job.test.js`
Expected: PASS (existing `Documento` tests + 2 new `ejecutarProveedores` tests)

- [ ] **Step 5: Run the full backend test suite**

Run: `cd server && npm test`
Expected: all tests pass, no regressions.

- [ ] **Step 6: Commit**

```bash
git add server/src/jobs/recalcularEstadosDocumentos.job.js server/src/scripts/ejecutarRecalculoEstados.js server/tests/unit/recalcularEstadosDocumentos.job.test.js
git commit -m "feat(backend): extend the daily recalculation job to ProveedorDocumento vigencia"
```

---

### Task 5: Frontend API service wrappers

**Files:**
- Create: `frontend/src/api/proveedor.service.js`
- Create: `frontend/src/api/proveedor.service.test.js`
- Create: `frontend/src/api/requisitoProveedor.service.js`
- Create: `frontend/src/api/requisitoProveedor.service.test.js`
- Create: `frontend/src/api/proveedorDocumento.service.js`
- Create: `frontend/src/api/proveedorDocumento.service.test.js`

**Interfaces:**
- Consumes: the backend contract from Tasks 2-3 (`/proveedores`,
  `/requisitos-proveedor`, `/proveedores/:id/documentos`) — tests mock
  `apiClient`, no live backend needed.
- Produces: default exports `proveedorService = { listar, obtener, crear,
  editar, eliminar }`, `requisitoProveedorService = { listar }`,
  `proveedorDocumentoService = { listar, crear, eliminar, descargar }`.
  Consumed by Task 6 (`ProveedoresListado.jsx`) and Task 7
  (`ProveedorDetalle.jsx`).

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/api/proveedor.service.test.js`:

```js
import MockAdapter from 'axios-mock-adapter';
import apiClient from './client';
import proveedorService from './proveedor.service';

describe('proveedor.service', () => {
  let mock;

  beforeEach(() => {
    mock = new MockAdapter(apiClient);
  });

  afterEach(() => {
    mock.restore();
  });

  it('listar returns the proveedores array and forwards filtros as query params', async () => {
    mock.onGet('/proveedores').reply(200, { success: true, data: [{ id: 1, razonSocial: 'Insumos ABC' }] });
    const proveedores = await proveedorService.listar({ estado: 'activo' });
    expect(proveedores).toEqual([{ id: 1, razonSocial: 'Insumos ABC' }]);
    expect(mock.history.get[0].params).toEqual({ estado: 'activo' });
  });

  it('obtener returns a single proveedor', async () => {
    mock.onGet('/proveedores/5').reply(200, { success: true, data: { id: 5, razonSocial: 'Transportes XYZ' } });
    const proveedor = await proveedorService.obtener(5);
    expect(proveedor).toEqual({ id: 5, razonSocial: 'Transportes XYZ' });
  });

  it('crear posts the given data and returns the created proveedor', async () => {
    mock.onPost('/proveedores').reply(201, { success: true, data: { id: 2, razonSocial: 'Nuevo SAS' } });
    const proveedor = await proveedorService.crear({ tipo: 'proveedor', documentoIdentificacion: '900123', razonSocial: 'Nuevo SAS' });
    expect(proveedor).toEqual({ id: 2, razonSocial: 'Nuevo SAS' });
  });

  it('editar PUTs the changes and returns the updated proveedor', async () => {
    mock.onPut('/proveedores/1').reply(200, { success: true, data: { id: 1, razonSocial: 'Editado SAS' } });
    const proveedor = await proveedorService.editar(1, { razonSocial: 'Editado SAS' });
    expect(proveedor).toEqual({ id: 1, razonSocial: 'Editado SAS' });
  });

  it('eliminar deletes and returns null', async () => {
    mock.onDelete('/proveedores/1').reply(200, { success: true, data: null });
    const resultado = await proveedorService.eliminar(1);
    expect(resultado).toBeNull();
  });
});
```

Create `frontend/src/api/requisitoProveedor.service.test.js`:

```js
import MockAdapter from 'axios-mock-adapter';
import apiClient from './client';
import requisitoProveedorService from './requisitoProveedor.service';

describe('requisitoProveedor.service', () => {
  let mock;

  beforeEach(() => {
    mock = new MockAdapter(apiClient);
  });

  afterEach(() => {
    mock.restore();
  });

  it('listar returns the requisitos array', async () => {
    mock.onGet('/requisitos-proveedor').reply(200, { success: true, data: [{ id: 1, nombre: 'RUT' }] });
    const requisitos = await requisitoProveedorService.listar();
    expect(requisitos).toEqual([{ id: 1, nombre: 'RUT' }]);
  });
});
```

Create `frontend/src/api/proveedorDocumento.service.test.js`:

```js
import MockAdapter from 'axios-mock-adapter';
import apiClient from './client';
import proveedorDocumentoService from './proveedorDocumento.service';

describe('proveedorDocumento.service', () => {
  let mock;

  beforeEach(() => {
    mock = new MockAdapter(apiClient);
  });

  afterEach(() => {
    mock.restore();
  });

  it('listar returns the documentos array for a proveedor', async () => {
    mock.onGet('/proveedores/1/documentos').reply(200, { success: true, data: [{ id: 1, s3Key: 'documentos/proveedores/1/rut.pdf' }] });
    const documentos = await proveedorDocumentoService.listar(1);
    expect(documentos).toEqual([{ id: 1, s3Key: 'documentos/proveedores/1/rut.pdf' }]);
  });

  it('crear posts the given FormData and returns the created documento', async () => {
    const formData = new FormData();
    formData.append('requisitoId', '2');
    mock.onPost('/proveedores/1/documentos').reply(201, { success: true, data: { id: 3, requisitoId: 2 } });
    const documento = await proveedorDocumentoService.crear(1, formData);
    expect(documento).toEqual({ id: 3, requisitoId: 2 });
    expect(mock.history.post[0].data).toBe(formData);
  });

  it('eliminar deletes and returns null', async () => {
    mock.onDelete('/proveedores/1/documentos/3').reply(200, { success: true, data: null });
    const resultado = await proveedorDocumentoService.eliminar(1, 3);
    expect(resultado).toBeNull();
  });

  it('descargar fetches the file as a blob and triggers a download', async () => {
    const blob = new Blob(['contenido'], { type: 'application/pdf' });
    mock.onGet('/proveedores/1/documentos/3/descargar').reply(200, blob);

    const createObjectURL = vi.fn(() => 'blob:mock-url');
    const revokeObjectURL = vi.fn();
    global.URL.createObjectURL = createObjectURL;
    global.URL.revokeObjectURL = revokeObjectURL;
    const click = vi.fn();
    const anchorOriginal = document.createElement.bind(document);
    let enlaceCreado;
    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      const el = anchorOriginal(tag);
      if (tag === 'a') {
        el.click = click;
        enlaceCreado = el;
      }
      return el;
    });

    await proveedorDocumentoService.descargar(1, 3);

    expect(createObjectURL).toHaveBeenCalled();
    expect(click).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
    expect(enlaceCreado.download).toBe('proveedor-1-documento-3');

    document.createElement.mockRestore();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/api/proveedor.service.test.js src/api/requisitoProveedor.service.test.js src/api/proveedorDocumento.service.test.js`
Expected: FAIL — none of the three service modules exist yet.

- [ ] **Step 3: Write the implementations**

Create `frontend/src/api/proveedor.service.js`:

```js
import apiClient from './client';

async function listar(filtros = {}) {
  const response = await apiClient.get('/proveedores', { params: filtros });
  return response.data;
}

async function obtener(id) {
  const response = await apiClient.get(`/proveedores/${id}`);
  return response.data;
}

async function crear(datos) {
  const response = await apiClient.post('/proveedores', datos);
  return response.data;
}

async function editar(id, cambios) {
  const response = await apiClient.put(`/proveedores/${id}`, cambios);
  return response.data;
}

async function eliminar(id) {
  const response = await apiClient.delete(`/proveedores/${id}`);
  return response.data;
}

export default { listar, obtener, crear, editar, eliminar };
```

Create `frontend/src/api/requisitoProveedor.service.js`:

```js
import apiClient from './client';

async function listar() {
  const response = await apiClient.get('/requisitos-proveedor');
  return response.data;
}

export default { listar };
```

Create `frontend/src/api/proveedorDocumento.service.js`:

```js
import apiClient from './client';

async function listar(proveedorId) {
  const response = await apiClient.get(`/proveedores/${proveedorId}/documentos`);
  return response.data;
}

async function crear(proveedorId, formData) {
  const response = await apiClient.post(`/proveedores/${proveedorId}/documentos`, formData, {
    // Content-Type: undefined evita que axios serialice el FormData como JSON
    // (apiClient fija 'application/json' por defecto en client.js); así el
    // navegador genera el boundary multipart/form-data correcto.
    headers: { 'Content-Type': undefined },
  });
  return response.data;
}

async function eliminar(proveedorId, documentoId) {
  const response = await apiClient.delete(`/proveedores/${proveedorId}/documentos/${documentoId}`);
  return response.data;
}

function descargarBlob(blob, nombreBase) {
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombreBase;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  URL.revokeObjectURL(url);
}

async function descargar(proveedorId, documentoId) {
  const blob = await apiClient.get(`/proveedores/${proveedorId}/documentos/${documentoId}/descargar`, { responseType: 'blob' });
  descargarBlob(blob, `proveedor-${proveedorId}-documento-${documentoId}`);
}

export default { listar, crear, eliminar, descargar };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/api/proveedor.service.test.js src/api/requisitoProveedor.service.test.js src/api/proveedorDocumento.service.test.js`
Expected: PASS (5 + 1 + 4 = 10 tests)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api/proveedor.service.js frontend/src/api/proveedor.service.test.js frontend/src/api/requisitoProveedor.service.js frontend/src/api/requisitoProveedor.service.test.js frontend/src/api/proveedorDocumento.service.js frontend/src/api/proveedorDocumento.service.test.js
git commit -m "feat(frontend): add API service wrappers for Proveedores, Requisitos, and expediente documents"
```

---

### Task 6: `ProveedoresListado.jsx` (list page + route wiring)

**Files:**
- Create: `frontend/src/pages/proveedores/ProveedoresListado.jsx`
- Create: `frontend/src/pages/proveedores/ProveedoresListado.test.jsx`
- Modify: `frontend/src/App.jsx`

**Interfaces:**
- Consumes: `proveedorService` (Task 5); `useAuth()`'s `tienePermiso` (existing);
  `useViewMode` (existing); `FilterDropdown`/`DataTable`/`StatusChip`/`Modal`/
  `Input`/`Button`/`EmptyState` (existing common components).
- Produces: `/proveedores` renders `ProveedoresListado` instead of
  `ProximamentePage`. Not consumed by later tasks (Task 7 adds a sibling
  route in the same file).

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/pages/proveedores/ProveedoresListado.test.jsx`:

```jsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SnackbarProvider } from 'notistack';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ProveedoresListado from './ProveedoresListado';
import proveedorService from '../../api/proveedor.service';
import { useAuth } from '../../context/AuthContext';

vi.mock('../../api/proveedor.service');
vi.mock('../../context/AuthContext');

function renderPagina() {
  return render(
    <MemoryRouter initialEntries={['/proveedores']}>
      <SnackbarProvider>
        <Routes>
          <Route path="/proveedores" element={<ProveedoresListado />} />
          <Route path="/proveedores/:id" element={<p>Detalle de Proveedor</p>} />
        </Routes>
      </SnackbarProvider>
    </MemoryRouter>
  );
}

describe('ProveedoresListado', () => {
  beforeEach(() => {
    useAuth.mockReturnValue({ tienePermiso: () => true });
  });

  it('renders the list of proveedores', async () => {
    proveedorService.listar.mockResolvedValue([
      { id: 1, razonSocial: 'Insumos ABC', documentoIdentificacion: '900123', tipo: 'proveedor', criticidad: 'media', estado: 'activo' },
    ]);
    renderPagina();
    expect(await screen.findByText('Insumos ABC')).toBeInTheDocument();
  });

  it('shows an empty state when there are no proveedores', async () => {
    proveedorService.listar.mockResolvedValue([]);
    renderPagina();
    expect(await screen.findByText('Sin proveedores todavía')).toBeInTheDocument();
  });

  it('creates a proveedor through the modal', async () => {
    proveedorService.listar.mockResolvedValue([]);
    proveedorService.crear.mockResolvedValue({ id: 2, razonSocial: 'Nuevo SAS' });
    renderPagina();

    await screen.findByText('Sin proveedores todavía');
    await userEvent.click(screen.getByText('Crear proveedor'));
    await userEvent.type(screen.getByLabelText('Documento de identificación'), '900999888');
    await userEvent.type(screen.getByLabelText('Razón social'), 'Nuevo SAS');
    await userEvent.click(screen.getByRole('button', { name: 'Crear' }));

    await waitFor(() =>
      expect(proveedorService.crear).toHaveBeenCalledWith(
        expect.objectContaining({ documentoIdentificacion: '900999888', razonSocial: 'Nuevo SAS' })
      )
    );
  });

  it('hides "Crear proveedor" when the user lacks the crear permission', async () => {
    useAuth.mockReturnValue({ tienePermiso: () => false });
    proveedorService.listar.mockResolvedValue([]);
    renderPagina();
    await screen.findByText('Sin proveedores todavía');
    expect(screen.queryByText('Crear proveedor')).not.toBeInTheDocument();
  });

  it('filters proveedores by estado', async () => {
    proveedorService.listar.mockResolvedValue([]);
    renderPagina();
    await screen.findByText('Sin proveedores todavía');

    await userEvent.click(screen.getByLabelText('Estado'));
    await userEvent.click(await screen.findByRole('button', { name: 'Activo' }));

    await waitFor(() => expect(proveedorService.listar).toHaveBeenLastCalledWith({ estado: 'activo' }));
  });

  it('navigates to the proveedor detail when a table row is clicked', async () => {
    proveedorService.listar.mockResolvedValue([
      { id: 1, razonSocial: 'Insumos ABC', documentoIdentificacion: '900123', tipo: 'proveedor', criticidad: 'media', estado: 'activo' },
    ]);
    renderPagina();

    await userEvent.click(await screen.findByText('Insumos ABC'));
    expect(await screen.findByText('Detalle de Proveedor')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/pages/proveedores/ProveedoresListado.test.jsx`
Expected: FAIL — `ProveedoresListado.jsx` does not exist yet.

- [ ] **Step 3: Write the page**

Create `frontend/src/pages/proveedores/ProveedoresListado.jsx`:

```jsx
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { useSnackbar } from 'notistack';
import { Plus, Truck, AlertCircle } from 'lucide-react';
import proveedorService from '../../api/proveedor.service';
import { useAuth } from '../../context/AuthContext';
import { useViewMode } from '../../hooks/useViewMode';
import Button from '../../components/common/Button/Button';
import Input from '../../components/common/Input/Input';
import Modal from '../../components/common/Modal/Modal';
import EmptyState from '../../components/common/EmptyState/EmptyState';
import DataTable from '../../components/common/Table/DataTable';
import ViewToggle from '../../components/common/ViewToggle';
import StatusChip from '../../components/common/StatusChip/StatusChip';
import FilterDropdown from '../../components/common/FilterDropdown/FilterDropdown';

const OPCIONES_ESTADO = [
  { value: 'activo', label: 'Activo' },
  { value: 'inactivo', label: 'Inactivo' },
  { value: 'en_evaluacion', label: 'En evaluación' },
  { value: 'suspendido', label: 'Suspendido' },
];
const OPCIONES_TIPO = [
  { value: 'proveedor', label: 'Proveedor' },
  { value: 'contratista', label: 'Contratista' },
];
const OPCIONES_CRITICIDAD = [
  { value: 'alta', label: 'Alta' },
  { value: 'media', label: 'Media' },
  { value: 'baja', label: 'Baja' },
];

function ProveedorCard({ proveedor, onClick }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      className="bg-white dark:bg-centhrix-card rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-slate-700 cursor-pointer"
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="font-semibold text-slate-800 dark:text-slate-100">{proveedor.razonSocial}</p>
          <p className="text-xs text-slate-400 dark:text-slate-500">{proveedor.documentoIdentificacion}</p>
        </div>
        <Truck className="w-8 h-8 text-slate-300 dark:text-slate-600" />
      </div>
      <StatusChip status={proveedor.estado} />
    </div>
  );
}

export default function ProveedoresListado() {
  const { tienePermiso } = useAuth();
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const { modo, setModo, esVistaMovil } = useViewMode('cod_view_proveedores');
  const [proveedores, setProveedores] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [filtroEstado, setFiltroEstado] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('');
  const [filtroCriticidad, setFiltroCriticidad] = useState('');
  const [modalAbierto, setModalAbierto] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm();

  async function cargarProveedores() {
    setCargando(true);
    try {
      const filtros = {};
      if (filtroEstado) filtros.estado = filtroEstado;
      if (filtroTipo) filtros.tipo = filtroTipo;
      if (filtroCriticidad) filtros.criticidad = filtroCriticidad;
      const data = await proveedorService.listar(filtros);
      setProveedores(data);
    } catch (error) {
      setProveedores([]);
      enqueueSnackbar(error?.message || 'No se pudieron cargar los proveedores', { variant: 'error' });
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargarProveedores();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroEstado, filtroTipo, filtroCriticidad]);

  function cerrarModal() {
    setModalAbierto(false);
    reset();
  }

  async function onCrear(valores) {
    try {
      await proveedorService.crear({
        tipo: valores.tipo,
        documentoIdentificacion: valores.documentoIdentificacion,
        razonSocial: valores.razonSocial,
        criticidad: valores.criticidad,
        categoria: valores.categoria || null,
      });
      enqueueSnackbar('Proveedor creado exitosamente', { variant: 'success' });
      cerrarModal();
      await cargarProveedores();
    } catch (error) {
      enqueueSnackbar(error?.message || 'No se pudo crear el proveedor', { variant: 'error' });
    }
  }

  const columnas = [
    { key: 'razonSocial', label: 'Razón social' },
    { key: 'documentoIdentificacion', label: 'Documento' },
    { key: 'tipo', label: 'Tipo' },
    { key: 'criticidad', label: 'Criticidad' },
    { key: 'estado', label: 'Estado', render: (valor) => <StatusChip status={valor} /> },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h2 className="text-xl font-display font-semibold text-slate-800 dark:text-slate-100">Proveedores y contratistas</h2>
        <div className="flex items-center gap-3">
          {!esVistaMovil && <ViewToggle modo={modo} onChange={setModo} />}
          {tienePermiso('proveedores', 'crear') && (
            <Button icon={Plus} onClick={() => setModalAbierto(true)}>
              Crear proveedor
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-3 mb-6">
        <FilterDropdown label="Estado" options={OPCIONES_ESTADO} value={filtroEstado} onChange={setFiltroEstado} placeholder="Todos los estados" />
        <FilterDropdown label="Tipo" options={OPCIONES_TIPO} value={filtroTipo} onChange={setFiltroTipo} placeholder="Todos los tipos" />
        <FilterDropdown label="Criticidad" options={OPCIONES_CRITICIDAD} value={filtroCriticidad} onChange={setFiltroCriticidad} placeholder="Toda criticidad" />
      </div>

      {!cargando && proveedores.length === 0 && (
        <EmptyState icon={Truck} title="Sin proveedores todavía" description="Crea el primer proveedor o contratista para empezar su expediente." />
      )}

      {proveedores.length > 0 && modo === 'lista' && (
        <DataTable columns={columnas} data={proveedores} loading={cargando} emptyMessage="Sin proveedores todavía" onRowClick={(proveedor) => navigate(`/proveedores/${proveedor.id}`)} />
      )}

      {proveedores.length > 0 && modo === 'tarjetas' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {proveedores.map((proveedor) => (
            <ProveedorCard key={proveedor.id} proveedor={proveedor} onClick={() => navigate(`/proveedores/${proveedor.id}`)} />
          ))}
        </div>
      )}

      <Modal
        isOpen={modalAbierto}
        onClose={cerrarModal}
        title="Crear proveedor"
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
          <div>
            <label htmlFor="crear-tipo" className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
              Tipo
            </label>
            <select
              id="crear-tipo"
              defaultValue="proveedor"
              className="w-full py-2.5 px-4 border border-slate-200 dark:border-slate-600 rounded-xl text-sm bg-white dark:bg-centhrix-surface text-slate-900 dark:text-slate-100"
              {...register('tipo', { required: 'El tipo es obligatorio' })}
            >
              <option value="proveedor">Proveedor</option>
              <option value="contratista">Contratista</option>
            </select>
            {errors.tipo?.message && (
              <p role="alert" className="text-xs text-red-500 mt-1 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" aria-hidden="true" />
                {errors.tipo.message}
              </p>
            )}
          </div>

          <Input label="Documento de identificación" error={errors.documentoIdentificacion?.message} {...register('documentoIdentificacion', { required: 'El documento de identificación es obligatorio' })} />
          <Input label="Razón social" error={errors.razonSocial?.message} {...register('razonSocial', { required: 'La razón social es obligatoria' })} />

          <div>
            <label htmlFor="crear-criticidad" className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
              Criticidad
            </label>
            <select
              id="crear-criticidad"
              defaultValue="media"
              className="w-full py-2.5 px-4 border border-slate-200 dark:border-slate-600 rounded-xl text-sm bg-white dark:bg-centhrix-surface text-slate-900 dark:text-slate-100"
              {...register('criticidad')}
            >
              <option value="alta">Alta</option>
              <option value="media">Media</option>
              <option value="baja">Baja</option>
            </select>
          </div>

          <Input label="Categoría" {...register('categoria')} />
        </form>
      </Modal>
    </div>
  );
}
```

- [ ] **Step 4: Wire the route**

Modify `frontend/src/App.jsx` — add the import near the other page imports
(after the `CarpetasGestion` import):

```jsx
import ProveedoresListado from './pages/proveedores/ProveedoresListado';
```

Replace the `/proveedores` route's element (it currently renders
`<ProximamentePage nombre="Proveedores y contratistas" />`):

```jsx
                <Route
                  path="/proveedores"
                  element={
                    <PermissionRoute modulo="proveedores" accion="ver">
                      <ProveedoresListado />
                    </PermissionRoute>
                  }
                />
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/pages/proveedores/ProveedoresListado.test.jsx`
Expected: PASS (6 tests)

- [ ] **Step 6: Run the full frontend test suite**

Run: `cd frontend && npm test`
Expected: all tests pass. Note: this machine has a known pre-existing resource
issue that sometimes makes an unfiltered `npm test` report "Test timed out in
5000ms" failures in unrelated files — if that happens, verify by running the
specific files touched by this task in isolation instead of assuming a
regression.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/proveedores/ProveedoresListado.jsx frontend/src/pages/proveedores/ProveedoresListado.test.jsx frontend/src/App.jsx
git commit -m "feat(frontend): add the ProveedoresListado page"
```

---

### Task 7: `ProveedorDetalle.jsx` (detail page + expediente + route wiring)

**Files:**
- Create: `frontend/src/pages/proveedores/ProveedorDetalle.jsx`
- Create: `frontend/src/pages/proveedores/ProveedorDetalle.test.jsx`
- Modify: `frontend/src/App.jsx`

**Interfaces:**
- Consumes: `proveedorService`, `requisitoProveedorService`,
  `proveedorDocumentoService` (Task 5); `validarArchivo`/`TIPOS_PERMITIDOS`
  (existing `frontend/src/utils/validarArchivo.js`); `useAuth()`'s
  `tienePermiso` (existing).
- Produces: `/proveedores/:id` route. Not consumed by any later task.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/pages/proveedores/ProveedorDetalle.test.jsx`:

```jsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SnackbarProvider } from 'notistack';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ProveedorDetalle from './ProveedorDetalle';
import proveedorService from '../../api/proveedor.service';
import requisitoProveedorService from '../../api/requisitoProveedor.service';
import proveedorDocumentoService from '../../api/proveedorDocumento.service';
import { useAuth } from '../../context/AuthContext';

vi.mock('../../api/proveedor.service');
vi.mock('../../api/requisitoProveedor.service');
vi.mock('../../api/proveedorDocumento.service');
vi.mock('../../context/AuthContext');

const PROVEEDOR = { id: 1, razonSocial: 'Insumos ABC', documentoIdentificacion: '900123456', criticidad: 'media', categoria: 'insumos', estado: 'activo' };

const REQUISITOS = [
  { id: 1, nombre: 'RUT', criticidadMinima: 'baja' },
  { id: 2, nombre: 'Certificado SST', criticidadMinima: 'media' },
  { id: 3, nombre: 'Certificado SARLAFT', criticidadMinima: 'alta' },
];

function renderPagina(ruta = '/proveedores/1') {
  return render(
    <MemoryRouter initialEntries={[ruta]}>
      <SnackbarProvider>
        <Routes>
          <Route path="/proveedores/:id" element={<ProveedorDetalle />} />
          <Route path="/proveedores" element={<p>Proveedores</p>} />
        </Routes>
      </SnackbarProvider>
    </MemoryRouter>
  );
}

describe('ProveedorDetalle', () => {
  beforeEach(() => {
    useAuth.mockReturnValue({ tienePermiso: () => true });
    proveedorService.obtener.mockResolvedValue(PROVEEDOR);
    requisitoProveedorService.listar.mockResolvedValue(REQUISITOS);
    proveedorDocumentoService.listar.mockResolvedValue([]);
  });

  it('shows the proveedor info', async () => {
    renderPagina();
    expect(await screen.findByText('Insumos ABC')).toBeInTheDocument();
    expect(screen.getByText('900123456')).toBeInTheDocument();
  });

  it('edits the proveedor', async () => {
    proveedorService.editar.mockResolvedValue({ ...PROVEEDOR, razonSocial: 'Insumos ABC Modificado' });
    renderPagina();
    await screen.findByText('Insumos ABC');

    const input = screen.getByLabelText('Razón social *');
    await userEvent.clear(input);
    await userEvent.type(input, 'Insumos ABC Modificado');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() =>
      expect(proveedorService.editar).toHaveBeenCalledWith('1', expect.objectContaining({ razonSocial: 'Insumos ABC Modificado' }))
    );
  });

  it('gives the proveedor a baja and navigates back to the list', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    proveedorService.eliminar.mockResolvedValue(null);
    renderPagina();
    await screen.findByText('Insumos ABC');

    await userEvent.click(screen.getByRole('button', { name: 'Dar de baja' }));

    expect(await screen.findByText('Proveedores')).toBeInTheDocument();
  });

  it('only shows requisitos applicable to the proveedor criticidad', async () => {
    renderPagina();
    await screen.findByText('Insumos ABC');
    await userEvent.click(screen.getByRole('tab', { name: 'Expediente documental' }));

    expect(await screen.findByText('RUT')).toBeInTheDocument();
    expect(screen.getByText('Certificado SST')).toBeInTheDocument();
    expect(screen.queryByText('Certificado SARLAFT')).not.toBeInTheDocument();
  });

  it('shows "Falta" for a requisito with no covering document', async () => {
    renderPagina();
    await screen.findByText('Insumos ABC');
    await userEvent.click(screen.getByRole('tab', { name: 'Expediente documental' }));

    await screen.findByText('RUT');
    expect(screen.getAllByText('Falta').length).toBeGreaterThan(0);
  });

  it('shows the document estado for a covered requisito', async () => {
    proveedorDocumentoService.listar.mockResolvedValue([{ id: 5, requisitoId: 1, estado: 'vigente', RequisitoProveedor: { nombre: 'RUT' } }]);
    renderPagina();
    await screen.findByText('Insumos ABC');
    await userEvent.click(screen.getByRole('tab', { name: 'Expediente documental' }));

    await screen.findByText('RUT');
    expect(screen.getAllByText('vigente').length).toBeGreaterThan(0);
  });

  it('uploads a document to the expediente', async () => {
    proveedorDocumentoService.crear.mockResolvedValue({ id: 6 });
    renderPagina();
    await screen.findByText('Insumos ABC');
    await userEvent.click(screen.getByRole('tab', { name: 'Expediente documental' }));

    const archivo = new File(['contenido'], 'rut.pdf', { type: 'application/pdf' });
    await userEvent.upload(await screen.findByLabelText('Archivo *'), archivo);
    await userEvent.click(screen.getByRole('button', { name: 'Subir documento' }));

    await waitFor(() => expect(proveedorDocumentoService.crear).toHaveBeenCalledWith('1', expect.any(FormData)));
  });

  it('downloads a document from the expediente', async () => {
    proveedorDocumentoService.listar.mockResolvedValue([{ id: 5, requisitoId: 1, estado: 'vigente', RequisitoProveedor: { nombre: 'RUT' } }]);
    renderPagina();
    await screen.findByText('Insumos ABC');
    await userEvent.click(screen.getByRole('tab', { name: 'Expediente documental' }));

    await userEvent.click(await screen.findByRole('button', { name: 'Descargar' }));
    expect(proveedorDocumentoService.descargar).toHaveBeenCalledWith('1', 5);
  });

  it('deletes a document from the expediente', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    proveedorDocumentoService.listar.mockResolvedValue([{ id: 5, requisitoId: 1, estado: 'vigente', RequisitoProveedor: { nombre: 'RUT' } }]);
    proveedorDocumentoService.eliminar.mockResolvedValue(null);
    renderPagina();
    await screen.findByText('Insumos ABC');
    await userEvent.click(screen.getByRole('tab', { name: 'Expediente documental' }));

    await userEvent.click(await screen.findByRole('button', { name: 'Eliminar' }));
    await waitFor(() => expect(proveedorDocumentoService.eliminar).toHaveBeenCalledWith('1', 5));
  });

  it('hides "Subir documento" and "Eliminar" when the user lacks the editar permission', async () => {
    useAuth.mockReturnValue({ tienePermiso: () => false });
    proveedorDocumentoService.listar.mockResolvedValue([{ id: 5, requisitoId: 1, estado: 'vigente', RequisitoProveedor: { nombre: 'RUT' } }]);
    renderPagina();
    await screen.findByText('Insumos ABC');
    await userEvent.click(screen.getByRole('tab', { name: 'Expediente documental' }));

    await screen.findByText('RUT');
    expect(screen.queryByRole('button', { name: 'Subir documento' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Eliminar' })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/pages/proveedores/ProveedorDetalle.test.jsx`
Expected: FAIL — `ProveedorDetalle.jsx` does not exist yet.

- [ ] **Step 3: Write the page**

Create `frontend/src/pages/proveedores/ProveedorDetalle.jsx`:

```jsx
import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { useSnackbar } from 'notistack';
import { ArrowLeft, Download, Trash2, Upload, Truck } from 'lucide-react';
import proveedorService from '../../api/proveedor.service';
import requisitoProveedorService from '../../api/requisitoProveedor.service';
import proveedorDocumentoService from '../../api/proveedorDocumento.service';
import { useAuth } from '../../context/AuthContext';
import Button from '../../components/common/Button/Button';
import Input from '../../components/common/Input/Input';
import EmptyState from '../../components/common/EmptyState/EmptyState';
import StatusChip from '../../components/common/StatusChip/StatusChip';
import { validarArchivo, TIPOS_PERMITIDOS } from '../../utils/validarArchivo';

const TIPOS_PERMITIDOS_ACCEPT = [...TIPOS_PERMITIDOS].join(',');
const ORDEN_CRITICIDAD = { baja: 0, media: 1, alta: 2 };

function requisitoAplica(criticidadProveedor, criticidadMinimaRequisito) {
  return ORDEN_CRITICIDAD[criticidadProveedor] >= ORDEN_CRITICIDAD[criticidadMinimaRequisito];
}

const VOLVER_CLASSNAME =
  'inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-xl bg-white dark:bg-centhrix-card text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-centhrix-surface transition-colors';

export default function ProveedorDetalle() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { tienePermiso } = useAuth();
  const { enqueueSnackbar } = useSnackbar();

  const [proveedor, setProveedor] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [tabActiva, setTabActiva] = useState('detalle');
  const [requisitos, setRequisitos] = useState([]);
  const [documentos, setDocumentos] = useState([]);
  const [archivoError, setArchivoError] = useState(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm();

  const {
    register: registerSubida,
    handleSubmit: handleSubmitSubida,
    reset: resetSubida,
  } = useForm();

  async function cargarProveedor() {
    setCargando(true);
    try {
      const data = await proveedorService.obtener(id);
      setProveedor(data);
      reset({
        razonSocial: data.razonSocial,
        criticidad: data.criticidad,
        categoria: data.categoria || '',
      });
    } catch (error) {
      enqueueSnackbar(error?.message || 'No se pudo cargar el proveedor', { variant: 'error' });
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargarProveedor();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    async function cargarRequisitos() {
      try {
        const data = await requisitoProveedorService.listar();
        setRequisitos(data);
      } catch {
        setRequisitos([]);
      }
    }
    cargarRequisitos();
  }, []);

  async function cargarDocumentos() {
    try {
      const data = await proveedorDocumentoService.listar(id);
      setDocumentos(data);
    } catch {
      setDocumentos([]);
    }
  }

  useEffect(() => {
    cargarDocumentos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function onGuardar(valores) {
    try {
      await proveedorService.editar(id, {
        razonSocial: valores.razonSocial,
        criticidad: valores.criticidad,
        categoria: valores.categoria || null,
      });
      enqueueSnackbar('Proveedor actualizado', { variant: 'success' });
      await cargarProveedor();
    } catch (error) {
      enqueueSnackbar(error?.message || 'No se pudo actualizar el proveedor', { variant: 'error' });
    }
  }

  async function onEliminar() {
    if (!window.confirm('¿Dar de baja este proveedor? Esta acción no se puede deshacer.')) return;
    try {
      await proveedorService.eliminar(id);
      enqueueSnackbar('Proveedor dado de baja', { variant: 'success' });
      navigate('/proveedores');
    } catch (error) {
      enqueueSnackbar(error?.message || 'No se pudo dar de baja el proveedor', { variant: 'error' });
    }
  }

  async function onSubirDocumento(valores) {
    const archivo = valores.archivo?.[0];
    const errorArchivo = validarArchivo(archivo);
    if (errorArchivo) {
      setArchivoError(errorArchivo);
      return;
    }
    setArchivoError(null);

    const formData = new FormData();
    if (valores.requisitoId) formData.append('requisitoId', valores.requisitoId);
    if (valores.vigenciaDesde) formData.append('vigenciaDesde', valores.vigenciaDesde);
    if (valores.vigenciaHasta) formData.append('vigenciaHasta', valores.vigenciaHasta);
    formData.append('archivo', archivo);

    try {
      await proveedorDocumentoService.crear(id, formData);
      enqueueSnackbar('Documento subido al expediente', { variant: 'success' });
      resetSubida();
      setArchivoError(null);
      await cargarDocumentos();
    } catch (error) {
      enqueueSnackbar(error?.message || 'No se pudo subir el documento', { variant: 'error' });
    }
  }

  async function onDescargar(documentoId) {
    try {
      await proveedorDocumentoService.descargar(id, documentoId);
    } catch (error) {
      enqueueSnackbar(error?.message || 'No se pudo descargar el documento', { variant: 'error' });
    }
  }

  async function onEliminarDocumento(documentoId) {
    if (!window.confirm('¿Eliminar este documento del expediente?')) return;
    try {
      await proveedorDocumentoService.eliminar(id, documentoId);
      enqueueSnackbar('Documento eliminado', { variant: 'success' });
      await cargarDocumentos();
    } catch (error) {
      enqueueSnackbar(error?.message || 'No se pudo eliminar el documento', { variant: 'error' });
    }
  }

  if (cargando) return <p className="text-sm text-slate-500 dark:text-slate-400">Cargando...</p>;

  if (!proveedor) {
    return (
      <EmptyState
        icon={Truck}
        title="No se pudo cargar el proveedor"
        description="El proveedor solicitado no existe o no está disponible."
        action={
          <Link to="/proveedores" className={VOLVER_CLASSNAME}>
            <ArrowLeft className="w-4 h-4" />
            Volver a Proveedores
          </Link>
        }
      />
    );
  }

  const requisitosAplicables = requisitos.filter((requisito) => requisitoAplica(proveedor.criticidad, requisito.criticidadMinima));

  function coberturaDeRequisito(requisitoId) {
    const documento = documentos.find((doc) => doc.requisitoId === requisitoId);
    return documento ? documento.estado : null;
  }

  return (
    <div>
      <button
        onClick={() => navigate('/proveedores')}
        className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 mb-4"
      >
        <ArrowLeft className="w-4 h-4" /> Volver
      </button>

      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-display font-semibold text-slate-800 dark:text-slate-100">{proveedor.razonSocial}</h2>
          <p className="text-xs text-slate-400 dark:text-slate-500">{proveedor.documentoIdentificacion}</p>
        </div>
        <StatusChip status={proveedor.estado} />
      </div>

      <div className="bg-white dark:bg-centhrix-card rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 overflow-hidden">
        <div role="tablist" aria-label="Secciones del proveedor" className="flex border-b border-gray-100 dark:border-slate-700">
          <button
            role="tab"
            aria-selected={tabActiva === 'detalle'}
            onClick={() => setTabActiva('detalle')}
            className={`px-6 py-4 text-sm font-medium ${tabActiva === 'detalle' ? 'text-slate-900 dark:text-slate-100' : 'text-slate-500 dark:text-slate-400'}`}
          >
            Detalle
          </button>
          <button
            role="tab"
            aria-selected={tabActiva === 'expediente'}
            onClick={() => setTabActiva('expediente')}
            className={`px-6 py-4 text-sm font-medium ${tabActiva === 'expediente' ? 'text-slate-900 dark:text-slate-100' : 'text-slate-500 dark:text-slate-400'}`}
          >
            Expediente documental
          </button>
        </div>

        <div className="p-6">
          {tabActiva === 'detalle' && (
            <form className="space-y-4">
              <Input label="Razón social *" error={errors.razonSocial?.message} {...register('razonSocial', { required: 'La razón social es obligatoria' })} disabled={!tienePermiso('proveedores', 'editar')} />

              <div>
                <label htmlFor="detalle-criticidad" className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
                  Criticidad
                </label>
                <select
                  id="detalle-criticidad"
                  disabled={!tienePermiso('proveedores', 'editar')}
                  className="w-full py-2.5 px-4 border border-slate-200 dark:border-slate-600 rounded-xl text-sm bg-white dark:bg-centhrix-surface text-slate-900 dark:text-slate-100 disabled:bg-slate-50 dark:disabled:bg-centhrix-card"
                  {...register('criticidad')}
                >
                  <option value="alta">Alta</option>
                  <option value="media">Media</option>
                  <option value="baja">Baja</option>
                </select>
              </div>

              <Input label="Categoría" {...register('categoria')} disabled={!tienePermiso('proveedores', 'editar')} />

              <div className="flex items-center gap-3 pt-2">
                {tienePermiso('proveedores', 'editar') && <Button onClick={handleSubmit(onGuardar)}>Guardar cambios</Button>}
                {tienePermiso('proveedores', 'eliminar') && (
                  <Button variant="danger" onClick={onEliminar}>
                    Dar de baja
                  </Button>
                )}
              </div>
            </form>
          )}

          {tabActiva === 'expediente' && (
            <div className="space-y-8">
              <div>
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3">Checklist de requisitos</h3>
                {requisitosAplicables.length === 0 ? (
                  <p className="text-sm text-slate-400 dark:text-slate-500">No hay requisitos aplicables a esta criticidad.</p>
                ) : (
                  <ul className="divide-y divide-gray-100 dark:divide-slate-700">
                    {requisitosAplicables.map((requisito) => {
                      const estadoCobertura = coberturaDeRequisito(requisito.id);
                      return (
                        <li key={requisito.id} className="py-3 flex items-center justify-between">
                          <span className="text-sm text-slate-600 dark:text-slate-300">{requisito.nombre}</span>
                          {estadoCobertura ? <StatusChip status={estadoCobertura} /> : <StatusChip status="vencido" customLabel="Falta" />}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              <div>
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3">Documentos subidos</h3>
                <ul className="divide-y divide-gray-100 dark:divide-slate-700">
                  {documentos.length === 0 && <li className="py-4 text-sm text-slate-400 dark:text-slate-500">Sin documentos subidos.</li>}
                  {documentos.map((documento) => (
                    <li key={documento.id} className="py-3 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <StatusChip status={documento.estado} />
                        <span className="text-sm text-slate-600 dark:text-slate-300">{documento.RequisitoProveedor?.nombre || 'Sin requisito asociado'}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" icon={Download} onClick={() => onDescargar(documento.id)}>
                          Descargar
                        </Button>
                        {tienePermiso('proveedores', 'editar') && (
                          <Button variant="outline" size="sm" icon={Trash2} onClick={() => onEliminarDocumento(documento.id)}>
                            Eliminar
                          </Button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>

              {tienePermiso('proveedores', 'editar') && (
                <form className="space-y-4 pt-4 border-t border-gray-100 dark:border-slate-700">
                  <div>
                    <label htmlFor="subida-requisitoId" className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
                      Requisito (opcional)
                    </label>
                    <select
                      id="subida-requisitoId"
                      className="w-full py-2.5 px-4 border border-slate-200 dark:border-slate-600 rounded-xl text-sm bg-white dark:bg-centhrix-surface text-slate-900 dark:text-slate-100"
                      {...registerSubida('requisitoId')}
                    >
                      <option value="">Sin requisito asociado</option>
                      {requisitos.map((requisito) => (
                        <option key={requisito.id} value={requisito.id}>
                          {requisito.nombre}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <Input label="Vigencia desde" type="date" {...registerSubida('vigenciaDesde')} />
                    <Input label="Vigencia hasta" type="date" {...registerSubida('vigenciaHasta')} />
                  </div>

                  <div>
                    <label htmlFor="subida-archivo" className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
                      Archivo *
                    </label>
                    <input id="subida-archivo" type="file" accept={TIPOS_PERMITIDOS_ACCEPT} className="w-full text-sm" {...registerSubida('archivo', { required: true })} />
                    {archivoError && (
                      <p role="alert" className="text-xs text-red-500 mt-1">
                        {archivoError}
                      </p>
                    )}
                  </div>

                  <Button icon={Upload} onClick={handleSubmitSubida(onSubirDocumento)}>
                    Subir documento
                  </Button>
                </form>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Wire the route**

Modify `frontend/src/App.jsx` — add the import near the other page imports
(after the `ProveedoresListado` import from Task 6):

```jsx
import ProveedorDetalle from './pages/proveedores/ProveedorDetalle';
```

Add the route right after the `/proveedores` route:

```jsx
                <Route
                  path="/proveedores/:id"
                  element={
                    <PermissionRoute modulo="proveedores" accion="ver">
                      <ProveedorDetalle />
                    </PermissionRoute>
                  }
                />
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/pages/proveedores/ProveedorDetalle.test.jsx`
Expected: PASS (10 tests)

- [ ] **Step 6: Run the full frontend test suite**

Run: `cd frontend && npm test`
Expected: all tests pass (same caveat about the known machine-level timeout
flakiness as in prior tasks — verify with targeted files if it appears).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/proveedores/ProveedorDetalle.jsx frontend/src/pages/proveedores/ProveedorDetalle.test.jsx frontend/src/App.jsx
git commit -m "feat(frontend): add the ProveedorDetalle page with expediente documental"
```

---

### Task 8: Documentation

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing (documentation only).

- [ ] **Step 1: Add the spec reference and describe the new module**

Modify `README.md` — in the `## Documentación` list, add a new bullet right
after the "Diseño del Detalle de Área..." line:

```markdown
- Diseño del módulo de Proveedores y Contratistas (CRUD, expediente documental con checklist de requisitos, subida/descarga de documentos): `docs/superpowers/specs/2026-07-09-cod-proveedores-design.md`
```

Add a new paragraph in the `## Frontend (\`frontend/\`)` section, right after
the paragraph describing "El detalle de un área...":

```markdown
El módulo de Proveedores y Contratistas (`/proveedores`) ya está implementado: listado con filtros (estado, tipo, criticidad), creación, y detalle (`/proveedores/:id`) con edición inline, baja lógica, y expediente documental — un checklist de los requisitos aplicables según la criticidad del proveedor (Cámara de Comercio, RUT, Certificado SST, Certificado SARLAFT, Póliza de responsabilidad civil), y subida/descarga/eliminación de los documentos que los cubren, con cálculo automático de vigencia (vigente/por vencer/vencido, umbral fijo de 30 días).
```

- [ ] **Step 2: Run both test suites**

Run: `cd server && npm test`
Expected: all tests pass (documentation-only change, no backend test impact).

Run: `cd frontend && npm test`
Expected: all tests pass (documentation-only change, no frontend test impact).

- [ ] **Step 3: Run the production build**

Run: `cd frontend && npm run build`
Expected: build succeeds, no errors.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: document the Proveedores module"
```
