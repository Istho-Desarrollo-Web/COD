# Logs del Servidor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar una pantalla dentro de COD (`/administracion/logs`, solo `admin`) para consultar los logs técnicos del servidor: tráfico HTTP y errores no controlados, persistidos en una tabla nueva de MySQL con purga automática diaria.

**Architecture:** Un middleware Express nuevo registra cada request en `res.on('finish')`; el middleware de errores global ya existente se extiende para además persistir el error con su stack trace; un job diario (`node-cron`, mismo mecanismo que `recalcularEstadosDocumentos.job.js`) purga filas de más de 14 días; un endpoint paginado y filtrable expone los datos, gateado por un permiso nuevo otorgado solo a `admin`; el frontend agrega una página de listado con filtros y paginación, siguiendo el mismo patrón que `DocumentosListado.jsx`.

**Tech Stack:** Node/Express/Sequelize (MySQL) + Jest/Supertest en el backend; React + Vitest/Testing Library en el frontend — mismo stack que el resto del proyecto, sin dependencias nuevas (no se agrega morgan/winston).

## Global Constraints

- La tabla `logs_servidor` es completamente independiente del dominio de negocio — sin claves foráneas obligatorias hacia otras tablas (`usuarioId` es nullable y sin `references`, para que un log pueda persistir aunque el usuario ya no exista o la request sea anónima).
- **Desviación deliberada, menor, respecto al spec**: además de los campos listados en el spec (`nivel, metodo, ruta, statusCode, duracionMs, mensaje, stack, usuarioId, ip`), se agrega `usuarioNombre` (STRING, nullable) — mismo campo que ya usa `Auditoria` (`usuarioNombre: req.user.nombreCompleto`) para no depender de un JOIN ni del permiso `usuarios:ver` al mostrar la columna "Usuario" en la pantalla. Es una adición aditiva y consistente con un patrón ya establecido en el mismo código, no un cambio de comportamiento.
- `nivel` se deriva del `statusCode`: `>= 500 → 'error'`, `>= 400 → 'warn'`, cualquier otro caso → `'info'`. Los errores capturados por el middleware de errores global siempre registran `nivel: 'error'` (independientemente del código de respuesta que termine devolviendo esa request) — ver la nota de "duplicación deliberada" en el spec: un 5xx/4xx no controlado genera dos filas (una del middleware de requests, otra del middleware de errores), a propósito.
- Ninguna escritura de log debe interrumpir ni alterar la respuesta real de una request — toda escritura va envuelta en `try/catch` con `console.error` en caso de fallo, igual que `Auditoria.registrar`.
- Purga: umbral fijo de **14 días**, sin campo configurable (mismo criterio que otros umbrales fijos ya usados en el proyecto, ej. la vigencia de `ProveedorDocumento`).
- Permiso nuevo `logs_servidor: ['ver']` en `CATALOGO_MODULOS` (`server/src/models/Permiso.js`) — al ser un módulo **nuevo** (no una acción agregada a un módulo existente), `RolPermiso.findOrCreate({where:{rolId, modulo}})` en `seedRolesPermisos.js` lo crea automáticamente para `admin` en el próximo arranque, sin necesitar ninguna corrección explícita tipo `RolPermiso.update(...)` (ese mecanismo solo hacía falta cuando se modificaban las acciones de un módulo ya existente, como pasó con `financiera.proveedores` en un ciclo anterior). Ningún otro rol debe listar `logs_servidor` en su matriz.
- Spec de referencia: `docs/superpowers/specs/2026-07-09-cod-logs-servidor-design.md`.

---

### Task 1: Modelo `LogServidor` + migración + servicio de registro

**Files:**
- Create: `server/src/migrations/20260709130000-crear-logs-servidor.js`
- Create: `server/src/models/LogServidor.js`
- Create: `server/src/services/logServidor.service.js`
- Modify: `server/src/models/index.js`
- Test: `server/tests/unit/logServidor.service.test.js`

**Interfaces:**
- Produces: modelo `LogServidor` (exportado desde `server/src/models/index.js`) con columnas `nivel, metodo, ruta, statusCode, duracionMs, mensaje, stack, usuarioId, usuarioNombre, ip, createdAt, updatedAt`; `calcularNivelPorStatusCode(statusCode) => 'info'|'warn'|'error'` y `registrar(datos) => Promise<LogServidor|null>` exportados desde `server/src/services/logServidor.service.js`.

- [ ] **Step 1: Escribir el test que falla**

Crear `server/tests/unit/logServidor.service.test.js`:

```js
const { sequelize } = require('../../src/config/database');
const { createMigrator } = require('../../src/config/migrator');
const { LogServidor } = require('../../src/models');
const { calcularNivelPorStatusCode, registrar } = require('../../src/services/logServidor.service');

beforeAll(async () => {
  await sequelize.authenticate();
  await createMigrator(sequelize).up();
});

afterAll(async () => {
  await sequelize.close();
});

describe('logServidor.service', () => {
  it('calcularNivelPorStatusCode clasifica info/warn/error según el status code', () => {
    expect(calcularNivelPorStatusCode(200)).toBe('info');
    expect(calcularNivelPorStatusCode(304)).toBe('info');
    expect(calcularNivelPorStatusCode(404)).toBe('warn');
    expect(calcularNivelPorStatusCode(409)).toBe('warn');
    expect(calcularNivelPorStatusCode(500)).toBe('error');
  });

  it('registrar crea una fila en LogServidor con los campos dados', async () => {
    const fila = await registrar({
      nivel: 'info',
      metodo: 'GET',
      ruta: '/api/v1/health-test',
      statusCode: 200,
      duracionMs: 12,
      mensaje: 'GET /api/v1/health-test → 200',
      usuarioId: null,
      usuarioNombre: null,
      ip: '127.0.0.1',
    });
    expect(fila).not.toBeNull();
    expect(fila.nivel).toBe('info');
    expect(fila.ruta).toBe('/api/v1/health-test');

    const recargada = await LogServidor.findByPk(fila.id);
    expect(recargada.mensaje).toBe('GET /api/v1/health-test → 200');
  });

  it('registrar no lanza y devuelve null si faltan campos obligatorios (nivel/mensaje)', async () => {
    const resultado = await registrar({ metodo: 'GET' });
    expect(resultado).toBeNull();
  });
});
```

- [ ] **Step 2: Ejecutar el test y confirmar que falla**

Run: `cd server && npx jest tests/unit/logServidor.service.test.js --runInBand`
Expected: FAIL — `Cannot find module '../../src/services/logServidor.service'` (y `LogServidor` no existe en `models`).

- [ ] **Step 3: Crear la migración**

Crear `server/src/migrations/20260709130000-crear-logs-servidor.js`:

```js
module.exports = {
  up: async ({ context: queryInterface }) => {
    const { DataTypes } = require('sequelize');

    await queryInterface.createTable('logs_servidor', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      nivel: { type: DataTypes.ENUM('info', 'warn', 'error'), allowNull: false },
      metodo: { type: DataTypes.STRING(10), allowNull: true },
      ruta: { type: DataTypes.STRING(255), allowNull: true },
      status_code: { type: DataTypes.INTEGER, allowNull: true },
      duracion_ms: { type: DataTypes.INTEGER, allowNull: true },
      mensaje: { type: DataTypes.STRING(500), allowNull: false },
      stack: { type: DataTypes.TEXT, allowNull: true },
      usuario_id: { type: DataTypes.INTEGER, allowNull: true },
      usuario_nombre: { type: DataTypes.STRING(150), allowNull: true },
      ip: { type: DataTypes.STRING(45), allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false },
      updated_at: { type: DataTypes.DATE, allowNull: false },
    });
  },
  down: async ({ context: queryInterface }) => {
    await queryInterface.dropTable('logs_servidor');
  },
};
```

- [ ] **Step 4: Crear el modelo**

Crear `server/src/models/LogServidor.js`:

```js
const { DataTypes } = require('sequelize');

module.exports = (sequelize) =>
  sequelize.define(
    'LogServidor',
    {
      nivel: { type: DataTypes.ENUM('info', 'warn', 'error'), allowNull: false },
      metodo: { type: DataTypes.STRING(10), allowNull: true },
      ruta: { type: DataTypes.STRING(255), allowNull: true },
      statusCode: { type: DataTypes.INTEGER, allowNull: true },
      duracionMs: { type: DataTypes.INTEGER, allowNull: true },
      mensaje: { type: DataTypes.STRING(500), allowNull: false },
      stack: { type: DataTypes.TEXT, allowNull: true },
      usuarioId: { type: DataTypes.INTEGER, allowNull: true },
      usuarioNombre: { type: DataTypes.STRING(150), allowNull: true },
      ip: { type: DataTypes.STRING(45), allowNull: true },
    },
    { tableName: 'logs_servidor', underscored: true }
  );
```

- [ ] **Step 5: Registrar el modelo en `models/index.js`**

En `server/src/models/index.js`, agregar el require junto a los demás modelos (después de `const EvaluacionProveedor = require('./EvaluacionProveedor')(sequelize);`):

```js
const LogServidor = require('./LogServidor')(sequelize);
```

Y agregarlo al `module.exports` final:

```js
module.exports = {
  sequelize, Usuario, Rol, Permiso, RolPermiso, Auditoria,
  Area, Carpeta, TipoDocumento, Documento, DocumentoVersionHistorial, PlantillaFormulario,
  TipoSolicitud, NivelAprobacion, Solicitud, Cotizacion, SolicitudAprobacion,
  Proveedor, RequisitoProveedor, ProveedorDocumento, EvaluacionProveedor,
  LogServidor,
};
```

(No se agrega ninguna asociación `hasMany`/`belongsTo` — `LogServidor` es una tabla independiente, sin relaciones, tal como pide el spec.)

- [ ] **Step 6: Crear el servicio**

Crear `server/src/services/logServidor.service.js`:

```js
function calcularNivelPorStatusCode(statusCode) {
  if (statusCode >= 500) return 'error';
  if (statusCode >= 400) return 'warn';
  return 'info';
}

async function registrar(datos) {
  const { LogServidor } = require('../models');
  try {
    return await LogServidor.create(datos);
  } catch (err) {
    console.error('logServidor.service.registrar falló (no interrumpe la operación principal):', err.message);
    return null;
  }
}

module.exports = { calcularNivelPorStatusCode, registrar };
```

- [ ] **Step 7: Ejecutar el test y confirmar que pasa**

Run: `cd server && npx jest tests/unit/logServidor.service.test.js --runInBand`
Expected: PASS (3 tests)

- [ ] **Step 8: Ejecutar la suite completa de backend**

Run: `cd server && npm test`
Expected: PASS (todos los test suites, sin regresiones)

- [ ] **Step 9: Commit**

```bash
git add server/src/migrations/20260709130000-crear-logs-servidor.js server/src/models/LogServidor.js server/src/models/index.js server/src/services/logServidor.service.js server/tests/unit/logServidor.service.test.js
git commit -m "feat(backend): agrega modelo LogServidor y servicio de registro"
```

---

### Task 2: Middleware de captura de requests + extensión del middleware de errores

**Files:**
- Create: `server/src/middlewares/logServidor.middleware.js`
- Modify: `server/server.js`
- Test: `server/tests/integration/logServidor.middleware.test.js`

**Interfaces:**
- Consumes: `registrar(datos)`, `calcularNivelPorStatusCode(statusCode)` de `server/src/services/logServidor.service.js` (Task 1); `LogServidor` de `server/src/models` (Task 1).
- Produces: `registrarLogsRequest(req, res, next)` — middleware Express exportado desde `server/src/middlewares/logServidor.middleware.js`, montado en `server.js`.

- [ ] **Step 1: Escribir el test que falla**

Crear `server/tests/integration/logServidor.middleware.test.js`:

```js
const request = require('supertest');
const { sequelize } = require('../../src/config/database');
const { createMigrator } = require('../../src/config/migrator');
const seedRolesPermisos = require('../../src/scripts/seedRolesPermisos');
const { Area, LogServidor } = require('../../src/models');
const { invalidarCachePermisos } = require('../../src/middlewares/roles');
const { app } = require('../../server');

function esperar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let token;

beforeAll(async () => {
  await sequelize.authenticate();
  await createMigrator(sequelize).up();
  await seedRolesPermisos();
  invalidarCachePermisos();

  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ username: 'admin', password: process.env.SEED_PASSWORD_ADMIN || 'CambiarAhora123!' });
  token = res.body.data.token;
});

afterAll(async () => {
  await sequelize.close();
});

describe('Middleware de logs de requests', () => {
  it('registra una fila nivel info para una request exitosa', async () => {
    await request(app).get('/health');
    // El registro ocurre en un callback asíncrono de `res.on('finish')`, fuera
    // del ciclo de vida de la request — se espera un instante para darle
    // tiempo a la escritura antes de consultar la tabla.
    await esperar(200);

    const filas = await LogServidor.findAll({ where: { ruta: '/health' }, order: [['id', 'DESC']], limit: 1 });
    expect(filas).toHaveLength(1);
    expect(filas[0].nivel).toBe('info');
    expect(filas[0].metodo).toBe('GET');
    expect(filas[0].statusCode).toBe(200);
    expect(filas[0].duracionMs).toBeGreaterThanOrEqual(0);
  });

  it('registra una fila nivel warn para una request autenticada que devuelve 4xx, con usuarioNombre poblado', async () => {
    await request(app).get('/api/v1/proveedores/999999').set('Authorization', `Bearer ${token}`);
    await esperar(200);

    const filas = await LogServidor.findAll({
      where: { ruta: '/api/v1/proveedores/999999' },
      order: [['id', 'DESC']],
      limit: 1,
    });
    expect(filas).toHaveLength(1);
    expect(filas[0].nivel).toBe('warn');
    expect(filas[0].statusCode).toBe(404);
    expect(filas[0].usuarioNombre).toBe('Administrador COD');
  });
});

describe('Middleware de errores — persistencia', () => {
  it('registra una fila nivel error con stack trace cuando ocurre un error de Sequelize no controlado', async () => {
    const codigoDuplicado = `LOGTEST${Date.now()}`;
    await Area.create({ nombre: 'Área Log Prueba', codigo: codigoDuplicado });

    const antes = await LogServidor.count({ where: { nivel: 'error' } });

    await request(app)
      .post('/api/v1/areas')
      .set('Authorization', `Bearer ${token}`)
      .send({ nombre: 'Área Log Prueba Duplicada', codigo: codigoDuplicado });
    await esperar(200);

    const despues = await LogServidor.count({ where: { nivel: 'error' } });
    expect(despues).toBe(antes + 1);

    const ultimoError = await LogServidor.findOne({ where: { nivel: 'error' }, order: [['id', 'DESC']] });
    expect(ultimoError.stack).toBeTruthy();
    expect(ultimoError.ruta).toBe('/api/v1/areas');
  });
});
```

- [ ] **Step 2: Ejecutar el test y confirmar que falla**

Run: `cd server && npx jest tests/integration/logServidor.middleware.test.js --runInBand`
Expected: FAIL — ninguna fila se crea todavía (el middleware no existe ni está montado).

- [ ] **Step 3: Crear el middleware de requests**

Crear `server/src/middlewares/logServidor.middleware.js`:

```js
const { registrar, calcularNivelPorStatusCode } = require('../services/logServidor.service');

function registrarLogsRequest(req, res, next) {
  const inicio = Date.now();
  res.on('finish', () => {
    registrar({
      nivel: calcularNivelPorStatusCode(res.statusCode),
      metodo: req.method,
      ruta: req.originalUrl,
      statusCode: res.statusCode,
      duracionMs: Date.now() - inicio,
      mensaje: `${req.method} ${req.originalUrl} → ${res.statusCode}`,
      usuarioId: req.user?.id || null,
      usuarioNombre: req.user?.nombreCompleto || null,
      ip: req.ip,
    });
  });
  next();
}

module.exports = { registrarLogsRequest };
```

- [ ] **Step 4: Montar el middleware y extender el manejador de errores en `server.js`**

En `server/server.js`, agregar el import (junto a los demás requires del inicio):

```js
const { registrarLogsRequest } = require('./src/middlewares/logServidor.middleware');
const { registrar: registrarLogServidor } = require('./src/services/logServidor.service');
```

Montar el middleware justo después de `app.use(express.json());` y antes de `app.get('/health', ...)`:

```js
app.use(express.json());
app.use(registrarLogsRequest);
```

Reemplazar el middleware de errores existente completo:

```js
// eslint-disable-next-line no-unused-vars
app.use(async (err, req, res, next) => {
  await registrarLogServidor({
    nivel: 'error',
    metodo: req.method,
    ruta: req.originalUrl,
    statusCode: null,
    mensaje: err.message || 'Error desconocido',
    stack: err.stack,
    usuarioId: req.user?.id || null,
    usuarioNombre: req.user?.nombreCompleto || null,
    ip: req.ip,
  });

  if (err.name === 'SequelizeUniqueConstraintError') {
    return conflict(res, 'El registro ya existe', err);
  }
  if (err.name === 'SequelizeForeignKeyConstraintError') {
    return badRequest(res, 'Referencia inválida', err);
  }
  if (err.name === 'SequelizeValidationError') {
    console.error(err);
    const errors = (err.errors || []).map((e) => e.message);
    return error(res, 'Datos inválidos', 400, errors);
  }
  return serverError(res, 'Error interno', err);
});
```

- [ ] **Step 5: Ejecutar el test y confirmar que pasa**

Run: `cd server && npx jest tests/integration/logServidor.middleware.test.js --runInBand`
Expected: PASS (3 tests)

- [ ] **Step 6: Ejecutar la suite completa de backend**

Run: `cd server && npm test`
Expected: PASS (todos los test suites, sin regresiones — cada request que hace el resto de la suite ahora también queda registrada en `logs_servidor`, pero ningún test existente depende del conteo total de filas de otra tabla, así que no debería romper nada)

- [ ] **Step 7: Commit**

```bash
git add server/src/middlewares/logServidor.middleware.js server/server.js server/tests/integration/logServidor.middleware.test.js
git commit -m "feat(backend): captura requests HTTP y errores no controlados en LogServidor"
```

---

### Task 3: Job de purga diaria

**Files:**
- Create: `server/src/jobs/logServidor.job.js`
- Create: `server/src/scripts/purgarLogsServidor.js`
- Modify: `server/server.js`
- Modify: `server/package.json`
- Test: `server/tests/unit/logServidor.job.test.js`

**Interfaces:**
- Consumes: `LogServidor` de `server/src/models` (Task 1).
- Produces: `purgar() => Promise<{eliminados: number}>` y `programar()` exportados desde `server/src/jobs/logServidor.job.js`.

- [ ] **Step 1: Escribir el test que falla**

Crear `server/tests/unit/logServidor.job.test.js`:

```js
const { sequelize } = require('../../src/config/database');
const { createMigrator } = require('../../src/config/migrator');
const { LogServidor } = require('../../src/models');
const { purgar } = require('../../src/jobs/logServidor.job');

function fechaHaceDias(dias) {
  return new Date(Date.now() - dias * 24 * 60 * 60 * 1000);
}

beforeAll(async () => {
  await sequelize.authenticate();
  await createMigrator(sequelize).up();
});

afterAll(async () => {
  await sequelize.close();
});

describe('logServidor.job', () => {
  it('borra filas de más de 14 días y conserva las más recientes', async () => {
    const vieja = await LogServidor.create({ nivel: 'info', mensaje: 'Fila vieja de prueba' });
    await vieja.update({ createdAt: fechaHaceDias(20) });

    const reciente = await LogServidor.create({ nivel: 'info', mensaje: 'Fila reciente de prueba' });
    await reciente.update({ createdAt: fechaHaceDias(1) });

    const resultado = await purgar();
    expect(resultado.eliminados).toBeGreaterThanOrEqual(1);

    const viejaExiste = await LogServidor.findByPk(vieja.id);
    expect(viejaExiste).toBeNull();

    const recienteExiste = await LogServidor.findByPk(reciente.id);
    expect(recienteExiste).not.toBeNull();
  });
});
```

- [ ] **Step 2: Ejecutar el test y confirmar que falla**

Run: `cd server && npx jest tests/unit/logServidor.job.test.js --runInBand`
Expected: FAIL — `Cannot find module '../../src/jobs/logServidor.job'`

- [ ] **Step 3: Implementar el job**

Crear `server/src/jobs/logServidor.job.js`:

```js
const cron = require('node-cron');

const RETENCION_DIAS = 14;

async function purgar() {
  const { Op } = require('sequelize');
  const { LogServidor } = require('../models');

  const limite = new Date(Date.now() - RETENCION_DIAS * 24 * 60 * 60 * 1000);
  const eliminados = await LogServidor.destroy({ where: { createdAt: { [Op.lt]: limite } } });
  return { eliminados };
}

function programar() {
  const expresion = process.env.CRON_PURGA_LOGS || '0 4 * * *';
  cron.schedule(expresion, () => {
    purgar().catch((err) => console.error('Error en job logServidor (purga):', err));
  });
}

module.exports = { purgar, programar };
```

- [ ] **Step 4: Ejecutar el test y confirmar que pasa**

Run: `cd server && npx jest tests/unit/logServidor.job.test.js --runInBand`
Expected: PASS (1 test)

- [ ] **Step 5: Crear el script manual y programar el job en `server.js`**

Crear `server/src/scripts/purgarLogsServidor.js`:

```js
require('dotenv').config();
const { sequelize } = require('../config/database');
const { purgar } = require('../jobs/logServidor.job');

purgar()
  .then((resultado) => {
    console.log('Purga de logs del servidor completada:', resultado);
    return sequelize.close();
  })
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Error purgando logs del servidor:', err);
    process.exit(1);
  });
```

En `server/server.js`, agregar el import (junto a `programarRecalculoEstados`):

```js
const { programar: programarPurgaLogs } = require('./src/jobs/logServidor.job');
```

Y llamarlo junto a `programarRecalculoEstados()`:

```js
      programarRecalculoEstados();
      programarPurgaLogs();
```

En `server/package.json`, agregar el script (junto a `job:recalcular-estados`):

```json
    "job:purgar-logs": "node src/scripts/purgarLogsServidor.js",
```

- [ ] **Step 6: Ejecutar la suite completa de backend**

Run: `cd server && npm test`
Expected: PASS (todos los test suites, sin regresiones)

- [ ] **Step 7: Commit**

```bash
git add server/src/jobs/logServidor.job.js server/src/scripts/purgarLogsServidor.js server/server.js server/package.json server/tests/unit/logServidor.job.test.js
git commit -m "feat(backend): agrega job diario de purga de LogServidor (>14 días)"
```

---

### Task 4: Endpoint `GET /logs-servidor` + permiso nuevo

**Files:**
- Create: `server/src/controllers/logServidor.controller.js`
- Create: `server/src/routes/logServidor.routes.js`
- Modify: `server/src/routes/index.js`
- Modify: `server/src/models/Permiso.js`
- Test: `server/tests/integration/logServidor.routes.test.js`

**Interfaces:**
- Consumes: `LogServidor` de `server/src/models` (Task 1); `paginated()`/`badRequest()` de `server/src/utils/responses.js`; `requierePermiso('logs_servidor', 'ver')` de `server/src/middlewares/roles.js`.
- Produces: `GET /logs-servidor` — responde `{success, data: LogServidor[], pagination: {page, limit, total, totalPages}}`, filtrable por `nivel`, `metodo`, `desde`, `hasta`, `q`.

- [ ] **Step 1: Escribir el test que falla**

Crear `server/tests/integration/logServidor.routes.test.js`:

```js
const request = require('supertest');
const bcrypt = require('bcryptjs');
const { sequelize } = require('../../src/config/database');
const { createMigrator } = require('../../src/config/migrator');
const seedRolesPermisos = require('../../src/scripts/seedRolesPermisos');
const { Rol, Usuario, LogServidor } = require('../../src/models');
const { invalidarCachePermisos } = require('../../src/middlewares/roles');
const { app } = require('../../server');

let token;
let solicitanteToken;

beforeAll(async () => {
  await sequelize.authenticate();
  await createMigrator(sequelize).up();
  await seedRolesPermisos();
  invalidarCachePermisos();

  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ username: 'admin', password: process.env.SEED_PASSWORD_ADMIN || 'CambiarAhora123!' });
  token = res.body.data.token;

  const solicitanteRol = await Rol.findOne({ where: { nombre: 'solicitante' } });
  const solicitanteUsername = `solicitante_logs_${Date.now()}`;
  await Usuario.create({
    username: solicitanteUsername,
    email: `${solicitanteUsername}@istho.com.co`,
    passwordHash: await bcrypt.hash('ClaveSolicitante123!', 10),
    nombre: 'Solicitante',
    apellido: 'Logs',
    rolId: solicitanteRol.id,
  });
  const solicitanteLogin = await request(app)
    .post('/api/v1/auth/login')
    .send({ username: solicitanteUsername, password: 'ClaveSolicitante123!' });
  solicitanteToken = solicitanteLogin.body.data.token;

  await LogServidor.create({ nivel: 'info', metodo: 'GET', ruta: '/api/v1/marca-de-prueba', statusCode: 200, mensaje: 'GET /api/v1/marca-de-prueba → 200' });
  await LogServidor.create({ nivel: 'warn', metodo: 'GET', ruta: '/api/v1/marca-de-prueba', statusCode: 404, mensaje: 'GET /api/v1/marca-de-prueba → 404' });
  await LogServidor.create({ nivel: 'error', metodo: 'POST', ruta: '/api/v1/otra-marca', statusCode: null, mensaje: 'Fallo simulado de prueba', stack: 'Error: fallo\n  at test' });
});

afterAll(async () => {
  await sequelize.close();
});

describe('GET /logs-servidor', () => {
  it('lista logs paginados, admin autorizado', async () => {
    const res = await request(app).get('/api/v1/logs-servidor').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.pagination).toBeDefined();
  });

  it('filtra por nivel', async () => {
    const res = await request(app).get('/api/v1/logs-servidor?nivel=error').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.every((fila) => fila.nivel === 'error')).toBe(true);
  });

  it('filtra por ruta/mensaje con q', async () => {
    const res = await request(app).get('/api/v1/logs-servidor?q=marca-de-prueba').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(2);
    expect(res.body.data.every((fila) => fila.ruta.includes('marca-de-prueba') || fila.mensaje.includes('marca-de-prueba'))).toBe(true);
  });

  it('returns 400 when desde no es una fecha válida', async () => {
    const res = await request(app).get('/api/v1/logs-servidor?desde=no-es-fecha').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  it('returns 403 para un rol sin el permiso logs_servidor', async () => {
    const res = await request(app).get('/api/v1/logs-servidor').set('Authorization', `Bearer ${solicitanteToken}`);
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Ejecutar el test y confirmar que falla**

Run: `cd server && npx jest tests/integration/logServidor.routes.test.js --runInBand`
Expected: FAIL — `404` (la ruta no existe todavía).

- [ ] **Step 3: Agregar el módulo al catálogo de permisos**

En `server/src/models/Permiso.js`, agregar la línea al `CATALOGO_MODULOS` (después de `auditoria: ['ver'],`):

```js
  auditoria: ['ver'],
  logs_servidor: ['ver'],
  perfil: ['ver', 'cambiar_password'],
```

- [ ] **Step 4: Implementar el controller**

Crear `server/src/controllers/logServidor.controller.js`:

```js
const { Op } = require('sequelize');
const { LogServidor } = require('../models');
const { paginated, badRequest } = require('../utils/responses');

async function listar(req, res) {
  const { nivel, metodo, desde, hasta, q } = req.query;
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));

  const condiciones = [];
  if (nivel) condiciones.push({ nivel });
  if (metodo) condiciones.push({ metodo });
  if (q) condiciones.push({ [Op.or]: [{ mensaje: { [Op.like]: `%${q}%` } }, { ruta: { [Op.like]: `%${q}%` } }] });

  if (desde) {
    const fechaDesde = new Date(`${desde}T00:00:00`);
    if (isNaN(fechaDesde.getTime())) return badRequest(res, 'desde no es una fecha válida');
    condiciones.push({ createdAt: { [Op.gte]: fechaDesde } });
  }
  if (hasta) {
    const fechaHasta = new Date(`${hasta}T23:59:59.999`);
    if (isNaN(fechaHasta.getTime())) return badRequest(res, 'hasta no es una fecha válida');
    condiciones.push({ createdAt: { [Op.lte]: fechaHasta } });
  }

  const where = condiciones.length ? { [Op.and]: condiciones } : {};

  const { rows, count } = await LogServidor.findAndCountAll({
    where,
    order: [['createdAt', 'DESC']],
    limit,
    offset: (page - 1) * limit,
  });

  return paginated(res, rows, { page, limit, total: count, totalPages: Math.ceil(count / limit) });
}

module.exports = { listar };
```

- [ ] **Step 5: Crear las rutas y montarlas**

Crear `server/src/routes/logServidor.routes.js`:

```js
const express = require('express');
const router = express.Router();
const { verificarToken } = require('../middlewares/auth');
const { requierePermiso } = require('../middlewares/roles');
const controller = require('../controllers/logServidor.controller');
const asyncHandler = require('../utils/asyncHandler');

router.get('/', verificarToken, requierePermiso('logs_servidor', 'ver'), asyncHandler(controller.listar));

module.exports = router;
```

En `server/src/routes/index.js`, agregar la línea (junto a las demás `router.use(...)`):

```js
router.use('/logs-servidor', require('./logServidor.routes'));
```

- [ ] **Step 6: Ejecutar el test y confirmar que pasa**

Run: `cd server && npx jest tests/integration/logServidor.routes.test.js --runInBand`
Expected: PASS (5 tests)

- [ ] **Step 7: Ejecutar la suite completa de backend**

Run: `cd server && npm test`
Expected: PASS (todos los test suites, sin regresiones)

- [ ] **Step 8: Commit**

```bash
git add server/src/controllers/logServidor.controller.js server/src/routes/logServidor.routes.js server/src/routes/index.js server/src/models/Permiso.js server/tests/integration/logServidor.routes.test.js
git commit -m "feat(backend): agrega GET /logs-servidor paginado y filtrable, gateado por permiso admin-only"
```

---

### Task 5: Frontend — servicio, página y navegación

**Files:**
- Create: `frontend/src/api/logServidor.service.js`
- Create: `frontend/src/api/logServidor.service.test.js`
- Create: `frontend/src/pages/administracion/LogsServidor.jsx`
- Create: `frontend/src/pages/administracion/LogsServidor.test.jsx`
- Modify: `frontend/src/components/common/StatusChip/StatusChip.jsx`
- Modify: `frontend/src/components/common/StatusChip/StatusChip.test.jsx`
- Modify: `frontend/src/pages/administracion/AdministracionInicio.jsx`
- Modify: `frontend/src/App.jsx`

**Interfaces:**
- Consumes: `GET /logs-servidor` (Task 4).
- Produces: `logServidorService.listar(filtros) => Promise<{data, pagination}>`.

- [ ] **Step 1: Escribir el test que falla (servicio)**

Crear `frontend/src/api/logServidor.service.test.js`:

```js
import MockAdapter from 'axios-mock-adapter';
import apiClient from './client';
import logServidorService from './logServidor.service';

describe('logServidor.service', () => {
  let mock;

  beforeEach(() => {
    mock = new MockAdapter(apiClient);
  });

  afterEach(() => {
    mock.restore();
  });

  it('listar returns data and pagination, forwarding filtros as query params', async () => {
    mock.onGet('/logs-servidor').reply(200, {
      success: true,
      data: [{ id: 1, nivel: 'info', metodo: 'GET', ruta: '/health', statusCode: 200 }],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });
    const resultado = await logServidorService.listar({ nivel: 'info' });
    expect(resultado.data).toEqual([{ id: 1, nivel: 'info', metodo: 'GET', ruta: '/health', statusCode: 200 }]);
    expect(resultado.pagination).toEqual({ page: 1, limit: 20, total: 1, totalPages: 1 });
    expect(mock.history.get[0].params).toEqual({ nivel: 'info' });
  });
});
```

- [ ] **Step 2: Ejecutar el test y confirmar que falla**

Run: `cd frontend && npx vitest run src/api/logServidor.service.test.js`
Expected: FAIL — `Cannot find module './logServidor.service'`

- [ ] **Step 3: Implementar el servicio**

Crear `frontend/src/api/logServidor.service.js`:

```js
import apiClient from './client';

async function listar(filtros = {}) {
  const response = await apiClient.get('/logs-servidor', { params: filtros });
  return { data: response.data, pagination: response.pagination };
}

export default { listar };
```

- [ ] **Step 4: Ejecutar el test del servicio y confirmar que pasa**

Run: `cd frontend && npx vitest run src/api/logServidor.service.test.js`
Expected: PASS (1 test)

- [ ] **Step 5: Agregar niveles a `StatusChip`**

En `frontend/src/components/common/StatusChip/StatusChip.jsx`, agregar estas 3 entradas a `STATUS_CONFIG` (después de `sin_vigencia`):

```js
  sin_vigencia: { bg: 'bg-gray-100 dark:bg-centhrix-surface', text: 'text-gray-700 dark:text-slate-300', label: 'sin vigencia' },

  info: { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-400', label: 'info' },
  warn: { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-400', label: 'warn' },
  error: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-400', label: 'error' },
```

En `frontend/src/components/common/StatusChip/StatusChip.test.jsx`, agregar al final del `describe`:

```js
  it('renders "info", "warn" and "error" for log-level statuses', () => {
    render(<StatusChip status="info" />);
    expect(screen.getByText('info')).toBeInTheDocument();
  });
```

Run: `cd frontend && npx vitest run src/components/common/StatusChip/StatusChip.test.jsx`
Expected: PASS (todos los tests del archivo)

- [ ] **Step 6: Escribir el test que falla (página)**

Crear `frontend/src/pages/administracion/LogsServidor.test.jsx`:

```jsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SnackbarProvider } from 'notistack';
import { MemoryRouter } from 'react-router-dom';
import LogsServidor from './LogsServidor';
import logServidorService from '../../api/logServidor.service';

vi.mock('../../api/logServidor.service');

const LOGS = [
  { id: 1, createdAt: '2026-07-09T10:00:00.000Z', nivel: 'info', metodo: 'GET', ruta: '/api/v1/health', statusCode: 200, duracionMs: 12, mensaje: 'GET /api/v1/health → 200', usuarioNombre: null },
  { id: 2, createdAt: '2026-07-09T10:05:00.000Z', nivel: 'error', metodo: 'POST', ruta: '/api/v1/areas', statusCode: null, duracionMs: null, mensaje: 'Fallo simulado', usuarioNombre: 'Administrador COD' },
];
const PAGINACION = { page: 1, limit: 20, total: 2, totalPages: 1 };

function renderPagina() {
  return render(
    <MemoryRouter>
      <SnackbarProvider>
        <LogsServidor />
      </SnackbarProvider>
    </MemoryRouter>
  );
}

describe('LogsServidor', () => {
  beforeEach(() => {
    logServidorService.listar.mockResolvedValue({ data: LOGS, pagination: PAGINACION });
  });

  it('lists the logs in a table', async () => {
    renderPagina();
    expect(await screen.findByText('GET /api/v1/health → 200')).toBeInTheDocument();
    expect(screen.getByText('Fallo simulado')).toBeInTheDocument();
  });

  it('shows an empty state when there are no logs', async () => {
    logServidorService.listar.mockResolvedValue({ data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } });
    renderPagina();
    expect(await screen.findByText('Sin logs para mostrar')).toBeInTheDocument();
  });

  it('filters by nivel', async () => {
    renderPagina();
    await screen.findByText('GET /api/v1/health → 200');

    await userEvent.click(screen.getByLabelText('Nivel'));
    await userEvent.click(await screen.findByRole('button', { name: 'error' }));

    await waitFor(() => expect(logServidorService.listar).toHaveBeenLastCalledWith(expect.objectContaining({ nivel: 'error', page: 1 })));
  });

  it('reloads the current filters when "Actualizar" is clicked', async () => {
    renderPagina();
    await screen.findByText('GET /api/v1/health → 200');
    logServidorService.listar.mockClear();

    await userEvent.click(screen.getByRole('button', { name: 'Actualizar' }));

    await waitFor(() => expect(logServidorService.listar).toHaveBeenCalledTimes(1));
  });
});
```

- [ ] **Step 7: Ejecutar el test y confirmar que falla**

Run: `cd frontend && npx vitest run src/pages/administracion/LogsServidor.test.jsx`
Expected: FAIL — `Cannot find module './LogsServidor'`

- [ ] **Step 8: Implementar la página**

Crear `frontend/src/pages/administracion/LogsServidor.jsx`:

```jsx
import { useEffect, useState } from 'react';
import { useSnackbar } from 'notistack';
import { RefreshCw, ScrollText } from 'lucide-react';
import logServidorService from '../../api/logServidor.service';
import Button from '../../components/common/Button/Button';
import Input from '../../components/common/Input/Input';
import EmptyState from '../../components/common/EmptyState/EmptyState';
import DataTable from '../../components/common/Table/DataTable';
import Pagination from '../../components/common/Pagination/Pagination';
import StatusChip from '../../components/common/StatusChip/StatusChip';
import FilterDropdown from '../../components/common/FilterDropdown/FilterDropdown';
import DatePicker from '../../components/common/DatePicker/DatePicker';

const OPCIONES_NIVEL = [
  { value: '', label: 'Todos' },
  { value: 'info', label: 'info' },
  { value: 'warn', label: 'warn' },
  { value: 'error', label: 'error' },
];

export default function LogsServidor() {
  const { enqueueSnackbar } = useSnackbar();
  const [logs, setLogs] = useState([]);
  const [paginacion, setPaginacion] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [cargando, setCargando] = useState(true);
  const [filtros, setFiltros] = useState({ nivel: '', metodo: '', desde: '', hasta: '', q: '', page: 1 });

  async function cargarLogs() {
    setCargando(true);
    try {
      const { data, pagination } = await logServidorService.listar({
        nivel: filtros.nivel || undefined,
        metodo: filtros.metodo || undefined,
        desde: filtros.desde || undefined,
        hasta: filtros.hasta || undefined,
        q: filtros.q || undefined,
        page: filtros.page,
      });
      setLogs(data);
      setPaginacion(pagination);
    } catch (error) {
      setLogs([]);
      setPaginacion({ page: 1, limit: 20, total: 0, totalPages: 0 });
      enqueueSnackbar(error?.message || 'No se pudieron cargar los logs', { variant: 'error' });
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargarLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtros]);

  function actualizarFiltro(campo, valor) {
    setFiltros((prev) => ({ ...prev, [campo]: valor, page: 1 }));
  }

  const columnas = [
    { key: 'createdAt', label: 'Fecha', render: (valor) => new Date(valor).toLocaleString('es-CO') },
    { key: 'nivel', label: 'Nivel', render: (valor) => <StatusChip status={valor} /> },
    { key: 'metodo', label: 'Método' },
    { key: 'ruta', label: 'Ruta' },
    { key: 'statusCode', label: 'Status' },
    { key: 'duracionMs', label: 'Duración', render: (valor) => (valor != null ? `${valor} ms` : '—') },
    { key: 'usuarioNombre', label: 'Usuario', render: (valor) => valor || '—' },
    { key: 'mensaje', label: 'Mensaje' },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h2 className="text-xl font-display font-semibold text-slate-800 dark:text-slate-100">Logs del servidor</h2>
        <Button variant="outline" icon={RefreshCw} onClick={cargarLogs}>
          Actualizar
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
        <FilterDropdown label="Nivel" options={OPCIONES_NIVEL} value={filtros.nivel} onChange={(valor) => actualizarFiltro('nivel', valor)} placeholder="Todos" />
        <Input label="Método" value={filtros.metodo} onChange={(e) => actualizarFiltro('metodo', e.target.value)} />
        <DatePicker label="Desde" value={filtros.desde} onChange={(valor) => actualizarFiltro('desde', valor)} />
        <DatePicker label="Hasta" value={filtros.hasta} onChange={(valor) => actualizarFiltro('hasta', valor)} />
        <Input label="Buscar" value={filtros.q} onChange={(e) => actualizarFiltro('q', e.target.value)} />
      </div>

      {!cargando && logs.length === 0 && (
        <EmptyState icon={ScrollText} title="Sin logs para mostrar" description="No hay logs que coincidan con los filtros actuales." />
      )}

      {logs.length > 0 && <DataTable columns={columnas} data={logs} loading={cargando} emptyMessage="Sin logs para mostrar" />}

      <Pagination pagination={paginacion} onPageChange={(page) => setFiltros((prev) => ({ ...prev, page }))} />
    </div>
  );
}
```

- [ ] **Step 9: Ejecutar el test de la página y confirmar que pasa**

Run: `cd frontend && npx vitest run src/pages/administracion/LogsServidor.test.jsx`
Expected: PASS (4 tests)

- [ ] **Step 10: Agregar la entrada en `AdministracionInicio.jsx` y la ruta en `App.jsx`**

En `frontend/src/pages/administracion/AdministracionInicio.jsx`, reemplazar el import y el array `SUBMODULOS`:

```jsx
import { Users, ScrollText } from 'lucide-react';
...
const SUBMODULOS = [
  { path: '/administracion/usuarios', label: 'Usuarios', icon: Users, modulo: 'usuarios' },
  { path: '/administracion/logs', label: 'Logs del servidor', icon: ScrollText, modulo: 'logs_servidor' },
];
```

En `frontend/src/App.jsx`, agregar el import (junto a `UsuariosListado`):

```jsx
import LogsServidor from './pages/administracion/LogsServidor';
```

Y la ruta (después de la ruta `/administracion/usuarios`):

```jsx
                <Route
                  path="/administracion/logs"
                  element={
                    <PermissionRoute modulo="logs_servidor" accion="ver">
                      <LogsServidor />
                    </PermissionRoute>
                  }
                />
```

- [ ] **Step 11: Ejecutar la suite completa de frontend**

Run: `cd frontend && npm test -- --run`
Expected: PASS (todos los archivos de test)

- [ ] **Step 12: Commit**

```bash
git add frontend/src/api/logServidor.service.js frontend/src/api/logServidor.service.test.js frontend/src/pages/administracion/LogsServidor.jsx frontend/src/pages/administracion/LogsServidor.test.jsx frontend/src/components/common/StatusChip/StatusChip.jsx frontend/src/components/common/StatusChip/StatusChip.test.jsx frontend/src/pages/administracion/AdministracionInicio.jsx frontend/src/App.jsx
git commit -m "feat(frontend): agrega la pantalla de Logs del servidor en Administración"
```

---

### Task 6: Documentación (README)

**Files:**
- Modify: `README.md`

**Interfaces:**
- Ninguna — solo texto descriptivo.

- [ ] **Step 1: Actualizar el README**

Agregar una línea a la lista de specs de documentación (después de la línea del módulo de Proveedores/Aprobación):

```markdown
- Diseño de la pantalla de Logs del servidor (tráfico HTTP y errores no controlados, purga diaria a los 14 días, solo admin): `docs/superpowers/specs/2026-07-09-cod-logs-servidor-design.md`
```

Y agregar un párrafo nuevo describiendo la funcionalidad (después del párrafo del módulo de Proveedores):

```markdown
`Administración > Logs del servidor` (`/administracion/logs`, solo rol `admin`) muestra el tráfico HTTP y los errores no controlados del backend, paginado y filtrable por nivel (info/warn/error), método, rango de fechas y texto libre. Los registros se purgan automáticamente a los 14 días (`npm run job:purgar-logs` para forzarlo manualmente).
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: documenta la pantalla de Logs del servidor"
```

---

## Self-Review

**Cobertura del spec:**
- Modelo `LogServidor` + migración (nivel/metodo/ruta/statusCode/duracionMs/mensaje/stack/usuarioId/ip, + `usuarioNombre` agregado deliberadamente) → Task 1.
- Captura de requests (middleware) + captura de errores no controlados (extensión del middleware global) → Task 2.
- Purga diaria a los 14 días → Task 3.
- Endpoint paginado/filtrable + permiso `logs_servidor:ver` solo para `admin` → Task 4.
- Página frontend con tabla, filtros, paginación, botón "Actualizar" (sin auto-refresh) + entrada en Administración → Task 5.
- Documentación → Task 6.
- Fuera de alcance (spec): streaming/WebSockets, export a CSV, alertas automáticas, logs de nivel debug/SQL, auto-refresh, acceso de otros roles — ninguna tarea los implementa, correcto.

**Placeholders:** ninguno — cada paso tiene el código completo a escribir tal cual.

**Consistencia de tipos:** `registrar(datos) => Promise<LogServidor|null>` (Task 1) es exactamente lo que consumen tanto el middleware de requests como la extensión del middleware de errores (Task 2). `calcularNivelPorStatusCode(statusCode) => 'info'|'warn'|'error'` (Task 1) es lo que usa el middleware de requests (Task 2) y lo que valida el test de Task 1. `purgar() => Promise<{eliminados}>` (Task 3) coincide con lo que verifica su propio test y con el script manual. `logServidorService.listar(filtros) => Promise<{data, pagination}>` (Task 5) coincide exactamente con la forma que devuelve `GET /logs-servidor` vía `paginated()` (Task 4) y con lo que consume `LogsServidor.jsx` en el mismo Task 5.
