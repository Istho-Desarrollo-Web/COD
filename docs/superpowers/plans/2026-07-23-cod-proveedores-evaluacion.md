# Evaluación de Proveedores Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar el ciclo de evaluación anual de proveedores: migración de la tabla, permiso nuevo, endpoints (crear/iniciar/completar/listar/listado transversal), job diario de recordatorio automático, y la UI correspondiente (pestaña en `ProveedorDetalle.jsx` + listado transversal).

**Architecture:** El modelo `EvaluacionProveedor` y su asociación con `Proveedor` ya existen desde el diseño inicial — este plan agrega la migración que falta, un controller nuevo (`evaluacionProveedor.controller.js`) montado como sub-recurso de `proveedor.routes.js`, un job `node-cron` (mismo patrón que `recalcularEstadosDocumentos.job.js`), y dos piezas de frontend (pestaña + listado transversal).

**Tech Stack:** Node/Express + Sequelize (MySQL) en `server/`; React (Vite) + React Hook Form + Vitest/Testing Library en `frontend/`; Jest + supertest para tests de integración backend; `node-cron` para el job diario.

## Global Constraints

- Una sola `EvaluacionProveedor` con `estado` en `['pendiente', 'en_proceso']` por proveedor a la vez — crear una nueva mientras existe una activa es `400`.
- Transiciones: `pendiente → en_proceso` (acción `iniciar`, fija `responsableUsuarioId`) → `completada` (acción `completar`, requiere `puntaje` 0-100 inclusive). `vencida` la fija únicamente el job diario (nunca una acción de usuario).
- Al completar: `Proveedor.fechaUltimaEvaluacion = hoy`, `Proveedor.fechaProximaEvaluacion = hoy + 1 año`.
- El job diario NO registra en `Auditoria` (mismo precedente que `recalcularEstadosDocumentos.job.js`) — solo las 3 acciones de usuario (`crear`, `iniciar`, `completar`) lo hacen, sobre `tabla: 'evaluaciones_proveedor'`.
- **Hallazgo de entorno importante:** la tabla `evaluaciones_proveedor` **ya existe** en la base de datos de test compartida de este proyecto (creada antes de que el proyecto adoptara migraciones para todo — no hay ninguna migración que la haya creado, confirmado contra `SequelizeMeta`), con columnas que coinciden exactamente con el modelo `EvaluacionProveedor.js` ya existente. La migración de este plan **debe ser idempotente** (verificar si la tabla ya existe antes de crearla) para no romper con un error de "tabla ya existe" al correr contra ese entorno — y seguir creando la tabla correctamente en cualquier entorno nuevo (dev/prod) que no la tenga.
- Nuevo permiso `proveedores:evaluar` en el seed (`gestor_compras`, `aprobador_area`, `aprobador_ejecutivo`) — `CATALOGO_MODULOS` no cambia, `evaluar` ya está ahí.
- Backend: rutas montadas en `proveedor.routes.js` (sin archivo `evaluacionProveedor.routes.js` separado — mismo patrón que `cotizacion`/`solicitudComentario` en el módulo de Solicitudes). **Orden crítico**: `GET /proveedores/evaluaciones` debe declararse antes de `GET /proveedores/:id`.
- Frontend: `describe`/`it` en inglés, `vi.mock(...)` para servicios (Vitest + Testing Library), mismo patrón de servicios que el resto de `frontend/src/api/*.service.js`. React Router v7 no requiere orden especial entre `/proveedores/evaluaciones` y `/proveedores/:id` (rankea rutas estáticas automáticamente).
- Spec de referencia: `docs/superpowers/specs/2026-07-23-cod-proveedores-evaluacion-design.md`.

---

### Task 1: Backend — Migración idempotente de `evaluaciones_proveedor`

**Files:**
- Create: `server/src/migrations/20260723140000-crear-evaluaciones-proveedor.js`
- Test: `server/tests/unit/crearEvaluacionesProveedor.migration.test.js`

**Interfaces:**
- Consumes: nada nuevo — el modelo `EvaluacionProveedor` y su asociación con `Proveedor` ya existen en `server/src/models/index.js`.
- Produces: la tabla `evaluaciones_proveedor` queda disponible (o confirmada) en cualquier entorno donde corra `createMigrator(sequelize).up()`. Las Tareas 2 y 3 dependen de que esta tabla exista.

- [ ] **Step 1: Escribir el test que falla**

Crear `server/tests/unit/crearEvaluacionesProveedor.migration.test.js`:

```js
const { sequelize } = require('../../src/config/database');
const { createMigrator } = require('../../src/config/migrator');
const migracion = require('../../src/migrations/20260723140000-crear-evaluaciones-proveedor');

beforeAll(async () => {
  await sequelize.authenticate();
  await createMigrator(sequelize).up();
});

afterAll(async () => {
  await sequelize.close();
});

describe('20260723140000-crear-evaluaciones-proveedor migration', () => {
  it('es idempotente: no falla si se ejecuta de nuevo contra una base donde la tabla ya existe', async () => {
    const queryInterface = sequelize.getQueryInterface();
    const tablas = await queryInterface.showAllTables();
    expect(tablas).toContain('evaluaciones_proveedor');

    await expect(migracion.up({ context: queryInterface })).resolves.not.toThrow();
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla (módulo inexistente)**

Run: `cd server && npx jest tests/unit/crearEvaluacionesProveedor.migration.test.js`
Expected: FAIL con `Cannot find module '../../src/migrations/20260723140000-crear-evaluaciones-proveedor'`.

- [ ] **Step 3: Crear la migración SIN el chequeo de idempotencia (para comprobar que el chequeo es realmente necesario)**

`server/src/migrations/20260723140000-crear-evaluaciones-proveedor.js`:

```js
module.exports = {
  up: async ({ context: queryInterface }) => {
    const { DataTypes } = require('sequelize');

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
  },
};
```

- [ ] **Step 4: Correr el test para verificar que falla (tabla ya existe)**

Run: `cd server && npx jest tests/unit/crearEvaluacionesProveedor.migration.test.js`
Expected: FAIL — esta vez con un error de Sequelize/MySQL del tipo `Table 'evaluaciones_proveedor' already exists` (`SequelizeDatabaseError`), lanzado por la llamada directa a `migracion.up(...)` dentro del test (la tabla ya fue creada por el `createMigrator(sequelize).up()` del `beforeAll`, vía la ejecución normal de Umzug). Esto confirma empíricamente que el chequeo de idempotencia del Step 5 es necesario, no opcional.

- [ ] **Step 5: Agregar el chequeo de idempotencia**

Reemplazar la función `up` en `server/src/migrations/20260723140000-crear-evaluaciones-proveedor.js` por:

```js
module.exports = {
  up: async ({ context: queryInterface }) => {
    const { DataTypes } = require('sequelize');

    const tablasExistentes = await queryInterface.showAllTables();
    if (tablasExistentes.includes('evaluaciones_proveedor')) {
      // La tabla ya existe en algunos entornos (creada antes de que este
      // proyecto adoptara migraciones para todo — ver Global Constraints
      // de este plan) — no recrearla evita un error de "tabla ya existe"
      // al correr esta migración ahí; en un entorno nuevo sí la crea.
      return;
    }

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
  },
};
```

- [ ] **Step 6: Correr el test para verificar que pasa**

Run: `cd server && npx jest tests/unit/crearEvaluacionesProveedor.migration.test.js`
Expected: PASS (1 test).

Correr también `server/tests/integration/proveedor.test.js` para confirmar que el test ya existente que crea una `EvaluacionProveedor` (líneas 43-58, "links Proveedor -> ProveedorDocumento -> RequisitoProveedor and -> EvaluacionProveedor") sigue pasando: `cd server && npx jest tests/integration/proveedor.test.js`
Expected: PASS (todos los tests del archivo).

- [ ] **Step 7: Commit**

```bash
git add server/src/migrations/20260723140000-crear-evaluaciones-proveedor.js server/tests/unit/crearEvaluacionesProveedor.migration.test.js
git commit -m "feat(proveedores): migracion idempotente de evaluaciones_proveedor"
```

---

### Task 2: Backend — Permiso `proveedores:evaluar` + `evaluacionProveedor.controller.js` + rutas

**Files:**
- Modify: `server/src/scripts/seedRolesPermisos.js`
- Create: `server/src/controllers/evaluacionProveedor.controller.js`
- Modify: `server/src/routes/proveedor.routes.js`
- Create: `server/tests/integration/evaluacionProveedor.routes.test.js`

**Interfaces:**
- Consumes: `Proveedor`/`EvaluacionProveedor`/`Auditoria` de `../models` (Task 1 y ya existentes); `success`/`created`/`notFound`/`badRequest` de `../utils/responses`.
- Produces: `GET /proveedores/evaluaciones` (listarTodas), `GET /proveedores/:id/evaluaciones` (listar), `POST /proveedores/:id/evaluaciones` (crear), `POST /proveedores/:id/evaluaciones/:evaluacionId/iniciar` (iniciar), `POST /proveedores/:id/evaluaciones/:evaluacionId/completar` (completar). Permiso `proveedores:evaluar` en `gestor_compras`/`aprobador_area`/`aprobador_ejecutivo`. La Tarea 4 (frontend) consume estas 5 rutas.

- [ ] **Step 1: Escribir el test que falla**

Crear `server/tests/integration/evaluacionProveedor.routes.test.js`:

```js
const request = require('supertest');
const bcrypt = require('bcryptjs');
const { sequelize } = require('../../src/config/database');
const { createMigrator } = require('../../src/config/migrator');
const seedRolesPermisos = require('../../src/scripts/seedRolesPermisos');
const { Rol, Usuario, Proveedor, EvaluacionProveedor, Area } = require('../../src/models');
const { invalidarCachePermisos } = require('../../src/middlewares/roles');
const { app } = require('../../server');

let adminToken;
let gestorComprasToken;
let aprobadorAreaToken;
let colaboradorToken;
let area;

async function crearUsuarioConRol(rolNombre, prefijo) {
  const rol = await Rol.findOne({ where: { nombre: rolNombre } });
  const username = `${prefijo}_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
  const usuario = await Usuario.create({
    username, email: `${username}@istho.com.co`,
    passwordHash: await bcrypt.hash('Clave123!', 10), nombre: prefijo, apellido: 'Evaluacion',
  });
  await usuario.setRoles([rol.id]);
  const login = await request(app).post('/api/v1/auth/login').send({ username, password: 'Clave123!' });
  return login.body.data.token;
}

beforeAll(async () => {
  await sequelize.authenticate();
  await createMigrator(sequelize).up();
  await seedRolesPermisos();
  invalidarCachePermisos();

  area = await Area.create({ nombre: 'Evaluacion Area', codigo: `EVALAREA${Date.now()}` });

  const adminLogin = await request(app)
    .post('/api/v1/auth/login')
    .send({ username: 'admin', password: process.env.SEED_PASSWORD_ADMIN || 'CambiarAhora123!' });
  adminToken = adminLogin.body.data.token;

  gestorComprasToken = await crearUsuarioConRol('gestor_compras', 'gestor_compras_eval');
  aprobadorAreaToken = await crearUsuarioConRol('aprobador_area', 'aprobador_area_eval');
  colaboradorToken = await crearUsuarioConRol('colaborador', 'colaborador_eval');
});

afterAll(async () => {
  await sequelize.close();
});

async function crearProveedor() {
  const res = await request(app)
    .post('/api/v1/proveedores')
    .set('Authorization', `Bearer ${gestorComprasToken}`)
    .send({
      tipo: 'proveedor', documentoIdentificacion: `EVAL${Date.now()}${Math.floor(Math.random() * 10000)}`,
      razonSocial: 'Proveedor Evaluacion SAS', areaSolicitanteId: area.id,
    });
  const proveedor = await Proveedor.findByPk(res.body.data.id);
  await proveedor.update({ estado: 'activo' });
  return proveedor.id;
}

describe('EvaluacionProveedor API', () => {
  it('programa manualmente una evaluación para un proveedor', async () => {
    const proveedorId = await crearProveedor();
    const res = await request(app)
      .post(`/api/v1/proveedores/${proveedorId}/evaluaciones`)
      .set('Authorization', `Bearer ${gestorComprasToken}`)
      .send({ fechaProgramada: '2026-12-01' });
    expect(res.status).toBe(201);
    expect(res.body.data.estado).toBe('pendiente');
    expect(res.body.data.periodo).toBe(2026);
  });

  it('returns 400 si falta fechaProgramada', async () => {
    const proveedorId = await crearProveedor();
    const res = await request(app)
      .post(`/api/v1/proveedores/${proveedorId}/evaluaciones`)
      .set('Authorization', `Bearer ${gestorComprasToken}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it('returns 400 si el proveedor ya tiene una evaluación pendiente/en_proceso', async () => {
    const proveedorId = await crearProveedor();
    await request(app)
      .post(`/api/v1/proveedores/${proveedorId}/evaluaciones`)
      .set('Authorization', `Bearer ${gestorComprasToken}`)
      .send({ fechaProgramada: '2026-12-01' });

    const res = await request(app)
      .post(`/api/v1/proveedores/${proveedorId}/evaluaciones`)
      .set('Authorization', `Bearer ${gestorComprasToken}`)
      .send({ fechaProgramada: '2026-12-15' });
    expect(res.status).toBe(400);
  });

  it('returns 403 cuando un rol sin el permiso evaluar intenta programar una evaluación', async () => {
    const proveedorId = await crearProveedor();
    const res = await request(app)
      .post(`/api/v1/proveedores/${proveedorId}/evaluaciones`)
      .set('Authorization', `Bearer ${colaboradorToken}`)
      .send({ fechaProgramada: '2026-12-01' });
    expect(res.status).toBe(403);
  });

  it('inicia una evaluación pendiente, fija responsableUsuarioId', async () => {
    const proveedorId = await crearProveedor();
    const creada = await request(app)
      .post(`/api/v1/proveedores/${proveedorId}/evaluaciones`)
      .set('Authorization', `Bearer ${gestorComprasToken}`)
      .send({ fechaProgramada: '2026-12-01' });

    const res = await request(app)
      .post(`/api/v1/proveedores/${proveedorId}/evaluaciones/${creada.body.data.id}/iniciar`)
      .set('Authorization', `Bearer ${gestorComprasToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.estado).toBe('en_proceso');
    expect(res.body.data.responsableUsuarioId).not.toBeNull();
  });

  it('returns 400 al iniciar una evaluación que no está pendiente', async () => {
    const proveedorId = await crearProveedor();
    const creada = await request(app)
      .post(`/api/v1/proveedores/${proveedorId}/evaluaciones`)
      .set('Authorization', `Bearer ${gestorComprasToken}`)
      .send({ fechaProgramada: '2026-12-01' });
    await request(app)
      .post(`/api/v1/proveedores/${proveedorId}/evaluaciones/${creada.body.data.id}/iniciar`)
      .set('Authorization', `Bearer ${gestorComprasToken}`);

    const res = await request(app)
      .post(`/api/v1/proveedores/${proveedorId}/evaluaciones/${creada.body.data.id}/iniciar`)
      .set('Authorization', `Bearer ${gestorComprasToken}`);
    expect(res.status).toBe(400);
  });

  it('completa una evaluación en_proceso con puntaje válido, y actualiza las fechas del Proveedor', async () => {
    const proveedorId = await crearProveedor();
    const creada = await request(app)
      .post(`/api/v1/proveedores/${proveedorId}/evaluaciones`)
      .set('Authorization', `Bearer ${gestorComprasToken}`)
      .send({ fechaProgramada: '2026-12-01' });
    await request(app)
      .post(`/api/v1/proveedores/${proveedorId}/evaluaciones/${creada.body.data.id}/iniciar`)
      .set('Authorization', `Bearer ${gestorComprasToken}`);

    const res = await request(app)
      .post(`/api/v1/proveedores/${proveedorId}/evaluaciones/${creada.body.data.id}/completar`)
      .set('Authorization', `Bearer ${gestorComprasToken}`)
      .send({ puntaje: 85, observaciones: 'Buen desempeño' });
    expect(res.status).toBe(200);
    expect(res.body.data.estado).toBe('completada');
    expect(Number(res.body.data.puntaje)).toBe(85);

    const proveedor = await Proveedor.findByPk(proveedorId);
    expect(proveedor.fechaUltimaEvaluacion).not.toBeNull();
    expect(proveedor.fechaProximaEvaluacion).not.toBeNull();
    expect(new Date(proveedor.fechaProximaEvaluacion).getFullYear()).toBe(new Date(proveedor.fechaUltimaEvaluacion).getFullYear() + 1);
  });

  it('returns 400 si el puntaje está fuera de 0-100', async () => {
    const proveedorId = await crearProveedor();
    const creada = await request(app)
      .post(`/api/v1/proveedores/${proveedorId}/evaluaciones`)
      .set('Authorization', `Bearer ${gestorComprasToken}`)
      .send({ fechaProgramada: '2026-12-01' });
    await request(app)
      .post(`/api/v1/proveedores/${proveedorId}/evaluaciones/${creada.body.data.id}/iniciar`)
      .set('Authorization', `Bearer ${gestorComprasToken}`);

    const res = await request(app)
      .post(`/api/v1/proveedores/${proveedorId}/evaluaciones/${creada.body.data.id}/completar`)
      .set('Authorization', `Bearer ${gestorComprasToken}`)
      .send({ puntaje: 150 });
    expect(res.status).toBe(400);
  });

  it('returns 400 al completar una evaluación que no está en_proceso', async () => {
    const proveedorId = await crearProveedor();
    const creada = await request(app)
      .post(`/api/v1/proveedores/${proveedorId}/evaluaciones`)
      .set('Authorization', `Bearer ${gestorComprasToken}`)
      .send({ fechaProgramada: '2026-12-01' });

    const res = await request(app)
      .post(`/api/v1/proveedores/${proveedorId}/evaluaciones/${creada.body.data.id}/completar`)
      .set('Authorization', `Bearer ${gestorComprasToken}`)
      .send({ puntaje: 90 });
    expect(res.status).toBe(400);
  });

  it('lista el historial de evaluaciones de un proveedor', async () => {
    const proveedorId = await crearProveedor();
    await request(app)
      .post(`/api/v1/proveedores/${proveedorId}/evaluaciones`)
      .set('Authorization', `Bearer ${gestorComprasToken}`)
      .send({ fechaProgramada: '2026-12-01' });

    const res = await request(app)
      .get(`/api/v1/proveedores/${proveedorId}/evaluaciones`)
      .set('Authorization', `Bearer ${gestorComprasToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it('lista todas las evaluaciones (transversal), filtrable por estado, con el Proveedor incluido', async () => {
    const proveedorId = await crearProveedor();
    await request(app)
      .post(`/api/v1/proveedores/${proveedorId}/evaluaciones`)
      .set('Authorization', `Bearer ${gestorComprasToken}`)
      .send({ fechaProgramada: '2026-12-01' });

    const res = await request(app)
      .get('/api/v1/proveedores/evaluaciones')
      .query({ estado: 'pendiente' })
      .set('Authorization', `Bearer ${gestorComprasToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.some((e) => e.proveedorId === proveedorId)).toBe(true);
    expect(res.body.data.find((e) => e.proveedorId === proveedorId).Proveedor.id).toBe(proveedorId);
  });

  it('returns 403 cuando un rol sin el permiso evaluar intenta ver el listado transversal', async () => {
    const res = await request(app)
      .get('/api/v1/proveedores/evaluaciones')
      .set('Authorization', `Bearer ${colaboradorToken}`);
    expect(res.status).toBe(403);
  });

  it('aprobador_area (con el permiso evaluar) puede programar y completar una evaluación', async () => {
    const proveedorId = await crearProveedor();
    const creada = await request(app)
      .post(`/api/v1/proveedores/${proveedorId}/evaluaciones`)
      .set('Authorization', `Bearer ${aprobadorAreaToken}`)
      .send({ fechaProgramada: '2026-12-01' });
    expect(creada.status).toBe(201);

    await request(app)
      .post(`/api/v1/proveedores/${proveedorId}/evaluaciones/${creada.body.data.id}/iniciar`)
      .set('Authorization', `Bearer ${aprobadorAreaToken}`);
    const completada = await request(app)
      .post(`/api/v1/proveedores/${proveedorId}/evaluaciones/${creada.body.data.id}/completar`)
      .set('Authorization', `Bearer ${aprobadorAreaToken}`)
      .send({ puntaje: 70 });
    expect(completada.status).toBe(200);
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `cd server && npx jest tests/integration/evaluacionProveedor.routes.test.js`
Expected: FAIL — las rutas `/proveedores/evaluaciones` y `/proveedores/:id/evaluaciones*` no existen todavía (`404`), y ningún rol tiene el permiso `proveedores:evaluar` en el seed actual (los tests que esperan éxito reciben `403`).

- [ ] **Step 3: Agregar el permiso `evaluar` al seed**

En `server/src/scripts/seedRolesPermisos.js`, en `PERMISOS_POR_ROL`:

`aprobador_ejecutivo` (línea con `proveedores: ['ver', 'aprobar']`) pasa a:
```js
    proveedores: ['ver', 'aprobar', 'evaluar'],
```

`aprobador_area` (misma línea `proveedores: ['ver', 'aprobar']`) pasa a:
```js
    proveedores: ['ver', 'aprobar', 'evaluar'],
```

`gestor_compras` (línea `proveedores: ['ver', 'gestionar']`) pasa a:
```js
    proveedores: ['ver', 'gestionar', 'evaluar'],
```

- [ ] **Step 4: Crear el controller**

`server/src/controllers/evaluacionProveedor.controller.js`:

```js
const { Proveedor, EvaluacionProveedor, Auditoria } = require('../models');
const { success, created, notFound, badRequest } = require('../utils/responses');

async function listar(req, res) {
  const proveedor = await Proveedor.findByPk(req.params.id);
  if (!proveedor) return notFound(res, 'Proveedor no encontrado');

  const evaluaciones = await EvaluacionProveedor.findAll({
    where: { proveedorId: proveedor.id },
    order: [['fechaProgramada', 'DESC']],
  });
  return success(res, evaluaciones);
}

async function listarTodas(req, res) {
  const { estado } = req.query;
  const where = {};
  if (estado) where.estado = estado;

  const evaluaciones = await EvaluacionProveedor.findAll({
    where,
    include: [{ model: Proveedor }],
    order: [['fechaProgramada', 'DESC']],
  });
  return success(res, evaluaciones);
}

async function crear(req, res) {
  const proveedor = await Proveedor.findByPk(req.params.id);
  if (!proveedor) return notFound(res, 'Proveedor no encontrado');

  const { fechaProgramada } = req.body;
  if (!fechaProgramada) return badRequest(res, 'fechaProgramada es obligatoria');

  const evaluacionActiva = await EvaluacionProveedor.findOne({
    where: { proveedorId: proveedor.id, estado: ['pendiente', 'en_proceso'] },
  });
  if (evaluacionActiva) return badRequest(res, 'Este proveedor ya tiene una evaluación pendiente o en proceso');

  const periodo = new Date(`${fechaProgramada}T00:00:00`).getFullYear();
  const evaluacion = await EvaluacionProveedor.create({
    proveedorId: proveedor.id, periodo, fechaProgramada, estado: 'pendiente',
  });

  await Auditoria.registrar({
    tabla: 'evaluaciones_proveedor', registroId: evaluacion.id, accion: 'crear',
    usuarioId: req.user.id, usuarioNombre: req.user.nombreCompleto, datosNuevos: evaluacion.toJSON(),
  });

  return created(res, 'Evaluación programada', evaluacion);
}

async function iniciar(req, res) {
  const evaluacion = await EvaluacionProveedor.findOne({ where: { id: req.params.evaluacionId, proveedorId: req.params.id } });
  if (!evaluacion) return notFound(res, 'Evaluación no encontrada');
  if (evaluacion.estado !== 'pendiente') return badRequest(res, 'La evaluación debe estar pendiente para iniciarla');

  const datosAnteriores = evaluacion.toJSON();
  await evaluacion.update({ estado: 'en_proceso', responsableUsuarioId: req.user.id });

  await Auditoria.registrar({
    tabla: 'evaluaciones_proveedor', registroId: evaluacion.id, accion: 'actualizar',
    usuarioId: req.user.id, usuarioNombre: req.user.nombreCompleto,
    descripcion: 'Evaluación de proveedor iniciada', datosAnteriores, datosNuevos: evaluacion.toJSON(),
  });

  return success(res, evaluacion);
}

async function completar(req, res) {
  const evaluacion = await EvaluacionProveedor.findOne({ where: { id: req.params.evaluacionId, proveedorId: req.params.id } });
  if (!evaluacion) return notFound(res, 'Evaluación no encontrada');
  if (evaluacion.estado !== 'en_proceso') return badRequest(res, 'La evaluación debe estar en proceso para completarla');

  const { puntaje, observaciones } = req.body;
  if (puntaje === undefined || puntaje === null || puntaje === '') return badRequest(res, 'El puntaje es obligatorio');
  const puntajeNumerico = Number(puntaje);
  if (Number.isNaN(puntajeNumerico) || puntajeNumerico < 0 || puntajeNumerico > 100) {
    return badRequest(res, 'El puntaje debe estar entre 0 y 100');
  }

  const datosAnteriores = evaluacion.toJSON();
  const hoy = new Date().toISOString().slice(0, 10);
  await evaluacion.update({
    estado: 'completada', puntaje: puntajeNumerico, observaciones: observaciones || null, fechaRealizada: hoy,
  });

  const proveedor = await Proveedor.findByPk(evaluacion.proveedorId);
  const proximaFecha = new Date(`${hoy}T00:00:00`);
  proximaFecha.setFullYear(proximaFecha.getFullYear() + 1);
  await proveedor.update({
    fechaUltimaEvaluacion: hoy,
    fechaProximaEvaluacion: proximaFecha.toISOString().slice(0, 10),
  });

  await Auditoria.registrar({
    tabla: 'evaluaciones_proveedor', registroId: evaluacion.id, accion: 'actualizar',
    usuarioId: req.user.id, usuarioNombre: req.user.nombreCompleto,
    descripcion: 'Evaluación de proveedor completada', datosAnteriores, datosNuevos: evaluacion.toJSON(),
  });

  return success(res, evaluacion);
}

module.exports = { listar, listarTodas, crear, iniciar, completar };
```

- [ ] **Step 5: Montar las rutas en `proveedor.routes.js`**

En `server/src/routes/proveedor.routes.js`, agregar el require después de la línea 7 (`const documentoController = require('../controllers/proveedorDocumento.controller');`):

```js
const evaluacionController = require('../controllers/evaluacionProveedor.controller');
```

Insertar, **antes** de la línea `router.get('/:id', ...)` (línea 12 actual — el orden importa: si se pone después, Express interpretaría `evaluaciones` como el parámetro `:id`):

```js
router.get('/evaluaciones', verificarToken, requierePermiso('proveedores', 'evaluar'), asyncHandler(evaluacionController.listarTodas));
```

Y agregar, al final del archivo (después de las rutas de `documentoController`, antes de `module.exports = router;`):

```js
router.get('/:id/evaluaciones', verificarToken, requierePermiso('proveedores', 'ver'), asyncHandler(evaluacionController.listar));
router.post('/:id/evaluaciones', verificarToken, requierePermiso('proveedores', 'evaluar'), asyncHandler(evaluacionController.crear));
router.post('/:id/evaluaciones/:evaluacionId/iniciar', verificarToken, requierePermiso('proveedores', 'evaluar'), asyncHandler(evaluacionController.iniciar));
router.post('/:id/evaluaciones/:evaluacionId/completar', verificarToken, requierePermiso('proveedores', 'evaluar'), asyncHandler(evaluacionController.completar));
```

- [ ] **Step 6: Correr el test para verificar que pasa**

Run: `cd server && npx jest tests/integration/evaluacionProveedor.routes.test.js`
Expected: PASS (13/13 tests).

Correr también la suite completa del backend para confirmar que no hay regresiones: `cd server && npm test`
Expected: PASS (todos los tests).

- [ ] **Step 7: Commit**

```bash
git add server/src/scripts/seedRolesPermisos.js server/src/controllers/evaluacionProveedor.controller.js server/src/routes/proveedor.routes.js server/tests/integration/evaluacionProveedor.routes.test.js
git commit -m "feat(proveedores): endpoints de evaluacion (crear, iniciar, completar, listar, listado transversal)"
```

---

### Task 3: Backend — Job diario `evaluacionProveedor.job.js`

**Files:**
- Create: `server/src/jobs/evaluacionProveedor.job.js`
- Create: `server/src/scripts/ejecutarEvaluacionesProveedor.js`
- Modify: `server/server.js`
- Modify: `server/package.json`
- Test: `server/tests/unit/evaluacionProveedor.job.test.js`

**Interfaces:**
- Consumes: `Proveedor`/`EvaluacionProveedor` de `../models` (Task 1/2, ya disponibles).
- Produces: `ejecutar()` (usado por el test y por el script manual) y `programar()` (usado por `server.js`), ambos exportados desde `evaluacionProveedor.job.js`.

- [ ] **Step 1: Escribir el test que falla**

Crear `server/tests/unit/evaluacionProveedor.job.test.js`:

```js
const { sequelize } = require('../../src/config/database');
const { createMigrator } = require('../../src/config/migrator');
const { Proveedor, EvaluacionProveedor } = require('../../src/models');
const { ejecutar } = require('../../src/jobs/evaluacionProveedor.job');

function fechaEnDias(dias) {
  return new Date(Date.now() + dias * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

beforeAll(async () => {
  await sequelize.authenticate();
  await createMigrator(sequelize).up();
});

afterAll(async () => {
  await sequelize.close();
});

describe('evaluacionProveedor.job', () => {
  it('crea una evaluación pendiente cuando fechaProximaEvaluacion ya pasó y no hay ninguna activa', async () => {
    const proveedor = await Proveedor.create({
      tipo: 'proveedor', documentoIdentificacion: `930${Date.now()}`, razonSocial: 'Job Evaluación SAS',
      estado: 'activo', fechaProximaEvaluacion: fechaEnDias(-1),
    });

    await ejecutar();

    const evaluacion = await EvaluacionProveedor.findOne({ where: { proveedorId: proveedor.id } });
    expect(evaluacion).not.toBeNull();
    expect(evaluacion.estado).toBe('pendiente');
  });

  it('no crea una evaluación si fechaProximaEvaluacion todavía no llega', async () => {
    const proveedor = await Proveedor.create({
      tipo: 'proveedor', documentoIdentificacion: `931${Date.now()}`, razonSocial: 'Job Evaluación Futura SAS',
      estado: 'activo', fechaProximaEvaluacion: fechaEnDias(30),
    });

    await ejecutar();

    const evaluacion = await EvaluacionProveedor.findOne({ where: { proveedorId: proveedor.id } });
    expect(evaluacion).toBeNull();
  });

  it('no crea una evaluación si el proveedor no tiene fechaProximaEvaluacion (NULL)', async () => {
    const proveedor = await Proveedor.create({
      tipo: 'proveedor', documentoIdentificacion: `932${Date.now()}`, razonSocial: 'Job Evaluación Nula SAS', estado: 'activo',
    });

    await ejecutar();

    const evaluacion = await EvaluacionProveedor.findOne({ where: { proveedorId: proveedor.id } });
    expect(evaluacion).toBeNull();
  });

  it('no duplica si ya hay una evaluación pendiente/en_proceso activa', async () => {
    const proveedor = await Proveedor.create({
      tipo: 'proveedor', documentoIdentificacion: `933${Date.now()}`, razonSocial: 'Job Evaluación Activa SAS',
      estado: 'activo', fechaProximaEvaluacion: fechaEnDias(-1),
    });
    await EvaluacionProveedor.create({
      proveedorId: proveedor.id, periodo: 2026, fechaProgramada: fechaEnDias(10), estado: 'pendiente',
    });

    await ejecutar();

    const evaluaciones = await EvaluacionProveedor.findAll({ where: { proveedorId: proveedor.id } });
    expect(evaluaciones).toHaveLength(1);
  });

  it('marca vencida una evaluación pendiente cuya fechaProgramada ya pasó', async () => {
    const proveedor = await Proveedor.create({
      tipo: 'proveedor', documentoIdentificacion: `934${Date.now()}`, razonSocial: 'Job Evaluación Vencida SAS', estado: 'activo',
    });
    const evaluacion = await EvaluacionProveedor.create({
      proveedorId: proveedor.id, periodo: 2025, fechaProgramada: fechaEnDias(-5), estado: 'pendiente',
    });

    await ejecutar();

    await evaluacion.reload();
    expect(evaluacion.estado).toBe('vencida');
  });

  it('ignora proveedores que no están activo', async () => {
    const proveedor = await Proveedor.create({
      tipo: 'proveedor', documentoIdentificacion: `935${Date.now()}`, razonSocial: 'Job Evaluación Inactiva SAS',
      estado: 'inactivo', fechaProximaEvaluacion: fechaEnDias(-1),
    });

    await ejecutar();

    const evaluacion = await EvaluacionProveedor.findOne({ where: { proveedorId: proveedor.id } });
    expect(evaluacion).toBeNull();
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `cd server && npx jest tests/unit/evaluacionProveedor.job.test.js`
Expected: FAIL con `Cannot find module '../../src/jobs/evaluacionProveedor.job'`.

- [ ] **Step 3: Crear el job**

`server/src/jobs/evaluacionProveedor.job.js`:

```js
const cron = require('node-cron');

async function ejecutar() {
  const { Proveedor, EvaluacionProveedor } = require('../models');

  const hoy = new Date();
  const proveedoresActivos = await Proveedor.findAll({ where: { estado: 'activo' } });

  let marcadasVencidas = 0;
  let creadasPendientes = 0;

  for (const proveedor of proveedoresActivos) {
    const evaluacionActiva = await EvaluacionProveedor.findOne({
      where: { proveedorId: proveedor.id, estado: ['pendiente', 'en_proceso'] },
    });

    if (evaluacionActiva) {
      const fechaProgramada = new Date(`${evaluacionActiva.fechaProgramada}T00:00:00`);
      if (fechaProgramada < hoy) {
        await evaluacionActiva.update({ estado: 'vencida' });
        marcadasVencidas += 1;
      }
      continue;
    }

    if (proveedor.fechaProximaEvaluacion) {
      const fechaProxima = new Date(`${proveedor.fechaProximaEvaluacion}T00:00:00`);
      if (fechaProxima <= hoy) {
        await EvaluacionProveedor.create({
          proveedorId: proveedor.id,
          periodo: fechaProxima.getFullYear(),
          fechaProgramada: proveedor.fechaProximaEvaluacion,
          estado: 'pendiente',
        });
        creadasPendientes += 1;
      }
    }
  }

  return { marcadasVencidas, creadasPendientes };
}

function programar() {
  const expresion = process.env.CRON_EVALUACIONES_PROVEEDOR || '0 4 * * *';
  cron.schedule(expresion, () => {
    ejecutar().catch((err) => console.error('Error en job evaluacionProveedor:', err));
  });
}

module.exports = { ejecutar, programar };
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `cd server && npx jest tests/unit/evaluacionProveedor.job.test.js`
Expected: PASS (6/6 tests).

- [ ] **Step 5: Crear el script de ejecución manual**

`server/src/scripts/ejecutarEvaluacionesProveedor.js`:

```js
require('dotenv').config();
const { sequelize } = require('../config/database');
const { ejecutar } = require('../jobs/evaluacionProveedor.job');

ejecutar()
  .then((resultado) => {
    console.log('Job de evaluaciones de proveedores completado:', resultado);
    return sequelize.close();
  })
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Error ejecutando el job de evaluaciones de proveedores:', err);
    process.exit(1);
  });
```

- [ ] **Step 6: Agregar el script a `package.json`**

En `server/package.json`, dentro de `"scripts"`, agregar (junto a `"job:recalcular-estados"`/`"job:purgar-logs"`):

```json
    "job:evaluar-proveedores": "node src/scripts/ejecutarEvaluacionesProveedor.js"
```

- [ ] **Step 7: Registrar el job en `server.js`**

En `server/server.js`, agregar el require después de la línea 8 (`const { programar: programarPurgaLogs } = require('./src/jobs/logServidor.job');`):

```js
const { programar: programarEvaluacionesProveedor } = require('./src/jobs/evaluacionProveedor.job');
```

Y agregar, después de la línea `programarPurgaLogs();` (dentro del bloque `if (require.main === module) { ... }`):

```js
      programarEvaluacionesProveedor();
```

- [ ] **Step 8: Verificar que el servidor sigue arrancando**

Run: `cd server && node -e "require('./server.js')"` y verificar que no lanza ningún error de sintaxis o de módulo no encontrado (Ctrl+C para detenerlo tras confirmar que arrancó).

Correr también la suite completa del backend para confirmar que no hay regresiones: `cd server && npm test`
Expected: PASS (todos los tests).

- [ ] **Step 9: Commit**

```bash
git add server/src/jobs/evaluacionProveedor.job.js server/src/scripts/ejecutarEvaluacionesProveedor.js server/server.js server/package.json server/tests/unit/evaluacionProveedor.job.test.js
git commit -m "feat(proveedores): job diario de evaluaciones (crea pendientes, marca vencidas)"
```

---

### Task 4: Frontend — `evaluacionProveedor.service.js` + pestaña "Evaluaciones" en `ProveedorDetalle.jsx`

**Files:**
- Create: `frontend/src/api/evaluacionProveedor.service.js`
- Create: `frontend/src/api/evaluacionProveedor.service.test.js`
- Modify: `frontend/src/components/common/StatusChip/StatusChip.jsx`
- Modify: `frontend/src/pages/proveedores/ProveedorDetalle.jsx`
- Modify: `frontend/src/pages/proveedores/ProveedorDetalle.test.jsx`

**Interfaces:**
- Consumes: rutas de la Tarea 2 (`GET/POST /proveedores/:id/evaluaciones`, `/iniciar`, `/completar`).
- Produces: `evaluacionProveedorService.listar(proveedorId)`, `.listarTodas(filtros)`, `.crear(proveedorId, datos)`, `.iniciar(proveedorId, evaluacionId)`, `.completar(proveedorId, evaluacionId, datos)` — la Tarea 5 (`EvaluacionesListado.jsx`) consume `.listarTodas`.

- [ ] **Step 1: Escribir el test que falla (servicio)**

Crear `frontend/src/api/evaluacionProveedor.service.test.js`:

```js
import MockAdapter from 'axios-mock-adapter';
import apiClient from './client';
import evaluacionProveedorService from './evaluacionProveedor.service';

describe('evaluacionProveedor.service', () => {
  let mock;

  beforeEach(() => {
    mock = new MockAdapter(apiClient);
  });

  afterEach(() => {
    mock.restore();
  });

  it('listar returns the evaluaciones array for a proveedor', async () => {
    mock.onGet('/proveedores/1/evaluaciones').reply(200, { success: true, data: [{ id: 5, estado: 'pendiente' }] });
    const evaluaciones = await evaluacionProveedorService.listar(1);
    expect(evaluaciones).toEqual([{ id: 5, estado: 'pendiente' }]);
  });

  it('listarTodas passes filtros as query params', async () => {
    mock.onGet('/proveedores/evaluaciones').reply((config) => {
      expect(config.params).toEqual({ estado: 'pendiente' });
      return [200, { success: true, data: [] }];
    });
    const evaluaciones = await evaluacionProveedorService.listarTodas({ estado: 'pendiente' });
    expect(evaluaciones).toEqual([]);
  });

  it('crear posts fechaProgramada and returns the created evaluación', async () => {
    mock.onPost('/proveedores/1/evaluaciones').reply(201, { success: true, data: { id: 5, estado: 'pendiente' } });
    const evaluacion = await evaluacionProveedorService.crear(1, { fechaProgramada: '2026-12-01' });
    expect(evaluacion).toEqual({ id: 5, estado: 'pendiente' });
    expect(JSON.parse(mock.history.post[0].data)).toEqual({ fechaProgramada: '2026-12-01' });
  });

  it('iniciar posts to the iniciar endpoint', async () => {
    mock.onPost('/proveedores/1/evaluaciones/5/iniciar').reply(200, { success: true, data: { id: 5, estado: 'en_proceso' } });
    const evaluacion = await evaluacionProveedorService.iniciar(1, 5);
    expect(evaluacion).toEqual({ id: 5, estado: 'en_proceso' });
  });

  it('completar posts puntaje/observaciones to the completar endpoint', async () => {
    mock.onPost('/proveedores/1/evaluaciones/5/completar').reply(200, { success: true, data: { id: 5, estado: 'completada' } });
    const evaluacion = await evaluacionProveedorService.completar(1, 5, { puntaje: 85 });
    expect(evaluacion).toEqual({ id: 5, estado: 'completada' });
    expect(JSON.parse(mock.history.post[0].data)).toEqual({ puntaje: 85 });
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `cd frontend && npx vitest run src/api/evaluacionProveedor.service.test.js`
Expected: FAIL — `Failed to resolve import "./evaluacionProveedor.service"`.

- [ ] **Step 3: Crear el servicio**

`frontend/src/api/evaluacionProveedor.service.js`:

```js
import apiClient from './client';

async function listar(proveedorId) {
  const response = await apiClient.get(`/proveedores/${proveedorId}/evaluaciones`);
  return response.data;
}

async function listarTodas(filtros = {}) {
  const response = await apiClient.get('/proveedores/evaluaciones', { params: filtros });
  return response.data;
}

async function crear(proveedorId, datos) {
  const response = await apiClient.post(`/proveedores/${proveedorId}/evaluaciones`, datos);
  return response.data;
}

async function iniciar(proveedorId, evaluacionId) {
  const response = await apiClient.post(`/proveedores/${proveedorId}/evaluaciones/${evaluacionId}/iniciar`);
  return response.data;
}

async function completar(proveedorId, evaluacionId, datos) {
  const response = await apiClient.post(`/proveedores/${proveedorId}/evaluaciones/${evaluacionId}/completar`, datos);
  return response.data;
}

export default { listar, listarTodas, crear, iniciar, completar };
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `cd frontend && npx vitest run src/api/evaluacionProveedor.service.test.js`
Expected: PASS (5/5 tests).

- [ ] **Step 5: Agregar los estados nuevos a `StatusChip`**

En `frontend/src/components/common/StatusChip/StatusChip.jsx`, agregar al objeto `STATUS_CONFIG` (después de la línea `pendiente: { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-400', label: 'pendiente' },` — `pendiente` ya existe y se reutiliza tal cual):

```js
  en_proceso: { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-400', label: 'en proceso' },
  completada: { bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-400', label: 'completada' },
  vencida: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-400', label: 'vencida' },
```

- [ ] **Step 6: Escribir los tests que fallan (pestaña en ProveedorDetalle)**

En `frontend/src/pages/proveedores/ProveedorDetalle.test.jsx`, agregar el import después de la línea 8 (`import proveedorDocumentoService from '../../api/proveedorDocumento.service';`):

```js
import evaluacionProveedorService from '../../api/evaluacionProveedor.service';
```

Agregar el mock después de la línea 13 (`vi.mock('../../api/proveedorDocumento.service');`):

```js
vi.mock('../../api/evaluacionProveedor.service');
```

En el `beforeEach`, agregar después de `proveedorDocumentoService.listar.mockResolvedValue([]);`:

```js
    evaluacionProveedorService.listar.mockResolvedValue([]);
```

Agregar, al final del archivo, antes del cierre `});` del `describe('ProveedorDetalle', ...)` (después del último `it(...)`, el de `'hides Aprobar and Rechazar when the user lacks the editar permission'`):

```js

  it('programs an evaluación when there is no active one', async () => {
    evaluacionProveedorService.crear.mockResolvedValue({ id: 1, estado: 'pendiente' });
    renderPagina();
    await screen.findByText('Insumos ABC');
    await userEvent.click(screen.getByRole('tab', { name: 'Evaluaciones' }));

    await userEvent.type(screen.getByLabelText('Fecha programada'), '2026-12-01');
    await userEvent.click(screen.getByRole('button', { name: 'Programar evaluación' }));

    await waitFor(() => expect(evaluacionProveedorService.crear).toHaveBeenCalledWith('1', { fechaProgramada: '2026-12-01' }));
  });

  it('hides "Programar evaluación" when there is already a pendiente/en_proceso evaluación', async () => {
    evaluacionProveedorService.listar.mockResolvedValue([{ id: 1, periodo: 2026, fechaProgramada: '2026-12-01', puntaje: null, observaciones: null, estado: 'pendiente' }]);
    renderPagina();
    await screen.findByText('Insumos ABC');
    await userEvent.click(screen.getByRole('tab', { name: 'Evaluaciones' }));

    await screen.findByText(/Periodo 2026/);
    expect(screen.queryByRole('button', { name: 'Programar evaluación' })).not.toBeInTheDocument();
  });

  it('starts a pendiente evaluación', async () => {
    evaluacionProveedorService.listar.mockResolvedValue([{ id: 1, periodo: 2026, fechaProgramada: '2026-12-01', puntaje: null, observaciones: null, estado: 'pendiente' }]);
    evaluacionProveedorService.iniciar.mockResolvedValue({ id: 1, estado: 'en_proceso' });
    renderPagina();
    await screen.findByText('Insumos ABC');
    await userEvent.click(screen.getByRole('tab', { name: 'Evaluaciones' }));

    await userEvent.click(await screen.findByRole('button', { name: 'Iniciar' }));
    await waitFor(() => expect(evaluacionProveedorService.iniciar).toHaveBeenCalledWith('1', 1));
  });

  it('completes an en_proceso evaluación with a puntaje', async () => {
    evaluacionProveedorService.listar.mockResolvedValue([{ id: 1, periodo: 2026, fechaProgramada: '2026-12-01', puntaje: null, observaciones: null, estado: 'en_proceso' }]);
    evaluacionProveedorService.completar.mockResolvedValue({ id: 1, estado: 'completada', puntaje: 85 });
    renderPagina();
    await screen.findByText('Insumos ABC');
    await userEvent.click(screen.getByRole('tab', { name: 'Evaluaciones' }));

    await userEvent.type(screen.getByLabelText('Puntaje (0-100)'), '85');
    await userEvent.click(screen.getByRole('button', { name: 'Completar evaluación' }));

    await waitFor(() => expect(evaluacionProveedorService.completar).toHaveBeenCalledWith('1', 1, { puntaje: '85', observaciones: undefined }));
  });
```

- [ ] **Step 7: Correr los tests para verificar que fallan**

Run: `cd frontend && npx vitest run src/pages/proveedores/ProveedorDetalle.test.jsx`
Expected: FAIL — los 4 tests nuevos fallan (no existe la pestaña "Evaluaciones" ni sus formularios/botones todavía).

- [ ] **Step 8: Implementar la pestaña en `ProveedorDetalle.jsx`**

Agregar el import después de la línea 8 (`import proveedorDocumentoService from '../../api/proveedorDocumento.service';`):

```js
import evaluacionProveedorService from '../../api/evaluacionProveedor.service';
```

Agregar los íconos `PlayCircle` y `Plus` al import de `lucide-react` (línea 5), quedando:

```js
import { ArrowLeft, Download, Trash2, Upload, Truck, CheckCircle, XCircle, PlayCircle, Plus } from 'lucide-react';
```

Agregar el estado, después de la línea `const [archivoError, setArchivoError] = useState(null);`:

```js
  const [evaluaciones, setEvaluaciones] = useState([]);
```

Agregar los `useForm` de evaluaciones, después del bloque de `registerSubida`/`handleSubmitSubida`/`resetSubida`:

```js

  const {
    register: registerProgramar,
    handleSubmit: handleSubmitProgramar,
    reset: resetProgramar,
  } = useForm();

  const {
    register: registerCompletar,
    handleSubmit: handleSubmitCompletar,
    reset: resetCompletar,
  } = useForm();
```

Agregar la carga de evaluaciones, después del bloque `useEffect(() => { cargarDocumentos(); ... }, [id]);` (después de la línea 98):

```js

  async function cargarEvaluaciones() {
    try {
      const data = await evaluacionProveedorService.listar(id);
      setEvaluaciones(data);
    } catch {
      setEvaluaciones([]);
    }
  }

  useEffect(() => {
    cargarEvaluaciones();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
```

Agregar los handlers, después de la función `onEliminarDocumento` (después de su llave de cierre, línea 206):

```js

  async function onProgramarEvaluacion(valores) {
    try {
      await evaluacionProveedorService.crear(id, { fechaProgramada: valores.fechaProgramada });
      enqueueSnackbar('Evaluación programada', { variant: 'success' });
      resetProgramar();
      await cargarEvaluaciones();
    } catch (error) {
      enqueueSnackbar(error?.message || 'No se pudo programar la evaluación', { variant: 'error' });
    }
  }

  async function onIniciarEvaluacion(evaluacionId) {
    try {
      await evaluacionProveedorService.iniciar(id, evaluacionId);
      enqueueSnackbar('Evaluación iniciada', { variant: 'success' });
      await cargarEvaluaciones();
    } catch (error) {
      enqueueSnackbar(error?.message || 'No se pudo iniciar la evaluación', { variant: 'error' });
    }
  }

  async function onCompletarEvaluacion(evaluacionId, valores) {
    try {
      await evaluacionProveedorService.completar(id, evaluacionId, {
        puntaje: valores.puntaje, observaciones: valores.observaciones || undefined,
      });
      enqueueSnackbar('Evaluación completada', { variant: 'success' });
      resetCompletar();
      await cargarEvaluaciones();
    } catch (error) {
      enqueueSnackbar(error?.message || 'No se pudo completar la evaluación', { variant: 'error' });
    }
  }
```

Antes del `return (` del componente (justo antes de la línea `if (cargando) return ...`), no hace falta nada adicional — pero SÍ agregar, justo después de la línea `const requisitosAplicables = requisitos.filter(...)` (dentro del cuerpo del componente, antes del `return`):

```js
  const hayEvaluacionActiva = evaluaciones.some((e) => ['pendiente', 'en_proceso'].includes(e.estado));
```

Agregar el botón de la pestaña nueva, después del botón `role="tab"` de "Expediente documental" (después de su `</button>` de cierre, antes del `</div>` que cierra `role="tablist"`):

```jsx
          <button
            role="tab"
            aria-selected={tabActiva === 'evaluaciones'}
            onClick={() => setTabActiva('evaluaciones')}
            className={`px-6 py-4 text-sm font-medium ${tabActiva === 'evaluaciones' ? 'text-slate-900 dark:text-slate-100' : 'text-slate-500 dark:text-slate-400'}`}
          >
            Evaluaciones
          </button>
```

Agregar el contenido de la pestaña, después del cierre del bloque `{tabActiva === 'expediente' && (...)}` (después de su `)}` de cierre, antes del `</div>` que cierra `className="p-6"`):

```jsx

          {tabActiva === 'evaluaciones' && (
            <div className="space-y-8">
              <div>
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3">Historial de evaluaciones</h3>
                {evaluaciones.length === 0 ? (
                  <p className="text-sm text-slate-400 dark:text-slate-500">Sin evaluaciones todavía.</p>
                ) : (
                  <ul className="divide-y divide-gray-100 dark:divide-slate-700">
                    {evaluaciones.map((evaluacion) => (
                      <li key={evaluacion.id} className="py-3">
                        <div className="flex items-center justify-between gap-3 flex-wrap">
                          <div>
                            <p className="text-sm text-slate-700 dark:text-slate-200">
                              Periodo {evaluacion.periodo} — programada {evaluacion.fechaProgramada}
                              {evaluacion.puntaje != null && ` — puntaje ${evaluacion.puntaje}`}
                            </p>
                            {evaluacion.observaciones && <p className="text-xs text-slate-400 dark:text-slate-500">{evaluacion.observaciones}</p>}
                          </div>
                          <div className="flex items-center gap-2">
                            <StatusChip status={evaluacion.estado} />
                            {evaluacion.estado === 'pendiente' && tienePermiso('proveedores', 'evaluar') && (
                              <Button variant="outline" size="sm" icon={PlayCircle} onClick={() => onIniciarEvaluacion(evaluacion.id)}>
                                Iniciar
                              </Button>
                            )}
                          </div>
                        </div>

                        {evaluacion.estado === 'en_proceso' && tienePermiso('proveedores', 'evaluar') && (
                          <form className="space-y-4 pt-4 mt-3 border-t border-gray-100 dark:border-slate-700">
                            <Input label="Puntaje (0-100)" type="number" {...registerCompletar('puntaje', { required: true, min: 0, max: 100 })} />
                            <Input label="Observaciones" {...registerCompletar('observaciones')} />
                            <Button icon={CheckCircle} onClick={handleSubmitCompletar((valores) => onCompletarEvaluacion(evaluacion.id, valores))}>
                              Completar evaluación
                            </Button>
                          </form>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {tienePermiso('proveedores', 'evaluar') && !hayEvaluacionActiva && (
                <form className="space-y-4 pt-4 border-t border-gray-100 dark:border-slate-700">
                  <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Programar evaluación</h3>
                  <Input label="Fecha programada" type="date" {...registerProgramar('fechaProgramada', { required: true })} />
                  <Button icon={Plus} onClick={handleSubmitProgramar(onProgramarEvaluacion)}>
                    Programar evaluación
                  </Button>
                </form>
              )}
            </div>
          )}
```

- [ ] **Step 9: Correr los tests para verificar que pasan**

Run: `cd frontend && npx vitest run src/pages/proveedores/ProveedorDetalle.test.jsx`
Expected: PASS (todos los tests, incluyendo los 4 nuevos).

Correr también la suite completa del frontend para confirmar que no hay regresiones: `cd frontend && npm test`
Expected: PASS (todos los tests).

- [ ] **Step 10: Commit**

```bash
git add frontend/src/api/evaluacionProveedor.service.js frontend/src/api/evaluacionProveedor.service.test.js frontend/src/components/common/StatusChip/StatusChip.jsx frontend/src/pages/proveedores/ProveedorDetalle.jsx frontend/src/pages/proveedores/ProveedorDetalle.test.jsx
git commit -m "feat(proveedores): pestana Evaluaciones en el detalle del proveedor"
```

---

### Task 5: Frontend — `EvaluacionesListado.jsx` (listado transversal)

**Files:**
- Create: `frontend/src/pages/proveedores/EvaluacionesListado.jsx`
- Create: `frontend/src/pages/proveedores/EvaluacionesListado.test.jsx`
- Modify: `frontend/src/App.jsx`

**Interfaces:**
- Consumes: `evaluacionProveedorService.listarTodas(filtros)` (Task 4).
- Produces: pantalla en `/proveedores/evaluaciones`, sin interfaz para otras tareas (es la última).

- [ ] **Step 1: Escribir el test que falla**

Crear `frontend/src/pages/proveedores/EvaluacionesListado.test.jsx`:

```js
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SnackbarProvider } from 'notistack';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import EvaluacionesListado from './EvaluacionesListado';
import evaluacionProveedorService from '../../api/evaluacionProveedor.service';

vi.mock('../../api/evaluacionProveedor.service');

function renderPagina() {
  return render(
    <MemoryRouter initialEntries={['/proveedores/evaluaciones']}>
      <SnackbarProvider>
        <Routes>
          <Route path="/proveedores/evaluaciones" element={<EvaluacionesListado />} />
          <Route path="/proveedores/:id" element={<p>Detalle proveedor</p>} />
        </Routes>
      </SnackbarProvider>
    </MemoryRouter>
  );
}

describe('EvaluacionesListado', () => {
  beforeEach(() => {
    evaluacionProveedorService.listarTodas.mockResolvedValue([]);
  });

  it('lists evaluaciones with the proveedor razón social', async () => {
    evaluacionProveedorService.listarTodas.mockResolvedValue([
      { id: 1, proveedorId: 7, periodo: 2026, fechaProgramada: '2026-12-01', fechaRealizada: null, puntaje: null, estado: 'pendiente', Proveedor: { razonSocial: 'Insumos ABC' } },
    ]);
    renderPagina();
    expect(await screen.findByText('Insumos ABC')).toBeInTheDocument();
  });

  it('filters by estado', async () => {
    renderPagina();
    await waitFor(() => expect(evaluacionProveedorService.listarTodas).toHaveBeenCalledWith({}));

    await userEvent.click(screen.getByLabelText('Estado'));
    await userEvent.click(await screen.findByRole('button', { name: 'Pendiente' }));

    await waitFor(() => expect(evaluacionProveedorService.listarTodas).toHaveBeenLastCalledWith({ estado: 'pendiente' }));
  });

  it('navigates to the proveedor detail when a row is clicked', async () => {
    evaluacionProveedorService.listarTodas.mockResolvedValue([
      { id: 1, proveedorId: 7, periodo: 2026, fechaProgramada: '2026-12-01', fechaRealizada: null, puntaje: null, estado: 'pendiente', Proveedor: { razonSocial: 'Insumos ABC' } },
    ]);
    renderPagina();
    await userEvent.click(await screen.findByText('Insumos ABC'));
    expect(await screen.findByText('Detalle proveedor')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `cd frontend && npx vitest run src/pages/proveedores/EvaluacionesListado.test.jsx`
Expected: FAIL — `Failed to resolve import "./EvaluacionesListado"`.

- [ ] **Step 3: Crear la pantalla**

`frontend/src/pages/proveedores/EvaluacionesListado.jsx`:

```jsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSnackbar } from 'notistack';
import { ClipboardCheck } from 'lucide-react';
import evaluacionProveedorService from '../../api/evaluacionProveedor.service';
import EmptyState from '../../components/common/EmptyState/EmptyState';
import DataTable from '../../components/common/Table/DataTable';
import StatusChip from '../../components/common/StatusChip/StatusChip';
import FilterDropdown from '../../components/common/FilterDropdown/FilterDropdown';

const OPCIONES_ESTADO = [
  { value: 'pendiente', label: 'Pendiente' },
  { value: 'en_proceso', label: 'En proceso' },
  { value: 'completada', label: 'Completada' },
  { value: 'vencida', label: 'Vencida' },
];

export default function EvaluacionesListado() {
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const [evaluaciones, setEvaluaciones] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [filtroEstado, setFiltroEstado] = useState('');

  async function cargarEvaluaciones() {
    setCargando(true);
    try {
      const filtros = {};
      if (filtroEstado) filtros.estado = filtroEstado;
      const data = await evaluacionProveedorService.listarTodas(filtros);
      setEvaluaciones(data);
    } catch (error) {
      setEvaluaciones([]);
      enqueueSnackbar(error?.message || 'No se pudieron cargar las evaluaciones', { variant: 'error' });
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargarEvaluaciones();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroEstado]);

  const columnas = [
    { key: 'proveedor', label: 'Proveedor', render: (_, fila) => fila.Proveedor?.razonSocial || '—' },
    { key: 'periodo', label: 'Periodo' },
    { key: 'fechaProgramada', label: 'Fecha programada' },
    { key: 'fechaRealizada', label: 'Fecha realizada', render: (valor) => valor || '—' },
    { key: 'puntaje', label: 'Puntaje', render: (valor) => (valor != null ? valor : '—') },
    { key: 'estado', label: 'Estado', render: (valor) => <StatusChip status={valor} /> },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h2 className="text-xl font-display font-semibold text-slate-800 dark:text-slate-100">Evaluaciones de proveedores</h2>
      </div>

      <div className="flex flex-wrap gap-3 mb-6">
        <FilterDropdown label="Estado" options={OPCIONES_ESTADO} value={filtroEstado} onChange={setFiltroEstado} placeholder="Todos los estados" />
      </div>

      {!cargando && evaluaciones.length === 0 && (
        <EmptyState icon={ClipboardCheck} title="Sin evaluaciones todavía" description="Las evaluaciones aparecerán aquí a medida que se programen o se generen automáticamente." />
      )}

      {evaluaciones.length > 0 && (
        <DataTable
          columns={columnas}
          data={evaluaciones}
          loading={cargando}
          emptyMessage="Sin evaluaciones todavía"
          onRowClick={(evaluacion) => navigate(`/proveedores/${evaluacion.proveedorId}`)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `cd frontend && npx vitest run src/pages/proveedores/EvaluacionesListado.test.jsx`
Expected: PASS (3/3 tests).

- [ ] **Step 5: Montar la ruta en `App.jsx`**

Agregar el import junto a los demás de `pages/proveedores`:

```js
import EvaluacionesListado from './pages/proveedores/EvaluacionesListado';
```

Agregar la ruta, después del bloque `<Route path="/proveedores/:id" ...>` (después de su cierre `</Route>`... en este archivo cada `<Route>` se cierra con `/>` tras el `element={...}`, así que se agrega inmediatamente después del `/>` de esa ruta):

```jsx
                <Route
                  path="/proveedores/evaluaciones"
                  element={
                    <PermissionRoute modulo="proveedores" accion="evaluar">
                      <EvaluacionesListado />
                    </PermissionRoute>
                  }
                />
```

- [ ] **Step 6: Verificar manualmente que ambas rutas de `/proveedores` resuelven correctamente**

Run: `cd frontend && npm test` (la suite completa, incluyendo `App.test.jsx` si existe, y todos los archivos ya existentes de `proveedores`).
Expected: PASS (todos los tests, sin regresiones).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/proveedores/EvaluacionesListado.jsx frontend/src/pages/proveedores/EvaluacionesListado.test.jsx frontend/src/App.jsx
git commit -m "feat(proveedores): listado transversal de evaluaciones en /proveedores/evaluaciones"
```
