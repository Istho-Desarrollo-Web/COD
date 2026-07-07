# COD Documentos API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete HTTP API for Documentos (documents), Carpetas (folders), and Tipos de Documento (document types) — none of which have any controller/routes today, only Sequelize models and a minimal service layer — including real file upload/storage, pagination, and the daily `estado` recalculation job the data-model design already requires.

**Architecture:** Follows the exact controller/routes/middleware pattern already established by `area.controller.js`/`area.routes.js` (thin controllers, direct Sequelize calls, `asyncHandler`-wrapped routes, `requierePermiso(modulo, accion)` gating, `utils/responses.js`'s `{ success, data, message, errors, code }` envelope). File storage is local disk via `multer` (memory storage) plus a new `almacenamiento.service.js` indirection layer, so migrating to S3 later only touches that one file. The daily `estado` recalculation job reuses the already-existing, already-tested `calcularEstadoDocumento`/`recalcularSaludArea` service functions.

**Tech Stack:** Express 4, Sequelize 6 + mysql2 (existing), `multer` (new, file uploads), `node-cron` (new, daily job scheduling). Testing: Jest + Supertest against a real MySQL test database (existing convention, no mocks).

**Related spec:** `docs/superpowers/specs/2026-07-07-cod-documentos-api-design.md`

## Global Constraints

- No validation library — hand-rolled validation via `req.body` destructuring and manual checks, exactly matching `area.controller.js`'s existing style. Return `badRequest`/`notFound`/`conflict` from `utils/responses.js` for validation failures.
- Every mutating route handler is wrapped in `asyncHandler` (from `server/src/utils/asyncHandler.js`); every route is gated by `verificarToken` then `requierePermiso(modulo, accion)` (or `soloAdmin` where applicable — not needed in this plan, all gates are `requierePermiso('documentos', ...)`).
- Exact permission actions available (from `server/src/models/Permiso.js`'s `CATALOGO_MODULOS.documentos`): `ver`, `crear`, `editar`, `eliminar`, `aprobar_version`, `exportar`. Carpetas and Tipos de Documento are gated under these same `documentos.*` actions — there is no separate `carpetas`/`tipos_documento` permission module.
- `documentos.aprobar_version` gates `POST /documentos/:id/versiones` (uploading a new version) — it is a simple one-step permission gate, not a two-step approval workflow.
- `documentos.exportar` gates the two file-download endpoints (`GET /documentos/:id/descargar`, `GET /documentos/:id/versiones/:versionId/descargar`) — these two endpoints respond with `res.download(...)` (a binary file stream), **not** the `{ success, data, ... }` JSON envelope. This is a deliberate, documented exception — do not wrap them in `success()`.
- File storage: `multer` uses `memoryStorage()` (never `diskStorage()`) so that `req.file.buffer` is available; the actual disk write happens only inside `server/src/services/almacenamiento.service.js`. No controller or route file ever calls `fs`/`multer` directly except through `subirArchivoUnico` (middleware) and `almacenamiento.service.js`'s exported functions.
- The existing `s3Key`/`s3_key` model/column names are **not renamed** — they now hold a local relative path (e.g. `documentos/3/9f2c...-contrato.pdf`), not an actual S3 key. Do not reference AWS/S3 SDKs anywhere in this plan.
- File validation: accepted mimetypes are exactly `application/pdf`, `application/msword`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`, `application/vnd.ms-excel`, `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, `application/vnd.ms-powerpoint`, `application/vnd.openxmlformats-officedocument.presentationml.presentation`, `image/jpeg`, `image/png`. Max size 20MB (`20 * 1024 * 1024` bytes).
- A file is **required** on `POST /documentos` (create) and on `POST /documentos/:id/versiones` (new version) — a `Documento` or version without an attached file is a data-integrity gap this plan does not allow. Missing file → `badRequest(res, 'El archivo es obligatorio')`.
- `carpetaId` must belong to the same `areaId` being used — validated on `POST /documentos` (against the submitted `areaId`) and on `PUT /documentos/:id` (against the existing document's `areaId`), and on `POST /carpetas` (a `carpetaPadreId` must belong to the same `areaId` as the new carpeta). Mismatch → `badRequest`.
- `estado` recalculation happens in exactly four places: (1) on document creation (`calcularEstadoDocumento` at create time), (2) on `PUT /documentos/:id` only if `vigenciaDesde`, `vigenciaHasta`, or `diasAlertaVencimiento` were part of the edit, (3) inside the already-existing `subirNuevaVersion` service (unchanged), (4) the new daily cron job. `recalcularSaludArea(areaId)` is called after any create, after any edit that actually changed `estado`, after any soft-delete, and (batched, once per affected area) after the daily job.
- `Auditoria.registrar(...)` is called for every mutation (`crear`, `editar`, `eliminar`, `subirVersion` — using `accion: 'actualizar'` for both edits and version uploads, matching `Auditoria`'s enum which has no `'subir_version'` value), exactly matching the pattern already used in `area.controller.js`'s `crear`.
- Tests are real-MySQL integration tests via `supertest` against the exported `app` from `server/server.js` — **no mocks**, matching the existing backend-wide convention. Any test that depends on a date relative to "today" (e.g. testing the daily job, or `por_vencer`/`vencido` thresholds) **must** compute that date with a small `fechaEnDias(dias)` helper (`new Date(Date.now() + dias * 24*60*60*1000)`), never a hardcoded absolute date — a prior plan in this codebase shipped a hardcoded near-term date that later started failing silently, and this plan must not repeat that.
- File-upload tests use `supertest`'s `.attach(fieldName, buffer, { filename, contentType })` against the shared fixture `server/tests/fixtures/documento-prueba.pdf` (created in Task 1) — never a mocked multer.
- The cron job registered by `programar()` is only ever invoked from inside `server.js`'s `if (require.main === module)` block (real process startup) — requiring `server.js` as a module (as every test file already does via `const { app } = require('../../server')`) must never trigger `programar()` or schedule a real cron job during tests.
- Route mounting in `server/src/routes/index.js` follows the exact existing one-line-per-resource convention (`router.use('/<plural>', require('./<name>.routes'))`).
- `server/src/controllers/documento.controller.js` and `server/src/routes/documento.routes.js` are each built up incrementally across Tasks 4–9 — every task after Task 4 **modifies** (appends to) these same two files rather than creating new ones. Each task's steps show the exact code being added, and the final `module.exports` line each task leaves behind.

---

### Task 1: File storage foundation — `almacenamiento.service.js`, upload middleware, test fixture

**Files:**
- Modify: `server/package.json` (add `multer`, `node-cron` to `dependencies`)
- Modify: `.gitignore` (add `/server/uploads/`)
- Create: `server/src/services/almacenamiento.service.js`
- Create: `server/src/middlewares/upload.js`
- Create: `server/tests/fixtures/documento-prueba.pdf`
- Test: `server/tests/unit/almacenamiento.service.test.js`
- Test: `server/tests/unit/upload.test.js`

**Interfaces:**
- Produces: `almacenamiento.service.js` → `guardarArchivo(file, areaId)` returns `{ ruta }` (a relative path string like `documentos/<areaId>/<uuid>.<ext>`), `obtenerRutaAbsoluta(ruta)` returns an absolute filesystem path, `eliminarArchivo(ruta)` deletes the file if present (no-op, no throw, if absent). `file` is any object shaped `{ originalname, buffer }` (matches multer's in-memory `req.file`).
- Produces: `upload.js` → `subirArchivoUnico` (Express middleware, expects a single multipart field named `archivo`; on success sets `req.file = { originalname, mimetype, buffer, ... }`; on a disallowed mimetype or oversized file, responds `badRequest` directly and does not call `next(err)`).
- Consumed by: Tasks 5 and 8 (`guardarArchivo`, `subirArchivoUnico`), Task 9 (`obtenerRutaAbsoluta`).

- [ ] **Step 1: Add `multer` and `node-cron` to `server/package.json`**

Modify the `dependencies` block:

```json
  "dependencies": {
    "bcryptjs": "^2.4.3",
    "compression": "^1.7.4",
    "cors": "^2.8.5",
    "dotenv": "^16.4.5",
    "express": "^4.19.2",
    "express-rate-limit": "^7.2.0",
    "helmet": "^7.1.0",
    "jsonwebtoken": "^9.0.2",
    "multer": "^1.4.5-lts.1",
    "mysql2": "^3.9.7",
    "node-cron": "^3.0.3",
    "sequelize": "^6.37.3",
    "umzug": "^3.8.1"
  },
```

Run: `cd server && npm install`
Expected: `node_modules/multer` and `node_modules/node-cron` created, `package-lock.json` updated, no errors.

- [ ] **Step 2: Add `/server/uploads/` to `.gitignore`**

Modify `.gitignore` (repo root), adding this line under the `# Server` section:

```
/server/uploads/
```

- [ ] **Step 3: Write the failing test — `server/tests/unit/almacenamiento.service.test.js`**

```js
const fs = require('fs');
const path = require('path');
const { guardarArchivo, obtenerRutaAbsoluta, eliminarArchivo } = require('../../src/services/almacenamiento.service');

describe('almacenamiento.service', () => {
  const areaIdPrueba = 999999;

  afterEach(() => {
    const dir = path.join(__dirname, '..', '..', 'uploads', 'documentos', String(areaIdPrueba));
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  });

  it('guarda un archivo en disco bajo el área correspondiente y devuelve una ruta relativa', () => {
    const file = { originalname: 'contrato.pdf', buffer: Buffer.from('contenido de prueba') };
    const { ruta } = guardarArchivo(file, areaIdPrueba);
    expect(ruta).toMatch(new RegExp(`^documentos[\\\\/]${areaIdPrueba}[\\\\/].+\\.pdf$`));
    expect(fs.existsSync(obtenerRutaAbsoluta(ruta))).toBe(true);
  });

  it('elimina un archivo previamente guardado', () => {
    const file = { originalname: 'borrar.pdf', buffer: Buffer.from('x') };
    const { ruta } = guardarArchivo(file, areaIdPrueba);
    eliminarArchivo(ruta);
    expect(fs.existsSync(obtenerRutaAbsoluta(ruta))).toBe(false);
  });

  it('eliminarArchivo no lanza error si el archivo no existe', () => {
    expect(() => eliminarArchivo('documentos/000/no-existe.pdf')).not.toThrow();
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `cd server && npm test -- almacenamiento.service.test.js`
Expected: FAIL — `Cannot find module '../../src/services/almacenamiento.service'`

- [ ] **Step 5: Write `server/src/services/almacenamiento.service.js`**

```js
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

const DIRECTORIO_BASE = path.join(__dirname, '..', '..', 'uploads', 'documentos');

function guardarArchivo(file, areaId) {
  const extension = path.extname(file.originalname);
  const nombreArchivo = `${randomUUID()}${extension}`;
  const directorioArea = path.join(DIRECTORIO_BASE, String(areaId));
  fs.mkdirSync(directorioArea, { recursive: true });
  const rutaAbsoluta = path.join(directorioArea, nombreArchivo);
  fs.writeFileSync(rutaAbsoluta, file.buffer);
  const ruta = path.join('documentos', String(areaId), nombreArchivo);
  return { ruta };
}

function obtenerRutaAbsoluta(ruta) {
  return path.join(__dirname, '..', '..', 'uploads', ruta);
}

function eliminarArchivo(ruta) {
  const rutaAbsoluta = obtenerRutaAbsoluta(ruta);
  if (fs.existsSync(rutaAbsoluta)) fs.unlinkSync(rutaAbsoluta);
}

module.exports = { guardarArchivo, obtenerRutaAbsoluta, eliminarArchivo };
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd server && npm test -- almacenamiento.service.test.js`
Expected: `PASS` (3 tests)

- [ ] **Step 7: Write the failing test — `server/tests/unit/upload.test.js`**

```js
const express = require('express');
const request = require('supertest');
const { subirArchivoUnico } = require('../../src/middlewares/upload');

function crearAppPrueba() {
  const app = express();
  app.post('/subir', subirArchivoUnico, (req, res) => res.status(200).json({ ok: true, archivo: !!req.file }));
  return app;
}

describe('upload middleware', () => {
  it('acepta un PDF dentro del límite de tamaño', async () => {
    const res = await request(crearAppPrueba())
      .post('/subir')
      .attach('archivo', Buffer.from('%PDF-1.4 contenido de prueba'), { filename: 'doc.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(200);
    expect(res.body.archivo).toBe(true);
  });

  it('rechaza un tipo de archivo no permitido', async () => {
    const res = await request(crearAppPrueba())
      .post('/subir')
      .attach('archivo', Buffer.from('texto plano'), { filename: 'doc.txt', contentType: 'text/plain' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('rechaza un archivo que excede el tamaño máximo de 20MB', async () => {
    const bufferGrande = Buffer.alloc(21 * 1024 * 1024, 'a');
    const res = await request(crearAppPrueba())
      .post('/subir')
      .attach('archivo', bufferGrande, { filename: 'grande.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});
```

- [ ] **Step 8: Run test to verify it fails**

Run: `cd server && npm test -- upload.test.js`
Expected: FAIL — `Cannot find module '../../src/middlewares/upload'`

- [ ] **Step 9: Write `server/src/middlewares/upload.js`**

```js
const multer = require('multer');
const { badRequest } = require('../utils/responses');

const TIPOS_PERMITIDOS = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'image/jpeg',
  'image/png',
]);

const TAMANO_MAXIMO_BYTES = 20 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: TAMANO_MAXIMO_BYTES },
  fileFilter(req, file, cb) {
    if (!TIPOS_PERMITIDOS.has(file.mimetype)) return cb(new Error('TIPO_NO_PERMITIDO'));
    cb(null, true);
  },
});

function subirArchivoUnico(req, res, next) {
  upload.single('archivo')(req, res, (err) => {
    if (!err) return next();
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      return badRequest(res, 'El archivo excede el tamaño máximo de 20MB');
    }
    if (err.message === 'TIPO_NO_PERMITIDO') {
      return badRequest(res, 'Tipo de archivo no permitido');
    }
    return next(err);
  });
}

module.exports = { subirArchivoUnico };
```

- [ ] **Step 10: Run test to verify it passes**

Run: `cd server && npm test -- upload.test.js`
Expected: `PASS` (3 tests)

- [ ] **Step 11: Create the test fixture PDF**

Create `server/tests/fixtures/documento-prueba.pdf` with this exact content (a minimal valid PDF):

```
%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj
trailer<</Size 4/Root 1 0 R>>
%%EOF
```

- [ ] **Step 12: Commit**

```bash
git add server/package.json server/package-lock.json .gitignore server/src/services/almacenamiento.service.js server/src/middlewares/upload.js server/tests/unit/almacenamiento.service.test.js server/tests/unit/upload.test.js server/tests/fixtures/documento-prueba.pdf
git commit -m "feat(server): add local file storage service and upload middleware for Documentos"
```

---

### Task 2: Tipos de Documento — read-only endpoint

**Files:**
- Create: `server/src/controllers/tipoDocumento.controller.js`
- Create: `server/src/routes/tipoDocumento.routes.js`
- Modify: `server/src/routes/index.js`
- Test: `server/tests/integration/tipoDocumento.routes.test.js`

**Interfaces:**
- Consumes: `TipoDocumento` model (existing), `requierePermiso('documentos', 'ver')`, `verificarToken`, `asyncHandler`, `success` from `utils/responses.js`.
- Produces: `GET /api/v1/tipos-documento` → `{ success: true, data: TipoDocumento[] }` (active types only, ordered by `nombre`).

- [ ] **Step 1: Write the failing test — `server/tests/integration/tipoDocumento.routes.test.js`**

```js
const request = require('supertest');
const { sequelize } = require('../../src/config/database');
const { createMigrator } = require('../../src/config/migrator');
const seedRolesPermisos = require('../../src/scripts/seedRolesPermisos');
const seedTiposDocumento = require('../../src/scripts/seedTiposDocumento');
const { app } = require('../../server');

let token;

beforeAll(async () => {
  await sequelize.authenticate();
  await createMigrator(sequelize).up();
  await seedRolesPermisos();
  await seedTiposDocumento();
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ username: 'admin', password: process.env.SEED_PASSWORD_ADMIN || 'CambiarAhora123!' });
  token = res.body.data.token;
});

afterAll(async () => {
  await sequelize.close();
});

describe('GET /api/v1/tipos-documento', () => {
  it('lists the 7 seeded active tipos de documento', async () => {
    const res = await request(app).get('/api/v1/tipos-documento').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(7);
    expect(res.body.data.some((t) => t.nombre === 'Legal' && t.diasAlertaVencimientoDefault === 15)).toBe(true);
  });

  it('requires authentication', async () => {
    const res = await request(app).get('/api/v1/tipos-documento');
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npm test -- tipoDocumento.routes.test.js`
Expected: FAIL — `404` (route doesn't exist) or `Cannot find module`

- [ ] **Step 3: Write `server/src/controllers/tipoDocumento.controller.js`**

```js
const { TipoDocumento } = require('../models');
const { success } = require('../utils/responses');

async function listar(req, res) {
  const tipos = await TipoDocumento.findAll({ where: { activo: true }, order: [['nombre', 'ASC']] });
  return success(res, tipos);
}

module.exports = { listar };
```

- [ ] **Step 4: Write `server/src/routes/tipoDocumento.routes.js`**

```js
const express = require('express');
const router = express.Router();
const { verificarToken } = require('../middlewares/auth');
const { requierePermiso } = require('../middlewares/roles');
const controller = require('../controllers/tipoDocumento.controller');
const asyncHandler = require('../utils/asyncHandler');

router.get('/', verificarToken, requierePermiso('documentos', 'ver'), asyncHandler(controller.listar));

module.exports = router;
```

- [ ] **Step 5: Mount the route in `server/src/routes/index.js`**

```js
const express = require('express');
const router = express.Router();

router.use('/auth', require('./auth.routes'));
router.use('/areas', require('./area.routes'));
router.use('/tipos-documento', require('./tipoDocumento.routes'));

module.exports = router;
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd server && npm test -- tipoDocumento.routes.test.js`
Expected: `PASS` (2 tests)

- [ ] **Step 7: Run the full backend suite to confirm no regressions**

Run: `cd server && npm test`
Expected: all suites `PASS`

- [ ] **Step 8: Commit**

```bash
git add server/src/controllers/tipoDocumento.controller.js server/src/routes/tipoDocumento.routes.js server/src/routes/index.js server/tests/integration/tipoDocumento.routes.test.js
git commit -m "feat(server): add GET /api/v1/tipos-documento"
```

---

### Task 3: Carpetas — list tree + create

**Files:**
- Create: `server/src/controllers/carpeta.controller.js`
- Create: `server/src/routes/carpeta.routes.js`
- Modify: `server/src/routes/index.js`
- Test: `server/tests/integration/carpeta.routes.test.js`

**Interfaces:**
- Consumes: `Carpeta`/`Area` models (existing), same middleware stack as Task 2.
- Produces: `GET /api/v1/carpetas?areaId=<id>` → `{ success: true, data: Carpeta[] }` (nested tree, each node has a `subcarpetas` array). `areaId` query param is required. `POST /api/v1/carpetas` → `{ success: true, data: Carpeta, message: 'Carpeta creada' }` (201). Body: `{ areaId, nombre, carpetaPadreId?, orden? }`.

- [ ] **Step 1: Write the failing test — `server/tests/integration/carpeta.routes.test.js`**

```js
const request = require('supertest');
const bcrypt = require('bcryptjs');
const { sequelize } = require('../../src/config/database');
const { createMigrator } = require('../../src/config/migrator');
const seedRolesPermisos = require('../../src/scripts/seedRolesPermisos');
const { Area, Rol, Usuario } = require('../../src/models');
const { app } = require('../../server');

let token;
let solicitanteToken;
let area;

beforeAll(async () => {
  await sequelize.authenticate();
  await createMigrator(sequelize).up();
  await seedRolesPermisos();

  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ username: 'admin', password: process.env.SEED_PASSWORD_ADMIN || 'CambiarAhora123!' });
  token = res.body.data.token;

  area = await Area.create({ nombre: 'Carpetas Prueba', codigo: `CARP${Date.now()}` });

  const solicitanteRol = await Rol.findOne({ where: { nombre: 'solicitante' } });
  const solicitanteUsername = `solicitante_carpeta_${Date.now()}`;
  await Usuario.create({
    username: solicitanteUsername,
    email: `${solicitanteUsername}@istho.com.co`,
    passwordHash: await bcrypt.hash('ClaveSolicitante123!', 10),
    nombre: 'Solicitante',
    apellido: 'Carpeta',
    rolId: solicitanteRol.id,
  });
  const loginRes = await request(app)
    .post('/api/v1/auth/login')
    .send({ username: solicitanteUsername, password: 'ClaveSolicitante123!' });
  solicitanteToken = loginRes.body.data.token;
});

afterAll(async () => {
  await sequelize.close();
});

describe('Carpetas API', () => {
  it('creates a root carpeta and a nested carpeta, then lists them as a tree', async () => {
    const raizRes = await request(app)
      .post('/api/v1/carpetas')
      .set('Authorization', `Bearer ${token}`)
      .send({ areaId: area.id, nombre: 'Procesos' });
    expect(raizRes.status).toBe(201);

    const subRes = await request(app)
      .post('/api/v1/carpetas')
      .set('Authorization', `Bearer ${token}`)
      .send({ areaId: area.id, nombre: 'Formatos', carpetaPadreId: raizRes.body.data.id });
    expect(subRes.status).toBe(201);

    const listRes = await request(app).get(`/api/v1/carpetas?areaId=${area.id}`).set('Authorization', `Bearer ${token}`);
    expect(listRes.status).toBe(200);
    const raiz = listRes.body.data.find((c) => c.nombre === 'Procesos');
    expect(raiz.subcarpetas.some((s) => s.nombre === 'Formatos')).toBe(true);
  });

  it('returns 400 when areaId is missing on create', async () => {
    const res = await request(app).post('/api/v1/carpetas').set('Authorization', `Bearer ${token}`).send({ nombre: 'Sin área' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when carpetaPadreId belongs to a different area', async () => {
    const otraArea = await Area.create({ nombre: 'Otra Área', codigo: `OTRA${Date.now()}` });
    const padreRes = await request(app)
      .post('/api/v1/carpetas')
      .set('Authorization', `Bearer ${token}`)
      .send({ areaId: otraArea.id, nombre: 'Raíz otra área' });

    const res = await request(app)
      .post('/api/v1/carpetas')
      .set('Authorization', `Bearer ${token}`)
      .send({ areaId: area.id, nombre: 'Hija cruzada', carpetaPadreId: padreRes.body.data.id });
    expect(res.status).toBe(400);
  });

  it('returns 400 when areaId query param is missing on list', async () => {
    const res = await request(app).get('/api/v1/carpetas').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  it('returns 403 when a solicitante (no documentos.crear) tries to create a carpeta', async () => {
    const res = await request(app)
      .post('/api/v1/carpetas')
      .set('Authorization', `Bearer ${solicitanteToken}`)
      .send({ areaId: area.id, nombre: 'No debería crearse' });
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npm test -- carpeta.routes.test.js`
Expected: FAIL — `404`/`Cannot find module`

- [ ] **Step 3: Write `server/src/controllers/carpeta.controller.js`**

```js
const { Carpeta } = require('../models');
const { success, created, badRequest, notFound } = require('../utils/responses');

function construirArbol(carpetas, carpetaPadreId = null) {
  return carpetas
    .filter((c) => c.carpetaPadreId === carpetaPadreId)
    .map((c) => ({ ...c.toJSON(), subcarpetas: construirArbol(carpetas, c.id) }));
}

async function listar(req, res) {
  const { areaId } = req.query;
  if (!areaId) return badRequest(res, 'areaId es obligatorio');

  const carpetas = await Carpeta.findAll({
    where: { areaId, activo: true },
    order: [['orden', 'ASC'], ['nombre', 'ASC']],
  });
  return success(res, construirArbol(carpetas));
}

async function crear(req, res) {
  const { areaId, nombre, carpetaPadreId, orden } = req.body;
  if (!areaId || !nombre) return badRequest(res, 'areaId y nombre son obligatorios');

  if (carpetaPadreId) {
    const padre = await Carpeta.findByPk(carpetaPadreId);
    if (!padre || !padre.activo) return notFound(res, 'Carpeta padre no encontrada');
    if (padre.areaId !== Number(areaId)) return badRequest(res, 'La carpeta padre no pertenece a la misma área');
  }

  const carpeta = await Carpeta.create({ areaId, nombre, carpetaPadreId: carpetaPadreId || null, orden: orden || 0 });
  return created(res, 'Carpeta creada', carpeta);
}

module.exports = { listar, crear };
```

- [ ] **Step 4: Write `server/src/routes/carpeta.routes.js`**

```js
const express = require('express');
const router = express.Router();
const { verificarToken } = require('../middlewares/auth');
const { requierePermiso } = require('../middlewares/roles');
const controller = require('../controllers/carpeta.controller');
const asyncHandler = require('../utils/asyncHandler');

router.get('/', verificarToken, requierePermiso('documentos', 'ver'), asyncHandler(controller.listar));
router.post('/', verificarToken, requierePermiso('documentos', 'crear'), asyncHandler(controller.crear));

module.exports = router;
```

- [ ] **Step 5: Mount the route in `server/src/routes/index.js`**

```js
const express = require('express');
const router = express.Router();

router.use('/auth', require('./auth.routes'));
router.use('/areas', require('./area.routes'));
router.use('/tipos-documento', require('./tipoDocumento.routes'));
router.use('/carpetas', require('./carpeta.routes'));

module.exports = router;
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd server && npm test -- carpeta.routes.test.js`
Expected: `PASS` (5 tests)

- [ ] **Step 7: Run the full backend suite to confirm no regressions**

Run: `cd server && npm test`
Expected: all suites `PASS`

- [ ] **Step 8: Commit**

```bash
git add server/src/controllers/carpeta.controller.js server/src/routes/carpeta.routes.js server/src/routes/index.js server/tests/integration/carpeta.routes.test.js
git commit -m "feat(server): add Carpetas API (list tree, create)"
```

---

### Task 4: Documentos — list (paginated, filterable) + detail

**Files:**
- Create: `server/src/controllers/documento.controller.js`
- Create: `server/src/routes/documento.routes.js`
- Modify: `server/src/routes/index.js`
- Test: `server/tests/integration/documento.routes.test.js`

**Interfaces:**
- Consumes: `Documento` model, `paginated`/`success`/`notFound` from `utils/responses.js`.
- Produces: `GET /api/v1/documentos` → `paginated(res, Documento[], { page, limit, total, totalPages })`, filters `areaId`/`carpetaId`/`tipoDocumentoId`/`estado` (all optional query params), `page`/`limit` (default `page=1`, `limit=20`, max `limit=100`). `GET /api/v1/documentos/:id` → `{ success: true, data: Documento }` or 404.
- This file (`documento.controller.js`/`documento.routes.js`) is extended by Tasks 5–9 — do not treat its `module.exports`/route list as final here.

- [ ] **Step 1: Write the failing test — `server/tests/integration/documento.routes.test.js`**

```js
const request = require('supertest');
const bcrypt = require('bcryptjs');
const { sequelize } = require('../../src/config/database');
const { createMigrator } = require('../../src/config/migrator');
const seedRolesPermisos = require('../../src/scripts/seedRolesPermisos');
const seedTiposDocumento = require('../../src/scripts/seedTiposDocumento');
const { Area, Carpeta, TipoDocumento, Documento, Rol, Usuario } = require('../../src/models');
const { app } = require('../../server');

let token;
let operacionesToken;
let area;
let carpeta;
let tipoDocumento;

beforeAll(async () => {
  await sequelize.authenticate();
  await createMigrator(sequelize).up();
  await seedRolesPermisos();
  await seedTiposDocumento();

  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ username: 'admin', password: process.env.SEED_PASSWORD_ADMIN || 'CambiarAhora123!' });
  token = res.body.data.token;

  area = await Area.create({ nombre: 'Documentos Prueba', codigo: `DOC${Date.now()}` });
  carpeta = await Carpeta.create({ areaId: area.id, nombre: 'Raíz' });
  tipoDocumento = await TipoDocumento.findOne({ where: { nombre: 'Procedimiento' } });

  await Documento.create({ areaId: area.id, carpetaId: carpeta.id, tipoDocumentoId: tipoDocumento.id, nombre: 'Doc Vigente', estado: 'vigente' });
  await Documento.create({ areaId: area.id, carpetaId: carpeta.id, tipoDocumentoId: tipoDocumento.id, nombre: 'Doc Vencido', estado: 'vencido' });

  const operacionesRol = await Rol.findOne({ where: { nombre: 'operaciones' } });
  const operacionesUsername = `operaciones_doc_${Date.now()}`;
  await Usuario.create({
    username: operacionesUsername,
    email: `${operacionesUsername}@istho.com.co`,
    passwordHash: await bcrypt.hash('ClaveOperaciones123!', 10),
    nombre: 'Operaciones',
    apellido: 'Prueba',
    rolId: operacionesRol.id,
  });
  const loginRes = await request(app)
    .post('/api/v1/auth/login')
    .send({ username: operacionesUsername, password: 'ClaveOperaciones123!' });
  operacionesToken = loginRes.body.data.token;
});

afterAll(async () => {
  await sequelize.close();
});

describe('GET /api/v1/documentos', () => {
  it('lists documentos with pagination metadata', async () => {
    const res = await request(app).get(`/api/v1/documentos?areaId=${area.id}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(2);
    expect(res.body.pagination).toEqual({ page: 1, limit: 20, total: 2, totalPages: 1 });
  });

  it('filters by estado', async () => {
    const res = await request(app)
      .get(`/api/v1/documentos?areaId=${area.id}&estado=vencido`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].nombre).toBe('Doc Vencido');
  });

  it('returns 403 for a role without documentos.ver (operaciones)', async () => {
    const res = await request(app).get(`/api/v1/documentos?areaId=${area.id}`).set('Authorization', `Bearer ${operacionesToken}`);
    expect(res.status).toBe(403);
  });
});

describe('GET /api/v1/documentos/:id', () => {
  it('returns a single documento', async () => {
    const listRes = await request(app).get(`/api/v1/documentos?areaId=${area.id}`).set('Authorization', `Bearer ${token}`);
    const id = listRes.body.data[0].id;

    const res = await request(app).get(`/api/v1/documentos/${id}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(id);
  });

  it('returns 404 for a nonexistent documento', async () => {
    const res = await request(app).get('/api/v1/documentos/999999999').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npm test -- documento.routes.test.js`
Expected: FAIL — `404`/`Cannot find module`

- [ ] **Step 3: Write `server/src/controllers/documento.controller.js`**

```js
const { Documento } = require('../models');
const { success, paginated, notFound } = require('../utils/responses');

async function listar(req, res) {
  const { areaId, carpetaId, tipoDocumentoId, estado } = req.query;
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));

  const where = { activo: true };
  if (areaId) where.areaId = areaId;
  if (carpetaId) where.carpetaId = carpetaId;
  if (tipoDocumentoId) where.tipoDocumentoId = tipoDocumentoId;
  if (estado) where.estado = estado;

  const { rows, count } = await Documento.findAndCountAll({
    where,
    order: [['nombre', 'ASC']],
    limit,
    offset: (page - 1) * limit,
  });

  return paginated(res, rows, { page, limit, total: count, totalPages: Math.ceil(count / limit) });
}

async function obtener(req, res) {
  const documento = await Documento.findByPk(req.params.id);
  if (!documento || !documento.activo) return notFound(res, 'Documento no encontrado');
  return success(res, documento);
}

module.exports = { listar, obtener };
```

- [ ] **Step 4: Write `server/src/routes/documento.routes.js`**

```js
const express = require('express');
const router = express.Router();
const { verificarToken } = require('../middlewares/auth');
const { requierePermiso } = require('../middlewares/roles');
const controller = require('../controllers/documento.controller');
const asyncHandler = require('../utils/asyncHandler');

router.get('/', verificarToken, requierePermiso('documentos', 'ver'), asyncHandler(controller.listar));
router.get('/:id', verificarToken, requierePermiso('documentos', 'ver'), asyncHandler(controller.obtener));

module.exports = router;
```

- [ ] **Step 5: Mount the route in `server/src/routes/index.js`**

```js
const express = require('express');
const router = express.Router();

router.use('/auth', require('./auth.routes'));
router.use('/areas', require('./area.routes'));
router.use('/tipos-documento', require('./tipoDocumento.routes'));
router.use('/carpetas', require('./carpeta.routes'));
router.use('/documentos', require('./documento.routes'));

module.exports = router;
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd server && npm test -- documento.routes.test.js`
Expected: `PASS` (5 tests)

- [ ] **Step 7: Run the full backend suite to confirm no regressions**

Run: `cd server && npm test`
Expected: all suites `PASS`

- [ ] **Step 8: Commit**

```bash
git add server/src/controllers/documento.controller.js server/src/routes/documento.routes.js server/src/routes/index.js server/tests/integration/documento.routes.test.js
git commit -m "feat(server): add GET /api/v1/documentos (list, paginated) and GET /:id"
```

---

### Task 5: Documentos — create (with file upload)

**Files:**
- Modify: `server/src/controllers/documento.controller.js` (add `crear`)
- Modify: `server/src/routes/documento.routes.js` (add `POST /`)
- Modify: `server/tests/integration/documento.routes.test.js` (add a new `describe` block)

**Interfaces:**
- Consumes: `subirArchivoUnico` (Task 1), `guardarArchivo` (Task 1), `calcularEstadoDocumento` from `documento.service.js` (existing), `recalcularSaludArea` from `area.service.js` (existing), `Auditoria` model (existing).
- Produces: `POST /api/v1/documentos` (multipart, field `archivo` + body fields `areaId, carpetaId, tipoDocumentoId, nombre, codigo?, vigenciaDesde?, vigenciaHasta?, diasAlertaVencimiento?, responsableUsuarioId?`) → `created(res, 'Documento creado', Documento)` (201).

- [ ] **Step 1: Add the failing test to `server/tests/integration/documento.routes.test.js`**

Append this `describe` block at the end of the file (after the existing `GET /api/v1/documentos/:id` block):

```js
describe('POST /api/v1/documentos', () => {
  it('creates a documento with an uploaded file and computes estado', async () => {
    const res = await request(app)
      .post('/api/v1/documentos')
      .set('Authorization', `Bearer ${token}`)
      .field('areaId', String(area.id))
      .field('carpetaId', String(carpeta.id))
      .field('tipoDocumentoId', String(tipoDocumento.id))
      .field('nombre', 'Contrato de prueba')
      .field('vigenciaDesde', '2026-01-01')
      .field('vigenciaHasta', '2099-01-01')
      .attach('archivo', 'tests/fixtures/documento-prueba.pdf');

    expect(res.status).toBe(201);
    expect(res.body.data.nombre).toBe('Contrato de prueba');
    expect(res.body.data.estado).toBe('vigente');
    expect(res.body.data.s3Key).toMatch(/^documentos[\\/]/);
  });

  it('returns 400 when the file is missing', async () => {
    const res = await request(app)
      .post('/api/v1/documentos')
      .set('Authorization', `Bearer ${token}`)
      .field('areaId', String(area.id))
      .field('carpetaId', String(carpeta.id))
      .field('tipoDocumentoId', String(tipoDocumento.id))
      .field('nombre', 'Sin archivo');
    expect(res.status).toBe(400);
  });

  it('returns 400 when carpetaId belongs to a different area', async () => {
    const otraArea = await Area.create({ nombre: 'Otra Área Docs', codigo: `OTRADOC${Date.now()}` });
    const otraCarpeta = await Carpeta.create({ areaId: otraArea.id, nombre: 'Raíz otra' });

    const res = await request(app)
      .post('/api/v1/documentos')
      .set('Authorization', `Bearer ${token}`)
      .field('areaId', String(area.id))
      .field('carpetaId', String(otraCarpeta.id))
      .field('tipoDocumentoId', String(tipoDocumento.id))
      .field('nombre', 'Carpeta cruzada')
      .attach('archivo', 'tests/fixtures/documento-prueba.pdf');
    expect(res.status).toBe(400);
  });

  it('returns 403 for a role without documentos.crear (operaciones)', async () => {
    const res = await request(app)
      .post('/api/v1/documentos')
      .set('Authorization', `Bearer ${operacionesToken}`)
      .field('areaId', String(area.id))
      .field('carpetaId', String(carpeta.id))
      .field('tipoDocumentoId', String(tipoDocumento.id))
      .field('nombre', 'No debería crearse')
      .attach('archivo', 'tests/fixtures/documento-prueba.pdf');
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npm test -- documento.routes.test.js`
Expected: FAIL — `404` on `POST /api/v1/documentos`

- [ ] **Step 3: Add `crear` to `server/src/controllers/documento.controller.js`**

Replace the entire file with (this changes the import lines at the top, so replace the whole file rather than appending):

```js
const { Documento, TipoDocumento, Carpeta, Auditoria } = require('../models');
const { success, created, paginated, notFound, badRequest } = require('../utils/responses');
const { calcularEstadoDocumento } = require('../services/documento.service');
const { recalcularSaludArea } = require('../services/area.service');
const { guardarArchivo } = require('../services/almacenamiento.service');

async function listar(req, res) {
  const { areaId, carpetaId, tipoDocumentoId, estado } = req.query;
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));

  const where = { activo: true };
  if (areaId) where.areaId = areaId;
  if (carpetaId) where.carpetaId = carpetaId;
  if (tipoDocumentoId) where.tipoDocumentoId = tipoDocumentoId;
  if (estado) where.estado = estado;

  const { rows, count } = await Documento.findAndCountAll({
    where,
    order: [['nombre', 'ASC']],
    limit,
    offset: (page - 1) * limit,
  });

  return paginated(res, rows, { page, limit, total: count, totalPages: Math.ceil(count / limit) });
}

async function obtener(req, res) {
  const documento = await Documento.findByPk(req.params.id);
  if (!documento || !documento.activo) return notFound(res, 'Documento no encontrado');
  return success(res, documento);
}

async function crear(req, res) {
  const { areaId, carpetaId, tipoDocumentoId, nombre, codigo, vigenciaDesde, vigenciaHasta, diasAlertaVencimiento, responsableUsuarioId } = req.body;

  if (!nombre || !areaId || !tipoDocumentoId || !carpetaId) {
    return badRequest(res, 'nombre, areaId, tipoDocumentoId y carpetaId son obligatorios');
  }
  if (!req.file) return badRequest(res, 'El archivo es obligatorio');

  const [tipoDocumento, carpeta] = await Promise.all([
    TipoDocumento.findByPk(tipoDocumentoId),
    Carpeta.findByPk(carpetaId),
  ]);
  if (!tipoDocumento || !tipoDocumento.activo) return notFound(res, 'Tipo de documento no encontrado');
  if (!carpeta || !carpeta.activo) return notFound(res, 'Carpeta no encontrada');
  if (carpeta.areaId !== Number(areaId)) return badRequest(res, 'La carpeta no pertenece al área indicada');
  if (vigenciaDesde && vigenciaHasta && new Date(vigenciaHasta) <= new Date(vigenciaDesde)) {
    return badRequest(res, 'vigenciaHasta debe ser posterior a vigenciaDesde');
  }

  const { ruta } = guardarArchivo(req.file, areaId);
  const diasAlerta = diasAlertaVencimiento ?? tipoDocumento.diasAlertaVencimientoDefault;
  const estado = calcularEstadoDocumento({ vigenciaHasta, diasAlerta });

  const documento = await Documento.create({
    areaId,
    carpetaId,
    tipoDocumentoId,
    nombre,
    codigo,
    vigenciaDesde: vigenciaDesde || null,
    vigenciaHasta: vigenciaHasta || null,
    diasAlertaVencimiento: diasAlertaVencimiento || null,
    estado,
    s3Key: ruta,
    responsableUsuarioId: responsableUsuarioId || null,
  });

  await Auditoria.registrar({
    tabla: 'documentos', registroId: documento.id, accion: 'crear',
    usuarioId: req.user.id, usuarioNombre: req.user.nombreCompleto, datosNuevos: documento.toJSON(),
  });
  await recalcularSaludArea(areaId);

  return created(res, 'Documento creado', documento);
}

module.exports = { listar, obtener, crear };
```

- [ ] **Step 4: Add the route in `server/src/routes/documento.routes.js`**

Modify the file:

```js
const express = require('express');
const router = express.Router();
const { verificarToken } = require('../middlewares/auth');
const { requierePermiso } = require('../middlewares/roles');
const { subirArchivoUnico } = require('../middlewares/upload');
const controller = require('../controllers/documento.controller');
const asyncHandler = require('../utils/asyncHandler');

router.get('/', verificarToken, requierePermiso('documentos', 'ver'), asyncHandler(controller.listar));
router.post('/', verificarToken, requierePermiso('documentos', 'crear'), subirArchivoUnico, asyncHandler(controller.crear));
router.get('/:id', verificarToken, requierePermiso('documentos', 'ver'), asyncHandler(controller.obtener));

module.exports = router;
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd server && npm test -- documento.routes.test.js`
Expected: `PASS` (9 tests)

- [ ] **Step 6: Run the full backend suite to confirm no regressions**

Run: `cd server && npm test`
Expected: all suites `PASS`

- [ ] **Step 7: Commit**

```bash
git add server/src/controllers/documento.controller.js server/src/routes/documento.routes.js server/tests/integration/documento.routes.test.js
git commit -m "feat(server): add POST /api/v1/documentos with file upload"
```

---

### Task 6: Documentos — edit metadata

**Files:**
- Modify: `server/src/controllers/documento.controller.js` (add `editar`)
- Modify: `server/src/routes/documento.routes.js` (add `PUT /:id`)
- Modify: `server/tests/integration/documento.routes.test.js` (add a new `describe` block)

**Interfaces:**
- Produces: `PUT /api/v1/documentos/:id` (JSON body, any subset of `nombre, codigo, tipoDocumentoId, carpetaId, responsableUsuarioId, vigenciaDesde, vigenciaHasta, diasAlertaVencimiento`) → `{ success: true, data: Documento }`.

- [ ] **Step 1: Add the failing test to `server/tests/integration/documento.routes.test.js`**

Append after the `POST /api/v1/documentos` block:

```js
describe('PUT /api/v1/documentos/:id', () => {
  it('edits metadata without touching vigencia and does not change estado', async () => {
    const createRes = await request(app)
      .post('/api/v1/documentos')
      .set('Authorization', `Bearer ${token}`)
      .field('areaId', String(area.id))
      .field('carpetaId', String(carpeta.id))
      .field('tipoDocumentoId', String(tipoDocumento.id))
      .field('nombre', 'Para editar')
      .attach('archivo', 'tests/fixtures/documento-prueba.pdf');
    const id = createRes.body.data.id;
    expect(createRes.body.data.estado).toBe('sin_vigencia');

    const res = await request(app)
      .put(`/api/v1/documentos/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ nombre: 'Nombre editado' });

    expect(res.status).toBe(200);
    expect(res.body.data.nombre).toBe('Nombre editado');
    expect(res.body.data.estado).toBe('sin_vigencia');
  });

  it('recalculates estado when vigenciaHasta is edited', async () => {
    const createRes = await request(app)
      .post('/api/v1/documentos')
      .set('Authorization', `Bearer ${token}`)
      .field('areaId', String(area.id))
      .field('carpetaId', String(carpeta.id))
      .field('tipoDocumentoId', String(tipoDocumento.id))
      .field('nombre', 'Para vencer')
      .field('vigenciaDesde', '2026-01-01')
      .field('vigenciaHasta', '2099-01-01')
      .attach('archivo', 'tests/fixtures/documento-prueba.pdf');
    const id = createRes.body.data.id;
    expect(createRes.body.data.estado).toBe('vigente');

    const res = await request(app)
      .put(`/api/v1/documentos/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ vigenciaHasta: '2020-01-01' });

    expect(res.status).toBe(200);
    expect(res.body.data.estado).toBe('vencido');
  });

  it('returns 400 when the new carpetaId belongs to a different area', async () => {
    const createRes = await request(app)
      .post('/api/v1/documentos')
      .set('Authorization', `Bearer ${token}`)
      .field('areaId', String(area.id))
      .field('carpetaId', String(carpeta.id))
      .field('tipoDocumentoId', String(tipoDocumento.id))
      .field('nombre', 'Para mover mal')
      .attach('archivo', 'tests/fixtures/documento-prueba.pdf');
    const id = createRes.body.data.id;

    const otraArea = await Area.create({ nombre: 'Otra Área Edit', codigo: `OTRAEDIT${Date.now()}` });
    const otraCarpeta = await Carpeta.create({ areaId: otraArea.id, nombre: 'Raíz otra edit' });

    const res = await request(app)
      .put(`/api/v1/documentos/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ carpetaId: otraCarpeta.id });
    expect(res.status).toBe(400);
  });

  it('returns 404 for a nonexistent documento', async () => {
    const res = await request(app)
      .put('/api/v1/documentos/999999999')
      .set('Authorization', `Bearer ${token}`)
      .send({ nombre: 'No existe' });
    expect(res.status).toBe(404);
  });

  it('returns 403 for a role without documentos.editar (operaciones)', async () => {
    const createRes = await request(app)
      .post('/api/v1/documentos')
      .set('Authorization', `Bearer ${token}`)
      .field('areaId', String(area.id))
      .field('carpetaId', String(carpeta.id))
      .field('tipoDocumentoId', String(tipoDocumento.id))
      .field('nombre', 'Para probar 403')
      .attach('archivo', 'tests/fixtures/documento-prueba.pdf');
    const id = createRes.body.data.id;

    const res = await request(app)
      .put(`/api/v1/documentos/${id}`)
      .set('Authorization', `Bearer ${operacionesToken}`)
      .send({ nombre: 'No debería editarse' });
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npm test -- documento.routes.test.js`
Expected: FAIL — `404` on `PUT /api/v1/documentos/:id`

- [ ] **Step 3: Add `editar` to `server/src/controllers/documento.controller.js`**

Modify the file — add the `editar` function and update `module.exports`:

```js
async function editar(req, res) {
  const documento = await Documento.findByPk(req.params.id);
  if (!documento || !documento.activo) return notFound(res, 'Documento no encontrado');

  const { nombre, codigo, tipoDocumentoId, carpetaId, responsableUsuarioId, vigenciaDesde, vigenciaHasta, diasAlertaVencimiento } = req.body;

  if (carpetaId !== undefined) {
    const carpeta = await Carpeta.findByPk(carpetaId);
    if (!carpeta || !carpeta.activo) return notFound(res, 'Carpeta no encontrada');
    if (carpeta.areaId !== documento.areaId) return badRequest(res, 'La carpeta no pertenece al área del documento');
  }

  const vigenciaDesdeEfectiva = vigenciaDesde !== undefined ? vigenciaDesde : documento.vigenciaDesde;
  const vigenciaHastaEfectiva = vigenciaHasta !== undefined ? vigenciaHasta : documento.vigenciaHasta;
  if (vigenciaDesdeEfectiva && vigenciaHastaEfectiva && new Date(vigenciaHastaEfectiva) <= new Date(vigenciaDesdeEfectiva)) {
    return badRequest(res, 'vigenciaHasta debe ser posterior a vigenciaDesde');
  }

  const datosAnteriores = documento.toJSON();
  const cambiosVigencia = vigenciaDesde !== undefined || vigenciaHasta !== undefined || diasAlertaVencimiento !== undefined;

  const cambios = {};
  if (nombre !== undefined) cambios.nombre = nombre;
  if (codigo !== undefined) cambios.codigo = codigo;
  if (tipoDocumentoId !== undefined) cambios.tipoDocumentoId = tipoDocumentoId;
  if (carpetaId !== undefined) cambios.carpetaId = carpetaId;
  if (responsableUsuarioId !== undefined) cambios.responsableUsuarioId = responsableUsuarioId;
  if (vigenciaDesde !== undefined) cambios.vigenciaDesde = vigenciaDesde;
  if (vigenciaHasta !== undefined) cambios.vigenciaHasta = vigenciaHasta;
  if (diasAlertaVencimiento !== undefined) cambios.diasAlertaVencimiento = diasAlertaVencimiento;

  if (cambiosVigencia) {
    const tipoDocumentoIdEfectivo = cambios.tipoDocumentoId ?? documento.tipoDocumentoId;
    const tipoDocumento = await TipoDocumento.findByPk(tipoDocumentoIdEfectivo);
    const diasAlerta = (cambios.diasAlertaVencimiento ?? documento.diasAlertaVencimiento) ?? tipoDocumento.diasAlertaVencimientoDefault;
    cambios.estado = calcularEstadoDocumento({ vigenciaHasta: vigenciaHastaEfectiva, diasAlerta });
  }

  await documento.update(cambios);
  await Auditoria.registrar({
    tabla: 'documentos', registroId: documento.id, accion: 'actualizar',
    usuarioId: req.user.id, usuarioNombre: req.user.nombreCompleto, datosAnteriores, datosNuevos: documento.toJSON(),
  });
  if (cambiosVigencia && cambios.estado !== datosAnteriores.estado) {
    await recalcularSaludArea(documento.areaId);
  }

  return success(res, documento);
}

module.exports = { listar, obtener, crear, editar };
```

- [ ] **Step 4: Add the route in `server/src/routes/documento.routes.js`**

Modify the file, adding the `PUT /:id` line after `POST /`:

```js
router.put('/:id', verificarToken, requierePermiso('documentos', 'editar'), asyncHandler(controller.editar));
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd server && npm test -- documento.routes.test.js`
Expected: `PASS` (14 tests)

- [ ] **Step 6: Run the full backend suite to confirm no regressions**

Run: `cd server && npm test`
Expected: all suites `PASS`

- [ ] **Step 7: Commit**

```bash
git add server/src/controllers/documento.controller.js server/src/routes/documento.routes.js server/tests/integration/documento.routes.test.js
git commit -m "feat(server): add PUT /api/v1/documentos/:id with estado recalculation"
```

---

### Task 7: Documentos — soft delete

**Files:**
- Modify: `server/src/controllers/documento.controller.js` (add `eliminar`)
- Modify: `server/src/routes/documento.routes.js` (add `DELETE /:id`)
- Modify: `server/tests/integration/documento.routes.test.js` (add a new `describe` block)

**Interfaces:**
- Produces: `DELETE /api/v1/documentos/:id` → `{ success: true, data: null, message: 'Documento eliminado' }`.

- [ ] **Step 1: Add the failing test to `server/tests/integration/documento.routes.test.js`**

Append after the `PUT /api/v1/documentos/:id` block:

```js
describe('DELETE /api/v1/documentos/:id', () => {
  it('soft-deletes a documento and it no longer appears in the list', async () => {
    const createRes = await request(app)
      .post('/api/v1/documentos')
      .set('Authorization', `Bearer ${token}`)
      .field('areaId', String(area.id))
      .field('carpetaId', String(carpeta.id))
      .field('tipoDocumentoId', String(tipoDocumento.id))
      .field('nombre', 'Para eliminar')
      .attach('archivo', 'tests/fixtures/documento-prueba.pdf');
    const id = createRes.body.data.id;

    const res = await request(app).delete(`/api/v1/documentos/${id}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);

    const getRes = await request(app).get(`/api/v1/documentos/${id}`).set('Authorization', `Bearer ${token}`);
    expect(getRes.status).toBe(404);
  });

  it('returns 404 for a nonexistent documento', async () => {
    const res = await request(app).delete('/api/v1/documentos/999999999').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('returns 403 for a role without documentos.eliminar (lider_area has no eliminar)', async () => {
    const liderRol = await Rol.findOne({ where: { nombre: 'lider_area' } });
    const liderUsername = `lider_delete_${Date.now()}`;
    await Usuario.create({
      username: liderUsername,
      email: `${liderUsername}@istho.com.co`,
      passwordHash: await bcrypt.hash('ClaveLider123!', 10),
      nombre: 'Lider',
      apellido: 'Prueba',
      rolId: liderRol.id,
    });
    const liderLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: liderUsername, password: 'ClaveLider123!' });

    const createRes = await request(app)
      .post('/api/v1/documentos')
      .set('Authorization', `Bearer ${token}`)
      .field('areaId', String(area.id))
      .field('carpetaId', String(carpeta.id))
      .field('tipoDocumentoId', String(tipoDocumento.id))
      .field('nombre', 'No debería eliminarse')
      .attach('archivo', 'tests/fixtures/documento-prueba.pdf');
    const id = createRes.body.data.id;

    const res = await request(app)
      .delete(`/api/v1/documentos/${id}`)
      .set('Authorization', `Bearer ${liderLogin.body.data.token}`);
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npm test -- documento.routes.test.js`
Expected: FAIL — `404` on `DELETE /api/v1/documentos/:id` (route missing) — the first assertion expects `200` and gets `404`

- [ ] **Step 3: Add `eliminar` to `server/src/controllers/documento.controller.js`**

Modify the file — add the `eliminar` function and update `module.exports`:

```js
async function eliminar(req, res) {
  const documento = await Documento.findByPk(req.params.id);
  if (!documento || !documento.activo) return notFound(res, 'Documento no encontrado');

  const datosAnteriores = documento.toJSON();
  await documento.update({ activo: false });
  await Auditoria.registrar({
    tabla: 'documentos', registroId: documento.id, accion: 'eliminar',
    usuarioId: req.user.id, usuarioNombre: req.user.nombreCompleto, datosAnteriores,
  });
  await recalcularSaludArea(documento.areaId);

  return success(res, null, 'Documento eliminado');
}

module.exports = { listar, obtener, crear, editar, eliminar };
```

- [ ] **Step 4: Add the route in `server/src/routes/documento.routes.js`**

Modify the file, adding after `PUT /:id`:

```js
router.delete('/:id', verificarToken, requierePermiso('documentos', 'eliminar'), asyncHandler(controller.eliminar));
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd server && npm test -- documento.routes.test.js`
Expected: `PASS` (17 tests)

- [ ] **Step 6: Run the full backend suite to confirm no regressions**

Run: `cd server && npm test`
Expected: all suites `PASS`

- [ ] **Step 7: Commit**

```bash
git add server/src/controllers/documento.controller.js server/src/routes/documento.routes.js server/tests/integration/documento.routes.test.js
git commit -m "feat(server): add DELETE /api/v1/documentos/:id (soft delete)"
```

---

### Task 8: Documentos — version history + upload new version

**Files:**
- Modify: `server/src/controllers/documento.controller.js` (add `listarVersiones`, `subirVersion`)
- Modify: `server/src/routes/documento.routes.js` (add `GET /:id/versiones`, `POST /:id/versiones`)
- Modify: `server/tests/integration/documento.routes.test.js` (add a new `describe` block)

**Interfaces:**
- Consumes: `subirNuevaVersion` from `documento.service.js` (existing, unchanged), `DocumentoVersionHistorial` model (existing).
- Produces: `GET /api/v1/documentos/:id/versiones` → `{ success: true, data: DocumentoVersionHistorial[] }`. `POST /api/v1/documentos/:id/versiones` (multipart, field `archivo` + body `version, vigenciaDesde?, vigenciaHasta?`) → `{ success: true, data: Documento }` (the updated document, now on the new version).

- [ ] **Step 1: Add the failing test to `server/tests/integration/documento.routes.test.js`**

Append after the `DELETE /api/v1/documentos/:id` block:

```js
describe('Documento versiones', () => {
  it('uploads a new version, updates the documento, and records history', async () => {
    const createRes = await request(app)
      .post('/api/v1/documentos')
      .set('Authorization', `Bearer ${token}`)
      .field('areaId', String(area.id))
      .field('carpetaId', String(carpeta.id))
      .field('tipoDocumentoId', String(tipoDocumento.id))
      .field('nombre', 'Con versiones')
      .field('vigenciaHasta', '2099-01-01')
      .attach('archivo', 'tests/fixtures/documento-prueba.pdf');
    const id = createRes.body.data.id;
    const s3KeyOriginal = createRes.body.data.s3Key;

    const versionRes = await request(app)
      .post(`/api/v1/documentos/${id}/versiones`)
      .set('Authorization', `Bearer ${token}`)
      .field('version', 'v2')
      .field('vigenciaHasta', '2030-06-01')
      .attach('archivo', 'tests/fixtures/documento-prueba.pdf');

    expect(versionRes.status).toBe(200);
    expect(versionRes.body.data.version).toBe('v2');
    expect(versionRes.body.data.s3Key).not.toBe(s3KeyOriginal);

    const historialRes = await request(app)
      .get(`/api/v1/documentos/${id}/versiones`)
      .set('Authorization', `Bearer ${token}`);
    expect(historialRes.status).toBe(200);
    expect(historialRes.body.data.some((v) => v.version === 'v1' && v.s3Key === s3KeyOriginal)).toBe(true);
  });

  it('returns 400 when the new version file is missing', async () => {
    const createRes = await request(app)
      .post('/api/v1/documentos')
      .set('Authorization', `Bearer ${token}`)
      .field('areaId', String(area.id))
      .field('carpetaId', String(carpeta.id))
      .field('tipoDocumentoId', String(tipoDocumento.id))
      .field('nombre', 'Version sin archivo')
      .attach('archivo', 'tests/fixtures/documento-prueba.pdf');
    const id = createRes.body.data.id;

    const res = await request(app)
      .post(`/api/v1/documentos/${id}/versiones`)
      .set('Authorization', `Bearer ${token}`)
      .field('version', 'v2');
    expect(res.status).toBe(400);
  });

  it('returns 403 for a role without documentos.aprobar_version (solicitante)', async () => {
    const solicitanteRol = await Rol.findOne({ where: { nombre: 'solicitante' } });
    const solicitanteUsername = `solicitante_version_${Date.now()}`;
    await Usuario.create({
      username: solicitanteUsername,
      email: `${solicitanteUsername}@istho.com.co`,
      passwordHash: await bcrypt.hash('ClaveSolicitante123!', 10),
      nombre: 'Solicitante',
      apellido: 'Version',
      rolId: solicitanteRol.id,
    });
    const solicitanteLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: solicitanteUsername, password: 'ClaveSolicitante123!' });

    const createRes = await request(app)
      .post('/api/v1/documentos')
      .set('Authorization', `Bearer ${token}`)
      .field('areaId', String(area.id))
      .field('carpetaId', String(carpeta.id))
      .field('tipoDocumentoId', String(tipoDocumento.id))
      .field('nombre', 'No debería tener nueva version')
      .attach('archivo', 'tests/fixtures/documento-prueba.pdf');
    const id = createRes.body.data.id;

    const res = await request(app)
      .post(`/api/v1/documentos/${id}/versiones`)
      .set('Authorization', `Bearer ${solicitanteLogin.body.data.token}`)
      .field('version', 'v2')
      .attach('archivo', 'tests/fixtures/documento-prueba.pdf');
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npm test -- documento.routes.test.js`
Expected: FAIL — `404` on the new `/versiones` routes

- [ ] **Step 3: Add `listarVersiones` and `subirVersion` to `server/src/controllers/documento.controller.js`**

Modify the file — add this import and the two functions, and update `module.exports`:

```js
const { Documento, TipoDocumento, Carpeta, DocumentoVersionHistorial, Auditoria } = require('../models');
const { subirNuevaVersion } = require('../services/documento.service');

async function listarVersiones(req, res) {
  const documento = await Documento.findByPk(req.params.id);
  if (!documento) return notFound(res, 'Documento no encontrado');

  const versiones = await DocumentoVersionHistorial.findAll({
    where: { documentoId: documento.id },
    order: [['createdAt', 'DESC']],
  });
  return success(res, versiones);
}

async function subirVersion(req, res) {
  const documento = await Documento.findByPk(req.params.id);
  if (!documento || !documento.activo) return notFound(res, 'Documento no encontrado');
  if (!req.file) return badRequest(res, 'El archivo es obligatorio');

  const { version, vigenciaDesde, vigenciaHasta } = req.body;
  if (!version) return badRequest(res, 'version es obligatorio');
  if (vigenciaDesde && vigenciaHasta && new Date(vigenciaHasta) <= new Date(vigenciaDesde)) {
    return badRequest(res, 'vigenciaHasta debe ser posterior a vigenciaDesde');
  }

  const { ruta } = guardarArchivo(req.file, documento.areaId);

  const actualizado = await subirNuevaVersion(documento.id, {
    version,
    s3Key: ruta,
    vigenciaDesde: vigenciaDesde || null,
    vigenciaHasta: vigenciaHasta || null,
    subidoPorUsuarioId: req.user.id,
  });

  await Auditoria.registrar({
    tabla: 'documentos', registroId: documento.id, accion: 'actualizar',
    usuarioId: req.user.id, usuarioNombre: req.user.nombreCompleto,
    descripcion: `Nueva versión ${version} subida`, datosNuevos: actualizado.toJSON(),
  });

  return success(res, actualizado);
}

module.exports = { listar, obtener, crear, editar, eliminar, listarVersiones, subirVersion };
```

- [ ] **Step 4: Add the routes in `server/src/routes/documento.routes.js`**

Modify the file — add the `subirArchivoUnico` import (already present from Task 5) and these two lines after `DELETE /:id`:

```js
router.get('/:id/versiones', verificarToken, requierePermiso('documentos', 'ver'), asyncHandler(controller.listarVersiones));
router.post('/:id/versiones', verificarToken, requierePermiso('documentos', 'aprobar_version'), subirArchivoUnico, asyncHandler(controller.subirVersion));
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd server && npm test -- documento.routes.test.js`
Expected: `PASS` (20 tests)

- [ ] **Step 6: Run the full backend suite to confirm no regressions**

Run: `cd server && npm test`
Expected: all suites `PASS`

- [ ] **Step 7: Commit**

```bash
git add server/src/controllers/documento.controller.js server/src/routes/documento.routes.js server/tests/integration/documento.routes.test.js
git commit -m "feat(server): add Documento version history and new-version upload"
```

---

### Task 9: Documentos — file download endpoints

**Files:**
- Modify: `server/src/controllers/documento.controller.js` (add `descargar`, `descargarVersion`)
- Modify: `server/src/routes/documento.routes.js` (add the two download routes)
- Modify: `server/tests/integration/documento.routes.test.js` (add a new `describe` block)

**Interfaces:**
- Consumes: `obtenerRutaAbsoluta` from `almacenamiento.service.js` (Task 1).
- Produces: `GET /api/v1/documentos/:id/descargar` and `GET /api/v1/documentos/:id/versiones/:versionId/descargar` — both respond with `res.download(rutaAbsoluta)` (binary stream, not the JSON envelope), per Global Constraints.

- [ ] **Step 1: Add the failing test to `server/tests/integration/documento.routes.test.js`**

Append after the `Documento versiones` block:

```js
describe('Descarga de archivos', () => {
  it('downloads the current file for a documento', async () => {
    const createRes = await request(app)
      .post('/api/v1/documentos')
      .set('Authorization', `Bearer ${token}`)
      .field('areaId', String(area.id))
      .field('carpetaId', String(carpeta.id))
      .field('tipoDocumentoId', String(tipoDocumento.id))
      .field('nombre', 'Para descargar')
      .attach('archivo', 'tests/fixtures/documento-prueba.pdf');
    const id = createRes.body.data.id;

    const res = await request(app).get(`/api/v1/documentos/${id}/descargar`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/pdf/);
  });

  it('returns 404 when downloading a documento that does not exist', async () => {
    const res = await request(app).get('/api/v1/documentos/999999999/descargar').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('downloads a historical version file', async () => {
    const createRes = await request(app)
      .post('/api/v1/documentos')
      .set('Authorization', `Bearer ${token}`)
      .field('areaId', String(area.id))
      .field('carpetaId', String(carpeta.id))
      .field('tipoDocumentoId', String(tipoDocumento.id))
      .field('nombre', 'Con historial descargable')
      .attach('archivo', 'tests/fixtures/documento-prueba.pdf');
    const id = createRes.body.data.id;

    await request(app)
      .post(`/api/v1/documentos/${id}/versiones`)
      .set('Authorization', `Bearer ${token}`)
      .field('version', 'v2')
      .attach('archivo', 'tests/fixtures/documento-prueba.pdf');

    const historialRes = await request(app).get(`/api/v1/documentos/${id}/versiones`).set('Authorization', `Bearer ${token}`);
    const versionAnteriorId = historialRes.body.data.find((v) => v.version === 'v1').id;

    const res = await request(app)
      .get(`/api/v1/documentos/${id}/versiones/${versionAnteriorId}/descargar`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it('returns 403 for a role without documentos.exportar (operaciones)', async () => {
    const createRes = await request(app)
      .post('/api/v1/documentos')
      .set('Authorization', `Bearer ${token}`)
      .field('areaId', String(area.id))
      .field('carpetaId', String(carpeta.id))
      .field('tipoDocumentoId', String(tipoDocumento.id))
      .field('nombre', 'No debería descargarse')
      .attach('archivo', 'tests/fixtures/documento-prueba.pdf');
    const id = createRes.body.data.id;

    const res = await request(app)
      .get(`/api/v1/documentos/${id}/descargar`)
      .set('Authorization', `Bearer ${operacionesToken}`);
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npm test -- documento.routes.test.js`
Expected: FAIL — `404` on the download routes

- [ ] **Step 3: Add `descargar` and `descargarVersion` to `server/src/controllers/documento.controller.js`**

Modify the file — add this import and the two functions, and update `module.exports`:

```js
const { obtenerRutaAbsoluta } = require('../services/almacenamiento.service');

async function descargar(req, res) {
  const documento = await Documento.findByPk(req.params.id);
  if (!documento || !documento.activo) return notFound(res, 'Documento no encontrado');
  if (!documento.s3Key) return notFound(res, 'El documento no tiene un archivo asociado');
  return res.download(obtenerRutaAbsoluta(documento.s3Key));
}

async function descargarVersion(req, res) {
  const version = await DocumentoVersionHistorial.findOne({
    where: { id: req.params.versionId, documentoId: req.params.id },
  });
  if (!version) return notFound(res, 'Versión no encontrada');
  if (!version.s3Key) return notFound(res, 'La versión no tiene un archivo asociado');
  return res.download(obtenerRutaAbsoluta(version.s3Key));
}

module.exports = { listar, obtener, crear, editar, eliminar, listarVersiones, subirVersion, descargar, descargarVersion };
```

- [ ] **Step 4: Add the routes in `server/src/routes/documento.routes.js`**

Modify the file, adding these two lines after the `versiones` routes:

```js
router.get('/:id/descargar', verificarToken, requierePermiso('documentos', 'exportar'), asyncHandler(controller.descargar));
router.get('/:id/versiones/:versionId/descargar', verificarToken, requierePermiso('documentos', 'exportar'), asyncHandler(controller.descargarVersion));
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd server && npm test -- documento.routes.test.js`
Expected: `PASS` (24 tests)

- [ ] **Step 6: Run the full backend suite to confirm no regressions**

Run: `cd server && npm test`
Expected: all suites `PASS`

- [ ] **Step 7: Commit**

```bash
git add server/src/controllers/documento.controller.js server/src/routes/documento.routes.js server/tests/integration/documento.routes.test.js
git commit -m "feat(server): add Documento file download endpoints"
```

---

### Task 10: Daily `estado` recalculation job

**Files:**
- Create: `server/src/jobs/recalcularEstadosDocumentos.job.js`
- Create: `server/src/scripts/ejecutarRecalculoEstados.js`
- Modify: `server/server.js` (call `programar()` at real startup only)
- Modify: `server/.env.example` (document `CRON_RECALCULO_ESTADOS`)
- Modify: `server/package.json` (add `job:recalcular-estados` script)
- Test: `server/tests/unit/recalcularEstadosDocumentos.job.test.js`

**Interfaces:**
- Consumes: `calcularEstadoDocumento` from `documento.service.js`, `recalcularSaludArea` from `area.service.js` (both existing, unchanged).
- Produces: `ejecutar()` → `Promise<{ documentosActualizados: number, areasRecalculadas: number }>`. `programar()` → registers the cron, returns nothing.

- [ ] **Step 1: Write the failing test — `server/tests/unit/recalcularEstadosDocumentos.job.test.js`**

```js
const { sequelize } = require('../../src/config/database');
const { createMigrator } = require('../../src/config/migrator');
const { Area, Carpeta, TipoDocumento, Documento } = require('../../src/models');
const { ejecutar } = require('../../src/jobs/recalcularEstadosDocumentos.job');

function fechaEnDias(dias) {
  return new Date(Date.now() + dias * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

let area;
let carpeta;
let tipoDocumento;

beforeAll(async () => {
  await sequelize.authenticate();
  await createMigrator(sequelize).up();
  area = await Area.create({ nombre: 'Job Prueba', codigo: `JOB${Date.now()}` });
  carpeta = await Carpeta.create({ areaId: area.id, nombre: 'Raíz' });
  [tipoDocumento] = await TipoDocumento.findOrCreate({
    where: { nombre: 'Procedimiento' },
    defaults: { diasAlertaVencimientoDefault: 30 },
  });
});

afterAll(async () => {
  await sequelize.close();
});

describe('recalcularEstadosDocumentos.job', () => {
  it('flips a document from vigente to vencido when its vigencia already passed, and recalculates area health', async () => {
    const documento = await Documento.create({
      areaId: area.id,
      carpetaId: carpeta.id,
      tipoDocumentoId: tipoDocumento.id,
      nombre: 'Documento vencido silenciosamente',
      vigenciaDesde: fechaEnDias(-100),
      vigenciaHasta: fechaEnDias(-1),
      estado: 'vigente',
    });

    const resultado = await ejecutar();

    await documento.reload();
    expect(documento.estado).toBe('vencido');
    expect(resultado.documentosActualizados).toBeGreaterThanOrEqual(1);

    await area.reload();
    expect(Number(area.saludDocumentalPct)).toBeLessThan(100);
  });

  it('leaves an already-correct estado untouched', async () => {
    const documento = await Documento.create({
      areaId: area.id,
      carpetaId: carpeta.id,
      tipoDocumentoId: tipoDocumento.id,
      nombre: 'Documento ya vigente',
      vigenciaDesde: fechaEnDias(-10),
      vigenciaHasta: fechaEnDias(365),
      estado: 'vigente',
    });

    await ejecutar();

    await documento.reload();
    expect(documento.estado).toBe('vigente');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npm test -- recalcularEstadosDocumentos.job.test.js`
Expected: FAIL — `Cannot find module '../../src/jobs/recalcularEstadosDocumentos.job'`

- [ ] **Step 3: Write `server/src/jobs/recalcularEstadosDocumentos.job.js`**

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

function programar() {
  const expresion = process.env.CRON_RECALCULO_ESTADOS || '0 3 * * *';
  cron.schedule(expresion, () => {
    ejecutar().catch((err) => console.error('Error en job recalcularEstadosDocumentos:', err));
  });
}

module.exports = { ejecutar, programar };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npm test -- recalcularEstadosDocumentos.job.test.js`
Expected: `PASS` (2 tests)

- [ ] **Step 5: Write `server/src/scripts/ejecutarRecalculoEstados.js`**

```js
require('dotenv').config();
const { sequelize } = require('../config/database');
const { ejecutar } = require('../jobs/recalcularEstadosDocumentos.job');

ejecutar()
  .then((resultado) => {
    console.log('Recálculo de estados completado:', resultado);
    return sequelize.close();
  })
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Error ejecutando el recálculo de estados:', err);
    process.exit(1);
  });
```

- [ ] **Step 6: Add the npm script to `server/package.json`**

Modify the `scripts` block:

```json
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js",
    "test": "cross-env NODE_ENV=test jest --runInBand",
    "migration:up": "node src/scripts/migrate-cli.js up",
    "migration:down": "node src/scripts/migrate-cli.js down",
    "migration:status": "node src/scripts/migrate-cli.js status",
    "job:recalcular-estados": "node src/scripts/ejecutarRecalculoEstados.js"
  },
```

- [ ] **Step 7: Wire `programar()` into `server/server.js`**

Modify the file — add the import near the top (after the `migrator` import) and the call inside the `require.main === module` block, right before `app.listen`:

```js
const { createMigrator } = require('./src/config/migrator');
const { programar: programarRecalculoEstados } = require('./src/jobs/recalcularEstadosDocumentos.job');
const { error, conflict, serverError } = require('./src/utils/responses');
```

```js
if (require.main === module) {
  const PORT = process.env.PORT || 5000;
  initializeDatabase()
    .then(() => {
      programarRecalculoEstados();
      app.listen(PORT, () => {
        const entorno = process.env.NODE_ENV || 'development';
        const baseUrl = process.env.APP_URL || (entorno !== 'production' ? `http://localhost:${PORT}` : null);
        console.log('');
        console.log(`COD API lista — entorno: ${entorno}`);
        if (baseUrl) {
          console.log(`  → ${baseUrl}/health`);
          console.log(`  → ${baseUrl}/api/v1`);
        } else {
          console.log(`  → escuchando en el puerto ${PORT} (defina APP_URL para mostrar la URL pública aquí)`);
        }
        console.log('');
      });
    })
    .catch((err) => {
      console.error('Error inicializando la base de datos:', err);
      process.exit(1);
    });
}
```

- [ ] **Step 8: Document `CRON_RECALCULO_ESTADOS` in `server/.env.example`**

Modify the file, adding after `CORS_ORIGIN`:

```bash
# CRON_RECALCULO_ESTADOS: expresión cron para el job diario que recalcula el
# estado (vigente/por_vencer/vencido) de todos los documentos activos y la
# salud documental de sus áreas. Por defecto corre todos los días a las 3am.
# CRON_RECALCULO_ESTADOS=0 3 * * *
```

- [ ] **Step 9: Run the full backend suite to confirm no regressions**

Run: `cd server && npm test`
Expected: all suites `PASS` (confirms requiring `server.js` in every test file does not trigger `programar()`/schedule a real cron)

- [ ] **Step 10: Commit**

```bash
git add server/src/jobs/recalcularEstadosDocumentos.job.js server/src/scripts/ejecutarRecalculoEstados.js server/server.js server/.env.example server/package.json server/tests/unit/recalcularEstadosDocumentos.job.test.js
git commit -m "feat(server): add daily estado recalculation job for Documentos"
```

---

### Task 11: Documentation and final verification

**Files:**
- Modify: `README.md`

**Interfaces:** none (documentation + verification only).

- [ ] **Step 1: Update `README.md`'s "Documentación" and "Backend" sections**

Modify `README.md`: add a line under "Documentación" pointing at this plan's design spec:

```markdown
- Diseño de la API de Documentos (documentos, carpetas, tipos de documento, subida de archivos, job diario): `docs/superpowers/specs/2026-07-07-cod-documentos-api-design.md`
```

And extend the existing `## Backend (\`server/\`)` section with a short note (after its existing content) documenting the new upload directory and the manual job script:

````markdown
Archivos subidos por la API de Documentos se guardan localmente en `server/uploads/` (ignorado por git). Para forzar el recálculo diario de `estado` manualmente:

```bash
cd server
npm run job:recalcular-estados
```
````

- [ ] **Step 2: Run the full backend suite once more**

Run: `cd server && npm test`
Expected: all suites `PASS`

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: add Documentos API design spec link and upload/job notes"
```

## Not covered by this plan (deliberately out of scope)

- Frontend module for Documentos (separate spec + plan, after this API is merged).
- Real AWS S3 integration (the `almacenamiento.service.js` indirection layer allows this later without an API contract change).
- Two-step version approval workflow.
- CSV/Excel export of the document listing.
- An HTTP endpoint to trigger the daily recalculation job manually (only the `job:recalcular-estados` npm script).
- Expiration notifications (email/push) — the job only recalculates `estado`, it does not notify anyone.
- Editing or deleting Carpetas, and creating/editing Tipos de Documento via the API.
