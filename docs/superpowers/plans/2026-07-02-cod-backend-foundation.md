# COD Backend Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the COD backend (`server/`) — Express + Sequelize + MySQL — with the full data model from the design spec, RBAC + JWT auth, mandatory audit logging, and idempotent seeds, so the API boots, migrates, seeds, and authenticates against a real MySQL database.

**Architecture:** Direct replication of the CRM CenthriX backend pattern documented in `DESIGN_SYSTEM_CENTHRIX.md`: Express app → `verificarToken` → `requierePermiso` → Controller → Service → Sequelize Model → `Auditoria.registrar()` → `utils/responses.js` helpers. Migrations run automatically on startup via Umzug; seeds are idempotent and also run on startup.

**Tech Stack:** Node.js 18+, Express 4, Sequelize 6 + `mysql2`, Umzug 3 (migrations), `jsonwebtoken`, `bcryptjs`, Jest + Supertest (tests), `cross-env`, `dotenv`.

**Related spec:** `docs/superpowers/specs/2026-07-02-cod-modelo-datos-estructura-design.md`

## Global Constraints

- All Sequelize models use `{ underscored: true, timestamps: true }` — JS attributes camelCase, DB columns snake_case (`createdAt` → `created_at`).
- All tables have an `id INTEGER PRIMARY KEY AUTOINCREMENT` and explicit `created_at` / `updated_at` `DATE NOT NULL` columns in migrations.
- DB pool: `max: DB_POOL_MAX || 5, min: 0, acquire: 30000, idle: 10000, evict: 5000`, `timezone: '-05:00'`.
- Startup fails fast if `JWT_SECRET` is missing or shorter than 32 chars, or (in production) still contains the string `'cambiar'`; fails if `DB_NAME`/`DB_USER`/`DB_HOST` are missing; fails if production and `CORS_ORIGIN` is missing.
- Every HTTP response uses `utils/responses.js` helpers; body shape is always `{ success, data, message, errors, code }`.
- `Auditoria.registrar()` never throws — a failure inside it is caught and logged, the calling write operation still succeeds.
- Tests run against a real MySQL schema (no SQLite substitution) via `server/.env.test`, `NODE_ENV=test`, `cross-env`. A MySQL server must be reachable at the host/port in `.env.test` before running `npm test`. Each test file truncates the tables it touches in `beforeEach`/`afterAll` rather than dropping the schema.
- Migration filenames: `YYYYMMDDHHMMSS-descripcion-kebab.js`, using the Umzug + `SequelizeStorage` pattern (not `sequelize-cli`).

---

### Task 1: Bootstrap backend project — server, DB connection, migration runner, health check

**Files:**
- Create: `server/package.json`
- Create: `server/.env.example`
- Create: `server/.env.test`
- Create: `server/src/config/database.js`
- Create: `server/src/config/migrator.js`
- Create: `server/src/scripts/migrate-cli.js`
- Create: `server/server.js`
- Create: `server/jest.config.js`
- Test: `server/tests/integration/health.test.js`

**Interfaces:**
- Produces: `require('../src/config/database')` → `{ sequelize, connectWithRetry }`. `connectWithRetry(sequelize, { maxAttempts = 10, baseDelayMs = 3000 } = {})` returns a Promise that resolves once `sequelize.authenticate()` succeeds, retrying with exponential backoff (3s, 6s, 12s, ...) on `ECONNREFUSED`/`ETIMEDOUT`/`PROTOCOL_CONNECTION_LOST`, and rejects after `maxAttempts`.
- Produces: `require('../src/config/migrator')` → `createMigrator(sequelize)` returning an Umzug instance whose `.up()` / `.down()` / `.pending()` later tasks' migrations rely on.
- Produces: `server.js` exports the Express `app` (for Supertest) and only calls `app.listen()` when `require.main === module`.

- [ ] **Step 1: Write `server/package.json`**

```json
{
  "name": "cod-server",
  "version": "1.0.0",
  "private": true,
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js",
    "test": "cross-env NODE_ENV=test jest --runInBand",
    "migration:up": "node src/scripts/migrate-cli.js up",
    "migration:down": "node src/scripts/migrate-cli.js down",
    "migration:status": "node src/scripts/migrate-cli.js status"
  },
  "dependencies": {
    "bcryptjs": "^2.4.3",
    "compression": "^1.7.4",
    "cors": "^2.8.5",
    "dotenv": "^16.4.5",
    "express": "^4.19.2",
    "express-rate-limit": "^7.2.0",
    "helmet": "^7.1.0",
    "jsonwebtoken": "^9.0.2",
    "mysql2": "^3.9.7",
    "sequelize": "^6.37.3",
    "umzug": "^3.8.1"
  },
  "devDependencies": {
    "cross-env": "^7.0.3",
    "jest": "^29.7.0",
    "nodemon": "^3.1.0",
    "supertest": "^7.0.0"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run: `cd server && npm install`
Expected: `node_modules/` created, no errors.

- [ ] **Step 3: Write `server/.env.example` and `server/.env.test`**

`server/.env.example`:
```bash
NODE_ENV=development
PORT=5000
JWT_SECRET=cambiar_por_un_secreto_aleatorio_de_al_menos_32_caracteres
JWT_EXPIRES_IN=24h
JWT_REFRESH_EXPIRES_IN=7d
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=cod_dev
DB_USER=root
DB_PASSWORD=
DB_POOL_MAX=5
CORS_ORIGIN=http://localhost:5173
```

`server/.env.test` (committed — points at a local disposable schema, no real secrets):
```bash
NODE_ENV=test
PORT=5001
JWT_SECRET=test_secret_de_al_menos_32_caracteres_1234
JWT_EXPIRES_IN=24h
JWT_REFRESH_EXPIRES_IN=7d
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=cod_test
DB_USER=root
DB_PASSWORD=
DB_POOL_MAX=5
CORS_ORIGIN=http://localhost:5173
```

Run: `mysql -u root -e "CREATE DATABASE IF NOT EXISTS cod_test;"` (adjust user/password to your local MySQL)
Expected: schema `cod_test` exists.

- [ ] **Step 4: Write `server/src/config/database.js`**

```js
const path = require('path');
require('dotenv').config({
  path: path.resolve(__dirname, '../../', process.env.NODE_ENV === 'test' ? '.env.test' : '.env'),
});
const { Sequelize } = require('sequelize');

const RETRYABLE_ERRORS = ['ECONNREFUSED', 'ETIMEDOUT', 'PROTOCOL_CONNECTION_LOST'];

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 3306,
    dialect: 'mysql',
    logging: false,
    timezone: '-05:00',
    pool: {
      max: parseInt(process.env.DB_POOL_MAX, 10) || 5,
      min: 0,
      acquire: 30000,
      idle: 10000,
      evict: 5000,
    },
  }
);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function connectWithRetry(instance = sequelize, { maxAttempts = 10, baseDelayMs = 3000 } = {}) {
  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      await instance.authenticate();
      return;
    } catch (err) {
      attempt += 1;
      const isRetryable = RETRYABLE_ERRORS.includes(err.original?.code) || RETRYABLE_ERRORS.includes(err.code);
      if (!isRetryable || attempt >= maxAttempts) {
        throw err;
      }
      const delay = baseDelayMs * 2 ** (attempt - 1);
      await sleep(delay);
    }
  }
}

module.exports = { sequelize, connectWithRetry };
```

- [ ] **Step 5: Write `server/src/config/migrator.js`**

```js
const { Umzug, SequelizeStorage } = require('umzug');
const path = require('path');

function createMigrator(sequelize) {
  return new Umzug({
    migrations: {
      glob: path.join(__dirname, '../migrations/*.js'),
    },
    context: sequelize.getQueryInterface(),
    storage: new SequelizeStorage({ sequelize }),
    logger: console,
  });
}

module.exports = { createMigrator };
```

- [ ] **Step 6: Write `server/src/scripts/migrate-cli.js`**

```js
const { sequelize } = require('../config/database');
const { createMigrator } = require('../config/migrator');

async function main() {
  const command = process.argv[2];
  const migrator = createMigrator(sequelize);

  if (command === 'up') {
    const applied = await migrator.up();
    console.log(`Migraciones aplicadas: ${applied.map((m) => m.name).join(', ') || '(ninguna pendiente)'}`);
  } else if (command === 'down') {
    const reverted = await migrator.down();
    console.log(`Migración revertida: ${reverted.map((m) => m.name).join(', ')}`);
  } else if (command === 'status') {
    const pending = await migrator.pending();
    console.log(`Pendientes: ${pending.map((m) => m.name).join(', ') || '(ninguna)'}`);
  } else {
    console.error('Uso: node migrate-cli.js <up|down|status>');
    process.exitCode = 1;
  }

  await sequelize.close();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
```

- [ ] **Step 7: Write `server/server.js`**

```js
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const { sequelize, connectWithRetry } = require('./src/config/database');
const { createMigrator } = require('./src/config/migrator');

function validateEnv() {
  const isProduccion = process.env.NODE_ENV === 'production';
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET debe existir y tener al menos 32 caracteres');
  }
  if (isProduccion && process.env.JWT_SECRET.includes('cambiar')) {
    throw new Error('JWT_SECRET no puede contener "cambiar" en producción');
  }
  if (!process.env.DB_NAME || !process.env.DB_USER || !process.env.DB_HOST) {
    throw new Error('DB_NAME, DB_USER y DB_HOST son obligatorios');
  }
  if (isProduccion && !process.env.CORS_ORIGIN) {
    throw new Error('CORS_ORIGIN es obligatorio en producción');
  }
}

validateEnv();

const app = express();

app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(compression());
app.use(express.json());

app.get('/health', async (req, res) => {
  let dbStatus = 'connecting';
  try {
    await sequelize.authenticate();
    dbStatus = 'connected';
  } catch {
    dbStatus = 'error';
  }
  res.json({
    success: true,
    environment: process.env.NODE_ENV,
    timestamp: new Date().toISOString(),
    database: dbStatus,
  });
});

app.use('/api/v1', require('./src/routes'));

async function initializeDatabase() {
  await connectWithRetry(sequelize);
  const migrator = createMigrator(sequelize);
  await migrator.up();
  await require('./src/scripts/seedRolesPermisos')();
  await require('./src/scripts/seedTiposDocumento')();
  await require('./src/scripts/seedNivelesAprobacion')();
  await require('./src/scripts/seedRequisitosProveedor')();
}

if (require.main === module) {
  const PORT = process.env.PORT || 5000;
  initializeDatabase()
    .then(() => {
      app.listen(PORT, () => console.log(`COD API escuchando en puerto ${PORT}`));
    })
    .catch((err) => {
      console.error('Error inicializando la base de datos:', err);
      process.exit(1);
    });
}

module.exports = { app, initializeDatabase };
```

Note: `src/routes/index.js` and the four seed scripts referenced here are created in Tasks 3, 5, 7, 10 and 12. Task 1's own test (Step 10 below) only needs `/health`, which does not depend on them — but `server.js` won't fully boot until Task 5 creates `src/routes/index.js`. Create a placeholder now so Task 1's test passes standalone.

- [ ] **Step 8: Write placeholder `server/src/routes/index.js`**

```js
const express = require('express');
const router = express.Router();

module.exports = router;
```

- [ ] **Step 9: Write placeholder seed scripts (replaced with real logic in later tasks)**

Create `server/src/scripts/seedRolesPermisos.js`, `server/src/scripts/seedTiposDocumento.js`, `server/src/scripts/seedNivelesAprobacion.js`, `server/src/scripts/seedRequisitosProveedor.js`, each with:

```js
module.exports = async function seed() {
  // Implementado en una tarea posterior del plan de implementación.
};
```

- [ ] **Step 10: Write `server/jest.config.js`**

```js
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  testTimeout: 20000,
};
```

- [ ] **Step 11: Write the failing test — `server/tests/integration/health.test.js`**

```js
const request = require('supertest');
const { app } = require('../../server');

describe('GET /health', () => {
  it('responds with success and environment info', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.environment).toBe('test');
    expect(['connected', 'error']).toContain(res.body.database);
  });
});
```

- [ ] **Step 12: Run test to verify it fails (before `cod_test` schema exists / before deps installed correctly)**

Run: `cd server && npm test -- health.test.js`
Expected: if `cod_test` schema from Step 3 exists and MySQL is reachable, this may already PASS with `database: 'connected'`. If MySQL is not reachable yet, it still PASSES with `database: 'error'` (the endpoint tolerates DB failure by design) — confirm the response shape assertions pass either way.

- [ ] **Step 13: Fix any startup errors surfaced by the test run**

Common issue: missing `.env.test` values → rerun Step 3. Common issue: port conflict → `PORT=5001` in `.env.test` avoids colliding with a locally running dev server.

- [ ] **Step 14: Run test to verify it passes**

Run: `cd server && npm test -- health.test.js`
Expected: `PASS tests/integration/health.test.js`

- [ ] **Step 15: Commit**

```bash
git add server/package.json server/.env.example server/.env.test server/src/config server/src/scripts server/src/routes server/server.js server/jest.config.js server/tests
git commit -m "feat(server): bootstrap Express app, DB connection, and migration runner"
```

---

### Task 2: Response and helper utilities

**Files:**
- Create: `server/src/utils/responses.js`
- Create: `server/src/utils/helpers.js`
- Test: `server/tests/unit/responses.test.js`
- Test: `server/tests/unit/helpers.test.js`

**Interfaces:**
- Produces: `success(res, data, statusCodeOrMessage = 200)`, `successMessage(res, message, data = null, statusCode = 200)`, `created(res, message, data)`, `paginated(res, data, pagination)`, `error(res, message, statusCode = 400, errors = null, code = null)`, `unauthorized/forbidden/notFound/badRequest/conflict/unprocessable/serverError(res, message, errorObj)`.
- Produces: `parsePaginacion(query)` → `{ page, limit, offset }`; `buildPaginacion(total, page, limit)` → `{ totalPages, hasNext, hasPrev }`; `parseOrdenamiento(query, camposPermitidos, defaultField, defaultOrder)` → `{ field, order }`; `limpiarObjeto(obj)`; `sanitizarBusqueda(str)`.

- [ ] **Step 1: Write the failing test for `responses.js`**

```js
const { success, error, paginated } = require('../../src/utils/responses');

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('responses utils', () => {
  it('success() defaults to 200 and wraps data', () => {
    const res = mockRes();
    success(res, { id: 1 });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: { id: 1 }, message: null, errors: [], code: null });
  });

  it('success() accepts a custom message as 3rd arg', () => {
    const res = mockRes();
    success(res, { id: 1 }, 'Listo');
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Listo' }));
  });

  it('success() accepts a custom status code as 3rd arg', () => {
    const res = mockRes();
    success(res, { id: 1 }, 201);
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('error() defaults to 400', () => {
    const res = mockRes();
    error(res, 'Malo');
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ success: false, data: null, message: 'Malo', errors: [], code: null });
  });

  it('paginated() includes pagination metadata', () => {
    const res = mockRes();
    paginated(res, [1, 2], { total: 2, page: 1, limit: 10 });
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, data: [1, 2], pagination: { total: 2, page: 1, limit: 10 } })
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npm test -- responses.test.js`
Expected: FAIL — `Cannot find module '../../src/utils/responses'`

- [ ] **Step 3: Write `server/src/utils/responses.js`**

```js
function success(res, data, statusCodeOrMessage = 200) {
  const isCode = typeof statusCodeOrMessage === 'number';
  return res
    .status(isCode ? statusCodeOrMessage : 200)
    .json({ success: true, data, message: isCode ? null : statusCodeOrMessage, errors: [], code: null });
}

function successMessage(res, message, data = null, statusCode = 200) {
  return res.status(statusCode).json({ success: true, data, message, errors: [], code: null });
}

function created(res, message, data) {
  return successMessage(res, message, data, 201);
}

function paginated(res, data, pagination) {
  return res.status(200).json({ success: true, data, message: null, errors: [], code: null, pagination });
}

function error(res, message, statusCode = 400, errors = null, code = null) {
  return res.status(statusCode).json({ success: false, data: null, message, errors: errors || [], code });
}

const unauthorized = (res, message = 'No autorizado') => error(res, message, 401);
const forbidden = (res, message = 'Prohibido') => error(res, message, 403);
const notFound = (res, message = 'No encontrado') => error(res, message, 404);
const badRequest = (res, message = 'Solicitud inválida') => error(res, message, 400);
const conflict = (res, message = 'Conflicto') => error(res, message, 409);
const unprocessable = (res, message = 'Regla de negocio violada') => error(res, message, 422);
const serverError = (res, message = 'Error interno', errorObj = null) => {
  if (errorObj) console.error(errorObj);
  return error(res, message, 500);
};

module.exports = {
  success, successMessage, created, paginated,
  error, unauthorized, forbidden, notFound, badRequest, conflict, unprocessable, serverError,
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npm test -- responses.test.js`
Expected: `PASS tests/unit/responses.test.js`

- [ ] **Step 5: Write the failing test for `helpers.js`**

```js
const { parsePaginacion, buildPaginacion, parseOrdenamiento, limpiarObjeto, sanitizarBusqueda } = require('../../src/utils/helpers');

describe('helpers utils', () => {
  it('parsePaginacion defaults to page 1, limit 20', () => {
    expect(parsePaginacion({})).toEqual({ page: 1, limit: 20, offset: 0 });
  });

  it('parsePaginacion computes offset', () => {
    expect(parsePaginacion({ page: '3', limit: '10' })).toEqual({ page: 3, limit: 10, offset: 20 });
  });

  it('buildPaginacion computes totalPages/hasNext/hasPrev', () => {
    expect(buildPaginacion(25, 2, 10)).toEqual({ totalPages: 3, hasNext: true, hasPrev: true });
    expect(buildPaginacion(25, 1, 10)).toEqual({ totalPages: 3, hasNext: true, hasPrev: false });
    expect(buildPaginacion(25, 3, 10)).toEqual({ totalPages: 3, hasNext: false, hasPrev: true });
  });

  it('parseOrdenamiento falls back to default when field not allowed', () => {
    expect(parseOrdenamiento({ orden: 'password_hash', direccion: 'asc' }, ['nombre'], 'nombre', 'DESC'))
      .toEqual({ field: 'nombre', order: 'ASC' });
  });

  it('limpiarObjeto removes undefined and null values', () => {
    expect(limpiarObjeto({ a: 1, b: undefined, c: null, d: 0 })).toEqual({ a: 1, d: 0 });
  });

  it('sanitizarBusqueda escapes % and _', () => {
    expect(sanitizarBusqueda('50%_off')).toBe('50\\%\\_off');
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `cd server && npm test -- helpers.test.js`
Expected: FAIL — module not found

- [ ] **Step 7: Write `server/src/utils/helpers.js`**

```js
function parsePaginacion(query) {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.max(parseInt(query.limit, 10) || 20, 1);
  return { page, limit, offset: (page - 1) * limit };
}

function buildPaginacion(total, page, limit) {
  const totalPages = Math.max(Math.ceil(total / limit), 1);
  return { totalPages, hasNext: page < totalPages, hasPrev: page > 1 };
}

function parseOrdenamiento(query, camposPermitidos, defaultField, defaultOrder = 'ASC') {
  const field = camposPermitidos.includes(query.orden) ? query.orden : defaultField;
  const requested = (query.direccion || '').toUpperCase();
  const order = ['ASC', 'DESC'].includes(requested) ? requested : defaultOrder.toUpperCase();
  return { field, order };
}

function limpiarObjeto(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== null));
}

function sanitizarBusqueda(str) {
  return String(str).replace(/[%_]/g, (match) => `\\${match}`);
}

module.exports = { parsePaginacion, buildPaginacion, parseOrdenamiento, limpiarObjeto, sanitizarBusqueda };
```

- [ ] **Step 8: Run both test files to verify they pass**

Run: `cd server && npm test -- helpers.test.js responses.test.js`
Expected: both suites `PASS`

- [ ] **Step 9: Commit**

```bash
git add server/src/utils server/tests/unit
git commit -m "feat(server): add response and pagination/query helper utilities"
```

---

### Task 3: RBAC core — Usuario, Rol, Permiso, RolPermiso + seed

**Files:**
- Create: `server/src/migrations/20260702100000-crear-rbac.js`
- Create: `server/src/models/index.js`
- Create: `server/src/models/Usuario.js`
- Create: `server/src/models/Rol.js`
- Create: `server/src/models/Permiso.js`
- Create: `server/src/models/RolPermiso.js`
- Modify: `server/src/scripts/seedRolesPermisos.js` (replace placeholder)
- Test: `server/tests/integration/rbac.test.js`

**Interfaces:**
- Produces: `require('../models')` → `{ sequelize, Usuario, Rol, Permiso, RolPermiso }`, each a Sequelize model already `.init`-ed and associated (`Rol.belongsToMany(Permiso, { through: RolPermiso })` is not needed — permisos are granular JSON per módulo, stored directly on `RolPermiso` as `{ rol_id, modulo, acciones: JSON }`, matching the CRM's `{ rol_id: { modulo: [...] } }` cache shape).
- Produces: `Usuario` fields: `id, username, email, passwordHash, nombre, apellido, rolId, activo, requiereCambioPassword, ultimoAcceso`.
- Produces: `seedRolesPermisos()` — idempotent, creates the 6 roles (`admin` 100, `financiera` 80, `lider_area` 60, `operaciones` 50, `solicitante` 30, `auditor` 20) and the module/action catalog from the spec's "Matriz de accesos" section, and an initial `admin` user (`username: 'admin'`, password from `SEED_PASSWORD_ADMIN` env var or `'CambiarAhora123!'` default, `requiereCambioPassword: true`).

- [ ] **Step 1: Write the failing test**

```js
const { sequelize } = require('../../src/config/database');
const { createMigrator } = require('../../src/config/migrator');
const { Usuario, Rol, RolPermiso } = require('../../src/models');
const seedRolesPermisos = require('../../src/scripts/seedRolesPermisos');

beforeAll(async () => {
  await sequelize.authenticate();
  await createMigrator(sequelize).up();
});

afterAll(async () => {
  await sequelize.close();
});

describe('RBAC seed', () => {
  it('creates the 6 roles with correct hierarchy levels', async () => {
    await seedRolesPermisos();
    const roles = await Rol.findAll({ order: [['nivel', 'DESC']] });
    expect(roles.map((r) => r.nombre)).toEqual(['admin', 'financiera', 'lider_area', 'operaciones', 'solicitante', 'auditor']);
    expect(roles.map((r) => r.nivel)).toEqual([100, 80, 60, 50, 30, 20]);
  });

  it('is idempotent — running twice does not duplicate roles', async () => {
    await seedRolesPermisos();
    await seedRolesPermisos();
    const count = await Rol.count();
    expect(count).toBe(6);
  });

  it('grants admin the documentos.crear permission', async () => {
    await seedRolesPermisos();
    const admin = await Rol.findOne({ where: { nombre: 'admin' } });
    const permiso = await RolPermiso.findOne({ where: { rolId: admin.id, modulo: 'documentos' } });
    expect(permiso.acciones).toContain('crear');
  });

  it('creates a default admin user requiring password change', async () => {
    await seedRolesPermisos();
    const user = await Usuario.findOne({ where: { username: 'admin' } });
    expect(user).not.toBeNull();
    expect(user.requiereCambioPassword).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npm test -- rbac.test.js`
Expected: FAIL — `Cannot find module '../../src/models'`

- [ ] **Step 3: Write the migration `server/src/migrations/20260702100000-crear-rbac.js`**

```js
module.exports = {
  up: async ({ context: queryInterface }) => {
    const { DataTypes } = require('sequelize');

    await queryInterface.createTable('roles', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      nombre: { type: DataTypes.STRING(50), allowNull: false, unique: true },
      nivel: { type: DataTypes.INTEGER, allowNull: false },
      descripcion: { type: DataTypes.STRING(255), allowNull: true },
      activo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      created_at: { type: DataTypes.DATE, allowNull: false },
      updated_at: { type: DataTypes.DATE, allowNull: false },
    });

    await queryInterface.createTable('usuarios', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      username: { type: DataTypes.STRING(50), allowNull: false, unique: true },
      email: { type: DataTypes.STRING(150), allowNull: false, unique: true },
      password_hash: { type: DataTypes.STRING(255), allowNull: false },
      nombre: { type: DataTypes.STRING(100), allowNull: false },
      apellido: { type: DataTypes.STRING(100), allowNull: false },
      rol_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'roles', key: 'id' } },
      activo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      requiere_cambio_password: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      ultimo_acceso: { type: DataTypes.DATE, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false },
      updated_at: { type: DataTypes.DATE, allowNull: false },
    });

    await queryInterface.createTable('rol_permisos', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      rol_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'roles', key: 'id' } },
      modulo: { type: DataTypes.STRING(50), allowNull: false },
      acciones: { type: DataTypes.JSON, allowNull: false },
      created_at: { type: DataTypes.DATE, allowNull: false },
      updated_at: { type: DataTypes.DATE, allowNull: false },
    });
    await queryInterface.addConstraint('rol_permisos', {
      fields: ['rol_id', 'modulo'],
      type: 'unique',
      name: 'uq_rol_permisos_rol_modulo',
    });
  },
  down: async ({ context: queryInterface }) => {
    await queryInterface.dropTable('rol_permisos');
    await queryInterface.dropTable('usuarios');
    await queryInterface.dropTable('roles');
  },
};
```

- [ ] **Step 4: Write `server/src/models/index.js`**

```js
const { sequelize } = require('../config/database');

const Usuario = require('./Usuario')(sequelize);
const Rol = require('./Rol')(sequelize);
const Permiso = require('./Permiso')(sequelize);
const RolPermiso = require('./RolPermiso')(sequelize);

Rol.hasMany(Usuario, { foreignKey: 'rolId' });
Usuario.belongsTo(Rol, { foreignKey: 'rolId' });
Rol.hasMany(RolPermiso, { foreignKey: 'rolId' });
RolPermiso.belongsTo(Rol, { foreignKey: 'rolId' });

module.exports = { sequelize, Usuario, Rol, Permiso, RolPermiso };
```

- [ ] **Step 5: Write `server/src/models/Rol.js`**

```js
const { DataTypes } = require('sequelize');

module.exports = (sequelize) =>
  sequelize.define(
    'Rol',
    {
      nombre: { type: DataTypes.STRING(50), allowNull: false, unique: true },
      nivel: { type: DataTypes.INTEGER, allowNull: false },
      descripcion: { type: DataTypes.STRING(255) },
      activo: { type: DataTypes.BOOLEAN, defaultValue: true },
    },
    { tableName: 'roles', underscored: true }
  );
```

- [ ] **Step 6: Write `server/src/models/Usuario.js`**

```js
const { DataTypes } = require('sequelize');

module.exports = (sequelize) =>
  sequelize.define(
    'Usuario',
    {
      username: { type: DataTypes.STRING(50), allowNull: false, unique: true },
      email: { type: DataTypes.STRING(150), allowNull: false, unique: true },
      passwordHash: { type: DataTypes.STRING(255), allowNull: false },
      nombre: { type: DataTypes.STRING(100), allowNull: false },
      apellido: { type: DataTypes.STRING(100), allowNull: false },
      rolId: { type: DataTypes.INTEGER, allowNull: false },
      activo: { type: DataTypes.BOOLEAN, defaultValue: true },
      requiereCambioPassword: { type: DataTypes.BOOLEAN, defaultValue: false },
      ultimoAcceso: { type: DataTypes.DATE, allowNull: true },
    },
    {
      tableName: 'usuarios',
      underscored: true,
      defaultScope: { attributes: { exclude: ['passwordHash'] } },
      scopes: { conPassword: { attributes: {} } },
    }
  );
```

- [ ] **Step 7: Write `server/src/models/Permiso.js`**

```js
const { DataTypes } = require('sequelize');

// Catálogo estático de módulos/acciones válidos para COD — usado para validar
// RolPermiso.acciones en el seed y en el panel de Matriz de Accesos.
const CATALOGO_MODULOS = {
  inicio: ['ver'],
  areas: ['ver'],
  area_detalle: ['ver'],
  documentos: ['ver', 'crear', 'editar', 'eliminar', 'aprobar_version', 'exportar'],
  solicitudes: ['ver', 'crear', 'comentar', 'cotizar', 'aprobar', 'confirmar', 'exportar'],
  proveedores: ['ver', 'crear', 'editar', 'eliminar', 'evaluar', 'exportar'],
  formularios: ['ver', 'crear', 'editar', 'eliminar'],
  reportes: ['ver', 'exportar'],
  usuarios: ['ver', 'crear', 'editar', 'eliminar'],
  roles: ['ver', 'crear', 'editar', 'eliminar'],
  matriz_accesos: ['ver', 'editar'],
  sesiones: ['ver', 'cerrar'],
  auditoria: ['ver'],
  perfil: ['ver', 'cambiar_password'],
};

// No tiene tabla propia — se mantiene como catálogo en código, igual a como
// el CRM referencia sus módulos en seedRolesPermisos.js.
module.exports = (sequelize) => ({ CATALOGO_MODULOS, sequelize });
```

- [ ] **Step 8: Write `server/src/models/RolPermiso.js`**

```js
const { DataTypes } = require('sequelize');

module.exports = (sequelize) =>
  sequelize.define(
    'RolPermiso',
    {
      rolId: { type: DataTypes.INTEGER, allowNull: false },
      modulo: { type: DataTypes.STRING(50), allowNull: false },
      acciones: { type: DataTypes.JSON, allowNull: false },
    },
    { tableName: 'rol_permisos', underscored: true }
  );
```

- [ ] **Step 9: Write `server/src/scripts/seedRolesPermisos.js`**

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
    proveedores: ['ver'], formularios: ['ver'], reportes: ['ver', 'exportar'], perfil: ['ver', 'cambiar_password'],
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

- [ ] **Step 10: Run test to verify it passes**

Run: `cd server && npm test -- rbac.test.js`
Expected: `PASS tests/integration/rbac.test.js` (4 tests)

- [ ] **Step 11: Wire the real seed into `server.js`**

Confirm `server.js` (Task 1, Step 7) already calls `require('./src/scripts/seedRolesPermisos')()` — no change needed since the placeholder is now replaced by real logic at the same path.

- [ ] **Step 12: Commit**

```bash
git add server/src/migrations server/src/models server/src/scripts/seedRolesPermisos.js server/tests/integration/rbac.test.js
git commit -m "feat(server): add RBAC core tables (usuarios, roles, rol_permisos) and seed"
```

---

### Task 4: Auditoria model + `registrar()` helper

**Files:**
- Create: `server/src/migrations/20260702100100-crear-auditoria.js`
- Create: `server/src/models/Auditoria.js`
- Modify: `server/src/models/index.js` (register `Auditoria`)
- Test: `server/tests/integration/auditoria.test.js`

**Interfaces:**
- Consumes: `sequelize` from `require('../config/database')`.
- Produces: `Auditoria.registrar({ tabla, registroId, accion, usuarioId, usuarioNombre, datosAnteriores = null, datosNuevos = null, ipAddress = null, userAgent = null, descripcion = null })` → resolves to the created row, or `null` if persisting fails (never throws).

- [ ] **Step 1: Write the failing test**

```js
const { sequelize } = require('../../src/config/database');
const { createMigrator } = require('../../src/config/migrator');
const { Auditoria } = require('../../src/models');

beforeAll(async () => {
  await sequelize.authenticate();
  await createMigrator(sequelize).up();
});

afterEach(async () => {
  await Auditoria.destroy({ where: {}, truncate: true });
});

afterAll(async () => {
  await sequelize.close();
});

describe('Auditoria.registrar', () => {
  it('persists a row with the given fields', async () => {
    const row = await Auditoria.registrar({
      tabla: 'areas',
      registroId: 1,
      accion: 'crear',
      usuarioId: 1,
      usuarioNombre: 'Admin COD',
      datosNuevos: { nombre: 'Financiera' },
    });
    expect(row).not.toBeNull();
    const found = await Auditoria.findByPk(row.id);
    expect(found.tabla).toBe('areas');
    expect(found.datosNuevos).toEqual({ nombre: 'Financiera' });
  });

  it('returns null instead of throwing when required fields are missing', async () => {
    const row = await Auditoria.registrar({ accion: 'crear' });
    expect(row).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npm test -- auditoria.test.js`
Expected: FAIL — `Auditoria` is undefined on the models export

- [ ] **Step 3: Write the migration `server/src/migrations/20260702100100-crear-auditoria.js`**

```js
module.exports = {
  up: async ({ context: queryInterface }) => {
    const { DataTypes } = require('sequelize');
    await queryInterface.createTable('auditorias', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      tabla: { type: DataTypes.STRING(100), allowNull: false },
      registro_id: { type: DataTypes.INTEGER, allowNull: false },
      accion: { type: DataTypes.ENUM('crear', 'actualizar', 'eliminar', 'login', 'logout'), allowNull: false },
      usuario_id: { type: DataTypes.INTEGER, allowNull: true },
      usuario_nombre: { type: DataTypes.STRING(150), allowNull: true },
      datos_anteriores: { type: DataTypes.JSON, allowNull: true },
      datos_nuevos: { type: DataTypes.JSON, allowNull: true },
      ip_address: { type: DataTypes.STRING(45), allowNull: true },
      user_agent: { type: DataTypes.STRING(255), allowNull: true },
      descripcion: { type: DataTypes.STRING(255), allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false },
      updated_at: { type: DataTypes.DATE, allowNull: false },
    });
  },
  down: async ({ context: queryInterface }) => {
    await queryInterface.dropTable('auditorias');
  },
};
```

- [ ] **Step 4: Write `server/src/models/Auditoria.js`**

```js
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Auditoria = sequelize.define(
    'Auditoria',
    {
      tabla: { type: DataTypes.STRING(100), allowNull: false },
      registroId: { type: DataTypes.INTEGER, allowNull: false },
      accion: { type: DataTypes.ENUM('crear', 'actualizar', 'eliminar', 'login', 'logout'), allowNull: false },
      usuarioId: { type: DataTypes.INTEGER, allowNull: true },
      usuarioNombre: { type: DataTypes.STRING(150), allowNull: true },
      datosAnteriores: { type: DataTypes.JSON, allowNull: true },
      datosNuevos: { type: DataTypes.JSON, allowNull: true },
      ipAddress: { type: DataTypes.STRING(45), allowNull: true },
      userAgent: { type: DataTypes.STRING(255), allowNull: true },
      descripcion: { type: DataTypes.STRING(255), allowNull: true },
    },
    { tableName: 'auditorias', underscored: true }
  );

  Auditoria.registrar = async function registrar(datos) {
    try {
      return await Auditoria.create(datos);
    } catch (err) {
      console.error('Auditoria.registrar falló (no interrumpe la operación principal):', err.message);
      return null;
    }
  };

  return Auditoria;
};
```

- [ ] **Step 5: Register `Auditoria` in `server/src/models/index.js`**

```js
const { sequelize } = require('../config/database');

const Usuario = require('./Usuario')(sequelize);
const Rol = require('./Rol')(sequelize);
const Permiso = require('./Permiso')(sequelize);
const RolPermiso = require('./RolPermiso')(sequelize);
const Auditoria = require('./Auditoria')(sequelize);

Rol.hasMany(Usuario, { foreignKey: 'rolId' });
Usuario.belongsTo(Rol, { foreignKey: 'rolId' });
Rol.hasMany(RolPermiso, { foreignKey: 'rolId' });
RolPermiso.belongsTo(Rol, { foreignKey: 'rolId' });

module.exports = { sequelize, Usuario, Rol, Permiso, RolPermiso, Auditoria };
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd server && npm test -- auditoria.test.js`
Expected: `PASS tests/integration/auditoria.test.js` (2 tests)

- [ ] **Step 7: Commit**

```bash
git add server/src/migrations/20260702100100-crear-auditoria.js server/src/models/Auditoria.js server/src/models/index.js server/tests/integration/auditoria.test.js
git commit -m "feat(server): add Auditoria model and registrar() helper"
```

---

### Task 5: Auth middlewares, login route, permission cache

**Files:**
- Create: `server/src/middlewares/auth.js`
- Create: `server/src/middlewares/roles.js`
- Create: `server/src/services/auth.service.js`
- Create: `server/src/controllers/auth.controller.js`
- Create: `server/src/routes/auth.routes.js`
- Modify: `server/src/routes/index.js`
- Test: `server/tests/integration/auth.test.js`

**Interfaces:**
- Produces: `verificarToken(req, res, next)` — reads `Authorization: Bearer <jwt>`, populates `req.user = { id, username, email, nombre, apellido, rol, rolId, esAdmin(), tienePermiso(modulo, accion) }`.
- Produces: `requierePermiso(modulo, accion)` — factory middleware, 403 via `forbidden()` if `req.user` lacks the permission; uses an in-memory cache (`cargarCachePermisos()`, TTL 60s, `invalidarCachePermisos()`).
- Produces: `requiereRolMinimo(nombreRol)` — factory middleware comparing `Rol.nivel`.
- Produces: `POST /api/v1/auth/login` → `{ success, data: { token, refreshToken, usuario } }`; `Auditoria.registrar({ accion: 'login', ... })` fires on success.

- [ ] **Step 1: Write the failing test**

```js
const request = require('supertest');
const bcrypt = require('bcryptjs');
const { sequelize } = require('../../src/config/database');
const { createMigrator } = require('../../src/config/migrator');
const { Usuario, Rol, RolPermiso, Auditoria } = require('../../src/models');
const seedRolesPermisos = require('../../src/scripts/seedRolesPermisos');
const { app } = require('../../server');

beforeAll(async () => {
  await sequelize.authenticate();
  await createMigrator(sequelize).up();
  await seedRolesPermisos();
});

afterAll(async () => {
  await sequelize.close();
});

describe('POST /api/v1/auth/login', () => {
  it('rejects wrong credentials with 401', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ username: 'admin', password: 'incorrecta' });
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('returns a token for correct credentials and logs an audit entry', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: 'admin', password: process.env.SEED_PASSWORD_ADMIN || 'CambiarAhora123!' });
    expect(res.status).toBe(200);
    expect(res.body.data.token).toEqual(expect.any(String));
    const log = await Auditoria.findOne({ where: { accion: 'login', usuarioNombre: 'Administrador COD' } });
    expect(log).not.toBeNull();
  });
});

describe('protected routes', () => {
  let token;
  beforeAll(async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: 'admin', password: process.env.SEED_PASSWORD_ADMIN || 'CambiarAhora123!' });
    token = res.body.data.token;
  });

  it('rejects requests with no token with 401', async () => {
    const res = await request(app).get('/api/v1/auth/me');
    expect(res.status).toBe(401);
  });

  it('accepts requests with a valid token', async () => {
    const res = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.username).toBe('admin');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npm test -- auth.test.js`
Expected: FAIL — 404 on `/api/v1/auth/login` (route doesn't exist yet)

- [ ] **Step 3: Write `server/src/services/auth.service.js`**

```js
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { Usuario, Rol } = require('../models');

async function autenticar(username, password) {
  const usuario = await Usuario.unscoped().findOne({ where: { username }, include: [{ model: Rol }] });
  if (!usuario || !usuario.activo) return null;
  const valido = await bcrypt.compare(password, usuario.passwordHash);
  if (!valido) return null;
  return usuario;
}

function firmarTokens(usuario) {
  const payload = { id: usuario.id, username: usuario.username, rol: usuario.Rol.nombre, rolId: usuario.rolId };
  const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '24h' });
  const refreshToken = jwt.sign({ id: usuario.id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  });
  return { token, refreshToken };
}

module.exports = { autenticar, firmarTokens };
```

- [ ] **Step 4: Write `server/src/middlewares/roles.js`**

```js
const { RolPermiso } = require('../models');
const { forbidden } = require('../utils/responses');

const CACHE_TTL_MS = 60 * 1000;
let cache = null;
let cacheLoadedAt = 0;

async function cargarCachePermisos() {
  const now = Date.now();
  if (cache && now - cacheLoadedAt < CACHE_TTL_MS) return cache;

  const filas = await RolPermiso.findAll();
  cache = {};
  for (const fila of filas) {
    cache[fila.rolId] = cache[fila.rolId] || {};
    cache[fila.rolId][fila.modulo] = fila.acciones;
  }
  cacheLoadedAt = now;
  return cache;
}

function invalidarCachePermisos() {
  cache = null;
}

function requierePermiso(modulo, accion) {
  return async (req, res, next) => {
    const permisos = await cargarCachePermisos();
    const acciones = permisos[req.user?.rolId]?.[modulo] || [];
    if (!acciones.includes(accion)) return forbidden(res, 'Sin permisos para esta acción');
    return next();
  };
}

function requiereRolMinimo(nombreRolMinimo) {
  const { ROLES_NIVEL } = require('./rolesNivelCache');
  return async (req, res, next) => {
    const niveles = await ROLES_NIVEL();
    if ((req.user?.nivelRol || 0) < (niveles[nombreRolMinimo] || Infinity)) {
      return forbidden(res, 'Nivel de rol insuficiente');
    }
    return next();
  };
}

const soloAdmin = requiereRolMinimo('admin');

module.exports = { requierePermiso, requiereRolMinimo, soloAdmin, cargarCachePermisos, invalidarCachePermisos };
```

- [ ] **Step 5: Write `server/src/middlewares/rolesNivelCache.js`**

```js
const { Rol } = require('../models');

let niveles = null;

async function ROLES_NIVEL() {
  if (!niveles) {
    const roles = await Rol.findAll();
    niveles = Object.fromEntries(roles.map((r) => [r.nombre, r.nivel]));
  }
  return niveles;
}

module.exports = { ROLES_NIVEL };
```

- [ ] **Step 6: Write `server/src/middlewares/auth.js`**

```js
const jwt = require('jsonwebtoken');
const { Usuario, Rol } = require('../models');
const { unauthorized } = require('../utils/responses');

async function verificarToken(req, res, next) {
  const header = req.get('Authorization') || '';
  const [, token] = header.split(' ');
  if (!token) return unauthorized(res, 'Token no proporcionado');

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const usuario = await Usuario.findByPk(payload.id, { include: [{ model: Rol }] });
    if (!usuario || !usuario.activo) return unauthorized(res, 'Usuario inválido');

    req.user = {
      id: usuario.id,
      username: usuario.username,
      email: usuario.email,
      nombre: usuario.nombre,
      apellido: usuario.apellido,
      nombreCompleto: `${usuario.nombre} ${usuario.apellido}`,
      rol: usuario.Rol.nombre,
      rolId: usuario.rolId,
      nivelRol: usuario.Rol.nivel,
      esAdmin: () => usuario.Rol.nombre === 'admin',
    };
    return next();
  } catch {
    return unauthorized(res, 'Token inválido o expirado');
  }
}

module.exports = { verificarToken };
```

- [ ] **Step 7: Write `server/src/controllers/auth.controller.js`**

```js
const { autenticar, firmarTokens } = require('../services/auth.service');
const { Auditoria, Usuario, Rol } = require('../models');
const { success, unauthorized } = require('../utils/responses');

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

  return success(res, {
    token,
    refreshToken,
    usuario: { id: usuario.id, username: usuario.username, nombre: usuario.nombre, rol: usuario.Rol.nombre },
  });
}

async function me(req, res) {
  return success(res, req.user);
}

module.exports = { login, me };
```

- [ ] **Step 8: Write `server/src/routes/auth.routes.js`**

```js
const express = require('express');
const router = express.Router();
const { verificarToken } = require('../middlewares/auth');
const authController = require('../controllers/auth.controller');

router.post('/login', authController.login);
router.get('/me', verificarToken, authController.me);

module.exports = router;
```

- [ ] **Step 9: Wire it into `server/src/routes/index.js`**

```js
const express = require('express');
const router = express.Router();

router.use('/auth', require('./auth.routes'));

module.exports = router;
```

- [ ] **Step 10: Run test to verify it passes**

Run: `cd server && npm test -- auth.test.js`
Expected: `PASS tests/integration/auth.test.js` (4 tests)

- [ ] **Step 11: Commit**

```bash
git add server/src/middlewares server/src/services server/src/controllers/auth.controller.js server/src/routes server/tests/integration/auth.test.js
git commit -m "feat(server): add JWT auth, permission cache, and login route"
```

---

### Task 6: Área — migration, model, CRUD routes, salud documental

**Files:**
- Create: `server/src/migrations/20260702100200-crear-areas.js`
- Create: `server/src/models/Area.js`
- Create: `server/src/services/area.service.js`
- Create: `server/src/controllers/area.controller.js`
- Create: `server/src/routes/area.routes.js`
- Modify: `server/src/models/index.js`, `server/src/routes/index.js`
- Test: `server/tests/unit/area.service.test.js`
- Test: `server/tests/integration/area.routes.test.js`

**Interfaces:**
- Produces: `calcularSaludDocumental({ vigentes, porVencer, vencidos })` → `number` (0–100, rounded to 1 decimal; returns `100` when there are zero documents).
- Produces: `Area` fields: `id, nombre, codigo, liderUsuarioId, saludDocumentalPct, activo`.
- Produces: `GET /api/v1/areas` (permiso `areas.ver`), `POST /api/v1/areas` (permiso `areas.ver`+`crear` — added to catálogo of `roles.js` module actions used by admin only for now), each wrapped in `Auditoria.registrar()` on write.

- [ ] **Step 1: Write the failing unit test for the pure calculation**

```js
const { calcularSaludDocumental } = require('../../src/services/area.service');

describe('calcularSaludDocumental', () => {
  it('returns 100 when there are no documents', () => {
    expect(calcularSaludDocumental({ vigentes: 0, porVencer: 0, vencidos: 0 })).toBe(100);
  });

  it('computes the percentage of vigentes over the total', () => {
    expect(calcularSaludDocumental({ vigentes: 3, porVencer: 1, vencidos: 1 })).toBe(60);
  });

  it('rounds to 1 decimal', () => {
    expect(calcularSaludDocumental({ vigentes: 1, porVencer: 1, vencidos: 1 })).toBe(33.3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npm test -- area.service.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Write the migration `server/src/migrations/20260702100200-crear-areas.js`**

```js
module.exports = {
  up: async ({ context: queryInterface }) => {
    const { DataTypes } = require('sequelize');
    await queryInterface.createTable('areas', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      nombre: { type: DataTypes.STRING(100), allowNull: false },
      codigo: { type: DataTypes.STRING(20), allowNull: false, unique: true },
      lider_usuario_id: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'usuarios', key: 'id' } },
      salud_documental_pct: { type: DataTypes.DECIMAL(5, 1), allowNull: false, defaultValue: 100 },
      activo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      created_at: { type: DataTypes.DATE, allowNull: false },
      updated_at: { type: DataTypes.DATE, allowNull: false },
    });
  },
  down: async ({ context: queryInterface }) => {
    await queryInterface.dropTable('areas');
  },
};
```

- [ ] **Step 4: Write `server/src/models/Area.js`**

```js
const { DataTypes } = require('sequelize');

module.exports = (sequelize) =>
  sequelize.define(
    'Area',
    {
      nombre: { type: DataTypes.STRING(100), allowNull: false },
      codigo: { type: DataTypes.STRING(20), allowNull: false, unique: true },
      liderUsuarioId: { type: DataTypes.INTEGER, allowNull: true },
      saludDocumentalPct: { type: DataTypes.DECIMAL(5, 1), allowNull: false, defaultValue: 100 },
      activo: { type: DataTypes.BOOLEAN, defaultValue: true },
    },
    { tableName: 'areas', underscored: true }
  );
```

- [ ] **Step 4b: Register `Area` in `server/src/models/index.js`**

```js
const { sequelize } = require('../config/database');

const Usuario = require('./Usuario')(sequelize);
const Rol = require('./Rol')(sequelize);
const Permiso = require('./Permiso')(sequelize);
const RolPermiso = require('./RolPermiso')(sequelize);
const Auditoria = require('./Auditoria')(sequelize);
const Area = require('./Area')(sequelize);

Rol.hasMany(Usuario, { foreignKey: 'rolId' });
Usuario.belongsTo(Rol, { foreignKey: 'rolId' });
Rol.hasMany(RolPermiso, { foreignKey: 'rolId' });
RolPermiso.belongsTo(Rol, { foreignKey: 'rolId' });

module.exports = { sequelize, Usuario, Rol, Permiso, RolPermiso, Auditoria, Area };
```

- [ ] **Step 5: Write `server/src/services/area.service.js`**

```js
const { Area } = require('../models');

function calcularSaludDocumental({ vigentes, porVencer, vencidos }) {
  const total = vigentes + porVencer + vencidos;
  if (total === 0) return 100;
  return Math.round((vigentes / total) * 1000) / 10;
}

async function recalcularSaludArea(areaId) {
  const { Documento } = require('../models');
  const [vigentes, porVencer, vencidos] = await Promise.all([
    Documento.count({ where: { areaId, estado: 'vigente' } }),
    Documento.count({ where: { areaId, estado: 'por_vencer' } }),
    Documento.count({ where: { areaId, estado: 'vencido' } }),
  ]);
  const pct = calcularSaludDocumental({ vigentes, porVencer, vencidos });
  await Area.update({ saludDocumentalPct: pct }, { where: { id: areaId } });
  return pct;
}

module.exports = { calcularSaludDocumental, recalcularSaludArea };
```

- [ ] **Step 6: Run unit test to verify it passes**

Run: `cd server && npm test -- area.service.test.js`
Expected: `PASS`

- [ ] **Step 7: Write `server/src/controllers/area.controller.js`**

```js
const { Area, Auditoria } = require('../models');
const { success, created, notFound } = require('../utils/responses');

async function listar(req, res) {
  const areas = await Area.findAll({ where: { activo: true }, order: [['nombre', 'ASC']] });
  return success(res, areas);
}

async function crear(req, res) {
  const { nombre, codigo, liderUsuarioId } = req.body;
  const area = await Area.create({ nombre, codigo, liderUsuarioId });
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

- [ ] **Step 8: Write `server/src/routes/area.routes.js`**

```js
const express = require('express');
const router = express.Router();
const { verificarToken } = require('../middlewares/auth');
const { requierePermiso } = require('../middlewares/roles');
const controller = require('../controllers/area.controller');

router.get('/', verificarToken, requierePermiso('areas', 'ver'), controller.listar);
router.post('/', verificarToken, requierePermiso('areas', 'ver'), controller.crear);
router.get('/:id', verificarToken, requierePermiso('areas', 'ver'), controller.obtener);

module.exports = router;
```

Note: `crear` is gated on `areas.ver` (the only `areas` action seeded in Task 3) rather than a not-yet-seeded `crear` action, so the existing role matrix from Task 3 doesn't need a mid-plan seed edit; expanding the `areas` action list is a follow-up once the Administración UI exists.

- [ ] **Step 9: Wire into `server/src/routes/index.js`**

```js
router.use('/areas', require('./area.routes'));
```

- [ ] **Step 10: Write the failing integration test**

```js
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

describe('Areas API', () => {
  it('creates and lists an area, defaulting salud_documental_pct to 100', async () => {
    const createRes = await request(app)
      .post('/api/v1/areas')
      .set('Authorization', `Bearer ${token}`)
      .send({ nombre: 'Financiera', codigo: 'FIN' });
    expect(createRes.status).toBe(201);
    expect(Number(createRes.body.data.saludDocumentalPct)).toBe(100);

    const listRes = await request(app).get('/api/v1/areas').set('Authorization', `Bearer ${token}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.data.some((a) => a.codigo === 'FIN')).toBe(true);
  });
});
```

- [ ] **Step 11: Run test to verify it fails, then implement fixes until it passes**

Run: `cd server && npm test -- area.routes.test.js`
Expected: first FAIL (routes not wired), then `PASS` once Steps 7–9 are in place.

- [ ] **Step 12: Commit**

```bash
git add server/src/migrations/20260702100200-crear-areas.js server/src/models/Area.js server/src/services/area.service.js server/src/controllers/area.controller.js server/src/routes/area.routes.js server/src/models/index.js server/src/routes/index.js server/tests
git commit -m "feat(server): add Area model, salud documental calculation, and CRUD routes"
```

---

### Task 7: Carpeta + TipoDocumento

**Files:**
- Create: `server/src/migrations/20260702100300-crear-carpetas-tipos-documento.js`
- Create: `server/src/models/Carpeta.js`
- Create: `server/src/models/TipoDocumento.js`
- Modify: `server/src/scripts/seedTiposDocumento.js` (replace placeholder)
- Modify: `server/src/models/index.js`
- Test: `server/tests/integration/carpetas-tipos-documento.test.js`

**Interfaces:**
- Produces: `Carpeta` fields: `id, areaId, nombre, carpetaPadreId (nullable), orden, activo`.
- Produces: `TipoDocumento` fields: `id, nombre, diasAlertaVencimientoDefault, activo`.
- Produces: `seedTiposDocumento()` — idempotent, seeds: `Procedimiento` (30), `Formato` (30), `Manual` (60), `Contrato` (60), `Legal` (15), `Certificado SST` (30), `Certificado SARLAFT` (15).

- [ ] **Step 1: Write the failing test**

```js
const { sequelize } = require('../../src/config/database');
const { createMigrator } = require('../../src/config/migrator');
const { Area, Carpeta, TipoDocumento } = require('../../src/models');
const seedTiposDocumento = require('../../src/scripts/seedTiposDocumento');

beforeAll(async () => {
  await sequelize.authenticate();
  await createMigrator(sequelize).up();
});

afterAll(async () => {
  await sequelize.close();
});

describe('Carpeta + TipoDocumento', () => {
  it('supports nested carpetas within an area', async () => {
    const area = await Area.create({ nombre: 'SGI', codigo: 'SGI' });
    const raiz = await Carpeta.create({ areaId: area.id, nombre: 'Procesos' });
    const sub = await Carpeta.create({ areaId: area.id, nombre: 'Formatos', carpetaPadreId: raiz.id });
    expect(sub.carpetaPadreId).toBe(raiz.id);
  });

  it('seedTiposDocumento is idempotent and sets default alert windows', async () => {
    await seedTiposDocumento();
    await seedTiposDocumento();
    const count = await TipoDocumento.count();
    expect(count).toBe(7);
    const legal = await TipoDocumento.findOne({ where: { nombre: 'Legal' } });
    expect(legal.diasAlertaVencimientoDefault).toBe(15);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npm test -- carpetas-tipos-documento.test.js`
Expected: FAIL — models not found

- [ ] **Step 3: Write the migration `server/src/migrations/20260702100300-crear-carpetas-tipos-documento.js`**

```js
module.exports = {
  up: async ({ context: queryInterface }) => {
    const { DataTypes } = require('sequelize');

    await queryInterface.createTable('carpetas', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      area_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'areas', key: 'id' } },
      nombre: { type: DataTypes.STRING(150), allowNull: false },
      carpeta_padre_id: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'carpetas', key: 'id' } },
      orden: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      activo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      created_at: { type: DataTypes.DATE, allowNull: false },
      updated_at: { type: DataTypes.DATE, allowNull: false },
    });

    await queryInterface.createTable('tipos_documento', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      nombre: { type: DataTypes.STRING(100), allowNull: false, unique: true },
      dias_alerta_vencimiento_default: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 30 },
      activo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      created_at: { type: DataTypes.DATE, allowNull: false },
      updated_at: { type: DataTypes.DATE, allowNull: false },
    });
  },
  down: async ({ context: queryInterface }) => {
    await queryInterface.dropTable('tipos_documento');
    await queryInterface.dropTable('carpetas');
  },
};
```

- [ ] **Step 4: Write `server/src/models/Carpeta.js`**

```js
const { DataTypes } = require('sequelize');

module.exports = (sequelize) =>
  sequelize.define(
    'Carpeta',
    {
      areaId: { type: DataTypes.INTEGER, allowNull: false },
      nombre: { type: DataTypes.STRING(150), allowNull: false },
      carpetaPadreId: { type: DataTypes.INTEGER, allowNull: true },
      orden: { type: DataTypes.INTEGER, defaultValue: 0 },
      activo: { type: DataTypes.BOOLEAN, defaultValue: true },
    },
    { tableName: 'carpetas', underscored: true }
  );
```

- [ ] **Step 5: Write `server/src/models/TipoDocumento.js`**

```js
const { DataTypes } = require('sequelize');

module.exports = (sequelize) =>
  sequelize.define(
    'TipoDocumento',
    {
      nombre: { type: DataTypes.STRING(100), allowNull: false, unique: true },
      diasAlertaVencimientoDefault: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 30 },
      activo: { type: DataTypes.BOOLEAN, defaultValue: true },
    },
    { tableName: 'tipos_documento', underscored: true }
  );
```

- [ ] **Step 6: Register `Carpeta` and `TipoDocumento` in `server/src/models/index.js`**

```js
const { sequelize } = require('../config/database');

const Usuario = require('./Usuario')(sequelize);
const Rol = require('./Rol')(sequelize);
const Permiso = require('./Permiso')(sequelize);
const RolPermiso = require('./RolPermiso')(sequelize);
const Auditoria = require('./Auditoria')(sequelize);
const Area = require('./Area')(sequelize);
const Carpeta = require('./Carpeta')(sequelize);
const TipoDocumento = require('./TipoDocumento')(sequelize);

Rol.hasMany(Usuario, { foreignKey: 'rolId' });
Usuario.belongsTo(Rol, { foreignKey: 'rolId' });
Rol.hasMany(RolPermiso, { foreignKey: 'rolId' });
RolPermiso.belongsTo(Rol, { foreignKey: 'rolId' });

Area.hasMany(Carpeta, { foreignKey: 'areaId' });
Carpeta.belongsTo(Area, { foreignKey: 'areaId' });
Carpeta.hasMany(Carpeta, { as: 'subcarpetas', foreignKey: 'carpetaPadreId' });

module.exports = { sequelize, Usuario, Rol, Permiso, RolPermiso, Auditoria, Area, Carpeta, TipoDocumento };
```

- [ ] **Step 7: Write `server/src/scripts/seedTiposDocumento.js`**

```js
const { TipoDocumento } = require('../models');

const TIPOS = [
  { nombre: 'Procedimiento', diasAlertaVencimientoDefault: 30 },
  { nombre: 'Formato', diasAlertaVencimientoDefault: 30 },
  { nombre: 'Manual', diasAlertaVencimientoDefault: 60 },
  { nombre: 'Contrato', diasAlertaVencimientoDefault: 60 },
  { nombre: 'Legal', diasAlertaVencimientoDefault: 15 },
  { nombre: 'Certificado SST', diasAlertaVencimientoDefault: 30 },
  { nombre: 'Certificado SARLAFT', diasAlertaVencimientoDefault: 15 },
];

module.exports = async function seedTiposDocumento() {
  for (const tipo of TIPOS) {
    await TipoDocumento.findOrCreate({ where: { nombre: tipo.nombre }, defaults: tipo });
  }
};
```

- [ ] **Step 8: Run test to verify it passes**

Run: `cd server && npm test -- carpetas-tipos-documento.test.js`
Expected: `PASS` (2 tests)

- [ ] **Step 9: Commit**

```bash
git add server/src/migrations/20260702100300-crear-carpetas-tipos-documento.js server/src/models/Carpeta.js server/src/models/TipoDocumento.js server/src/models/index.js server/src/scripts/seedTiposDocumento.js server/tests/integration/carpetas-tipos-documento.test.js
git commit -m "feat(server): add Carpeta hierarchy and TipoDocumento catalog with seed"
```

---

### Task 8: Documento + DocumentoVersionHistorial + estado calculation

**Files:**
- Create: `server/src/migrations/20260702100400-crear-documentos.js`
- Create: `server/src/models/Documento.js`
- Create: `server/src/models/DocumentoVersionHistorial.js`
- Create: `server/src/services/documento.service.js`
- Modify: `server/src/models/index.js`
- Test: `server/tests/unit/documento.service.test.js`
- Test: `server/tests/integration/documento.test.js`

**Interfaces:**
- Produces: `calcularEstadoDocumento({ vigenciaHasta, diasAlerta, hoy = new Date() })` → `'sin_vigencia' | 'vigente' | 'por_vencer' | 'vencido'`.
- Produces: `subirNuevaVersion(documentoId, { version, s3Key, vigenciaDesde, vigenciaHasta, subidoPorUsuarioId })` — archives the current row into `DocumentoVersionHistorial`, updates `Documento` in place, recalculates `estado`, and calls `recalcularSaludArea(documento.areaId)`.

- [ ] **Step 1: Write the failing unit test**

```js
const { calcularEstadoDocumento } = require('../../src/services/documento.service');

describe('calcularEstadoDocumento', () => {
  const hoy = new Date('2026-07-02T00:00:00-05:00');

  it('returns sin_vigencia when there is no vigenciaHasta', () => {
    expect(calcularEstadoDocumento({ vigenciaHasta: null, diasAlerta: 30, hoy })).toBe('sin_vigencia');
  });

  it('returns vencido when vigenciaHasta is in the past', () => {
    expect(calcularEstadoDocumento({ vigenciaHasta: '2026-06-01', diasAlerta: 30, hoy })).toBe('vencido');
  });

  it('returns por_vencer when within the alert window', () => {
    expect(calcularEstadoDocumento({ vigenciaHasta: '2026-07-15', diasAlerta: 30, hoy })).toBe('por_vencer');
  });

  it('returns vigente when outside the alert window', () => {
    expect(calcularEstadoDocumento({ vigenciaHasta: '2026-12-31', diasAlerta: 30, hoy })).toBe('vigente');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npm test -- documento.service.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Write the migration `server/src/migrations/20260702100400-crear-documentos.js`**

```js
module.exports = {
  up: async ({ context: queryInterface }) => {
    const { DataTypes } = require('sequelize');

    await queryInterface.createTable('documentos', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      area_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'areas', key: 'id' } },
      carpeta_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'carpetas', key: 'id' } },
      tipo_documento_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'tipos_documento', key: 'id' } },
      nombre: { type: DataTypes.STRING(200), allowNull: false },
      codigo: { type: DataTypes.STRING(50), allowNull: true },
      version: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'v1' },
      vigencia_desde: { type: DataTypes.DATEONLY, allowNull: true },
      vigencia_hasta: { type: DataTypes.DATEONLY, allowNull: true },
      dias_alerta_vencimiento: { type: DataTypes.INTEGER, allowNull: true },
      estado: {
        type: DataTypes.ENUM('vigente', 'por_vencer', 'vencido', 'sin_vigencia'),
        allowNull: false,
        defaultValue: 'sin_vigencia',
      },
      s3_key: { type: DataTypes.STRING(500), allowNull: true },
      responsable_usuario_id: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'usuarios', key: 'id' } },
      activo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      created_at: { type: DataTypes.DATE, allowNull: false },
      updated_at: { type: DataTypes.DATE, allowNull: false },
    });

    await queryInterface.createTable('documento_version_historial', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      documento_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'documentos', key: 'id' } },
      version: { type: DataTypes.STRING(20), allowNull: false },
      s3_key: { type: DataTypes.STRING(500), allowNull: true },
      vigencia_desde: { type: DataTypes.DATEONLY, allowNull: true },
      vigencia_hasta: { type: DataTypes.DATEONLY, allowNull: true },
      subido_por_usuario_id: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'usuarios', key: 'id' } },
      created_at: { type: DataTypes.DATE, allowNull: false },
      updated_at: { type: DataTypes.DATE, allowNull: false },
    });
  },
  down: async ({ context: queryInterface }) => {
    await queryInterface.dropTable('documento_version_historial');
    await queryInterface.dropTable('documentos');
  },
};
```

- [ ] **Step 4: Write `server/src/models/Documento.js`**

```js
const { DataTypes } = require('sequelize');

module.exports = (sequelize) =>
  sequelize.define(
    'Documento',
    {
      areaId: { type: DataTypes.INTEGER, allowNull: false },
      carpetaId: { type: DataTypes.INTEGER, allowNull: false },
      tipoDocumentoId: { type: DataTypes.INTEGER, allowNull: false },
      nombre: { type: DataTypes.STRING(200), allowNull: false },
      codigo: { type: DataTypes.STRING(50), allowNull: true },
      version: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'v1' },
      vigenciaDesde: { type: DataTypes.DATEONLY, allowNull: true },
      vigenciaHasta: { type: DataTypes.DATEONLY, allowNull: true },
      diasAlertaVencimiento: { type: DataTypes.INTEGER, allowNull: true },
      estado: {
        type: DataTypes.ENUM('vigente', 'por_vencer', 'vencido', 'sin_vigencia'),
        allowNull: false,
        defaultValue: 'sin_vigencia',
      },
      s3Key: { type: DataTypes.STRING(500), allowNull: true },
      responsableUsuarioId: { type: DataTypes.INTEGER, allowNull: true },
      activo: { type: DataTypes.BOOLEAN, defaultValue: true },
    },
    { tableName: 'documentos', underscored: true }
  );
```

- [ ] **Step 5: Write `server/src/models/DocumentoVersionHistorial.js`**

```js
const { DataTypes } = require('sequelize');

module.exports = (sequelize) =>
  sequelize.define(
    'DocumentoVersionHistorial',
    {
      documentoId: { type: DataTypes.INTEGER, allowNull: false },
      version: { type: DataTypes.STRING(20), allowNull: false },
      s3Key: { type: DataTypes.STRING(500), allowNull: true },
      vigenciaDesde: { type: DataTypes.DATEONLY, allowNull: true },
      vigenciaHasta: { type: DataTypes.DATEONLY, allowNull: true },
      subidoPorUsuarioId: { type: DataTypes.INTEGER, allowNull: true },
    },
    { tableName: 'documento_version_historial', underscored: true }
  );
```

- [ ] **Step 6: Register `Documento` and `DocumentoVersionHistorial` in `server/src/models/index.js`**

```js
const { sequelize } = require('../config/database');

const Usuario = require('./Usuario')(sequelize);
const Rol = require('./Rol')(sequelize);
const Permiso = require('./Permiso')(sequelize);
const RolPermiso = require('./RolPermiso')(sequelize);
const Auditoria = require('./Auditoria')(sequelize);
const Area = require('./Area')(sequelize);
const Carpeta = require('./Carpeta')(sequelize);
const TipoDocumento = require('./TipoDocumento')(sequelize);
const Documento = require('./Documento')(sequelize);
const DocumentoVersionHistorial = require('./DocumentoVersionHistorial')(sequelize);

Rol.hasMany(Usuario, { foreignKey: 'rolId' });
Usuario.belongsTo(Rol, { foreignKey: 'rolId' });
Rol.hasMany(RolPermiso, { foreignKey: 'rolId' });
RolPermiso.belongsTo(Rol, { foreignKey: 'rolId' });

Area.hasMany(Carpeta, { foreignKey: 'areaId' });
Carpeta.belongsTo(Area, { foreignKey: 'areaId' });
Carpeta.hasMany(Carpeta, { as: 'subcarpetas', foreignKey: 'carpetaPadreId' });

Area.hasMany(Documento, { foreignKey: 'areaId' });
Documento.belongsTo(Area, { foreignKey: 'areaId' });
Carpeta.hasMany(Documento, { foreignKey: 'carpetaId' });
Documento.belongsTo(Carpeta, { foreignKey: 'carpetaId' });
TipoDocumento.hasMany(Documento, { foreignKey: 'tipoDocumentoId' });
Documento.belongsTo(TipoDocumento, { foreignKey: 'tipoDocumentoId' });
Documento.hasMany(DocumentoVersionHistorial, { foreignKey: 'documentoId' });
DocumentoVersionHistorial.belongsTo(Documento, { foreignKey: 'documentoId' });

module.exports = {
  sequelize, Usuario, Rol, Permiso, RolPermiso, Auditoria,
  Area, Carpeta, TipoDocumento, Documento, DocumentoVersionHistorial,
};
```

- [ ] **Step 7: Write `server/src/services/documento.service.js`**

```js
const DIA_MS = 24 * 60 * 60 * 1000;

function calcularEstadoDocumento({ vigenciaHasta, diasAlerta, hoy = new Date() }) {
  if (!vigenciaHasta) return 'sin_vigencia';
  const fechaVencimiento = new Date(`${vigenciaHasta}T00:00:00`);
  const diasRestantes = Math.floor((fechaVencimiento.getTime() - hoy.getTime()) / DIA_MS);
  if (diasRestantes < 0) return 'vencido';
  if (diasRestantes <= (diasAlerta ?? 30)) return 'por_vencer';
  return 'vigente';
}

async function subirNuevaVersion(documentoId, { version, s3Key, vigenciaDesde, vigenciaHasta, subidoPorUsuarioId }) {
  const { Documento, DocumentoVersionHistorial, TipoDocumento } = require('../models');
  const { recalcularSaludArea } = require('./area.service');

  const documento = await Documento.findByPk(documentoId);
  if (!documento) throw new Error('Documento no encontrado');

  await DocumentoVersionHistorial.create({
    documentoId: documento.id,
    version: documento.version,
    s3Key: documento.s3Key,
    vigenciaDesde: documento.vigenciaDesde,
    vigenciaHasta: documento.vigenciaHasta,
    subidoPorUsuarioId,
  });

  const tipoDocumento = await TipoDocumento.findByPk(documento.tipoDocumentoId);
  const diasAlerta = documento.diasAlertaVencimiento ?? tipoDocumento.diasAlertaVencimientoDefault;
  const estado = calcularEstadoDocumento({ vigenciaHasta, diasAlerta });

  await documento.update({ version, s3Key, vigenciaDesde, vigenciaHasta, estado });
  await recalcularSaludArea(documento.areaId);
  return documento;
}

module.exports = { calcularEstadoDocumento, subirNuevaVersion };
```

- [ ] **Step 8: Run unit test to verify it passes**

Run: `cd server && npm test -- documento.service.test.js`
Expected: `PASS` (4 tests)

- [ ] **Step 9: Write the failing integration test**

```js
const { sequelize } = require('../../src/config/database');
const { createMigrator } = require('../../src/config/migrator');
const { Area, Carpeta, TipoDocumento, Documento } = require('../../src/models');
const { subirNuevaVersion } = require('../../src/services/documento.service');

let area;
let carpeta;
let tipo;

beforeAll(async () => {
  await sequelize.authenticate();
  await createMigrator(sequelize).up();
  area = await Area.create({ nombre: 'SGI', codigo: 'SGI2' });
  carpeta = await Carpeta.create({ areaId: area.id, nombre: 'Procesos' });
  tipo = await TipoDocumento.create({ nombre: 'Procedimiento test', diasAlertaVencimientoDefault: 30 });
});

afterAll(async () => {
  await sequelize.close();
});

describe('Documento + DocumentoVersionHistorial', () => {
  it('archives the previous version and recalculates area health on a new upload', async () => {
    const documento = await Documento.create({
      areaId: area.id, carpetaId: carpeta.id, tipoDocumentoId: tipo.id,
      nombre: 'Procedimiento de compras', version: 'v1', s3Key: 'documentos/1/v1.pdf',
      vigenciaDesde: '2026-01-01', vigenciaHasta: '2026-12-31', estado: 'vigente',
    });

    await subirNuevaVersion(documento.id, {
      version: 'v2', s3Key: 'documentos/1/v2.pdf', vigenciaDesde: '2026-07-01', vigenciaHasta: '2026-07-10',
    });

    const actualizado = await Documento.findByPk(documento.id);
    expect(actualizado.version).toBe('v2');
    expect(actualizado.estado).toBe('por_vencer');

    const historial = await require('../../src/models').DocumentoVersionHistorial.findAll({ where: { documentoId: documento.id } });
    expect(historial).toHaveLength(1);
    expect(historial[0].version).toBe('v1');

    const areaActualizada = await Area.findByPk(area.id);
    expect(Number(areaActualizada.saludDocumentalPct)).toBe(100);
  });
});
```

- [ ] **Step 10: Run test to verify it fails, then re-run after wiring associations from Step 6, until it passes**

Run: `cd server && npm test -- documento.test.js`
Expected: `PASS` (1 test) once `models/index.js` associations are correctly registered.

- [ ] **Step 11: Commit**

```bash
git add server/src/migrations/20260702100400-crear-documentos.js server/src/models/Documento.js server/src/models/DocumentoVersionHistorial.js server/src/services/documento.service.js server/src/models/index.js server/tests
git commit -m "feat(server): add Documento with version history and estado calculation"
```

---

### Task 9: PlantillaFormulario

**Files:**
- Create: `server/src/migrations/20260702100500-crear-plantillas-formulario.js`
- Create: `server/src/models/PlantillaFormulario.js`
- Modify: `server/src/models/index.js`
- Test: `server/tests/integration/plantilla-formulario.test.js`

**Interfaces:**
- Produces: `PlantillaFormulario` fields: `id, codigo (unique), nombre, areaId, version, s3Key, activo`.

- [ ] **Step 1: Write the failing test**

```js
const { sequelize } = require('../../src/config/database');
const { createMigrator } = require('../../src/config/migrator');
const { Area, PlantillaFormulario } = require('../../src/models');

beforeAll(async () => {
  await sequelize.authenticate();
  await createMigrator(sequelize).up();
});

afterAll(async () => {
  await sequelize.close();
});

describe('PlantillaFormulario', () => {
  it('enforces a unique codigo', async () => {
    const area = await Area.create({ nombre: 'Calidad', codigo: 'CAL' });
    await PlantillaFormulario.create({ codigo: 'GC-FT-04', nombre: 'Solicitud de compra', areaId: area.id, version: 'v1' });
    await expect(
      PlantillaFormulario.create({ codigo: 'GC-FT-04', nombre: 'Duplicada', areaId: area.id, version: 'v1' })
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npm test -- plantilla-formulario.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Write the migration `server/src/migrations/20260702100500-crear-plantillas-formulario.js`**

```js
module.exports = {
  up: async ({ context: queryInterface }) => {
    const { DataTypes } = require('sequelize');
    await queryInterface.createTable('plantillas_formulario', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      codigo: { type: DataTypes.STRING(50), allowNull: false, unique: true },
      nombre: { type: DataTypes.STRING(200), allowNull: false },
      area_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'areas', key: 'id' } },
      version: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'v1' },
      s3_key: { type: DataTypes.STRING(500), allowNull: true },
      activo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      created_at: { type: DataTypes.DATE, allowNull: false },
      updated_at: { type: DataTypes.DATE, allowNull: false },
    });
  },
  down: async ({ context: queryInterface }) => {
    await queryInterface.dropTable('plantillas_formulario');
  },
};
```

- [ ] **Step 4: Write `server/src/models/PlantillaFormulario.js`**

```js
const { DataTypes } = require('sequelize');

module.exports = (sequelize) =>
  sequelize.define(
    'PlantillaFormulario',
    {
      codigo: { type: DataTypes.STRING(50), allowNull: false, unique: true },
      nombre: { type: DataTypes.STRING(200), allowNull: false },
      areaId: { type: DataTypes.INTEGER, allowNull: false },
      version: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'v1' },
      s3Key: { type: DataTypes.STRING(500), allowNull: true },
      activo: { type: DataTypes.BOOLEAN, defaultValue: true },
    },
    { tableName: 'plantillas_formulario', underscored: true }
  );
```

- [ ] **Step 5: Register `PlantillaFormulario` in `server/src/models/index.js`**

```js
const { sequelize } = require('../config/database');

const Usuario = require('./Usuario')(sequelize);
const Rol = require('./Rol')(sequelize);
const Permiso = require('./Permiso')(sequelize);
const RolPermiso = require('./RolPermiso')(sequelize);
const Auditoria = require('./Auditoria')(sequelize);
const Area = require('./Area')(sequelize);
const Carpeta = require('./Carpeta')(sequelize);
const TipoDocumento = require('./TipoDocumento')(sequelize);
const Documento = require('./Documento')(sequelize);
const DocumentoVersionHistorial = require('./DocumentoVersionHistorial')(sequelize);
const PlantillaFormulario = require('./PlantillaFormulario')(sequelize);

Rol.hasMany(Usuario, { foreignKey: 'rolId' });
Usuario.belongsTo(Rol, { foreignKey: 'rolId' });
Rol.hasMany(RolPermiso, { foreignKey: 'rolId' });
RolPermiso.belongsTo(Rol, { foreignKey: 'rolId' });

Area.hasMany(Carpeta, { foreignKey: 'areaId' });
Carpeta.belongsTo(Area, { foreignKey: 'areaId' });
Carpeta.hasMany(Carpeta, { as: 'subcarpetas', foreignKey: 'carpetaPadreId' });

Area.hasMany(Documento, { foreignKey: 'areaId' });
Documento.belongsTo(Area, { foreignKey: 'areaId' });
Carpeta.hasMany(Documento, { foreignKey: 'carpetaId' });
Documento.belongsTo(Carpeta, { foreignKey: 'carpetaId' });
TipoDocumento.hasMany(Documento, { foreignKey: 'tipoDocumentoId' });
Documento.belongsTo(TipoDocumento, { foreignKey: 'tipoDocumentoId' });
Documento.hasMany(DocumentoVersionHistorial, { foreignKey: 'documentoId' });
DocumentoVersionHistorial.belongsTo(Documento, { foreignKey: 'documentoId' });

Area.hasMany(PlantillaFormulario, { foreignKey: 'areaId' });
PlantillaFormulario.belongsTo(Area, { foreignKey: 'areaId' });

module.exports = {
  sequelize, Usuario, Rol, Permiso, RolPermiso, Auditoria,
  Area, Carpeta, TipoDocumento, Documento, DocumentoVersionHistorial, PlantillaFormulario,
};
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd server && npm test -- plantilla-formulario.test.js`
Expected: `PASS`

- [ ] **Step 7: Commit**

```bash
git add server/src/migrations/20260702100500-crear-plantillas-formulario.js server/src/models/PlantillaFormulario.js server/src/models/index.js server/tests/integration/plantilla-formulario.test.js
git commit -m "feat(server): add PlantillaFormulario catalog model"
```

---

### Task 10: TipoSolicitud + NivelAprobacion + seed + resolverNivelAprobacion

**Files:**
- Create: `server/src/migrations/20260702100600-crear-tipos-solicitud-niveles-aprobacion.js`
- Create: `server/src/models/TipoSolicitud.js`
- Create: `server/src/models/NivelAprobacion.js`
- Create: `server/src/services/nivelAprobacion.service.js`
- Modify: `server/src/scripts/seedNivelesAprobacion.js` (replace placeholder)
- Modify: `server/src/models/index.js`
- Test: `server/tests/unit/nivelAprobacion.service.test.js`

**Interfaces:**
- Produces: `NivelAprobacion` fields: `id, tipoSolicitudId, montoDesde, montoHasta (nullable), rolAprobador, orden, activo`.
- Produces: `resolverNivelAprobacion(tipoSolicitudId, monto)` → resolves to the matching `NivelAprobacion` row, or `null` if none matches (caller decides how to handle — e.g. default to `admin`).
- Produces: `seedNivelesAprobacion()` — idempotent, seeds `TipoSolicitud` (`compra`, `contratacion_servicio`) and example thresholds per type: `0–1,000,000 → lider_area`, `1,000,001–10,000,000 → financiera`, `10,000,001+ → admin`. These are placeholder business thresholds explicitly called out as adjustable via Administración (see spec's "Fuera de alcance" section) — not final ISTHO figures.

- [ ] **Step 1: Write the failing unit test**

```js
jest.mock('../../src/models', () => ({
  NivelAprobacion: { findOne: jest.fn() },
}));
const { NivelAprobacion } = require('../../src/models');
const { resolverNivelAprobacion } = require('../../src/services/nivelAprobacion.service');

describe('resolverNivelAprobacion', () => {
  it('queries NivelAprobacion for a range containing monto, ordered by orden ASC', async () => {
    NivelAprobacion.findOne.mockResolvedValue({ id: 2, rolAprobador: 'financiera' });
    const nivel = await resolverNivelAprobacion(1, 5_000_000);
    expect(nivel).toEqual({ id: 2, rolAprobador: 'financiera' });
    expect(NivelAprobacion.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tipoSolicitudId: 1, montoDesde: expect.anything() }),
        order: [['orden', 'ASC']],
      })
    );
  });

  it('returns null when no matching NivelAprobacion is found', async () => {
    NivelAprobacion.findOne.mockResolvedValue(null);
    expect(await resolverNivelAprobacion(1, 999)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npm test -- nivelAprobacion.service.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Write the migration `server/src/migrations/20260702100600-crear-tipos-solicitud-niveles-aprobacion.js`**

```js
module.exports = {
  up: async ({ context: queryInterface }) => {
    const { DataTypes } = require('sequelize');

    await queryInterface.createTable('tipos_solicitud', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      nombre: { type: DataTypes.STRING(100), allowNull: false, unique: true },
      activo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      created_at: { type: DataTypes.DATE, allowNull: false },
      updated_at: { type: DataTypes.DATE, allowNull: false },
    });

    await queryInterface.createTable('niveles_aprobacion', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      tipo_solicitud_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'tipos_solicitud', key: 'id' } },
      monto_desde: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
      monto_hasta: { type: DataTypes.DECIMAL(14, 2), allowNull: true },
      rol_aprobador: { type: DataTypes.STRING(50), allowNull: false },
      orden: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      activo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      created_at: { type: DataTypes.DATE, allowNull: false },
      updated_at: { type: DataTypes.DATE, allowNull: false },
    });
  },
  down: async ({ context: queryInterface }) => {
    await queryInterface.dropTable('niveles_aprobacion');
    await queryInterface.dropTable('tipos_solicitud');
  },
};
```

- [ ] **Step 4: Write `server/src/models/TipoSolicitud.js`**

```js
const { DataTypes } = require('sequelize');

module.exports = (sequelize) =>
  sequelize.define(
    'TipoSolicitud',
    { nombre: { type: DataTypes.STRING(100), allowNull: false, unique: true }, activo: { type: DataTypes.BOOLEAN, defaultValue: true } },
    { tableName: 'tipos_solicitud', underscored: true }
  );
```

- [ ] **Step 5: Write `server/src/models/NivelAprobacion.js`**

```js
const { DataTypes } = require('sequelize');

module.exports = (sequelize) =>
  sequelize.define(
    'NivelAprobacion',
    {
      tipoSolicitudId: { type: DataTypes.INTEGER, allowNull: false },
      montoDesde: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
      montoHasta: { type: DataTypes.DECIMAL(14, 2), allowNull: true },
      rolAprobador: { type: DataTypes.STRING(50), allowNull: false },
      orden: { type: DataTypes.INTEGER, defaultValue: 0 },
      activo: { type: DataTypes.BOOLEAN, defaultValue: true },
    },
    { tableName: 'niveles_aprobacion', underscored: true }
  );
```

- [ ] **Step 6: Register `TipoSolicitud` and `NivelAprobacion` in `server/src/models/index.js`**

```js
const { sequelize } = require('../config/database');

const Usuario = require('./Usuario')(sequelize);
const Rol = require('./Rol')(sequelize);
const Permiso = require('./Permiso')(sequelize);
const RolPermiso = require('./RolPermiso')(sequelize);
const Auditoria = require('./Auditoria')(sequelize);
const Area = require('./Area')(sequelize);
const Carpeta = require('./Carpeta')(sequelize);
const TipoDocumento = require('./TipoDocumento')(sequelize);
const Documento = require('./Documento')(sequelize);
const DocumentoVersionHistorial = require('./DocumentoVersionHistorial')(sequelize);
const PlantillaFormulario = require('./PlantillaFormulario')(sequelize);
const TipoSolicitud = require('./TipoSolicitud')(sequelize);
const NivelAprobacion = require('./NivelAprobacion')(sequelize);

Rol.hasMany(Usuario, { foreignKey: 'rolId' });
Usuario.belongsTo(Rol, { foreignKey: 'rolId' });
Rol.hasMany(RolPermiso, { foreignKey: 'rolId' });
RolPermiso.belongsTo(Rol, { foreignKey: 'rolId' });

Area.hasMany(Carpeta, { foreignKey: 'areaId' });
Carpeta.belongsTo(Area, { foreignKey: 'areaId' });
Carpeta.hasMany(Carpeta, { as: 'subcarpetas', foreignKey: 'carpetaPadreId' });

Area.hasMany(Documento, { foreignKey: 'areaId' });
Documento.belongsTo(Area, { foreignKey: 'areaId' });
Carpeta.hasMany(Documento, { foreignKey: 'carpetaId' });
Documento.belongsTo(Carpeta, { foreignKey: 'carpetaId' });
TipoDocumento.hasMany(Documento, { foreignKey: 'tipoDocumentoId' });
Documento.belongsTo(TipoDocumento, { foreignKey: 'tipoDocumentoId' });
Documento.hasMany(DocumentoVersionHistorial, { foreignKey: 'documentoId' });
DocumentoVersionHistorial.belongsTo(Documento, { foreignKey: 'documentoId' });

Area.hasMany(PlantillaFormulario, { foreignKey: 'areaId' });
PlantillaFormulario.belongsTo(Area, { foreignKey: 'areaId' });

TipoSolicitud.hasMany(NivelAprobacion, { foreignKey: 'tipoSolicitudId' });
NivelAprobacion.belongsTo(TipoSolicitud, { foreignKey: 'tipoSolicitudId' });

module.exports = {
  sequelize, Usuario, Rol, Permiso, RolPermiso, Auditoria,
  Area, Carpeta, TipoDocumento, Documento, DocumentoVersionHistorial, PlantillaFormulario,
  TipoSolicitud, NivelAprobacion,
};
```

- [ ] **Step 7: Write `server/src/services/nivelAprobacion.service.js`**

```js
const { Op } = require('sequelize');

async function resolverNivelAprobacion(tipoSolicitudId, monto) {
  const { NivelAprobacion } = require('../models');
  return NivelAprobacion.findOne({
    where: {
      tipoSolicitudId,
      activo: true,
      montoDesde: { [Op.lte]: monto },
      [Op.or]: [{ montoHasta: null }, { montoHasta: { [Op.gte]: monto } }],
    },
    order: [['orden', 'ASC']],
  });
}

module.exports = { resolverNivelAprobacion };
```

- [ ] **Step 8: Run unit test to verify it passes**

Run: `cd server && npm test -- nivelAprobacion.service.test.js`
Expected: `PASS` (2 tests)

- [ ] **Step 9: Write `server/src/scripts/seedNivelesAprobacion.js`**

```js
const { TipoSolicitud, NivelAprobacion } = require('../models');

const TIPOS = ['compra', 'contratacion_servicio'];

// Umbrales de ejemplo — ajustar desde Administración con los montos reales de ISTHO.
const NIVELES = [
  { montoDesde: 0, montoHasta: 1_000_000, rolAprobador: 'lider_area', orden: 1 },
  { montoDesde: 1_000_000.01, montoHasta: 10_000_000, rolAprobador: 'financiera', orden: 2 },
  { montoDesde: 10_000_000.01, montoHasta: null, rolAprobador: 'admin', orden: 3 },
];

module.exports = async function seedNivelesAprobacion() {
  for (const nombre of TIPOS) {
    const [tipo] = await TipoSolicitud.findOrCreate({ where: { nombre } });
    for (const nivel of NIVELES) {
      await NivelAprobacion.findOrCreate({
        where: { tipoSolicitudId: tipo.id, orden: nivel.orden },
        defaults: { ...nivel, tipoSolicitudId: tipo.id },
      });
    }
  }
};
```

- [ ] **Step 10: Commit**

```bash
git add server/src/migrations/20260702100600-crear-tipos-solicitud-niveles-aprobacion.js server/src/models/TipoSolicitud.js server/src/models/NivelAprobacion.js server/src/services/nivelAprobacion.service.js server/src/scripts/seedNivelesAprobacion.js server/src/models/index.js server/tests/unit/nivelAprobacion.service.test.js
git commit -m "feat(server): add TipoSolicitud/NivelAprobacion tables, seed, and resolver"
```

---

### Task 11: Solicitud + Cotizacion + SolicitudAprobacion

**Files:**
- Create: `server/src/migrations/20260702100700-crear-solicitudes.js`
- Create: `server/src/models/Solicitud.js`
- Create: `server/src/models/Cotizacion.js`
- Create: `server/src/models/SolicitudAprobacion.js`
- Modify: `server/src/models/index.js`
- Test: `server/tests/integration/solicitud.test.js`

**Interfaces:**
- Produces: `Solicitud` fields as in the spec, including `estado` enum `borrador|cotizando|en_aprobacion|aprobada|rechazada|confirmada|cerrada|cancelada`.
- Produces: `Cotizacion.belongsTo(Solicitud)`, `SolicitudAprobacion.belongsTo(Solicitud)` and `.belongsTo(NivelAprobacion)`.

- [ ] **Step 1: Write the failing test**

```js
const { sequelize } = require('../../src/config/database');
const { createMigrator } = require('../../src/config/migrator');
const { Area, TipoSolicitud, NivelAprobacion, Solicitud, Cotizacion, SolicitudAprobacion, Usuario, Rol } = require('../../src/models');
const seedRolesPermisos = require('../../src/scripts/seedRolesPermisos');
const seedNivelesAprobacion = require('../../src/scripts/seedNivelesAprobacion');

beforeAll(async () => {
  await sequelize.authenticate();
  await createMigrator(sequelize).up();
  await seedRolesPermisos();
  await seedNivelesAprobacion();
});

afterAll(async () => {
  await sequelize.close();
});

describe('Solicitud workflow tables', () => {
  it('links Solicitud -> Cotizacion -> SolicitudAprobacion', async () => {
    const area = await Area.create({ nombre: 'Operaciones', codigo: 'OPS2' });
    const tipo = await TipoSolicitud.findOne({ where: { nombre: 'compra' } });
    const nivel = await NivelAprobacion.findOne({ where: { tipoSolicitudId: tipo.id, orden: 1 } });
    const solicitante = await Usuario.unscoped().findOne({ where: { username: 'admin' } });

    const solicitud = await Solicitud.create({
      codigo: 'SOL-2026-0001', tipoSolicitudId: tipo.id, areaSolicitanteId: area.id,
      solicitanteUsuarioId: solicitante.id, descripcion: 'Compra de resmas de papel',
      montoEstimado: 500000, nivelAprobacionId: nivel.id, estado: 'cotizando',
    });

    const cotizacion = await Cotizacion.create({ solicitudId: solicitud.id, monto: 480000, seleccionada: true });
    const aprobacion = await SolicitudAprobacion.create({
      solicitudId: solicitud.id, nivelAprobacionId: nivel.id, aprobadorUsuarioId: solicitante.id, estado: 'pendiente', orden: 1,
    });

    expect(cotizacion.solicitudId).toBe(solicitud.id);
    expect(aprobacion.solicitudId).toBe(solicitud.id);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npm test -- solicitud.test.js`
Expected: FAIL — models not found

- [ ] **Step 3: Write the migration `server/src/migrations/20260702100700-crear-solicitudes.js`**

```js
module.exports = {
  up: async ({ context: queryInterface }) => {
    const { DataTypes } = require('sequelize');

    await queryInterface.createTable('solicitudes', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      codigo: { type: DataTypes.STRING(30), allowNull: false, unique: true },
      tipo_solicitud_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'tipos_solicitud', key: 'id' } },
      area_solicitante_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'areas', key: 'id' } },
      plantilla_origen_id: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'plantillas_formulario', key: 'id' } },
      solicitante_usuario_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'usuarios', key: 'id' } },
      descripcion: { type: DataTypes.TEXT, allowNull: true },
      monto_estimado: { type: DataTypes.DECIMAL(14, 2), allowNull: true },
      nivel_aprobacion_id: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'niveles_aprobacion', key: 'id' } },
      estado: {
        type: DataTypes.ENUM('borrador', 'cotizando', 'en_aprobacion', 'aprobada', 'rechazada', 'confirmada', 'cerrada', 'cancelada'),
        allowNull: false, defaultValue: 'borrador',
      },
      orden_formal_numero: { type: DataTypes.STRING(30), allowNull: true },
      orden_formal_s3_key: { type: DataTypes.STRING(500), allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false },
      updated_at: { type: DataTypes.DATE, allowNull: false },
    });

    await queryInterface.createTable('cotizaciones', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      solicitud_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'solicitudes', key: 'id' } },
      proveedor_id: { type: DataTypes.INTEGER, allowNull: true },
      monto: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
      s3_key: { type: DataTypes.STRING(500), allowNull: true },
      seleccionada: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      observaciones: { type: DataTypes.TEXT, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false },
      updated_at: { type: DataTypes.DATE, allowNull: false },
    });

    await queryInterface.createTable('solicitud_aprobaciones', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      solicitud_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'solicitudes', key: 'id' } },
      nivel_aprobacion_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'niveles_aprobacion', key: 'id' } },
      aprobador_usuario_id: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'usuarios', key: 'id' } },
      estado: { type: DataTypes.ENUM('pendiente', 'aprobado', 'rechazado'), allowNull: false, defaultValue: 'pendiente' },
      comentario: { type: DataTypes.TEXT, allowNull: true },
      orden: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
      fecha_resolucion: { type: DataTypes.DATE, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false },
      updated_at: { type: DataTypes.DATE, allowNull: false },
    });
  },
  down: async ({ context: queryInterface }) => {
    await queryInterface.dropTable('solicitud_aprobaciones');
    await queryInterface.dropTable('cotizaciones');
    await queryInterface.dropTable('solicitudes');
  },
};
```

- [ ] **Step 4: Write `server/src/models/Solicitud.js`**

```js
const { DataTypes } = require('sequelize');

module.exports = (sequelize) =>
  sequelize.define(
    'Solicitud',
    {
      codigo: { type: DataTypes.STRING(30), allowNull: false, unique: true },
      tipoSolicitudId: { type: DataTypes.INTEGER, allowNull: false },
      areaSolicitanteId: { type: DataTypes.INTEGER, allowNull: false },
      plantillaOrigenId: { type: DataTypes.INTEGER, allowNull: true },
      solicitanteUsuarioId: { type: DataTypes.INTEGER, allowNull: false },
      descripcion: { type: DataTypes.TEXT, allowNull: true },
      montoEstimado: { type: DataTypes.DECIMAL(14, 2), allowNull: true },
      nivelAprobacionId: { type: DataTypes.INTEGER, allowNull: true },
      estado: {
        type: DataTypes.ENUM('borrador', 'cotizando', 'en_aprobacion', 'aprobada', 'rechazada', 'confirmada', 'cerrada', 'cancelada'),
        allowNull: false, defaultValue: 'borrador',
      },
      ordenFormalNumero: { type: DataTypes.STRING(30), allowNull: true },
      ordenFormalS3Key: { type: DataTypes.STRING(500), allowNull: true },
    },
    { tableName: 'solicitudes', underscored: true }
  );
```

- [ ] **Step 5: Write `server/src/models/Cotizacion.js`**

```js
const { DataTypes } = require('sequelize');

module.exports = (sequelize) =>
  sequelize.define(
    'Cotizacion',
    {
      solicitudId: { type: DataTypes.INTEGER, allowNull: false },
      proveedorId: { type: DataTypes.INTEGER, allowNull: true },
      monto: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
      s3Key: { type: DataTypes.STRING(500), allowNull: true },
      seleccionada: { type: DataTypes.BOOLEAN, defaultValue: false },
      observaciones: { type: DataTypes.TEXT, allowNull: true },
    },
    { tableName: 'cotizaciones', underscored: true }
  );
```

- [ ] **Step 6: Write `server/src/models/SolicitudAprobacion.js`**

```js
const { DataTypes } = require('sequelize');

module.exports = (sequelize) =>
  sequelize.define(
    'SolicitudAprobacion',
    {
      solicitudId: { type: DataTypes.INTEGER, allowNull: false },
      nivelAprobacionId: { type: DataTypes.INTEGER, allowNull: false },
      aprobadorUsuarioId: { type: DataTypes.INTEGER, allowNull: true },
      estado: { type: DataTypes.ENUM('pendiente', 'aprobado', 'rechazado'), allowNull: false, defaultValue: 'pendiente' },
      comentario: { type: DataTypes.TEXT, allowNull: true },
      orden: { type: DataTypes.INTEGER, defaultValue: 1 },
      fechaResolucion: { type: DataTypes.DATE, allowNull: true },
    },
    { tableName: 'solicitud_aprobaciones', underscored: true }
  );
```

- [ ] **Step 7: Register `Solicitud`, `Cotizacion`, and `SolicitudAprobacion` in `server/src/models/index.js`**

```js
const { sequelize } = require('../config/database');

const Usuario = require('./Usuario')(sequelize);
const Rol = require('./Rol')(sequelize);
const Permiso = require('./Permiso')(sequelize);
const RolPermiso = require('./RolPermiso')(sequelize);
const Auditoria = require('./Auditoria')(sequelize);
const Area = require('./Area')(sequelize);
const Carpeta = require('./Carpeta')(sequelize);
const TipoDocumento = require('./TipoDocumento')(sequelize);
const Documento = require('./Documento')(sequelize);
const DocumentoVersionHistorial = require('./DocumentoVersionHistorial')(sequelize);
const PlantillaFormulario = require('./PlantillaFormulario')(sequelize);
const TipoSolicitud = require('./TipoSolicitud')(sequelize);
const NivelAprobacion = require('./NivelAprobacion')(sequelize);
const Solicitud = require('./Solicitud')(sequelize);
const Cotizacion = require('./Cotizacion')(sequelize);
const SolicitudAprobacion = require('./SolicitudAprobacion')(sequelize);

Rol.hasMany(Usuario, { foreignKey: 'rolId' });
Usuario.belongsTo(Rol, { foreignKey: 'rolId' });
Rol.hasMany(RolPermiso, { foreignKey: 'rolId' });
RolPermiso.belongsTo(Rol, { foreignKey: 'rolId' });

Area.hasMany(Carpeta, { foreignKey: 'areaId' });
Carpeta.belongsTo(Area, { foreignKey: 'areaId' });
Carpeta.hasMany(Carpeta, { as: 'subcarpetas', foreignKey: 'carpetaPadreId' });

Area.hasMany(Documento, { foreignKey: 'areaId' });
Documento.belongsTo(Area, { foreignKey: 'areaId' });
Carpeta.hasMany(Documento, { foreignKey: 'carpetaId' });
Documento.belongsTo(Carpeta, { foreignKey: 'carpetaId' });
TipoDocumento.hasMany(Documento, { foreignKey: 'tipoDocumentoId' });
Documento.belongsTo(TipoDocumento, { foreignKey: 'tipoDocumentoId' });
Documento.hasMany(DocumentoVersionHistorial, { foreignKey: 'documentoId' });
DocumentoVersionHistorial.belongsTo(Documento, { foreignKey: 'documentoId' });

Area.hasMany(PlantillaFormulario, { foreignKey: 'areaId' });
PlantillaFormulario.belongsTo(Area, { foreignKey: 'areaId' });

TipoSolicitud.hasMany(NivelAprobacion, { foreignKey: 'tipoSolicitudId' });
NivelAprobacion.belongsTo(TipoSolicitud, { foreignKey: 'tipoSolicitudId' });

Area.hasMany(Solicitud, { foreignKey: 'areaSolicitanteId' });
Solicitud.belongsTo(Area, { foreignKey: 'areaSolicitanteId' });
TipoSolicitud.hasMany(Solicitud, { foreignKey: 'tipoSolicitudId' });
Solicitud.belongsTo(TipoSolicitud, { foreignKey: 'tipoSolicitudId' });
Solicitud.hasMany(Cotizacion, { foreignKey: 'solicitudId' });
Cotizacion.belongsTo(Solicitud, { foreignKey: 'solicitudId' });
Solicitud.hasMany(SolicitudAprobacion, { foreignKey: 'solicitudId' });
SolicitudAprobacion.belongsTo(Solicitud, { foreignKey: 'solicitudId' });
SolicitudAprobacion.belongsTo(NivelAprobacion, { foreignKey: 'nivelAprobacionId' });

module.exports = {
  sequelize, Usuario, Rol, Permiso, RolPermiso, Auditoria,
  Area, Carpeta, TipoDocumento, Documento, DocumentoVersionHistorial, PlantillaFormulario,
  TipoSolicitud, NivelAprobacion, Solicitud, Cotizacion, SolicitudAprobacion,
};
```

- [ ] **Step 8: Run test to verify it passes**

Run: `cd server && npm test -- solicitud.test.js`
Expected: `PASS`

- [ ] **Step 9: Commit**

```bash
git add server/src/migrations/20260702100700-crear-solicitudes.js server/src/models/Solicitud.js server/src/models/Cotizacion.js server/src/models/SolicitudAprobacion.js server/src/models/index.js server/tests/integration/solicitud.test.js
git commit -m "feat(server): add Solicitud, Cotizacion, and SolicitudAprobacion workflow tables"
```

---

### Task 12: Proveedor + RequisitoProveedor + ProveedorDocumento + EvaluacionProveedor + seed

**Files:**
- Create: `server/src/migrations/20260702100800-crear-proveedores.js`
- Create: `server/src/models/Proveedor.js`
- Create: `server/src/models/RequisitoProveedor.js`
- Create: `server/src/models/ProveedorDocumento.js`
- Create: `server/src/models/EvaluacionProveedor.js`
- Modify: `server/src/scripts/seedRequisitosProveedor.js` (replace placeholder)
- Modify: `server/src/models/index.js`
- Test: `server/tests/integration/proveedor.test.js`

**Interfaces:**
- Produces: `Proveedor` fields as in spec, `criticidad` enum `alta|media|baja`.
- Produces: `RequisitoProveedor` fields: `id, nombre, criticidadMinima, obligatorio, vigenciaAplica, activo`.
- Produces: `seedRequisitosProveedor()` — idempotent, seeds: `Cámara de Comercio` (baja, obligatorio, sin vigencia), `RUT` (baja, obligatorio, sin vigencia), `Certificado SST` (media, obligatorio, con vigencia), `Certificado SARLAFT` (alta, obligatorio, con vigencia), `Póliza de responsabilidad civil` (alta, obligatorio, con vigencia).

- [ ] **Step 1: Write the failing test**

```js
const { sequelize } = require('../../src/config/database');
const { createMigrator } = require('../../src/config/migrator');
const { Proveedor, RequisitoProveedor, ProveedorDocumento, EvaluacionProveedor } = require('../../src/models');
const seedRequisitosProveedor = require('../../src/scripts/seedRequisitosProveedor');

beforeAll(async () => {
  await sequelize.authenticate();
  await createMigrator(sequelize).up();
});

afterAll(async () => {
  await sequelize.close();
});

describe('Proveedor domain', () => {
  it('seedRequisitosProveedor is idempotent and includes SARLAFT as alta criticidad', async () => {
    await seedRequisitosProveedor();
    await seedRequisitosProveedor();
    const count = await RequisitoProveedor.count();
    expect(count).toBe(5);
    const sarlaft = await RequisitoProveedor.findOne({ where: { nombre: 'Certificado SARLAFT' } });
    expect(sarlaft.criticidadMinima).toBe('alta');
    expect(sarlaft.vigenciaAplica).toBe(true);
  });

  it('links Proveedor -> ProveedorDocumento -> RequisitoProveedor and -> EvaluacionProveedor', async () => {
    const requisito = await RequisitoProveedor.findOne({ where: { nombre: 'RUT' } });
    const proveedor = await Proveedor.create({
      tipo: 'proveedor', documentoIdentificacion: '900123456-7', razonSocial: 'Transportes ABC SAS',
      criticidad: 'media', categoria: 'transporte', estado: 'activo',
    });
    const documento = await ProveedorDocumento.create({
      proveedorId: proveedor.id, requisitoId: requisito.id, s3Key: 'documentos/prov-1/rut.pdf', estado: 'vigente',
    });
    const evaluacion = await EvaluacionProveedor.create({
      proveedorId: proveedor.id, periodo: 2026, fechaProgramada: '2026-12-01', estado: 'pendiente',
    });

    expect(documento.proveedorId).toBe(proveedor.id);
    expect(evaluacion.proveedorId).toBe(proveedor.id);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npm test -- proveedor.test.js`
Expected: FAIL — models not found

- [ ] **Step 3: Write the migration `server/src/migrations/20260702100800-crear-proveedores.js`**

```js
module.exports = {
  up: async ({ context: queryInterface }) => {
    const { DataTypes } = require('sequelize');

    await queryInterface.createTable('proveedores', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      tipo: { type: DataTypes.ENUM('proveedor', 'contratista'), allowNull: false },
      documento_identificacion: { type: DataTypes.STRING(30), allowNull: false, unique: true },
      razon_social: { type: DataTypes.STRING(200), allowNull: false },
      criticidad: { type: DataTypes.ENUM('alta', 'media', 'baja'), allowNull: false, defaultValue: 'media' },
      categoria: { type: DataTypes.STRING(100), allowNull: true },
      responsable_usuario_id: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'usuarios', key: 'id' } },
      estado: { type: DataTypes.ENUM('activo', 'inactivo', 'en_evaluacion', 'suspendido'), allowNull: false, defaultValue: 'en_evaluacion' },
      fecha_ultima_evaluacion: { type: DataTypes.DATEONLY, allowNull: true },
      fecha_proxima_evaluacion: { type: DataTypes.DATEONLY, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false },
      updated_at: { type: DataTypes.DATE, allowNull: false },
    });

    await queryInterface.createTable('requisitos_proveedor', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      nombre: { type: DataTypes.STRING(150), allowNull: false, unique: true },
      criticidad_minima: { type: DataTypes.ENUM('alta', 'media', 'baja'), allowNull: false },
      obligatorio: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      vigencia_aplica: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      activo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      created_at: { type: DataTypes.DATE, allowNull: false },
      updated_at: { type: DataTypes.DATE, allowNull: false },
    });

    await queryInterface.createTable('proveedor_documentos', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      proveedor_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'proveedores', key: 'id' } },
      requisito_id: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'requisitos_proveedor', key: 'id' } },
      s3_key: { type: DataTypes.STRING(500), allowNull: true },
      vigencia_desde: { type: DataTypes.DATEONLY, allowNull: true },
      vigencia_hasta: { type: DataTypes.DATEONLY, allowNull: true },
      estado: { type: DataTypes.ENUM('vigente', 'por_vencer', 'vencido'), allowNull: false, defaultValue: 'vigente' },
      version: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'v1' },
      created_at: { type: DataTypes.DATE, allowNull: false },
      updated_at: { type: DataTypes.DATE, allowNull: false },
    });

    await queryInterface.createTable('evaluaciones_proveedor', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      proveedor_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'proveedores', key: 'id' } },
      periodo: { type: DataTypes.INTEGER, allowNull: false },
      fecha_programada: { type: DataTypes.DATEONLY, allowNull: false },
      fecha_realizada: { type: DataTypes.DATEONLY, allowNull: true },
      responsable_usuario_id: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'usuarios', key: 'id' } },
      puntaje: { type: DataTypes.DECIMAL(5, 2), allowNull: true },
      estado: { type: DataTypes.ENUM('pendiente', 'en_proceso', 'completada', 'vencida'), allowNull: false, defaultValue: 'pendiente' },
      observaciones: { type: DataTypes.TEXT, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false },
      updated_at: { type: DataTypes.DATE, allowNull: false },
    });
  },
  down: async ({ context: queryInterface }) => {
    await queryInterface.dropTable('evaluaciones_proveedor');
    await queryInterface.dropTable('proveedor_documentos');
    await queryInterface.dropTable('requisitos_proveedor');
    await queryInterface.dropTable('proveedores');
  },
};
```

- [ ] **Step 4: Write `server/src/models/Proveedor.js`**

```js
const { DataTypes } = require('sequelize');

module.exports = (sequelize) =>
  sequelize.define(
    'Proveedor',
    {
      tipo: { type: DataTypes.ENUM('proveedor', 'contratista'), allowNull: false },
      documentoIdentificacion: { type: DataTypes.STRING(30), allowNull: false, unique: true },
      razonSocial: { type: DataTypes.STRING(200), allowNull: false },
      criticidad: { type: DataTypes.ENUM('alta', 'media', 'baja'), allowNull: false, defaultValue: 'media' },
      categoria: { type: DataTypes.STRING(100), allowNull: true },
      responsableUsuarioId: { type: DataTypes.INTEGER, allowNull: true },
      estado: { type: DataTypes.ENUM('activo', 'inactivo', 'en_evaluacion', 'suspendido'), allowNull: false, defaultValue: 'en_evaluacion' },
      fechaUltimaEvaluacion: { type: DataTypes.DATEONLY, allowNull: true },
      fechaProximaEvaluacion: { type: DataTypes.DATEONLY, allowNull: true },
    },
    { tableName: 'proveedores', underscored: true }
  );
```

- [ ] **Step 5: Write `server/src/models/RequisitoProveedor.js`**

```js
const { DataTypes } = require('sequelize');

module.exports = (sequelize) =>
  sequelize.define(
    'RequisitoProveedor',
    {
      nombre: { type: DataTypes.STRING(150), allowNull: false, unique: true },
      criticidadMinima: { type: DataTypes.ENUM('alta', 'media', 'baja'), allowNull: false },
      obligatorio: { type: DataTypes.BOOLEAN, defaultValue: true },
      vigenciaAplica: { type: DataTypes.BOOLEAN, defaultValue: false },
      activo: { type: DataTypes.BOOLEAN, defaultValue: true },
    },
    { tableName: 'requisitos_proveedor', underscored: true }
  );
```

- [ ] **Step 6: Write `server/src/models/ProveedorDocumento.js`**

```js
const { DataTypes } = require('sequelize');

module.exports = (sequelize) =>
  sequelize.define(
    'ProveedorDocumento',
    {
      proveedorId: { type: DataTypes.INTEGER, allowNull: false },
      requisitoId: { type: DataTypes.INTEGER, allowNull: true },
      s3Key: { type: DataTypes.STRING(500), allowNull: true },
      vigenciaDesde: { type: DataTypes.DATEONLY, allowNull: true },
      vigenciaHasta: { type: DataTypes.DATEONLY, allowNull: true },
      estado: { type: DataTypes.ENUM('vigente', 'por_vencer', 'vencido'), allowNull: false, defaultValue: 'vigente' },
      version: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'v1' },
    },
    { tableName: 'proveedor_documentos', underscored: true }
  );
```

- [ ] **Step 7: Write `server/src/models/EvaluacionProveedor.js`**

```js
const { DataTypes } = require('sequelize');

module.exports = (sequelize) =>
  sequelize.define(
    'EvaluacionProveedor',
    {
      proveedorId: { type: DataTypes.INTEGER, allowNull: false },
      periodo: { type: DataTypes.INTEGER, allowNull: false },
      fechaProgramada: { type: DataTypes.DATEONLY, allowNull: false },
      fechaRealizada: { type: DataTypes.DATEONLY, allowNull: true },
      responsableUsuarioId: { type: DataTypes.INTEGER, allowNull: true },
      puntaje: { type: DataTypes.DECIMAL(5, 2), allowNull: true },
      estado: { type: DataTypes.ENUM('pendiente', 'en_proceso', 'completada', 'vencida'), allowNull: false, defaultValue: 'pendiente' },
      observaciones: { type: DataTypes.TEXT, allowNull: true },
    },
    { tableName: 'evaluaciones_proveedor', underscored: true }
  );
```

- [ ] **Step 8: Register `Proveedor`, `RequisitoProveedor`, `ProveedorDocumento`, and `EvaluacionProveedor` in `server/src/models/index.js`** (final state of this file for the backend foundation plan)

```js
const { sequelize } = require('../config/database');

const Usuario = require('./Usuario')(sequelize);
const Rol = require('./Rol')(sequelize);
const Permiso = require('./Permiso')(sequelize);
const RolPermiso = require('./RolPermiso')(sequelize);
const Auditoria = require('./Auditoria')(sequelize);
const Area = require('./Area')(sequelize);
const Carpeta = require('./Carpeta')(sequelize);
const TipoDocumento = require('./TipoDocumento')(sequelize);
const Documento = require('./Documento')(sequelize);
const DocumentoVersionHistorial = require('./DocumentoVersionHistorial')(sequelize);
const PlantillaFormulario = require('./PlantillaFormulario')(sequelize);
const TipoSolicitud = require('./TipoSolicitud')(sequelize);
const NivelAprobacion = require('./NivelAprobacion')(sequelize);
const Solicitud = require('./Solicitud')(sequelize);
const Cotizacion = require('./Cotizacion')(sequelize);
const SolicitudAprobacion = require('./SolicitudAprobacion')(sequelize);
const Proveedor = require('./Proveedor')(sequelize);
const RequisitoProveedor = require('./RequisitoProveedor')(sequelize);
const ProveedorDocumento = require('./ProveedorDocumento')(sequelize);
const EvaluacionProveedor = require('./EvaluacionProveedor')(sequelize);

Rol.hasMany(Usuario, { foreignKey: 'rolId' });
Usuario.belongsTo(Rol, { foreignKey: 'rolId' });
Rol.hasMany(RolPermiso, { foreignKey: 'rolId' });
RolPermiso.belongsTo(Rol, { foreignKey: 'rolId' });

Area.hasMany(Carpeta, { foreignKey: 'areaId' });
Carpeta.belongsTo(Area, { foreignKey: 'areaId' });
Carpeta.hasMany(Carpeta, { as: 'subcarpetas', foreignKey: 'carpetaPadreId' });

Area.hasMany(Documento, { foreignKey: 'areaId' });
Documento.belongsTo(Area, { foreignKey: 'areaId' });
Carpeta.hasMany(Documento, { foreignKey: 'carpetaId' });
Documento.belongsTo(Carpeta, { foreignKey: 'carpetaId' });
TipoDocumento.hasMany(Documento, { foreignKey: 'tipoDocumentoId' });
Documento.belongsTo(TipoDocumento, { foreignKey: 'tipoDocumentoId' });
Documento.hasMany(DocumentoVersionHistorial, { foreignKey: 'documentoId' });
DocumentoVersionHistorial.belongsTo(Documento, { foreignKey: 'documentoId' });

Area.hasMany(PlantillaFormulario, { foreignKey: 'areaId' });
PlantillaFormulario.belongsTo(Area, { foreignKey: 'areaId' });

TipoSolicitud.hasMany(NivelAprobacion, { foreignKey: 'tipoSolicitudId' });
NivelAprobacion.belongsTo(TipoSolicitud, { foreignKey: 'tipoSolicitudId' });

Area.hasMany(Solicitud, { foreignKey: 'areaSolicitanteId' });
Solicitud.belongsTo(Area, { foreignKey: 'areaSolicitanteId' });
TipoSolicitud.hasMany(Solicitud, { foreignKey: 'tipoSolicitudId' });
Solicitud.belongsTo(TipoSolicitud, { foreignKey: 'tipoSolicitudId' });
Solicitud.hasMany(Cotizacion, { foreignKey: 'solicitudId' });
Cotizacion.belongsTo(Solicitud, { foreignKey: 'solicitudId' });
Solicitud.hasMany(SolicitudAprobacion, { foreignKey: 'solicitudId' });
SolicitudAprobacion.belongsTo(Solicitud, { foreignKey: 'solicitudId' });
SolicitudAprobacion.belongsTo(NivelAprobacion, { foreignKey: 'nivelAprobacionId' });

Proveedor.hasMany(ProveedorDocumento, { foreignKey: 'proveedorId' });
ProveedorDocumento.belongsTo(Proveedor, { foreignKey: 'proveedorId' });
RequisitoProveedor.hasMany(ProveedorDocumento, { foreignKey: 'requisitoId' });
ProveedorDocumento.belongsTo(RequisitoProveedor, { foreignKey: 'requisitoId' });
Proveedor.hasMany(EvaluacionProveedor, { foreignKey: 'proveedorId' });
EvaluacionProveedor.belongsTo(Proveedor, { foreignKey: 'proveedorId' });

module.exports = {
  sequelize, Usuario, Rol, Permiso, RolPermiso, Auditoria,
  Area, Carpeta, TipoDocumento, Documento, DocumentoVersionHistorial, PlantillaFormulario,
  TipoSolicitud, NivelAprobacion, Solicitud, Cotizacion, SolicitudAprobacion,
  Proveedor, RequisitoProveedor, ProveedorDocumento, EvaluacionProveedor,
};
```

- [ ] **Step 9: Write `server/src/scripts/seedRequisitosProveedor.js`**

```js
const { RequisitoProveedor } = require('../models');

const REQUISITOS = [
  { nombre: 'Cámara de Comercio', criticidadMinima: 'baja', obligatorio: true, vigenciaAplica: false },
  { nombre: 'RUT', criticidadMinima: 'baja', obligatorio: true, vigenciaAplica: false },
  { nombre: 'Certificado SST', criticidadMinima: 'media', obligatorio: true, vigenciaAplica: true },
  { nombre: 'Certificado SARLAFT', criticidadMinima: 'alta', obligatorio: true, vigenciaAplica: true },
  { nombre: 'Póliza de responsabilidad civil', criticidadMinima: 'alta', obligatorio: true, vigenciaAplica: true },
];

module.exports = async function seedRequisitosProveedor() {
  for (const requisito of REQUISITOS) {
    await RequisitoProveedor.findOrCreate({ where: { nombre: requisito.nombre }, defaults: requisito });
  }
};
```

- [ ] **Step 10: Run test to verify it passes**

Run: `cd server && npm test -- proveedor.test.js`
Expected: `PASS` (2 tests)

- [ ] **Step 11: Run the full backend test suite**

Run: `cd server && npm test`
Expected: all suites `PASS` (Tasks 1–12 combined).

- [ ] **Step 12: Commit**

```bash
git add server/src/migrations/20260702100800-crear-proveedores.js server/src/models/Proveedor.js server/src/models/RequisitoProveedor.js server/src/models/ProveedorDocumento.js server/src/models/EvaluacionProveedor.js server/src/scripts/seedRequisitosProveedor.js server/src/models/index.js server/tests/integration/proveedor.test.js
git commit -m "feat(server): add Proveedor, RequisitoProveedor, ProveedorDocumento, EvaluacionProveedor and seed"
```

---

### Task 13: Architecture docs — CRM integration contract + README setup

**Files:**
- Create: `docs/architecture/crm-integration.md`
- Modify: `README.md`

**Interfaces:** none (documentation only).

- [ ] **Step 1: Write `docs/architecture/crm-integration.md`**

```markdown
# Integración futura COD ↔ CRM CenthriX

> Estado: diseño únicamente — no implementado. Ver sección 6 del spec
> `docs/superpowers/specs/2026-07-02-cod-modelo-datos-estructura-design.md`.

## Contrato propuesto

- **Cliente HTTP interno en COD:** `server/src/services/crmClient.js` (a crear),
  análogo a `wmsSyncService.js` del CRM — un módulo con funciones `getProveedor(id)`,
  `getOperaciones(filtros)` que llaman al CRM vía `fetch`/`axios`.
- **Autenticación:** header `x-api-key`, mismo patrón que `powerbiAuth.js` del CRM
  (comparación SHA-256 contra un valor almacenado, sin JWT de usuario).
- **Endpoints a construir en el CRM (fuera de alcance de este repo):**
  - `GET /api/v1/integraciones/cod/proveedores`
  - `GET /api/v1/integraciones/cod/operaciones`
- **Modo de sincronización:** PULL bajo demanda — COD consulta al CRM cuando el
  usuario lo necesita (p. ej. al crear un `Proveedor` para sugerir datos ya
  existentes en el CRM, o para reportes cruzados). Sin sincronización
  automática (push/pull programado) en esta fase.
- **Manejo de fallos:** si el CRM no responde, COD debe degradar con
  gracefulmente (mostrar el formulario vacío, sin bloquear la creación local) —
  la integración es un enriquecimiento opcional, nunca una dependencia dura.

## Próximos pasos (no incluidos en este plan)

1. Definir y documentar el contrato exacto de request/response de cada endpoint.
2. Implementar los endpoints en el CRM protegidos por `x-api-key`.
3. Implementar `crmClient.js` en COD con timeout corto (ej. 3s) y manejo de error silencioso.
```

- [ ] **Step 2: Update `README.md`** — replace its current placeholder content with:

```markdown
# COD — Centro Operativo Documental (ISTHO S.A.S.)

Sistema hermano del CRM CenthriX: mismo lenguaje visual y convenciones
técnicas (ver `DESIGN_SYSTEM_CENTHRIX.md`), dominio propio de Compras,
Proveedores/Contratistas y Repositorio documental SGI.

## Documentación

- Diseño inicial (modelo de datos + estructura de carpetas):
  `docs/superpowers/specs/2026-07-02-cod-modelo-datos-estructura-design.md`
- Integración futura con el CRM: `docs/architecture/crm-integration.md`

## Backend (`server/`)

```bash
cd server
npm install
cp .env.example .env   # completar JWT_SECRET, credenciales de MySQL, etc.
npm run migration:up   # o simplemente `npm start` — corre migraciones+seeds al arrancar
npm run dev
```

Tests (requieren MySQL local accesible, ver `server/.env.test`):

```bash
cd server
npm test
```
```

- [ ] **Step 3: Verify the docs render correctly**

Run: `cd "c:\Users\PC_PRACTIDS\Documents\GitHub\COD" && cat docs/architecture/crm-integration.md README.md`
Expected: both files print with no truncation or broken markdown.

- [ ] **Step 4: Commit**

```bash
git add docs/architecture/crm-integration.md README.md
git commit -m "docs: add CRM integration contract and backend setup instructions"
```

---

## Not covered by this plan (deliberately out of scope)

- Frontend scaffold (Vite + React + Tailwind, Sidebar, FloatingHeader, Login page, Dashboard Inicio) — planned as a separate **COD Frontend Foundation** plan once this backend is merged, since it has its own test tooling (Vitest/RTL) and can be reviewed independently.
- CRUD controllers/routes for Documento, Solicitud, Proveedor, etc. beyond what Task 6 demonstrates for Área — building full CRUD for every module is explicitly deferred ("no inicies el desarrollo de pantallas de detalle todavía").
- Real values for `NivelAprobacion` thresholds and the full `RequisitoProveedor` checklist — seeded with reasonable placeholders, to be corrected via Administración once ISTHO confirms exact figures.
- Implementation of `crmClient.js` and the CRM-side integration endpoints (Task 13 only documents the contract).
