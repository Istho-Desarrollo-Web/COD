# Solicitudes/Compras (ciclo 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the backend routes/controllers and frontend pages for the Solicitudes/Compras module (Solicitud → cotización → aprobación → confirmación), connecting the data model and `resolverNivelAprobacion()` that already exist but have no real routes or screens.

**Architecture:** Three sub-resources under `/solicitudes` (Solicitud itself, `Cotizacion`, and a new `SolicitudComentario`), each with its own controller file but mounted from a single `solicitud.routes.js`, mirroring the existing `proveedor.routes.js` + `proveedorDocumento.controller.js` split. A new `solicitudAprobacion.service.js` resolves the approval level from the selected cotización (monto + proveedor criticidad) and creates the pending `SolicitudAprobacion`, mirroring `proveedorAprobacion.service.js`. Frontend follows the `ProveedoresListado.jsx`/`ProveedorDetalle.jsx` pattern exactly (listado with filters + create modal, detalle with role="tablist" tabs).

**Tech Stack:** Express + Sequelize (MySQL) backend, Jest + supertest integration tests; React (Vite) + react-hook-form frontend, Vitest + Testing Library + axios-mock-adapter.

## Global Constraints

- Ciclo cubre únicamente Solicitud → cotización → aprobación → confirmación. Factura/pago (estado `cerrada`) y evaluación de proveedores quedan fuera — no construir nada para ellos.
- Una Solicitud nace directamente en `estado: 'cotizando'` — no hay etapa "borrador" editable en este ciclo, aunque el valor sigue en el ENUM.
- Un único nivel de aprobación por Solicitud — `resolverNivelAprobacion()` resuelve UNA fila, sin cadenas multi-nivel.
- `aprobador_area` solo puede aprobar/rechazar cuando `Usuario.areaId === Solicitud.areaSolicitanteId`; `aprobador_ejecutivo` no tiene restricción de área.
- Visibilidad de `GET /solicitudes`: si el usuario NO tiene ninguno de los roles `gestor_compras`/`aprobador_area`/`aprobador_ejecutivo`, el listado se filtra por `solicitanteUsuarioId === req.user.id` (cubre `solicitante` y también `gestor_documental`, que tiene `solicitudes:ver` pero no está en la lista de roles con visibilidad amplia — ver Nota de implementación en la Tarea 3).
- La resolución del nivel de aprobación usa **el monto de la Cotizacion seleccionada** (`Cotizacion.monto`) y la criticidad de su Proveedor vinculado (si tiene) — nunca `Solicitud.montoEstimado`, que es solo informativo.
- `codigo` de una Solicitud se genera en el backend: `SOL-<año actual>-<id autoincremental>` — el cliente nunca lo provee.
- Comentarios (`SolicitudComentario`) son append-only — sin edición ni borrado en este ciclo.
- Sin cambios al catálogo de permisos (`solicitudes:[ver,crear,comentar,cotizar,aprobar,confirmar,exportar]` ya existe desde el refactor de roles). **Una excepción puntual al seed**: la matriz `PERMISOS_POR_ROL` de `seedRolesPermisos.js` hoy NO incluye `'confirmar'` en `gestor_compras.solicitudes` (solo lo tienen los dos roles aprobadores) — esto contradice el Objetivo 5 del spec ("gestor_compras cierra el ciclo..."), confirmado explícitamente vía AskUserQuestion durante el brainstorming. Se corrige en la Tarea 3.
- Toda mutación (Solicitud, Cotizacion, SolicitudAprobacion, SolicitudComentario) registra en `Auditoria`, igual que el resto del sistema.
- Fuera de alcance, no construir: exportación (`solicitudes:exportar`), Formularios/`PlantillaFormulario` (`Solicitud.plantillaOrigenId` queda sin usar), corregir el gap de permisos de `auditor` (preexistente, anotado en el spec, no se toca aquí).

---

## File Structure

**Backend — nuevos:**
- `server/src/migrations/20260722100000-crear-solicitud-comentarios.js` — tabla `solicitud_comentarios`.
- `server/src/models/SolicitudComentario.js` — modelo del comentario.
- `server/src/services/solicitudAprobacion.service.js` — resuelve el nivel y crea la `SolicitudAprobacion` pendiente.
- `server/src/controllers/solicitud.controller.js` — CRUD de Solicitud + transiciones de estado + catálogo de tipos.
- `server/src/routes/solicitud.routes.js` — monta `solicitud.controller.js`, `cotizacion.controller.js` y `solicitudComentario.controller.js`.
- `server/src/controllers/cotizacion.controller.js` — sub-recurso de cotizaciones.
- `server/src/controllers/solicitudComentario.controller.js` — sub-recurso de comentarios.
- `server/tests/unit/solicitudAprobacion.service.test.js`
- `server/tests/integration/solicitud.routes.test.js`
- `server/tests/integration/cotizacion.routes.test.js`
- `server/tests/integration/solicitudComentario.routes.test.js`

**Backend — modificados:**
- `server/src/models/index.js` — registra `SolicitudComentario` y sus asociaciones.
- `server/src/routes/index.js` — monta `/solicitudes`.
- `server/src/scripts/seedRolesPermisos.js` — agrega `'confirmar'` a `gestor_compras.solicitudes` (ver Global Constraints).
- `server/tests/integration/solicitud.test.js` — agrega un test de asociación para `SolicitudComentario`.

**Frontend — nuevos:**
- `frontend/src/api/solicitud.service.js`
- `frontend/src/api/solicitud.service.test.js`
- `frontend/src/api/cotizacion.service.js`
- `frontend/src/api/cotizacion.service.test.js`
- `frontend/src/api/solicitudComentario.service.js`
- `frontend/src/api/solicitudComentario.service.test.js`
- `frontend/src/pages/solicitudes/SolicitudesListado.jsx`
- `frontend/src/pages/solicitudes/SolicitudesListado.test.jsx`
- `frontend/src/pages/solicitudes/SolicitudDetalle.jsx`
- `frontend/src/pages/solicitudes/SolicitudDetalle.test.jsx`

**Frontend — modificados:**
- `frontend/src/App.jsx` — reemplaza el placeholder `ProximamentePage` de `/solicitudes` y agrega `/solicitudes/:id`.

---

## Task 1: Modelo `SolicitudComentario` + migración + asociaciones

**Files:**
- Create: `server/src/migrations/20260722100000-crear-solicitud-comentarios.js`
- Create: `server/src/models/SolicitudComentario.js`
- Modify: `server/src/models/index.js`
- Modify: `server/tests/integration/solicitud.test.js`

**Interfaces:**
- Produces: modelo `SolicitudComentario` exportado desde `server/src/models/index.js`, campos `{ id, solicitudId, usuarioId, texto, createdAt, updatedAt }`; asociaciones `Solicitud.hasMany(SolicitudComentario)` / `SolicitudComentario.belongsTo(Solicitud)` y `Usuario.hasMany(SolicitudComentario)` / `SolicitudComentario.belongsTo(Usuario)` (alias por defecto `Usuario`, sin `as`).

- [ ] **Step 1: Escribir el test de asociación (falla primero)**

Añade este `describe` al final de `server/tests/integration/solicitud.test.js` (después del `describe('Solicitud workflow tables', ...)` existente, sin tocar lo que ya hay):

```js
describe('SolicitudComentario', () => {
  it('vincula un comentario a una Solicitud y a un Usuario', async () => {
    const area = await Area.create({ nombre: 'Comentario Modelo', codigo: `COMENTMODELO${Date.now()}` });
    const tipo = await TipoSolicitud.findOne({ where: { nombre: 'compra' } });
    const solicitante = await Usuario.unscoped().findOne({ where: { username: 'admin' } });

    const solicitud = await Solicitud.create({
      codigo: `SOL-COMENT-${Date.now()}`, tipoSolicitudId: tipo.id, areaSolicitanteId: area.id,
      solicitanteUsuarioId: solicitante.id, descripcion: 'Solicitud para comentar', estado: 'cotizando',
    });

    const comentario = await SolicitudComentario.create({ solicitudId: solicitud.id, usuarioId: solicitante.id, texto: 'Primer comentario' });

    expect(comentario.solicitudId).toBe(solicitud.id);
    expect(comentario.usuarioId).toBe(solicitante.id);

    const conSolicitud = await SolicitudComentario.findByPk(comentario.id, { include: Solicitud });
    expect(conSolicitud.Solicitud.id).toBe(solicitud.id);
  });
});
```

Actualiza la línea de imports al inicio del archivo para incluir `SolicitudComentario`:

```js
const { Area, TipoSolicitud, NivelAprobacion, Solicitud, Cotizacion, SolicitudAprobacion, Usuario, Rol, Proveedor, SolicitudComentario } = require('../../src/models');
```

- [ ] **Step 2: Ejecutar y confirmar que falla**

Run: `cd server && npx jest tests/integration/solicitud.test.js -t "SolicitudComentario"`
Expected: FAIL — `SolicitudComentario` es `undefined` (no existe en `models/index.js` todavía) o la tabla `solicitud_comentarios` no existe.

- [ ] **Step 3: Crear la migración**

`server/src/migrations/20260722100000-crear-solicitud-comentarios.js`:

```js
module.exports = {
  up: async ({ context: queryInterface }) => {
    const { DataTypes } = require('sequelize');

    await queryInterface.createTable('solicitud_comentarios', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      solicitud_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'solicitudes', key: 'id' } },
      usuario_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'usuarios', key: 'id' } },
      texto: { type: DataTypes.TEXT, allowNull: false },
      created_at: { type: DataTypes.DATE, allowNull: false },
      updated_at: { type: DataTypes.DATE, allowNull: false },
    });
  },
  down: async ({ context: queryInterface }) => {
    await queryInterface.dropTable('solicitud_comentarios');
  },
};
```

- [ ] **Step 4: Crear el modelo**

`server/src/models/SolicitudComentario.js`:

```js
const { DataTypes } = require('sequelize');

module.exports = (sequelize) =>
  sequelize.define(
    'SolicitudComentario',
    {
      solicitudId: { type: DataTypes.INTEGER, allowNull: false },
      usuarioId: { type: DataTypes.INTEGER, allowNull: false },
      texto: { type: DataTypes.TEXT, allowNull: false },
    },
    { tableName: 'solicitud_comentarios', underscored: true }
  );
```

- [ ] **Step 5: Registrar el modelo y sus asociaciones en `models/index.js`**

Añade el require junto a los demás modelos (después de `const UsuarioProveedor = require('./UsuarioProveedor')(sequelize);`):

```js
const SolicitudComentario = require('./SolicitudComentario')(sequelize);
```

Añade las asociaciones junto a las de `Solicitud`/`Cotizacion` (después de `SolicitudAprobacion.belongsTo(NivelAprobacion, { foreignKey: 'nivelAprobacionId' });`):

```js
Solicitud.hasMany(SolicitudComentario, { foreignKey: 'solicitudId' });
SolicitudComentario.belongsTo(Solicitud, { foreignKey: 'solicitudId' });
Usuario.hasMany(SolicitudComentario, { foreignKey: 'usuarioId' });
SolicitudComentario.belongsTo(Usuario, { foreignKey: 'usuarioId' });
```

Añade `SolicitudComentario` al `module.exports` (junto a `Solicitud, Cotizacion, SolicitudAprobacion,`):

```js
module.exports = {
  sequelize, Usuario, Rol, Permiso, RolPermiso, UsuarioRol, UsuarioProveedor, Auditoria,
  Area, Carpeta, TipoDocumento, Documento, DocumentoVersionHistorial, PlantillaFormulario,
  TipoSolicitud, NivelAprobacion, Solicitud, Cotizacion, SolicitudAprobacion, SolicitudComentario,
  Proveedor, RequisitoProveedor, ProveedorDocumento, EvaluacionProveedor,
  LogServidor,
};
```

- [ ] **Step 6: Ejecutar y confirmar que pasa**

Run: `cd server && npx jest tests/integration/solicitud.test.js`
Expected: PASS (todos los tests del archivo, incluidos los 2 preexistentes y el nuevo).

- [ ] **Step 7: Commit**

```bash
git add server/src/migrations/20260722100000-crear-solicitud-comentarios.js server/src/models/SolicitudComentario.js server/src/models/index.js server/tests/integration/solicitud.test.js
git commit -m "feat(solicitudes): modelo SolicitudComentario y migracion"
```

---

## Task 2: Servicio `solicitudAprobacion.service.js`

**Files:**
- Create: `server/src/services/solicitudAprobacion.service.js`
- Create: `server/tests/unit/solicitudAprobacion.service.test.js`

**Interfaces:**
- Consumes: `resolverNivelAprobacion(tipoSolicitudId, monto, criticidad)` de `server/src/services/nivelAprobacion.service.js` (ya existe, sin cambios); modelo `SolicitudComentario` no se usa aquí — solo `SolicitudAprobacion`, `Solicitud`, `Cotizacion` (ya existentes).
- Produces: `enviarAprobacion(solicitud, cotizacionSeleccionada)` → `Promise<{ nivel: NivelAprobacion | null, aprobacion?: SolicitudAprobacion }>`. Si `nivel` es `null`, no crea nada y no actualiza `solicitud`. Si `nivel` existe: crea `SolicitudAprobacion` (`estado: 'pendiente'`, `orden: 1`) y actualiza `solicitud.nivelAprobacionId` + `solicitud.estado = 'en_aprobacion'`.

- [ ] **Step 1: Escribir los tests unitarios (fallan primero)**

`server/tests/unit/solicitudAprobacion.service.test.js`:

```js
const { sequelize } = require('../../src/config/database');
const { createMigrator } = require('../../src/config/migrator');
const { Area, TipoSolicitud, Solicitud, Cotizacion, Usuario, Proveedor } = require('../../src/models');
const seedNivelesAprobacion = require('../../src/scripts/seedNivelesAprobacion');
const { enviarAprobacion } = require('../../src/services/solicitudAprobacion.service');

let area;
let tipo;
let solicitante;

beforeAll(async () => {
  await sequelize.authenticate();
  await createMigrator(sequelize).up();
  await seedNivelesAprobacion();
  area = await Area.create({ nombre: 'Servicio Aprobacion Solicitud', codigo: `SRVAPRSOL${Date.now()}` });
  tipo = await TipoSolicitud.findOne({ where: { nombre: 'compra' } });
  solicitante = await Usuario.unscoped().findOne({ where: { username: 'admin' } });
});

afterAll(async () => {
  await sequelize.close();
});

async function crearSolicitud(montoEstimado = 100000) {
  return Solicitud.create({
    codigo: `SOL-TEST-${Date.now()}${Math.random()}`,
    tipoSolicitudId: tipo.id, areaSolicitanteId: area.id, solicitanteUsuarioId: solicitante.id,
    descripcion: 'Solicitud de prueba', montoEstimado, estado: 'cotizando',
  });
}

describe('solicitudAprobacion.service', () => {
  it('resuelve el nivel por el monto de la cotización seleccionada, no por montoEstimado', async () => {
    const solicitud = await crearSolicitud(50_000_000);
    const cotizacion = await Cotizacion.create({ solicitudId: solicitud.id, monto: 500_000, seleccionada: true });

    const { nivel, aprobacion } = await enviarAprobacion(solicitud, cotizacion);

    expect(nivel.rolAprobador).toBe('aprobador_area');
    expect(aprobacion.estado).toBe('pendiente');
    expect(aprobacion.nivelAprobacionId).toBe(nivel.id);

    const solicitudActualizada = await Solicitud.findByPk(solicitud.id);
    expect(solicitudActualizada.estado).toBe('en_aprobacion');
    expect(solicitudActualizada.nivelAprobacionId).toBe(nivel.id);
  });

  it('escala a aprobador_ejecutivo cuando la cotización seleccionada tiene un proveedor crítico, sin importar el monto', async () => {
    const proveedorCritico = await Proveedor.create({
      tipo: 'proveedor', documentoIdentificacion: `960${Date.now()}`, razonSocial: 'Proveedor Crítico SAS',
      criticidad: 'critico', areaSolicitanteId: area.id,
    });
    const solicitud = await crearSolicitud(300_000);
    const cotizacion = await Cotizacion.create({
      solicitudId: solicitud.id, proveedorId: proveedorCritico.id, monto: 300_000, seleccionada: true,
    });
    const cotizacionConProveedor = await Cotizacion.findByPk(cotizacion.id, { include: Proveedor });

    const { nivel } = await enviarAprobacion(solicitud, cotizacionConProveedor);

    expect(nivel.rolAprobador).toBe('aprobador_ejecutivo');
  });

  it('resuelve solo por monto cuando la cotización seleccionada no tiene proveedor vinculado', async () => {
    const solicitud = await crearSolicitud(300_000);
    const cotizacion = await Cotizacion.create({ solicitudId: solicitud.id, monto: 15_000_000, seleccionada: true });

    const { nivel } = await enviarAprobacion(solicitud, cotizacion);

    expect(nivel.rolAprobador).toBe('aprobador_ejecutivo');
  });

  it('devuelve nivel: null cuando no hay un NivelAprobacion configurado para el tipo/monto, sin tocar la solicitud', async () => {
    const otroTipo = await TipoSolicitud.create({ nombre: `tipo_sin_niveles_${Date.now()}` });
    const solicitud = await Solicitud.create({
      codigo: `SOL-TEST-SINNIVEL-${Date.now()}`,
      tipoSolicitudId: otroTipo.id, areaSolicitanteId: area.id, solicitanteUsuarioId: solicitante.id,
      descripcion: 'Sin niveles configurados', estado: 'cotizando',
    });
    const cotizacion = await Cotizacion.create({ solicitudId: solicitud.id, monto: 500_000, seleccionada: true });

    const resultado = await enviarAprobacion(solicitud, cotizacion);

    expect(resultado.nivel).toBeNull();
    const solicitudSinCambios = await Solicitud.findByPk(solicitud.id);
    expect(solicitudSinCambios.estado).toBe('cotizando');
  });
});
```

- [ ] **Step 2: Ejecutar y confirmar que falla**

Run: `cd server && npx jest tests/unit/solicitudAprobacion.service.test.js`
Expected: FAIL — `Cannot find module '../../src/services/solicitudAprobacion.service'`.

- [ ] **Step 3: Crear el servicio**

`server/src/services/solicitudAprobacion.service.js`:

```js
async function enviarAprobacion(solicitud, cotizacionSeleccionada) {
  const { resolverNivelAprobacion } = require('./nivelAprobacion.service');
  const criticidad = cotizacionSeleccionada.Proveedor?.criticidad;
  const nivel = await resolverNivelAprobacion(
    solicitud.tipoSolicitudId,
    cotizacionSeleccionada.monto,
    criticidad
  );
  if (!nivel) return { nivel: null };

  const { SolicitudAprobacion } = require('../models');
  const aprobacion = await SolicitudAprobacion.create({
    solicitudId: solicitud.id,
    nivelAprobacionId: nivel.id,
    estado: 'pendiente',
    orden: 1,
  });
  await solicitud.update({ nivelAprobacionId: nivel.id, estado: 'en_aprobacion' });
  return { nivel, aprobacion };
}

module.exports = { enviarAprobacion };
```

- [ ] **Step 4: Ejecutar y confirmar que pasa**

Run: `cd server && npx jest tests/unit/solicitudAprobacion.service.test.js`
Expected: PASS (4/4).

- [ ] **Step 5: Commit**

```bash
git add server/src/services/solicitudAprobacion.service.js server/tests/unit/solicitudAprobacion.service.test.js
git commit -m "feat(solicitudes): servicio solicitudAprobacion, resuelve nivel por cotizacion seleccionada"
```

---

## Task 3: `solicitud.controller.js` + `solicitud.routes.js` (CRUD, transiciones de estado, catálogo de tipos)

**Files:**
- Create: `server/src/controllers/solicitud.controller.js`
- Create: `server/src/routes/solicitud.routes.js`
- Modify: `server/src/routes/index.js`
- Create: `server/tests/integration/solicitud.routes.test.js`

**Interfaces:**
- Consumes: `enviarAprobacion(solicitud, cotizacionSeleccionada)` de `../services/solicitudAprobacion.service.js` (Tarea 2); `guardarArchivo(file, subdirectorio)` de `../services/almacenamiento.service.js` (ya existe); modelos `Solicitud, Cotizacion, SolicitudAprobacion, NivelAprobacion, TipoSolicitud, Proveedor, Auditoria`.
- Produces: rutas montadas bajo `/api/v1/solicitudes` — `GET /`, `POST /`, `GET /tipos`, `GET /:id`, `POST /:id/enviar-aprobacion`, `POST /:id/aprobar`, `POST /:id/rechazar`, `POST /:id/confirmar`, `POST /:id/cancelar`. El router de esta tarea también reserva (sin implementar todavía) los montajes de `cotizacionController` y `comentarioController` que llegan en las Tareas 4 y 5 — de momento se referencian con controladores vacíos placeholder-free: la Tarea 3 monta SOLO las rutas de Solicitud; las Tareas 4 y 5 agregan sus propias líneas al mismo archivo `solicitud.routes.js`.

**Nota de implementación (visibilidad):** el spec dice literalmente "el resto de roles con `solicitudes:ver` (`gestor_compras`, `aprobador_area`, `aprobador_ejecutivo`) ven todas las solicitudes" — es una lista exhaustiva de 3 roles, no "todo rol que no sea solicitante". `gestor_documental` también tiene `solicitudes:ver` en el seed pero no aparece en esa lista, así que cae en la rama de "filtra por dueño" junto con `solicitante`. Esto es intencional y se implementa con una constante `ROLES_VISIBILIDAD_AMPLIA`.

**Nota de implementación (catálogo de tipos):** el spec no menciona explícitamente un endpoint para listar `TipoSolicitud`, pero el frontend necesita conocer los `id` reales para armar el desplegable de "Tipo de solicitud" al crear una Solicitud (los nombres `'compra'`/`'contratacion_servicio'` no bastan, `tipoSolicitudId` es un FK numérico). Se agrega `GET /solicitudes/tipos` (gateado por `solicitudes:ver`, mismo criterio que `GET /requisitos-proveedor`), registrado **antes** de `GET /:id` en el router para que Express no lo confunda con `:id`.

- [ ] **Step 1: Escribir el test de integración (falla primero)**

`server/tests/integration/solicitud.routes.test.js`:

```js
const request = require('supertest');
const path = require('path');
const bcrypt = require('bcryptjs');
const { sequelize } = require('../../src/config/database');
const { createMigrator } = require('../../src/config/migrator');
const seedRolesPermisos = require('../../src/scripts/seedRolesPermisos');
const seedNivelesAprobacion = require('../../src/scripts/seedNivelesAprobacion');
const { Rol, Usuario, Area, TipoSolicitud, Proveedor } = require('../../src/models');
const { invalidarCachePermisos } = require('../../src/middlewares/roles');
const { app } = require('../../server');

let adminToken;
let gestorComprasToken;
let solicitanteToken;
let solicitanteId;
let otroSolicitanteToken;
let aprobadorAreaToken;
let aprobadorAreaOtraToken;
let aprobadorEjecutivoToken;
let area;
let otraArea;
let tipoCompra;

async function crearUsuarioConRol(rolNombre, prefijo, areaId = null) {
  const rol = await Rol.findOne({ where: { nombre: rolNombre } });
  const username = `${prefijo}_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
  const usuario = await Usuario.create({
    username, email: `${username}@istho.com.co`,
    passwordHash: await bcrypt.hash('Clave123!', 10),
    nombre: prefijo, apellido: 'Prueba', areaId,
  });
  await usuario.setRoles([rol.id]);
  const login = await request(app).post('/api/v1/auth/login').send({ username, password: 'Clave123!' });
  return { usuario, token: login.body.data.token };
}

beforeAll(async () => {
  await sequelize.authenticate();
  await createMigrator(sequelize).up();
  await seedRolesPermisos();
  await seedNivelesAprobacion();
  invalidarCachePermisos();

  area = await Area.create({ nombre: 'Compras Solicitudes', codigo: `COMPRASSOL${Date.now()}` });
  otraArea = await Area.create({ nombre: 'Otra Area Solicitudes', codigo: `OTRAAREASOL${Date.now()}` });
  tipoCompra = await TipoSolicitud.findOne({ where: { nombre: 'compra' } });

  const adminLogin = await request(app)
    .post('/api/v1/auth/login')
    .send({ username: 'admin', password: process.env.SEED_PASSWORD_ADMIN || 'CambiarAhora123!' });
  adminToken = adminLogin.body.data.token;

  const gestorCompras = await crearUsuarioConRol('gestor_compras', 'gestor_compras_sol');
  gestorComprasToken = gestorCompras.token;

  const solicitante = await crearUsuarioConRol('solicitante', 'solicitante_sol', area.id);
  solicitanteToken = solicitante.token;
  solicitanteId = solicitante.usuario.id;

  const otroSolicitante = await crearUsuarioConRol('solicitante', 'otro_solicitante_sol', area.id);
  otroSolicitanteToken = otroSolicitante.token;

  const aprobadorArea = await crearUsuarioConRol('aprobador_area', 'aprobador_area_sol', area.id);
  aprobadorAreaToken = aprobadorArea.token;

  const aprobadorAreaOtra = await crearUsuarioConRol('aprobador_area', 'aprobador_area_otra_sol', otraArea.id);
  aprobadorAreaOtraToken = aprobadorAreaOtra.token;

  const aprobadorEjecutivo = await crearUsuarioConRol('aprobador_ejecutivo', 'aprobador_ejecutivo_sol');
  aprobadorEjecutivoToken = aprobadorEjecutivo.token;
});

afterAll(async () => {
  await sequelize.close();
});

async function crearSolicitud(token, overrides = {}) {
  const datos = {
    tipoSolicitudId: tipoCompra.id, areaSolicitanteId: area.id,
    descripcion: 'Compra de equipos de oficina', montoEstimado: 800000,
    ...overrides,
  };
  return request(app).post('/api/v1/solicitudes').set('Authorization', `Bearer ${token}`).send(datos);
}

async function crearYEnviarAAprobacion(monto = 500000) {
  const creada = await crearSolicitud(solicitanteToken);
  const solicitudId = creada.body.data.id;
  const cotizacionRes = await request(app)
    .post(`/api/v1/solicitudes/${solicitudId}/cotizaciones`)
    .set('Authorization', `Bearer ${gestorComprasToken}`)
    .send({ monto });
  const cotizacionId = cotizacionRes.body.data.id;
  await request(app)
    .post(`/api/v1/solicitudes/${solicitudId}/cotizaciones/${cotizacionId}/seleccionar`)
    .set('Authorization', `Bearer ${gestorComprasToken}`);
  const envioRes = await request(app)
    .post(`/api/v1/solicitudes/${solicitudId}/enviar-aprobacion`)
    .set('Authorization', `Bearer ${gestorComprasToken}`);
  return { solicitudId, envioRes };
}

async function crearYEnviarYAprobar(monto = 500000) {
  const { solicitudId } = await crearYEnviarAAprobacion(monto);
  await request(app).post(`/api/v1/solicitudes/${solicitudId}/aprobar`).set('Authorization', `Bearer ${aprobadorAreaToken}`);
  return { solicitudId };
}

describe('Solicitudes API — catálogo de tipos', () => {
  it('lista los tipos de solicitud activos', async () => {
    const res = await request(app).get('/api/v1/solicitudes/tipos').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.some((t) => t.nombre === 'compra')).toBe(true);
  });
});

describe('Solicitudes API — CRUD y visibilidad', () => {
  it('crea una solicitud en estado cotizando, con codigo autogenerado SOL-<año>-<id>', async () => {
    const res = await crearSolicitud(solicitanteToken);
    expect(res.status).toBe(201);
    expect(res.body.data.estado).toBe('cotizando');
    expect(res.body.data.solicitanteUsuarioId).toBe(solicitanteId);
    expect(res.body.data.codigo).toMatch(new RegExp(`^SOL-${new Date().getFullYear()}-\\d+$`));
  });

  it('returns 400 when descripcion is missing', async () => {
    const res = await crearSolicitud(solicitanteToken, { descripcion: undefined });
    expect(res.status).toBe(400);
  });

  it('returns 403 when a role without solicitudes:crear tries to create one', async () => {
    const res = await crearSolicitud(aprobadorAreaToken);
    expect(res.status).toBe(403);
  });

  it('un solicitante solo ve sus propias solicitudes', async () => {
    await crearSolicitud(solicitanteToken);
    await crearSolicitud(otroSolicitanteToken);

    const res = await request(app).get('/api/v1/solicitudes').set('Authorization', `Bearer ${solicitanteToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data.every((s) => s.solicitanteUsuarioId === solicitanteId)).toBe(true);
  });

  it('gestor_compras ve todas las solicitudes, sin filtro de dueño', async () => {
    const creada = await crearSolicitud(otroSolicitanteToken);
    const res = await request(app).get('/api/v1/solicitudes').set('Authorization', `Bearer ${gestorComprasToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.some((s) => s.id === creada.body.data.id)).toBe(true);
  });

  it('filtra por estado', async () => {
    const res = await request(app).get('/api/v1/solicitudes?estado=cotizando').set('Authorization', `Bearer ${gestorComprasToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.every((s) => s.estado === 'cotizando')).toBe(true);
  });

  it('obtiene una solicitud por id', async () => {
    const creada = await crearSolicitud(solicitanteToken);
    const res = await request(app).get(`/api/v1/solicitudes/${creada.body.data.id}`).set('Authorization', `Bearer ${solicitanteToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(creada.body.data.id);
  });
});

describe('Solicitudes API — envío a aprobación, aprobar/rechazar', () => {
  it('envía a aprobación y crea una SolicitudAprobacion pendiente en aprobador_area', async () => {
    const { envioRes } = await crearYEnviarAAprobacion(500000);
    expect(envioRes.status).toBe(200);
    expect(envioRes.body.data.solicitud.estado).toBe('en_aprobacion');
    expect(envioRes.body.data.aprobacion.estado).toBe('pendiente');
  });

  it('returns 400 cuando se envía a aprobación sin ninguna cotización seleccionada', async () => {
    const creada = await crearSolicitud(solicitanteToken);
    const res = await request(app)
      .post(`/api/v1/solicitudes/${creada.body.data.id}/enviar-aprobacion`)
      .set('Authorization', `Bearer ${gestorComprasToken}`);
    expect(res.status).toBe(400);
  });

  it('aprobador_area de la misma área aprueba la solicitud', async () => {
    const { solicitudId } = await crearYEnviarAAprobacion(500000);
    const res = await request(app)
      .post(`/api/v1/solicitudes/${solicitudId}/aprobar`)
      .set('Authorization', `Bearer ${aprobadorAreaToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.estado).toBe('aprobada');
  });

  it('returns 403 cuando aprobador_area de OTRA área intenta aprobar', async () => {
    const { solicitudId } = await crearYEnviarAAprobacion(500000);
    const res = await request(app)
      .post(`/api/v1/solicitudes/${solicitudId}/aprobar`)
      .set('Authorization', `Bearer ${aprobadorAreaOtraToken}`);
    expect(res.status).toBe(403);
  });

  it('returns 403 cuando gestor_compras (sin permiso aprobar) intenta aprobar', async () => {
    const { solicitudId } = await crearYEnviarAAprobacion(500000);
    const res = await request(app)
      .post(`/api/v1/solicitudes/${solicitudId}/aprobar`)
      .set('Authorization', `Bearer ${gestorComprasToken}`);
    expect(res.status).toBe(403);
  });

  it('aprobador_ejecutivo aprueba sin restricción de área cuando la cotización escaló por criticidad crítica', async () => {
    const proveedorCritico = await Proveedor.create({
      tipo: 'proveedor', documentoIdentificacion: `970${Date.now()}`, razonSocial: 'Proveedor Crítico Solicitudes SAS',
      criticidad: 'critico', areaSolicitanteId: area.id,
    });
    const creada = await crearSolicitud(solicitanteToken);
    const solicitudId = creada.body.data.id;
    const cotizacionRes = await request(app)
      .post(`/api/v1/solicitudes/${solicitudId}/cotizaciones`)
      .set('Authorization', `Bearer ${gestorComprasToken}`)
      .send({ monto: 200000, proveedorId: proveedorCritico.id });
    await request(app)
      .post(`/api/v1/solicitudes/${solicitudId}/cotizaciones/${cotizacionRes.body.data.id}/seleccionar`)
      .set('Authorization', `Bearer ${gestorComprasToken}`);
    const envioRes = await request(app)
      .post(`/api/v1/solicitudes/${solicitudId}/enviar-aprobacion`)
      .set('Authorization', `Bearer ${gestorComprasToken}`);
    expect(envioRes.status).toBe(200);

    const aprobarRes = await request(app)
      .post(`/api/v1/solicitudes/${solicitudId}/aprobar`)
      .set('Authorization', `Bearer ${aprobadorEjecutivoToken}`);
    expect(aprobarRes.status).toBe(200);
    expect(aprobarRes.body.data.estado).toBe('aprobada');
  });

  it('rechaza una solicitud con motivo', async () => {
    const { solicitudId } = await crearYEnviarAAprobacion(500000);
    const res = await request(app)
      .post(`/api/v1/solicitudes/${solicitudId}/rechazar`)
      .set('Authorization', `Bearer ${aprobadorAreaToken}`)
      .send({ motivo: 'Presupuesto insuficiente' });
    expect(res.status).toBe(200);
    expect(res.body.data.estado).toBe('rechazada');
  });

  it('returns 400 al rechazar sin motivo', async () => {
    const { solicitudId } = await crearYEnviarAAprobacion(500000);
    const res = await request(app)
      .post(`/api/v1/solicitudes/${solicitudId}/rechazar`)
      .set('Authorization', `Bearer ${aprobadorAreaToken}`)
      .send({});
    expect(res.status).toBe(400);
  });
});

describe('Solicitudes API — confirmación', () => {
  it('confirma una solicitud aprobada subiendo número y archivo de orden formal', async () => {
    const { solicitudId } = await crearYEnviarYAprobar();
    const res = await request(app)
      .post(`/api/v1/solicitudes/${solicitudId}/confirmar`)
      .set('Authorization', `Bearer ${gestorComprasToken}`)
      .field('ordenFormalNumero', 'OF-2026-001')
      .attach('archivo', path.join(__dirname, '../fixtures/documento-prueba.pdf'));
    expect(res.status).toBe(200);
    expect(res.body.data.estado).toBe('confirmada');
    expect(res.body.data.ordenFormalNumero).toBe('OF-2026-001');
  });

  it('returns 400 cuando falta el archivo de la orden formal', async () => {
    const { solicitudId } = await crearYEnviarYAprobar();
    const res = await request(app)
      .post(`/api/v1/solicitudes/${solicitudId}/confirmar`)
      .set('Authorization', `Bearer ${gestorComprasToken}`)
      .field('ordenFormalNumero', 'OF-2026-002');
    expect(res.status).toBe(400);
  });

  it('returns 400 cuando la solicitud no está aprobada', async () => {
    const creada = await crearSolicitud(solicitanteToken);
    const res = await request(app)
      .post(`/api/v1/solicitudes/${creada.body.data.id}/confirmar`)
      .set('Authorization', `Bearer ${gestorComprasToken}`)
      .field('ordenFormalNumero', 'OF-2026-003')
      .attach('archivo', path.join(__dirname, '../fixtures/documento-prueba.pdf'));
    expect(res.status).toBe(400);
  });
});

describe('Solicitudes API — cancelación', () => {
  it('el dueño cancela su solicitud en cotizando', async () => {
    const creada = await crearSolicitud(solicitanteToken);
    const res = await request(app)
      .post(`/api/v1/solicitudes/${creada.body.data.id}/cancelar`)
      .set('Authorization', `Bearer ${solicitanteToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.estado).toBe('cancelada');
  });

  it('el dueño cancela su solicitud en_aprobacion', async () => {
    const { solicitudId } = await crearYEnviarAAprobacion(500000);
    const res = await request(app)
      .post(`/api/v1/solicitudes/${solicitudId}/cancelar`)
      .set('Authorization', `Bearer ${solicitanteToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.estado).toBe('cancelada');
  });

  it('returns 403 cuando otro usuario intenta cancelar una solicitud que no es suya', async () => {
    const creada = await crearSolicitud(solicitanteToken);
    const res = await request(app)
      .post(`/api/v1/solicitudes/${creada.body.data.id}/cancelar`)
      .set('Authorization', `Bearer ${otroSolicitanteToken}`);
    expect(res.status).toBe(403);
  });

  it('returns 400 cuando se intenta cancelar una solicitud ya confirmada', async () => {
    const { solicitudId } = await crearYEnviarYAprobar();
    await request(app)
      .post(`/api/v1/solicitudes/${solicitudId}/confirmar`)
      .set('Authorization', `Bearer ${gestorComprasToken}`)
      .field('ordenFormalNumero', 'OF-2026-004')
      .attach('archivo', path.join(__dirname, '../fixtures/documento-prueba.pdf'));

    const res = await request(app)
      .post(`/api/v1/solicitudes/${solicitudId}/cancelar`)
      .set('Authorization', `Bearer ${solicitanteToken}`);
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Ejecutar y confirmar que falla**

Run: `cd server && npx jest tests/integration/solicitud.routes.test.js`
Expected: FAIL — `Cannot GET /api/v1/solicitudes/...` (la ruta no existe todavía) o 404, ya que `POST /api/v1/solicitudes/${solicitudId}/cotizaciones` (Tarea 4) tampoco existe aún — es esperable que este test falle en varios puntos hasta completar las Tareas 4 y 5. Para esta tarea, verifica en particular que el primer bloque (`catálogo de tipos`) y el de `CRUD y visibilidad` fallan por ausencia de ruta.

- [ ] **Step 3: Corregir el seed — `gestor_compras` necesita `solicitudes:confirmar`**

El spec (Objetivo 5, confirmado vía AskUserQuestion durante el brainstorming) asigna la confirmación a `gestor_compras`, pero la matriz `PERMISOS_POR_ROL` de `server/src/scripts/seedRolesPermisos.js` (del refactor de roles previo) solo le dio `['ver', 'crear', 'comentar', 'cotizar']` — sin `'confirmar'`. Sin este fix, la ruta `POST /:id/confirmar` (que se gatea con `solicitudes:confirmar`) sería inalcanzable para el único rol que el spec dice que debe usarla.

En `server/src/scripts/seedRolesPermisos.js`, cambia:

```js
  gestor_compras: {
    inicio: ['ver'], proveedores: ['ver', 'gestionar'],
    solicitudes: ['ver', 'crear', 'comentar', 'cotizar'],
    perfil: ['ver', 'cambiar_password'],
  },
```

por:

```js
  gestor_compras: {
    inicio: ['ver'], proveedores: ['ver', 'gestionar'],
    solicitudes: ['ver', 'crear', 'comentar', 'cotizar', 'confirmar'],
    perfil: ['ver', 'cambiar_password'],
  },
```

No hace falta ninguna migración: `seedRolesPermisos()` ya aplica esta matriz vía `RolPermiso.upsert({ rolId, modulo, acciones })` (no `findOrCreate`), así que corre correctamente sobre bases de datos donde el seed ya se había ejecutado antes con la matriz vieja — el mismo mecanismo ya usado para los cambios de matriz de los Pasos anteriores del refactor de roles.

- [ ] **Step 4: Crear el controlador**

`server/src/controllers/solicitud.controller.js`:

```js
const { Solicitud, Cotizacion, SolicitudAprobacion, NivelAprobacion, TipoSolicitud, Proveedor, Auditoria } = require('../models');
const { success, created, notFound, badRequest, forbidden } = require('../utils/responses');
const { guardarArchivo } = require('../services/almacenamiento.service');
const { enviarAprobacion: resolverEnvioAprobacion } = require('../services/solicitudAprobacion.service');

// Lista EXHAUSTIVA de roles con visibilidad ampliada (ven todas las
// solicitudes) — ver la Nota de implementación del plan. Cualquier otro rol
// con solicitudes:ver (solicitante, gestor_documental) solo ve las propias.
const ROLES_VISIBILIDAD_AMPLIA = ['gestor_compras', 'aprobador_area', 'aprobador_ejecutivo'];

function tieneVisibilidadAmplia(roles) {
  return (roles || []).some((rol) => ROLES_VISIBILIDAD_AMPLIA.includes(rol.nombre));
}

async function listarTipos(req, res) {
  const tipos = await TipoSolicitud.findAll({ where: { activo: true }, order: [['nombre', 'ASC']] });
  return success(res, tipos);
}

async function listar(req, res) {
  const { estado, tipoSolicitudId } = req.query;
  const where = {};
  if (estado) where.estado = estado;
  if (tipoSolicitudId) where.tipoSolicitudId = tipoSolicitudId;
  if (!tieneVisibilidadAmplia(req.user.roles)) {
    where.solicitanteUsuarioId = req.user.id;
  }

  const solicitudes = await Solicitud.findAll({ where, order: [['createdAt', 'DESC']] });
  return success(res, solicitudes);
}

async function obtener(req, res) {
  const solicitud = await Solicitud.findByPk(req.params.id);
  if (!solicitud) return notFound(res, 'Solicitud no encontrada');
  return success(res, solicitud);
}

async function crear(req, res) {
  const { tipoSolicitudId, areaSolicitanteId, descripcion, montoEstimado } = req.body;
  if (!tipoSolicitudId || !areaSolicitanteId || !descripcion) {
    return badRequest(res, 'tipoSolicitudId, areaSolicitanteId y descripcion son obligatorios');
  }

  // codigo depende del id autoincremental, que solo se conoce después del
  // insert — se crea con un valor temporal único (nunca visible al cliente)
  // y se corrige con un update inmediato, dentro de la misma request.
  const solicitud = await Solicitud.create({
    codigo: `TMP-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
    tipoSolicitudId, areaSolicitanteId, descripcion,
    montoEstimado: montoEstimado || null,
    solicitanteUsuarioId: req.user.id,
    estado: 'cotizando',
  });
  await solicitud.update({ codigo: `SOL-${new Date().getFullYear()}-${solicitud.id}` });

  await Auditoria.registrar({
    tabla: 'solicitudes', registroId: solicitud.id, accion: 'crear',
    usuarioId: req.user.id, usuarioNombre: req.user.nombreCompleto, datosNuevos: solicitud.toJSON(),
  });

  return created(res, 'Solicitud creada', solicitud);
}

async function enviarAprobacion(req, res) {
  const solicitud = await Solicitud.findByPk(req.params.id);
  if (!solicitud) return notFound(res, 'Solicitud no encontrada');
  if (solicitud.estado !== 'cotizando') return badRequest(res, 'La solicitud debe estar en cotizando para enviarla a aprobación');

  const cotizacionSeleccionada = await Cotizacion.findOne({
    where: { solicitudId: solicitud.id, seleccionada: true },
    include: [{ model: Proveedor }],
  });
  if (!cotizacionSeleccionada) return badRequest(res, 'Selecciona una cotización antes de enviar a aprobación');

  const { nivel, aprobacion } = await resolverEnvioAprobacion(solicitud, cotizacionSeleccionada);
  if (!nivel) return badRequest(res, 'No hay un nivel de aprobación configurado para este monto/tipo');

  await Auditoria.registrar({
    tabla: 'solicitudes', registroId: solicitud.id, accion: 'actualizar',
    usuarioId: req.user.id, usuarioNombre: req.user.nombreCompleto,
    descripcion: 'Solicitud enviada a aprobación', datosNuevos: { estado: 'en_aprobacion', nivelAprobacionId: nivel.id },
  });

  const solicitudActualizada = await Solicitud.findByPk(solicitud.id);
  return success(res, { solicitud: solicitudActualizada, aprobacion });
}

async function aprobar(req, res) {
  const solicitud = await Solicitud.findByPk(req.params.id);
  if (!solicitud) return notFound(res, 'Solicitud no encontrada');
  if (solicitud.estado !== 'en_aprobacion') return badRequest(res, 'La solicitud no está en aprobación');

  const solicitudAprobacion = await SolicitudAprobacion.findOne({
    where: { solicitudId: solicitud.id, estado: 'pendiente' },
    include: [{ model: NivelAprobacion }],
  });
  if (!solicitudAprobacion) return badRequest(res, 'No hay una aprobación pendiente para esta solicitud');

  const rolRequerido = solicitudAprobacion.NivelAprobacion.rolAprobador;
  const tieneRol = req.user.roles.some((rol) => rol.nombre === rolRequerido);
  if (!tieneRol) return forbidden(res, 'No tienes el rol de aprobador requerido para esta solicitud');
  if (rolRequerido === 'aprobador_area' && req.user.areaId !== solicitud.areaSolicitanteId) {
    return forbidden(res, 'Solo puedes aprobar solicitudes de tu propia área');
  }

  const { comentario } = req.body;
  await solicitudAprobacion.update({
    estado: 'aprobado', aprobadorUsuarioId: req.user.id, comentario: comentario || null, fechaResolucion: new Date(),
  });
  await solicitud.update({ estado: 'aprobada' });

  await Auditoria.registrar({
    tabla: 'solicitudes', registroId: solicitud.id, accion: 'actualizar',
    usuarioId: req.user.id, usuarioNombre: req.user.nombreCompleto,
    descripcion: 'Solicitud aprobada', datosNuevos: { estado: 'aprobada' },
  });

  const solicitudActualizada = await Solicitud.findByPk(solicitud.id);
  return success(res, solicitudActualizada);
}

async function rechazar(req, res) {
  const solicitud = await Solicitud.findByPk(req.params.id);
  if (!solicitud) return notFound(res, 'Solicitud no encontrada');
  if (solicitud.estado !== 'en_aprobacion') return badRequest(res, 'La solicitud no está en aprobación');

  const { motivo } = req.body;
  if (!motivo) return badRequest(res, 'El motivo del rechazo es obligatorio');

  const solicitudAprobacion = await SolicitudAprobacion.findOne({
    where: { solicitudId: solicitud.id, estado: 'pendiente' },
    include: [{ model: NivelAprobacion }],
  });
  if (!solicitudAprobacion) return badRequest(res, 'No hay una aprobación pendiente para esta solicitud');

  const rolRequerido = solicitudAprobacion.NivelAprobacion.rolAprobador;
  const tieneRol = req.user.roles.some((rol) => rol.nombre === rolRequerido);
  if (!tieneRol) return forbidden(res, 'No tienes el rol de aprobador requerido para esta solicitud');
  if (rolRequerido === 'aprobador_area' && req.user.areaId !== solicitud.areaSolicitanteId) {
    return forbidden(res, 'Solo puedes aprobar solicitudes de tu propia área');
  }

  await solicitudAprobacion.update({
    estado: 'rechazado', aprobadorUsuarioId: req.user.id, comentario: motivo, fechaResolucion: new Date(),
  });
  await solicitud.update({ estado: 'rechazada' });

  await Auditoria.registrar({
    tabla: 'solicitudes', registroId: solicitud.id, accion: 'actualizar',
    usuarioId: req.user.id, usuarioNombre: req.user.nombreCompleto,
    descripcion: `Solicitud rechazada: ${motivo}`, datosNuevos: { estado: 'rechazada' },
  });

  const solicitudActualizada = await Solicitud.findByPk(solicitud.id);
  return success(res, solicitudActualizada);
}

async function confirmar(req, res) {
  const solicitud = await Solicitud.findByPk(req.params.id);
  if (!solicitud) return notFound(res, 'Solicitud no encontrada');
  if (solicitud.estado !== 'aprobada') return badRequest(res, 'La solicitud debe estar aprobada para confirmarla');

  const { ordenFormalNumero } = req.body;
  if (!ordenFormalNumero) return badRequest(res, 'El número de la orden formal es obligatorio');
  if (!req.file) return badRequest(res, 'El archivo de la orden formal es obligatorio');

  const { ruta } = guardarArchivo(req.file, `solicitudes/${solicitud.id}`);
  await solicitud.update({ estado: 'confirmada', ordenFormalNumero, ordenFormalS3Key: ruta });

  await Auditoria.registrar({
    tabla: 'solicitudes', registroId: solicitud.id, accion: 'actualizar',
    usuarioId: req.user.id, usuarioNombre: req.user.nombreCompleto,
    descripcion: 'Solicitud confirmada con orden formal', datosNuevos: solicitud.toJSON(),
  });

  return success(res, solicitud);
}

async function cancelar(req, res) {
  const solicitud = await Solicitud.findByPk(req.params.id);
  if (!solicitud) return notFound(res, 'Solicitud no encontrada');
  if (solicitud.solicitanteUsuarioId !== req.user.id) return forbidden(res, 'Solo el solicitante puede cancelar su propia solicitud');
  if (!['cotizando', 'en_aprobacion'].includes(solicitud.estado)) {
    return badRequest(res, 'Solo se puede cancelar una solicitud en cotizando o en_aprobacion');
  }

  const datosAnteriores = solicitud.toJSON();
  await solicitud.update({ estado: 'cancelada' });

  await Auditoria.registrar({
    tabla: 'solicitudes', registroId: solicitud.id, accion: 'actualizar',
    usuarioId: req.user.id, usuarioNombre: req.user.nombreCompleto,
    descripcion: 'Solicitud cancelada por el solicitante', datosAnteriores, datosNuevos: solicitud.toJSON(),
  });

  return success(res, solicitud);
}

module.exports = { listarTipos, listar, obtener, crear, enviarAprobacion, aprobar, rechazar, confirmar, cancelar };
```

- [ ] **Step 5: Crear el router**

`server/src/routes/solicitud.routes.js`:

```js
const express = require('express');
const router = express.Router();
const { verificarToken } = require('../middlewares/auth');
const { requierePermiso } = require('../middlewares/roles');
const { subirArchivoUnico } = require('../middlewares/upload');
const controller = require('../controllers/solicitud.controller');
const asyncHandler = require('../utils/asyncHandler');

router.get('/', verificarToken, requierePermiso('solicitudes', 'ver'), asyncHandler(controller.listar));
router.post('/', verificarToken, requierePermiso('solicitudes', 'crear'), asyncHandler(controller.crear));
router.get('/tipos', verificarToken, requierePermiso('solicitudes', 'ver'), asyncHandler(controller.listarTipos));
router.get('/:id', verificarToken, requierePermiso('solicitudes', 'ver'), asyncHandler(controller.obtener));
router.post('/:id/enviar-aprobacion', verificarToken, requierePermiso('solicitudes', 'cotizar'), asyncHandler(controller.enviarAprobacion));
router.post('/:id/aprobar', verificarToken, requierePermiso('solicitudes', 'aprobar'), asyncHandler(controller.aprobar));
router.post('/:id/rechazar', verificarToken, requierePermiso('solicitudes', 'aprobar'), asyncHandler(controller.rechazar));
router.post('/:id/confirmar', verificarToken, requierePermiso('solicitudes', 'confirmar'), subirArchivoUnico, asyncHandler(controller.confirmar));
router.post('/:id/cancelar', verificarToken, requierePermiso('solicitudes', 'crear'), asyncHandler(controller.cancelar));

module.exports = router;
```

- [ ] **Step 6: Montar en `routes/index.js`**

Añade la línea (junto a `router.use('/proveedores', ...)`):

```js
router.use('/solicitudes', require('./solicitud.routes'));
```

- [ ] **Step 7: Ejecutar y confirmar**

Run: `cd server && npx jest tests/integration/solicitud.routes.test.js`
Expected: los describes `catálogo de tipos` y `CRUD y visibilidad` PASAN. Los describes `envío a aprobación`, `confirmación` y `cancelación` **siguen fallando** porque dependen de `POST /:id/cotizaciones` y `.../seleccionar`, que llegan en la Tarea 4 — esto es esperado en este punto, no un error de esta tarea. Confirma explícitamente que los dos primeros describes están en verde antes de continuar.

- [ ] **Step 8: Commit**

```bash
git add server/src/controllers/solicitud.controller.js server/src/routes/solicitud.routes.js server/src/routes/index.js server/src/scripts/seedRolesPermisos.js server/tests/integration/solicitud.routes.test.js
git commit -m "feat(solicitudes): CRUD, catalogo de tipos y transiciones de estado de Solicitud"
```

---

## Task 4: `cotizacion.controller.js` (sub-recurso)

**Files:**
- Create: `server/src/controllers/cotizacion.controller.js`
- Modify: `server/src/routes/solicitud.routes.js`
- Create: `server/tests/integration/cotizacion.routes.test.js`

**Interfaces:**
- Consumes: modelos `Solicitud, Cotizacion, Proveedor, Auditoria, sequelize` (ya existentes); `guardarArchivo` de `almacenamiento.service.js`.
- Produces: `GET /solicitudes/:id/cotizaciones`, `POST /solicitudes/:id/cotizaciones`, `POST /solicitudes/:id/cotizaciones/:cotizacionId/seleccionar` — usados por `solicitud.routes.test.js` (Tarea 3, describes de aprobación/confirmación/cancelación) y por el frontend (Tarea 6).

- [ ] **Step 1: Escribir el test de integración (falla primero)**

`server/tests/integration/cotizacion.routes.test.js`:

```js
const request = require('supertest');
const bcrypt = require('bcryptjs');
const { sequelize } = require('../../src/config/database');
const { createMigrator } = require('../../src/config/migrator');
const seedRolesPermisos = require('../../src/scripts/seedRolesPermisos');
const seedNivelesAprobacion = require('../../src/scripts/seedNivelesAprobacion');
const { Rol, Usuario, Area, TipoSolicitud, Proveedor, Cotizacion } = require('../../src/models');
const { invalidarCachePermisos } = require('../../src/middlewares/roles');
const { app } = require('../../server');

let gestorComprasToken;
let solicitanteToken;
let area;
let tipoCompra;
let proveedor;

beforeAll(async () => {
  await sequelize.authenticate();
  await createMigrator(sequelize).up();
  await seedRolesPermisos();
  await seedNivelesAprobacion();
  invalidarCachePermisos();

  area = await Area.create({ nombre: 'Cotizaciones Area', codigo: `COTIZAREA${Date.now()}` });
  tipoCompra = await TipoSolicitud.findOne({ where: { nombre: 'compra' } });
  proveedor = await Proveedor.create({
    tipo: 'proveedor', documentoIdentificacion: `980${Date.now()}`, razonSocial: 'Proveedor Cotizaciones SAS',
    criticidad: 'relevante', areaSolicitanteId: area.id,
  });

  const gestorRol = await Rol.findOne({ where: { nombre: 'gestor_compras' } });
  const gestorUsername = `gestor_compras_cot_${Date.now()}`;
  const gestorUsuario = await Usuario.create({
    username: gestorUsername, email: `${gestorUsername}@istho.com.co`,
    passwordHash: await bcrypt.hash('Clave123!', 10), nombre: 'Gestor', apellido: 'Cotizaciones',
  });
  await gestorUsuario.setRoles([gestorRol.id]);
  const gestorLogin = await request(app).post('/api/v1/auth/login').send({ username: gestorUsername, password: 'Clave123!' });
  gestorComprasToken = gestorLogin.body.data.token;

  const solicitanteRol = await Rol.findOne({ where: { nombre: 'solicitante' } });
  const solicitanteUsername = `solicitante_cot_${Date.now()}`;
  const solicitanteUsuario = await Usuario.create({
    username: solicitanteUsername, email: `${solicitanteUsername}@istho.com.co`,
    passwordHash: await bcrypt.hash('Clave123!', 10), nombre: 'Solicitante', apellido: 'Cotizaciones', areaId: area.id,
  });
  await solicitanteUsuario.setRoles([solicitanteRol.id]);
  const solicitanteLogin = await request(app).post('/api/v1/auth/login').send({ username: solicitanteUsername, password: 'Clave123!' });
  solicitanteToken = solicitanteLogin.body.data.token;
});

afterAll(async () => {
  await sequelize.close();
});

async function crearSolicitud() {
  const res = await request(app)
    .post('/api/v1/solicitudes')
    .set('Authorization', `Bearer ${solicitanteToken}`)
    .send({ tipoSolicitudId: tipoCompra.id, areaSolicitanteId: area.id, descripcion: 'Solicitud para cotizar', montoEstimado: 100000 });
  return res.body.data.id;
}

describe('Cotizaciones API', () => {
  it('agrega una cotización a una solicitud en cotizando', async () => {
    const solicitudId = await crearSolicitud();
    const res = await request(app)
      .post(`/api/v1/solicitudes/${solicitudId}/cotizaciones`)
      .set('Authorization', `Bearer ${gestorComprasToken}`)
      .send({ proveedorId: proveedor.id, monto: 90000, observaciones: 'Cotización inicial' });
    expect(res.status).toBe(201);
    expect(res.body.data.solicitudId).toBe(solicitudId);
    expect(res.body.data.seleccionada).toBe(false);
  });

  it('returns 400 cuando falta el monto', async () => {
    const solicitudId = await crearSolicitud();
    const res = await request(app)
      .post(`/api/v1/solicitudes/${solicitudId}/cotizaciones`)
      .set('Authorization', `Bearer ${gestorComprasToken}`)
      .send({ proveedorId: proveedor.id });
    expect(res.status).toBe(400);
  });

  it('returns 404 cuando proveedorId no existe', async () => {
    const solicitudId = await crearSolicitud();
    const res = await request(app)
      .post(`/api/v1/solicitudes/${solicitudId}/cotizaciones`)
      .set('Authorization', `Bearer ${gestorComprasToken}`)
      .send({ proveedorId: 999999999, monto: 90000 });
    expect(res.status).toBe(404);
  });

  it('permite crear una cotización sin proveedorId', async () => {
    const solicitudId = await crearSolicitud();
    const res = await request(app)
      .post(`/api/v1/solicitudes/${solicitudId}/cotizaciones`)
      .set('Authorization', `Bearer ${gestorComprasToken}`)
      .send({ monto: 50000 });
    expect(res.status).toBe(201);
    expect(res.body.data.proveedorId).toBeNull();
  });

  it('returns 403 cuando solicitante (sin permiso cotizar) intenta agregar una cotización', async () => {
    const solicitudId = await crearSolicitud();
    const res = await request(app)
      .post(`/api/v1/solicitudes/${solicitudId}/cotizaciones`)
      .set('Authorization', `Bearer ${solicitanteToken}`)
      .send({ monto: 90000 });
    expect(res.status).toBe(403);
  });

  it('lista las cotizaciones de una solicitud, con el proveedor incluido', async () => {
    const solicitudId = await crearSolicitud();
    await request(app)
      .post(`/api/v1/solicitudes/${solicitudId}/cotizaciones`)
      .set('Authorization', `Bearer ${gestorComprasToken}`)
      .send({ proveedorId: proveedor.id, monto: 90000 });

    const res = await request(app).get(`/api/v1/solicitudes/${solicitudId}/cotizaciones`).set('Authorization', `Bearer ${gestorComprasToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data[0].Proveedor.id).toBe(proveedor.id);
  });

  it('selecciona una cotización y desmarca las demás de la misma solicitud', async () => {
    const solicitudId = await crearSolicitud();
    const cot1 = await request(app)
      .post(`/api/v1/solicitudes/${solicitudId}/cotizaciones`)
      .set('Authorization', `Bearer ${gestorComprasToken}`)
      .send({ monto: 90000 });
    const cot2 = await request(app)
      .post(`/api/v1/solicitudes/${solicitudId}/cotizaciones`)
      .set('Authorization', `Bearer ${gestorComprasToken}`)
      .send({ monto: 80000 });

    await request(app)
      .post(`/api/v1/solicitudes/${solicitudId}/cotizaciones/${cot1.body.data.id}/seleccionar`)
      .set('Authorization', `Bearer ${gestorComprasToken}`);
    const seleccionarRes = await request(app)
      .post(`/api/v1/solicitudes/${solicitudId}/cotizaciones/${cot2.body.data.id}/seleccionar`)
      .set('Authorization', `Bearer ${gestorComprasToken}`);
    expect(seleccionarRes.status).toBe(200);
    expect(seleccionarRes.body.data.seleccionada).toBe(true);

    const cotizacion1Recargada = await Cotizacion.findByPk(cot1.body.data.id);
    expect(cotizacion1Recargada.seleccionada).toBe(false);
  });

  it('returns 400 cuando se intenta agregar una cotización a una solicitud que no está en cotizando', async () => {
    const solicitudId = await crearSolicitud();
    const cot = await request(app)
      .post(`/api/v1/solicitudes/${solicitudId}/cotizaciones`)
      .set('Authorization', `Bearer ${gestorComprasToken}`)
      .send({ monto: 90000 });
    await request(app)
      .post(`/api/v1/solicitudes/${solicitudId}/cotizaciones/${cot.body.data.id}/seleccionar`)
      .set('Authorization', `Bearer ${gestorComprasToken}`);
    await request(app).post(`/api/v1/solicitudes/${solicitudId}/enviar-aprobacion`).set('Authorization', `Bearer ${gestorComprasToken}`);

    const res = await request(app)
      .post(`/api/v1/solicitudes/${solicitudId}/cotizaciones`)
      .set('Authorization', `Bearer ${gestorComprasToken}`)
      .send({ monto: 70000 });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Ejecutar y confirmar que falla**

Run: `cd server && npx jest tests/integration/cotizacion.routes.test.js`
Expected: FAIL — 404, la ruta `POST /solicitudes/:id/cotizaciones` no existe todavía.

- [ ] **Step 3: Crear el controlador**

`server/src/controllers/cotizacion.controller.js`:

```js
const { Solicitud, Cotizacion, Proveedor, Auditoria, sequelize } = require('../models');
const { success, created, notFound, badRequest } = require('../utils/responses');
const { guardarArchivo } = require('../services/almacenamiento.service');

async function listar(req, res) {
  const solicitud = await Solicitud.findByPk(req.params.id);
  if (!solicitud) return notFound(res, 'Solicitud no encontrada');

  const cotizaciones = await Cotizacion.findAll({
    where: { solicitudId: solicitud.id },
    include: [{ model: Proveedor }],
    order: [['createdAt', 'DESC']],
  });
  return success(res, cotizaciones);
}

async function crear(req, res) {
  const solicitud = await Solicitud.findByPk(req.params.id);
  if (!solicitud) return notFound(res, 'Solicitud no encontrada');
  if (solicitud.estado !== 'cotizando') return badRequest(res, 'La solicitud debe estar en cotizando para agregar cotizaciones');

  const { proveedorId, monto, observaciones } = req.body;
  if (!monto) return badRequest(res, 'El monto es obligatorio');

  if (proveedorId) {
    const proveedor = await Proveedor.findByPk(proveedorId);
    if (!proveedor) return notFound(res, 'Proveedor no encontrado');
  }

  let s3Key = null;
  if (req.file) {
    const { ruta } = guardarArchivo(req.file, `solicitudes/${solicitud.id}`);
    s3Key = ruta;
  }

  const cotizacion = await Cotizacion.create({
    solicitudId: solicitud.id, proveedorId: proveedorId || null, monto,
    observaciones: observaciones || null, s3Key,
  });

  await Auditoria.registrar({
    tabla: 'cotizaciones', registroId: cotizacion.id, accion: 'crear',
    usuarioId: req.user.id, usuarioNombre: req.user.nombreCompleto, datosNuevos: cotizacion.toJSON(),
  });

  return created(res, 'Cotización agregada', cotizacion);
}

async function seleccionar(req, res) {
  const solicitud = await Solicitud.findByPk(req.params.id);
  if (!solicitud) return notFound(res, 'Solicitud no encontrada');
  if (solicitud.estado !== 'cotizando') return badRequest(res, 'La solicitud debe estar en cotizando para seleccionar una cotización');

  const cotizacion = await Cotizacion.findOne({ where: { id: req.params.cotizacionId, solicitudId: solicitud.id } });
  if (!cotizacion) return notFound(res, 'Cotización no encontrada');

  await sequelize.transaction(async (t) => {
    await Cotizacion.update({ seleccionada: false }, { where: { solicitudId: solicitud.id }, transaction: t });
    await cotizacion.update({ seleccionada: true }, { transaction: t });
  });

  await Auditoria.registrar({
    tabla: 'cotizaciones', registroId: cotizacion.id, accion: 'actualizar',
    usuarioId: req.user.id, usuarioNombre: req.user.nombreCompleto,
    descripcion: 'Cotización marcada como seleccionada',
  });

  const cotizacionActualizada = await Cotizacion.findByPk(cotizacion.id);
  return success(res, cotizacionActualizada);
}

module.exports = { listar, crear, seleccionar };
```

- [ ] **Step 4: Montar las rutas en `solicitud.routes.js`**

Añade al archivo `server/src/routes/solicitud.routes.js` (Tarea 3), justo antes de `module.exports = router;`:

```js
const cotizacionController = require('../controllers/cotizacion.controller');

router.get('/:id/cotizaciones', verificarToken, requierePermiso('solicitudes', 'ver'), asyncHandler(cotizacionController.listar));
router.post('/:id/cotizaciones', verificarToken, requierePermiso('solicitudes', 'cotizar'), subirArchivoUnico, asyncHandler(cotizacionController.crear));
router.post('/:id/cotizaciones/:cotizacionId/seleccionar', verificarToken, requierePermiso('solicitudes', 'cotizar'), asyncHandler(cotizacionController.seleccionar));
```

(el `require` de `cotizacionController` debe ir junto a los otros `require` al inicio del archivo, no dentro del cuerpo — colócalo junto a `const controller = require('../controllers/solicitud.controller');`).

- [ ] **Step 5: Ejecutar y confirmar que pasa**

Run: `cd server && npx jest tests/integration/cotizacion.routes.test.js tests/integration/solicitud.routes.test.js`
Expected: PASS en ambos archivos — `cotizacion.routes.test.js` completo, y ahora también los describes de `solicitud.routes.test.js` que dependían de cotizaciones (`envío a aprobación, aprobar/rechazar`, `confirmación`, `cancelación`).

- [ ] **Step 6: Commit**

```bash
git add server/src/controllers/cotizacion.controller.js server/src/routes/solicitud.routes.js server/tests/integration/cotizacion.routes.test.js
git commit -m "feat(solicitudes): sub-recurso de cotizaciones (agregar, listar, seleccionar)"
```

---

## Task 5: `solicitudComentario.controller.js` (sub-recurso)

**Files:**
- Create: `server/src/controllers/solicitudComentario.controller.js`
- Modify: `server/src/routes/solicitud.routes.js`
- Create: `server/tests/integration/solicitudComentario.routes.test.js`

**Interfaces:**
- Consumes: modelo `SolicitudComentario` (Tarea 1); `Solicitud, Usuario, Auditoria`.
- Produces: `GET /solicitudes/:id/comentarios`, `POST /solicitudes/:id/comentarios`.

- [ ] **Step 1: Escribir el test de integración (falla primero)**

`server/tests/integration/solicitudComentario.routes.test.js`:

```js
const request = require('supertest');
const bcrypt = require('bcryptjs');
const { sequelize } = require('../../src/config/database');
const { createMigrator } = require('../../src/config/migrator');
const seedRolesPermisos = require('../../src/scripts/seedRolesPermisos');
const seedNivelesAprobacion = require('../../src/scripts/seedNivelesAprobacion');
const { Rol, Usuario, Area, TipoSolicitud } = require('../../src/models');
const { invalidarCachePermisos } = require('../../src/middlewares/roles');
const { app } = require('../../server');

let gestorComprasToken;
let solicitanteToken;
let aprobadorAreaToken;
let area;
let tipoCompra;
let solicitudId;

async function crearUsuarioConRol(rolNombre, prefijo) {
  const rol = await Rol.findOne({ where: { nombre: rolNombre } });
  const username = `${prefijo}_${Date.now()}`;
  const usuario = await Usuario.create({
    username, email: `${username}@istho.com.co`,
    passwordHash: await bcrypt.hash('Clave123!', 10), nombre: prefijo, apellido: 'Comentario',
  });
  await usuario.setRoles([rol.id]);
  const login = await request(app).post('/api/v1/auth/login').send({ username, password: 'Clave123!' });
  return login.body.data.token;
}

beforeAll(async () => {
  await sequelize.authenticate();
  await createMigrator(sequelize).up();
  await seedRolesPermisos();
  await seedNivelesAprobacion();
  invalidarCachePermisos();

  area = await Area.create({ nombre: 'Comentarios Area', codigo: `COMENTAREA${Date.now()}` });
  tipoCompra = await TipoSolicitud.findOne({ where: { nombre: 'compra' } });

  gestorComprasToken = await crearUsuarioConRol('gestor_compras', 'gestor_compras_com');
  solicitanteToken = await crearUsuarioConRol('solicitante', 'solicitante_com');
  aprobadorAreaToken = await crearUsuarioConRol('aprobador_area', 'aprobador_area_com');

  const creada = await request(app)
    .post('/api/v1/solicitudes')
    .set('Authorization', `Bearer ${solicitanteToken}`)
    .send({ tipoSolicitudId: tipoCompra.id, areaSolicitanteId: area.id, descripcion: 'Solicitud para comentar' });
  solicitudId = creada.body.data.id;
});

afterAll(async () => {
  await sequelize.close();
});

describe('Comentarios de Solicitud API', () => {
  it('el solicitante agrega un comentario', async () => {
    const res = await request(app)
      .post(`/api/v1/solicitudes/${solicitudId}/comentarios`)
      .set('Authorization', `Bearer ${solicitanteToken}`)
      .send({ texto: 'Necesitamos esto con urgencia' });
    expect(res.status).toBe(201);
    expect(res.body.data.texto).toBe('Necesitamos esto con urgencia');
    expect(res.body.data.Usuario).toBeDefined();
  });

  it('gestor_compras agrega un comentario', async () => {
    const res = await request(app)
      .post(`/api/v1/solicitudes/${solicitudId}/comentarios`)
      .set('Authorization', `Bearer ${gestorComprasToken}`)
      .send({ texto: 'Ya estamos cotizando' });
    expect(res.status).toBe(201);
  });

  it('returns 403 cuando aprobador_area (sin permiso comentar) intenta comentar', async () => {
    const res = await request(app)
      .post(`/api/v1/solicitudes/${solicitudId}/comentarios`)
      .set('Authorization', `Bearer ${aprobadorAreaToken}`)
      .send({ texto: 'No debería poder comentar' });
    expect(res.status).toBe(403);
  });

  it('returns 400 cuando falta el texto', async () => {
    const res = await request(app)
      .post(`/api/v1/solicitudes/${solicitudId}/comentarios`)
      .set('Authorization', `Bearer ${solicitanteToken}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it('lista los comentarios en orden cronológico', async () => {
    const res = await request(app).get(`/api/v1/solicitudes/${solicitudId}/comentarios`).set('Authorization', `Bearer ${gestorComprasToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(2);
    expect(new Date(res.body.data[0].createdAt).getTime()).toBeLessThanOrEqual(new Date(res.body.data[1].createdAt).getTime());
  });

  it('aprobador_area (con solicitudes:ver) puede leer los comentarios aunque no pueda escribir', async () => {
    const res = await request(app).get(`/api/v1/solicitudes/${solicitudId}/comentarios`).set('Authorization', `Bearer ${aprobadorAreaToken}`);
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Ejecutar y confirmar que falla**

Run: `cd server && npx jest tests/integration/solicitudComentario.routes.test.js`
Expected: FAIL — 404, la ruta no existe todavía.

- [ ] **Step 3: Crear el controlador**

`server/src/controllers/solicitudComentario.controller.js`:

```js
const { Solicitud, SolicitudComentario, Usuario, Auditoria } = require('../models');
const { success, created, notFound, badRequest } = require('../utils/responses');

async function listar(req, res) {
  const solicitud = await Solicitud.findByPk(req.params.id);
  if (!solicitud) return notFound(res, 'Solicitud no encontrada');

  const comentarios = await SolicitudComentario.findAll({
    where: { solicitudId: solicitud.id },
    include: [{ model: Usuario }],
    order: [['createdAt', 'ASC']],
  });
  return success(res, comentarios);
}

async function crear(req, res) {
  const solicitud = await Solicitud.findByPk(req.params.id);
  if (!solicitud) return notFound(res, 'Solicitud no encontrada');

  const { texto } = req.body;
  if (!texto) return badRequest(res, 'El texto del comentario es obligatorio');

  const comentario = await SolicitudComentario.create({
    solicitudId: solicitud.id, usuarioId: req.user.id, texto,
  });

  await Auditoria.registrar({
    tabla: 'solicitud_comentarios', registroId: comentario.id, accion: 'crear',
    usuarioId: req.user.id, usuarioNombre: req.user.nombreCompleto, datosNuevos: comentario.toJSON(),
  });

  const comentarioConUsuario = await SolicitudComentario.findByPk(comentario.id, { include: [{ model: Usuario }] });
  return created(res, 'Comentario agregado', comentarioConUsuario);
}

module.exports = { listar, crear };
```

- [ ] **Step 4: Montar las rutas en `solicitud.routes.js`**

Añade al archivo `server/src/routes/solicitud.routes.js`, junto al require de `cotizacionController` y antes de `module.exports = router;`:

```js
const comentarioController = require('../controllers/solicitudComentario.controller');

router.get('/:id/comentarios', verificarToken, requierePermiso('solicitudes', 'ver'), asyncHandler(comentarioController.listar));
router.post('/:id/comentarios', verificarToken, requierePermiso('solicitudes', 'comentar'), asyncHandler(comentarioController.crear));
```

- [ ] **Step 5: Ejecutar y confirmar que pasa**

Run: `cd server && npx jest tests/integration/solicitudComentario.routes.test.js`
Expected: PASS (6/6).

Run también la suite completa del backend para confirmar que nada se rompió: `cd server && npm test`
Expected: todos los tests en verde.

- [ ] **Step 6: Commit**

```bash
git add server/src/controllers/solicitudComentario.controller.js server/src/routes/solicitud.routes.js server/tests/integration/solicitudComentario.routes.test.js
git commit -m "feat(solicitudes): sub-recurso de comentarios (append-only)"
```

---

## Task 6: Frontend — servicios API (`solicitud`, `cotizacion`, `solicitudComentario`)

**Files:**
- Create: `frontend/src/api/solicitud.service.js`
- Create: `frontend/src/api/solicitud.service.test.js`
- Create: `frontend/src/api/cotizacion.service.js`
- Create: `frontend/src/api/cotizacion.service.test.js`
- Create: `frontend/src/api/solicitudComentario.service.js`
- Create: `frontend/src/api/solicitudComentario.service.test.js`

**Interfaces:**
- Consumes: endpoints de las Tareas 3, 4, 5.
- Produces: `solicitudService = { listar, listarTipos, obtener, crear, enviarAprobacion, aprobar, rechazar, confirmar, cancelar }`; `cotizacionService = { listar, crear, seleccionar }`; `solicitudComentarioService = { listar, crear }` — consumidos por las Tareas 7 y 8.

- [ ] **Step 1: Escribir los tests (fallan primero)**

`frontend/src/api/solicitud.service.test.js`:

```js
import MockAdapter from 'axios-mock-adapter';
import apiClient from './client';
import solicitudService from './solicitud.service';

describe('solicitud.service', () => {
  let mock;

  beforeEach(() => {
    mock = new MockAdapter(apiClient);
  });

  afterEach(() => {
    mock.restore();
  });

  it('listar returns the solicitudes array and forwards filtros as query params', async () => {
    mock.onGet('/solicitudes').reply(200, { success: true, data: [{ id: 1, codigo: 'SOL-2026-1' }] });
    const solicitudes = await solicitudService.listar({ estado: 'cotizando' });
    expect(solicitudes).toEqual([{ id: 1, codigo: 'SOL-2026-1' }]);
    expect(mock.history.get[0].params).toEqual({ estado: 'cotizando' });
  });

  it('listarTipos returns the tipos array', async () => {
    mock.onGet('/solicitudes/tipos').reply(200, { success: true, data: [{ id: 1, nombre: 'compra' }] });
    const tipos = await solicitudService.listarTipos();
    expect(tipos).toEqual([{ id: 1, nombre: 'compra' }]);
  });

  it('obtener returns a single solicitud', async () => {
    mock.onGet('/solicitudes/5').reply(200, { success: true, data: { id: 5, codigo: 'SOL-2026-5' } });
    const solicitud = await solicitudService.obtener(5);
    expect(solicitud).toEqual({ id: 5, codigo: 'SOL-2026-5' });
  });

  it('crear posts the given data and returns the created solicitud', async () => {
    mock.onPost('/solicitudes').reply(201, { success: true, data: { id: 2, codigo: 'SOL-2026-2' } });
    const solicitud = await solicitudService.crear({ tipoSolicitudId: 1, areaSolicitanteId: 7, descripcion: 'Compra' });
    expect(solicitud).toEqual({ id: 2, codigo: 'SOL-2026-2' });
  });

  it('enviarAprobacion posts to the enviar-aprobacion endpoint', async () => {
    mock.onPost('/solicitudes/1/enviar-aprobacion').reply(200, { success: true, data: { solicitud: { id: 1, estado: 'en_aprobacion' } } });
    const resultado = await solicitudService.enviarAprobacion(1);
    expect(resultado.solicitud.estado).toBe('en_aprobacion');
  });

  it('aprobar posts to the aprobar endpoint', async () => {
    mock.onPost('/solicitudes/1/aprobar').reply(200, { success: true, data: { id: 1, estado: 'aprobada' } });
    const resultado = await solicitudService.aprobar(1);
    expect(resultado).toEqual({ id: 1, estado: 'aprobada' });
  });

  it('rechazar posts the motivo and returns the updated solicitud', async () => {
    mock.onPost('/solicitudes/1/rechazar').reply(200, { success: true, data: { id: 1, estado: 'rechazada' } });
    const resultado = await solicitudService.rechazar(1, 'Sin presupuesto');
    expect(resultado).toEqual({ id: 1, estado: 'rechazada' });
    expect(JSON.parse(mock.history.post.find((r) => r.url === '/solicitudes/1/rechazar').data)).toEqual({ motivo: 'Sin presupuesto' });
  });

  it('cancelar posts to the cancelar endpoint', async () => {
    mock.onPost('/solicitudes/1/cancelar').reply(200, { success: true, data: { id: 1, estado: 'cancelada' } });
    const resultado = await solicitudService.cancelar(1);
    expect(resultado).toEqual({ id: 1, estado: 'cancelada' });
  });

  it('confirmar posts the given FormData and returns the updated solicitud', async () => {
    const formData = new FormData();
    formData.append('ordenFormalNumero', 'OF-2026-001');
    mock.onPost('/solicitudes/1/confirmar').reply(200, { success: true, data: { id: 1, estado: 'confirmada' } });
    const resultado = await solicitudService.confirmar(1, formData);
    expect(resultado).toEqual({ id: 1, estado: 'confirmada' });
    expect(mock.history.post[0].data).toBe(formData);
  });
});
```

`frontend/src/api/cotizacion.service.test.js`:

```js
import MockAdapter from 'axios-mock-adapter';
import apiClient from './client';
import cotizacionService from './cotizacion.service';

describe('cotizacion.service', () => {
  let mock;

  beforeEach(() => {
    mock = new MockAdapter(apiClient);
  });

  afterEach(() => {
    mock.restore();
  });

  it('listar returns the cotizaciones array for a solicitud', async () => {
    mock.onGet('/solicitudes/1/cotizaciones').reply(200, { success: true, data: [{ id: 5, monto: 90000 }] });
    const cotizaciones = await cotizacionService.listar(1);
    expect(cotizaciones).toEqual([{ id: 5, monto: 90000 }]);
  });

  it('crear posts the given FormData and returns the created cotizacion', async () => {
    const formData = new FormData();
    formData.append('monto', '90000');
    mock.onPost('/solicitudes/1/cotizaciones').reply(201, { success: true, data: { id: 5, monto: 90000 } });
    const cotizacion = await cotizacionService.crear(1, formData);
    expect(cotizacion).toEqual({ id: 5, monto: 90000 });
    expect(mock.history.post[0].data).toBe(formData);
  });

  it('seleccionar posts to the seleccionar endpoint', async () => {
    mock.onPost('/solicitudes/1/cotizaciones/5/seleccionar').reply(200, { success: true, data: { id: 5, seleccionada: true } });
    const resultado = await cotizacionService.seleccionar(1, 5);
    expect(resultado).toEqual({ id: 5, seleccionada: true });
  });
});
```

`frontend/src/api/solicitudComentario.service.test.js`:

```js
import MockAdapter from 'axios-mock-adapter';
import apiClient from './client';
import solicitudComentarioService from './solicitudComentario.service';

describe('solicitudComentario.service', () => {
  let mock;

  beforeEach(() => {
    mock = new MockAdapter(apiClient);
  });

  afterEach(() => {
    mock.restore();
  });

  it('listar returns the comentarios array for a solicitud', async () => {
    mock.onGet('/solicitudes/1/comentarios').reply(200, { success: true, data: [{ id: 1, texto: 'Hola' }] });
    const comentarios = await solicitudComentarioService.listar(1);
    expect(comentarios).toEqual([{ id: 1, texto: 'Hola' }]);
  });

  it('crear posts the texto and returns the created comentario', async () => {
    mock.onPost('/solicitudes/1/comentarios').reply(201, { success: true, data: { id: 2, texto: 'Nuevo comentario' } });
    const comentario = await solicitudComentarioService.crear(1, 'Nuevo comentario');
    expect(comentario).toEqual({ id: 2, texto: 'Nuevo comentario' });
    expect(JSON.parse(mock.history.post[0].data)).toEqual({ texto: 'Nuevo comentario' });
  });
});
```

- [ ] **Step 2: Ejecutar y confirmar que fallan**

Run: `cd frontend && npx vitest run src/api/solicitud.service.test.js src/api/cotizacion.service.test.js src/api/solicitudComentario.service.test.js`
Expected: FAIL — los módulos `./solicitud.service`, `./cotizacion.service`, `./solicitudComentario.service` no existen todavía.

- [ ] **Step 3: Crear los servicios**

`frontend/src/api/solicitud.service.js`:

```js
import apiClient from './client';

async function listar(filtros = {}) {
  const response = await apiClient.get('/solicitudes', { params: filtros });
  return response.data;
}

async function listarTipos() {
  const response = await apiClient.get('/solicitudes/tipos');
  return response.data;
}

async function obtener(id) {
  const response = await apiClient.get(`/solicitudes/${id}`);
  return response.data;
}

async function crear(datos) {
  const response = await apiClient.post('/solicitudes', datos);
  return response.data;
}

async function enviarAprobacion(id) {
  const response = await apiClient.post(`/solicitudes/${id}/enviar-aprobacion`);
  return response.data;
}

async function aprobar(id) {
  const response = await apiClient.post(`/solicitudes/${id}/aprobar`);
  return response.data;
}

async function rechazar(id, motivo) {
  const response = await apiClient.post(`/solicitudes/${id}/rechazar`, { motivo });
  return response.data;
}

async function confirmar(id, formData) {
  const response = await apiClient.post(`/solicitudes/${id}/confirmar`, formData, {
    headers: { 'Content-Type': undefined },
  });
  return response.data;
}

async function cancelar(id) {
  const response = await apiClient.post(`/solicitudes/${id}/cancelar`);
  return response.data;
}

export default { listar, listarTipos, obtener, crear, enviarAprobacion, aprobar, rechazar, confirmar, cancelar };
```

`frontend/src/api/cotizacion.service.js`:

```js
import apiClient from './client';

async function listar(solicitudId) {
  const response = await apiClient.get(`/solicitudes/${solicitudId}/cotizaciones`);
  return response.data;
}

async function crear(solicitudId, formData) {
  const response = await apiClient.post(`/solicitudes/${solicitudId}/cotizaciones`, formData, {
    headers: { 'Content-Type': undefined },
  });
  return response.data;
}

async function seleccionar(solicitudId, cotizacionId) {
  const response = await apiClient.post(`/solicitudes/${solicitudId}/cotizaciones/${cotizacionId}/seleccionar`);
  return response.data;
}

export default { listar, crear, seleccionar };
```

`frontend/src/api/solicitudComentario.service.js`:

```js
import apiClient from './client';

async function listar(solicitudId) {
  const response = await apiClient.get(`/solicitudes/${solicitudId}/comentarios`);
  return response.data;
}

async function crear(solicitudId, texto) {
  const response = await apiClient.post(`/solicitudes/${solicitudId}/comentarios`, { texto });
  return response.data;
}

export default { listar, crear };
```

- [ ] **Step 4: Ejecutar y confirmar que pasan**

Run: `cd frontend && npx vitest run src/api/solicitud.service.test.js src/api/cotizacion.service.test.js src/api/solicitudComentario.service.test.js`
Expected: PASS (9/9, 3/3, 2/2).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api/solicitud.service.js frontend/src/api/solicitud.service.test.js frontend/src/api/cotizacion.service.js frontend/src/api/cotizacion.service.test.js frontend/src/api/solicitudComentario.service.js frontend/src/api/solicitudComentario.service.test.js
git commit -m "feat(solicitudes): servicios API del frontend (solicitud, cotizacion, comentarios)"
```

---

## Task 7: Frontend — `SolicitudesListado.jsx`

**Files:**
- Create: `frontend/src/pages/solicitudes/SolicitudesListado.jsx`
- Create: `frontend/src/pages/solicitudes/SolicitudesListado.test.jsx`
- Modify: `frontend/src/App.jsx`

**Interfaces:**
- Consumes: `solicitudService.listar`, `solicitudService.listarTipos`, `solicitudService.crear` (Tarea 6); `areaService.listar` (ya existe); componentes comunes `Button, Input, Modal, EmptyState, DataTable, ViewToggle, StatusChip, FilterDropdown`; `useViewMode`, `useAuth`.
- Produces: página `SolicitudesListado` montada en `/solicitudes`.

- [ ] **Step 1: Escribir el test (falla primero)**

`frontend/src/pages/solicitudes/SolicitudesListado.test.jsx`:

```jsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SnackbarProvider } from 'notistack';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import SolicitudesListado from './SolicitudesListado';
import solicitudService from '../../api/solicitud.service';
import { useAuth } from '../../context/AuthContext';
import areaService from '../../api/area.service';

vi.mock('../../api/solicitud.service');
vi.mock('../../context/AuthContext');
vi.mock('../../api/area.service');

function renderPagina() {
  return render(
    <MemoryRouter initialEntries={['/solicitudes']}>
      <SnackbarProvider>
        <Routes>
          <Route path="/solicitudes" element={<SolicitudesListado />} />
          <Route path="/solicitudes/:id" element={<p>Detalle de Solicitud</p>} />
        </Routes>
      </SnackbarProvider>
    </MemoryRouter>
  );
}

describe('SolicitudesListado', () => {
  beforeEach(() => {
    useAuth.mockReturnValue({ tienePermiso: () => true });
    areaService.listar.mockResolvedValue([{ id: 7, nombre: 'Financiera' }]);
    solicitudService.listarTipos.mockResolvedValue([
      { id: 1, nombre: 'compra' },
      { id: 2, nombre: 'contratacion_servicio' },
    ]);
  });

  it('renders the list of solicitudes', async () => {
    solicitudService.listar.mockResolvedValue([
      { id: 1, codigo: 'SOL-2026-1', descripcion: 'Compra de sillas', montoEstimado: 500000, estado: 'cotizando' },
    ]);
    renderPagina();
    expect(await screen.findByText('SOL-2026-1')).toBeInTheDocument();
  });

  it('shows an empty state when there are no solicitudes', async () => {
    solicitudService.listar.mockResolvedValue([]);
    renderPagina();
    expect(await screen.findByText('Sin solicitudes todavía')).toBeInTheDocument();
  });

  it('creates a solicitud through the modal', async () => {
    solicitudService.listar.mockResolvedValue([]);
    solicitudService.crear.mockResolvedValue({ id: 2, codigo: 'SOL-2026-2' });
    renderPagina();

    await screen.findByText('Sin solicitudes todavía');
    await userEvent.click(screen.getByText('Crear solicitud'));
    await userEvent.selectOptions(screen.getByLabelText('Tipo de solicitud'), '1');
    await userEvent.selectOptions(screen.getByLabelText('Área solicitante'), '7');
    await userEvent.type(screen.getByLabelText('Descripción'), 'Compra de equipos');
    await userEvent.click(screen.getByRole('button', { name: 'Crear' }));

    await waitFor(() =>
      expect(solicitudService.crear).toHaveBeenCalledWith(
        expect.objectContaining({ tipoSolicitudId: 1, areaSolicitanteId: 7, descripcion: 'Compra de equipos' })
      )
    );
  });

  it('hides "Crear solicitud" when the user lacks the crear permission', async () => {
    useAuth.mockReturnValue({ tienePermiso: () => false });
    solicitudService.listar.mockResolvedValue([]);
    renderPagina();
    await screen.findByText('Sin solicitudes todavía');
    expect(screen.queryByText('Crear solicitud')).not.toBeInTheDocument();
  });

  it('filters solicitudes by estado', async () => {
    solicitudService.listar.mockResolvedValue([]);
    renderPagina();
    await screen.findByText('Sin solicitudes todavía');

    await userEvent.click(screen.getByLabelText('Estado'));
    await userEvent.click(await screen.findByRole('button', { name: 'Cotizando' }));

    await waitFor(() => expect(solicitudService.listar).toHaveBeenLastCalledWith({ estado: 'cotizando' }));
  });

  it('navigates to the solicitud detail when a table row is clicked', async () => {
    solicitudService.listar.mockResolvedValue([
      { id: 1, codigo: 'SOL-2026-1', descripcion: 'Compra de sillas', montoEstimado: 500000, estado: 'cotizando' },
    ]);
    renderPagina();

    await userEvent.click(await screen.findByText('SOL-2026-1'));
    expect(await screen.findByText('Detalle de Solicitud')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Ejecutar y confirmar que falla**

Run: `cd frontend && npx vitest run src/pages/solicitudes/SolicitudesListado.test.jsx`
Expected: FAIL — el módulo `./SolicitudesListado` no existe todavía.

- [ ] **Step 3: Crear la página**

`frontend/src/pages/solicitudes/SolicitudesListado.jsx`:

```jsx
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { useSnackbar } from 'notistack';
import { Plus, ClipboardList, AlertCircle } from 'lucide-react';
import solicitudService from '../../api/solicitud.service';
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
import FilterDropdown from '../../components/common/FilterDropdown/FilterDropdown';

const OPCIONES_ESTADO = [
  { value: 'cotizando', label: 'Cotizando' },
  { value: 'en_aprobacion', label: 'En aprobación' },
  { value: 'aprobada', label: 'Aprobada' },
  { value: 'rechazada', label: 'Rechazada' },
  { value: 'confirmada', label: 'Confirmada' },
  { value: 'cancelada', label: 'Cancelada' },
];

function SolicitudCard({ solicitud, onClick }) {
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
          <p className="font-semibold text-slate-800 dark:text-slate-100">{solicitud.codigo}</p>
          <p className="text-xs text-slate-400 dark:text-slate-500">{solicitud.descripcion}</p>
        </div>
        <ClipboardList className="w-8 h-8 text-slate-300 dark:text-slate-600" />
      </div>
      <StatusChip status={solicitud.estado} />
    </div>
  );
}

export default function SolicitudesListado() {
  const { tienePermiso } = useAuth();
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const { modo, setModo, esVistaMovil } = useViewMode('cod_view_solicitudes');
  const [solicitudes, setSolicitudes] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [filtroEstado, setFiltroEstado] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('');
  const [modalAbierto, setModalAbierto] = useState(false);
  const [areas, setAreas] = useState([]);
  const [tipos, setTipos] = useState([]);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm();

  async function cargarSolicitudes() {
    setCargando(true);
    try {
      const filtros = {};
      if (filtroEstado) filtros.estado = filtroEstado;
      if (filtroTipo) filtros.tipoSolicitudId = filtroTipo;
      const data = await solicitudService.listar(filtros);
      setSolicitudes(data);
    } catch (error) {
      setSolicitudes([]);
      enqueueSnackbar(error?.message || 'No se pudieron cargar las solicitudes', { variant: 'error' });
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargarSolicitudes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroEstado, filtroTipo]);

  useEffect(() => {
    async function cargarCatalogos() {
      try {
        const [datosAreas, datosTipos] = await Promise.all([areaService.listar(), solicitudService.listarTipos()]);
        setAreas(datosAreas);
        setTipos(datosTipos);
      } catch {
        setAreas([]);
        setTipos([]);
      }
    }
    cargarCatalogos();
  }, []);

  function cerrarModal() {
    setModalAbierto(false);
    reset();
  }

  async function onCrear(valores) {
    try {
      await solicitudService.crear({
        tipoSolicitudId: Number(valores.tipoSolicitudId),
        areaSolicitanteId: Number(valores.areaSolicitanteId),
        descripcion: valores.descripcion,
        montoEstimado: valores.montoEstimado ? Number(valores.montoEstimado) : null,
      });
      enqueueSnackbar('Solicitud creada exitosamente', { variant: 'success' });
      cerrarModal();
      await cargarSolicitudes();
    } catch (error) {
      enqueueSnackbar(error?.message || 'No se pudo crear la solicitud', { variant: 'error' });
    }
  }

  const opcionesTipo = tipos.map((tipo) => ({ value: tipo.id, label: tipo.nombre }));

  const columnas = [
    { key: 'codigo', label: 'Código' },
    { key: 'descripcion', label: 'Descripción' },
    { key: 'montoEstimado', label: 'Monto estimado' },
    { key: 'estado', label: 'Estado', render: (valor) => <StatusChip status={valor} /> },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h2 className="text-xl font-display font-semibold text-slate-800 dark:text-slate-100">Solicitudes de compra</h2>
        <div className="flex items-center gap-3">
          {!esVistaMovil && <ViewToggle modo={modo} onChange={setModo} />}
          {tienePermiso('solicitudes', 'crear') && (
            <Button icon={Plus} onClick={() => setModalAbierto(true)}>
              Crear solicitud
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-3 mb-6">
        <FilterDropdown label="Estado" options={OPCIONES_ESTADO} value={filtroEstado} onChange={setFiltroEstado} placeholder="Todos los estados" />
        <FilterDropdown label="Tipo" options={opcionesTipo} value={filtroTipo} onChange={setFiltroTipo} placeholder="Todos los tipos" />
      </div>

      {!cargando && solicitudes.length === 0 && (
        <EmptyState icon={ClipboardList} title="Sin solicitudes todavía" description="Crea la primera solicitud de compra para empezar su seguimiento." />
      )}

      {solicitudes.length > 0 && modo === 'lista' && (
        <DataTable columns={columnas} data={solicitudes} loading={cargando} emptyMessage="Sin solicitudes todavía" onRowClick={(solicitud) => navigate(`/solicitudes/${solicitud.id}`)} />
      )}

      {solicitudes.length > 0 && modo === 'tarjetas' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {solicitudes.map((solicitud) => (
            <SolicitudCard key={solicitud.id} solicitud={solicitud} onClick={() => navigate(`/solicitudes/${solicitud.id}`)} />
          ))}
        </div>
      )}

      <Modal
        isOpen={modalAbierto}
        onClose={cerrarModal}
        title="Crear solicitud"
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
            <label htmlFor="crear-tipo-solicitud" className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
              Tipo de solicitud
            </label>
            <select
              id="crear-tipo-solicitud"
              className="w-full py-2.5 px-4 border border-slate-200 dark:border-slate-600 rounded-xl text-sm bg-white dark:bg-centhrix-surface text-slate-900 dark:text-slate-100"
              {...register('tipoSolicitudId', { required: 'El tipo de solicitud es obligatorio' })}
            >
              <option value="">Selecciona un tipo</option>
              {tipos.map((tipo) => (
                <option key={tipo.id} value={tipo.id}>
                  {tipo.nombre}
                </option>
              ))}
            </select>
            {errors.tipoSolicitudId?.message && (
              <p role="alert" className="text-xs text-red-500 mt-1 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" aria-hidden="true" />
                {errors.tipoSolicitudId.message}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="crear-area-solicitante-sol" className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
              Área solicitante
            </label>
            <select
              id="crear-area-solicitante-sol"
              className="w-full py-2.5 px-4 border border-slate-200 dark:border-slate-600 rounded-xl text-sm bg-white dark:bg-centhrix-surface text-slate-900 dark:text-slate-100"
              {...register('areaSolicitanteId', { required: 'El área solicitante es obligatoria' })}
            >
              <option value="">Selecciona un área</option>
              {areas.map((area) => (
                <option key={area.id} value={area.id}>
                  {area.nombre}
                </option>
              ))}
            </select>
            {errors.areaSolicitanteId?.message && (
              <p role="alert" className="text-xs text-red-500 mt-1 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" aria-hidden="true" />
                {errors.areaSolicitanteId.message}
              </p>
            )}
          </div>

          <Input label="Descripción" error={errors.descripcion?.message} {...register('descripcion', { required: 'La descripción es obligatoria' })} />
          <Input label="Monto estimado" type="number" {...register('montoEstimado')} />
        </form>
      </Modal>
    </div>
  );
}
```

- [ ] **Step 4: Reemplazar el placeholder en `App.jsx`**

En `frontend/src/App.jsx`, reemplaza el import de `ProximamentePage` para Solicitudes agregando el nuevo import (junto a `import ProveedoresListado from './pages/proveedores/ProveedoresListado';`):

```js
import SolicitudesListado from './pages/solicitudes/SolicitudesListado';
```

Reemplaza el bloque de la ruta `/solicitudes` existente:

```jsx
<Route
  path="/solicitudes"
  element={
    <PermissionRoute modulo="solicitudes" accion="ver">
      <ProximamentePage nombre="Solicitudes" />
    </PermissionRoute>
  }
/>
```

por:

```jsx
<Route
  path="/solicitudes"
  element={
    <PermissionRoute modulo="solicitudes" accion="ver">
      <SolicitudesListado />
    </PermissionRoute>
  }
/>
```

(El import de `ProximamentePage` y su uso en `/formularios` y `/reportes` se mantienen sin cambios — solo se retira su uso en `/solicitudes`.)

- [ ] **Step 5: Ejecutar y confirmar que pasa**

Run: `cd frontend && npx vitest run src/pages/solicitudes/SolicitudesListado.test.jsx`
Expected: PASS (6/6).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/solicitudes/SolicitudesListado.jsx frontend/src/pages/solicitudes/SolicitudesListado.test.jsx frontend/src/App.jsx
git commit -m "feat(solicitudes): pantalla de listado, reemplaza el placeholder Proximamente"
```

---

## Task 8: Frontend — `SolicitudDetalle.jsx` (tabs Detalle / Cotizaciones / Comentarios)

**Files:**
- Create: `frontend/src/pages/solicitudes/SolicitudDetalle.jsx`
- Create: `frontend/src/pages/solicitudes/SolicitudDetalle.test.jsx`
- Modify: `frontend/src/App.jsx`

**Interfaces:**
- Consumes: `solicitudService.{obtener,enviarAprobacion,aprobar,rechazar,confirmar,cancelar}`, `cotizacionService.{listar,crear,seleccionar}`, `solicitudComentarioService.{listar,crear}` (Tarea 6); `proveedorService.listar` (ya existe, para el desplegable de proveedor en la cotización); `validarArchivo` (ya existe).
- Produces: página `SolicitudDetalle` montada en `/solicitudes/:id`.

- [ ] **Step 1: Escribir el test (falla primero)**

`frontend/src/pages/solicitudes/SolicitudDetalle.test.jsx`:

```jsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SnackbarProvider } from 'notistack';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import SolicitudDetalle from './SolicitudDetalle';
import solicitudService from '../../api/solicitud.service';
import cotizacionService from '../../api/cotizacion.service';
import solicitudComentarioService from '../../api/solicitudComentario.service';
import proveedorService from '../../api/proveedor.service';
import { useAuth } from '../../context/AuthContext';

vi.mock('../../api/solicitud.service');
vi.mock('../../api/cotizacion.service');
vi.mock('../../api/solicitudComentario.service');
vi.mock('../../api/proveedor.service');
vi.mock('../../context/AuthContext');

const SOLICITUD = {
  id: 1, codigo: 'SOL-2026-1', descripcion: 'Compra de sillas', montoEstimado: 500000,
  estado: 'cotizando', solicitanteUsuarioId: 42,
};

function renderPagina() {
  return render(
    <MemoryRouter initialEntries={['/solicitudes/1']}>
      <SnackbarProvider>
        <Routes>
          <Route path="/solicitudes/:id" element={<SolicitudDetalle />} />
          <Route path="/solicitudes" element={<p>Solicitudes</p>} />
        </Routes>
      </SnackbarProvider>
    </MemoryRouter>
  );
}

describe('SolicitudDetalle', () => {
  beforeEach(() => {
    useAuth.mockReturnValue({ user: { id: 42 }, tienePermiso: () => true });
    solicitudService.obtener.mockResolvedValue(SOLICITUD);
    cotizacionService.listar.mockResolvedValue([]);
    solicitudComentarioService.listar.mockResolvedValue([]);
    proveedorService.listar.mockResolvedValue([]);
  });

  it('shows the solicitud info', async () => {
    renderPagina();
    expect(await screen.findByText('SOL-2026-1')).toBeInTheDocument();
    expect(screen.getByText('Compra de sillas')).toBeInTheDocument();
  });

  it('disables "Enviar a aprobación" when there is no cotización seleccionada', async () => {
    renderPagina();
    await screen.findByText('SOL-2026-1');
    expect(screen.getByRole('button', { name: 'Enviar a aprobación' })).toBeDisabled();
  });

  it('enables "Enviar a aprobación" and sends it when a cotización is seleccionada', async () => {
    cotizacionService.listar.mockResolvedValue([{ id: 5, monto: 90000, seleccionada: true }]);
    solicitudService.enviarAprobacion.mockResolvedValue({ solicitud: { ...SOLICITUD, estado: 'en_aprobacion' } });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderPagina();
    await screen.findByText('SOL-2026-1');

    const boton = await screen.findByRole('button', { name: 'Enviar a aprobación' });
    expect(boton).not.toBeDisabled();
    await userEvent.click(boton);

    await waitFor(() => expect(solicitudService.enviarAprobacion).toHaveBeenCalledWith('1'));
  });

  it('shows Aprobar/Rechazar only while en_aprobacion, and aprueba exitosamente', async () => {
    solicitudService.obtener.mockResolvedValue({ ...SOLICITUD, estado: 'en_aprobacion' });
    solicitudService.aprobar.mockResolvedValue({ ...SOLICITUD, estado: 'aprobada' });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderPagina();
    await screen.findByText('SOL-2026-1');

    await userEvent.click(screen.getByRole('button', { name: 'Aprobar' }));
    await waitFor(() => expect(solicitudService.aprobar).toHaveBeenCalledWith('1'));
  });

  it('rejects a solicitud with a motivo', async () => {
    solicitudService.obtener.mockResolvedValue({ ...SOLICITUD, estado: 'en_aprobacion' });
    solicitudService.rechazar.mockResolvedValue({ ...SOLICITUD, estado: 'rechazada' });
    vi.spyOn(window, 'prompt').mockReturnValue('Sin presupuesto');
    renderPagina();
    await screen.findByText('SOL-2026-1');

    await userEvent.click(screen.getByRole('button', { name: 'Rechazar' }));
    await waitFor(() => expect(solicitudService.rechazar).toHaveBeenCalledWith('1', 'Sin presupuesto'));
  });

  it('shows "Cancelar" only for the owner while cotizando/en_aprobacion', async () => {
    renderPagina();
    await screen.findByText('SOL-2026-1');
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument();
  });

  it('hides "Cancelar" when the current user is not the owner', async () => {
    useAuth.mockReturnValue({ user: { id: 999 }, tienePermiso: () => true });
    renderPagina();
    await screen.findByText('SOL-2026-1');
    expect(screen.queryByRole('button', { name: 'Cancelar' })).not.toBeInTheDocument();
  });

  it('cancels the solicitud', async () => {
    solicitudService.cancelar.mockResolvedValue({ ...SOLICITUD, estado: 'cancelada' });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderPagina();
    await screen.findByText('SOL-2026-1');

    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(solicitudService.cancelar).toHaveBeenCalledWith('1'));
  });

  it('shows the confirmar form only when aprobada, and confirms with orden formal', async () => {
    solicitudService.obtener.mockResolvedValue({ ...SOLICITUD, estado: 'aprobada' });
    solicitudService.confirmar.mockResolvedValue({ ...SOLICITUD, estado: 'confirmada' });
    renderPagina();
    await screen.findByText('SOL-2026-1');

    await userEvent.type(screen.getByLabelText('Número de orden formal'), 'OF-2026-001');
    const archivo = new File(['contenido'], 'orden.pdf', { type: 'application/pdf' });
    await userEvent.upload(screen.getByLabelText('Archivo de la orden formal *'), archivo);
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    await waitFor(() => expect(solicitudService.confirmar).toHaveBeenCalledWith('1', expect.any(FormData)));
  });

  it('adds a cotización from the Cotizaciones tab', async () => {
    cotizacionService.crear.mockResolvedValue({ id: 5 });
    renderPagina();
    await screen.findByText('SOL-2026-1');
    await userEvent.click(screen.getByRole('tab', { name: 'Cotizaciones' }));

    await userEvent.type(screen.getByLabelText('Monto'), '90000');
    await userEvent.click(screen.getByRole('button', { name: 'Agregar cotización' }));

    await waitFor(() => expect(cotizacionService.crear).toHaveBeenCalledWith('1', expect.any(FormData)));
  });

  it('selects a cotización from the Cotizaciones tab', async () => {
    cotizacionService.listar.mockResolvedValue([{ id: 5, monto: 90000, seleccionada: false }]);
    cotizacionService.seleccionar.mockResolvedValue({ id: 5, seleccionada: true });
    renderPagina();
    await screen.findByText('SOL-2026-1');
    await userEvent.click(screen.getByRole('tab', { name: 'Cotizaciones' }));

    await userEvent.click(await screen.findByRole('button', { name: 'Seleccionar' }));
    await waitFor(() => expect(cotizacionService.seleccionar).toHaveBeenCalledWith('1', 5));
  });

  it('lists and posts comentarios', async () => {
    solicitudComentarioService.listar.mockResolvedValue([
      { id: 1, texto: 'Primer comentario', createdAt: '2026-07-01T00:00:00.000Z', Usuario: { nombre: 'Ana', apellido: 'Ruiz' } },
    ]);
    solicitudComentarioService.crear.mockResolvedValue({ id: 2 });
    renderPagina();
    await screen.findByText('SOL-2026-1');
    await userEvent.click(screen.getByRole('tab', { name: 'Comentarios' }));

    expect(await screen.findByText('Primer comentario')).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Comentario'), 'Segundo comentario');
    await userEvent.click(screen.getByRole('button', { name: 'Comentar' }));

    await waitFor(() => expect(solicitudComentarioService.crear).toHaveBeenCalledWith('1', 'Segundo comentario'));
  });

  it('hides "Comentar" when the user lacks the comentar permission', async () => {
    useAuth.mockReturnValue({ user: { id: 42 }, tienePermiso: (modulo, accion) => accion !== 'comentar' });
    renderPagina();
    await screen.findByText('SOL-2026-1');
    await userEvent.click(screen.getByRole('tab', { name: 'Comentarios' }));

    expect(screen.queryByRole('button', { name: 'Comentar' })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Ejecutar y confirmar que falla**

Run: `cd frontend && npx vitest run src/pages/solicitudes/SolicitudDetalle.test.jsx`
Expected: FAIL — el módulo `./SolicitudDetalle` no existe todavía.

- [ ] **Step 3: Crear la página**

`frontend/src/pages/solicitudes/SolicitudDetalle.jsx`:

```jsx
import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { useSnackbar } from 'notistack';
import { ArrowLeft, CheckCircle, XCircle, Send, Upload, Ban, ClipboardList, Star } from 'lucide-react';
import solicitudService from '../../api/solicitud.service';
import cotizacionService from '../../api/cotizacion.service';
import solicitudComentarioService from '../../api/solicitudComentario.service';
import proveedorService from '../../api/proveedor.service';
import { useAuth } from '../../context/AuthContext';
import Button from '../../components/common/Button/Button';
import Input from '../../components/common/Input/Input';
import EmptyState from '../../components/common/EmptyState/EmptyState';
import StatusChip from '../../components/common/StatusChip/StatusChip';
import { validarArchivo, TIPOS_PERMITIDOS } from '../../utils/validarArchivo';

const TIPOS_PERMITIDOS_ACCEPT = [...TIPOS_PERMITIDOS].join(',');

const VOLVER_CLASSNAME =
  'inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-xl bg-white dark:bg-centhrix-card text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-centhrix-surface transition-colors';

export default function SolicitudDetalle() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, tienePermiso } = useAuth();
  const { enqueueSnackbar } = useSnackbar();

  const [solicitud, setSolicitud] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [tabActiva, setTabActiva] = useState('detalle');
  const [cotizaciones, setCotizaciones] = useState([]);
  const [comentarios, setComentarios] = useState([]);
  const [proveedores, setProveedores] = useState([]);
  const [archivoErrorCotizacion, setArchivoErrorCotizacion] = useState(null);
  const [archivoErrorConfirmar, setArchivoErrorConfirmar] = useState(null);

  const { register: registerCotizacion, handleSubmit: handleSubmitCotizacion, reset: resetCotizacion } = useForm();
  const { register: registerComentario, handleSubmit: handleSubmitComentario, reset: resetComentario } = useForm();
  const { register: registerConfirmar, handleSubmit: handleSubmitConfirmar, reset: resetConfirmar } = useForm();

  async function cargarSolicitud() {
    setCargando(true);
    try {
      const data = await solicitudService.obtener(id);
      setSolicitud(data);
    } catch (error) {
      enqueueSnackbar(error?.message || 'No se pudo cargar la solicitud', { variant: 'error' });
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargarSolicitud();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function cargarCotizaciones() {
    try {
      const data = await cotizacionService.listar(id);
      setCotizaciones(data);
    } catch {
      setCotizaciones([]);
    }
  }

  useEffect(() => {
    cargarCotizaciones();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function cargarComentarios() {
    try {
      const data = await solicitudComentarioService.listar(id);
      setComentarios(data);
    } catch {
      setComentarios([]);
    }
  }

  useEffect(() => {
    cargarComentarios();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    async function cargarProveedores() {
      try {
        const data = await proveedorService.listar({ estado: 'activo' });
        setProveedores(data);
      } catch {
        setProveedores([]);
      }
    }
    cargarProveedores();
  }, []);

  async function onEnviarAprobacion() {
    if (!window.confirm('¿Enviar esta solicitud a aprobación con la cotización seleccionada?')) return;
    try {
      await solicitudService.enviarAprobacion(id);
      enqueueSnackbar('Solicitud enviada a aprobación', { variant: 'success' });
      await cargarSolicitud();
    } catch (error) {
      enqueueSnackbar(error?.message || 'No se pudo enviar la solicitud a aprobación', { variant: 'error' });
    }
  }

  async function onAprobar() {
    if (!window.confirm('¿Aprobar esta solicitud?')) return;
    try {
      await solicitudService.aprobar(id);
      enqueueSnackbar('Solicitud aprobada', { variant: 'success' });
      await cargarSolicitud();
    } catch (error) {
      enqueueSnackbar(error?.message || 'No se pudo aprobar la solicitud', { variant: 'error' });
    }
  }

  async function onRechazar() {
    const motivo = window.prompt('Motivo del rechazo:');
    if (motivo === null) return;
    if (!motivo.trim()) {
      enqueueSnackbar('El motivo del rechazo es obligatorio', { variant: 'error' });
      return;
    }
    try {
      await solicitudService.rechazar(id, motivo);
      enqueueSnackbar('Solicitud rechazada', { variant: 'success' });
      await cargarSolicitud();
    } catch (error) {
      enqueueSnackbar(error?.message || 'No se pudo rechazar la solicitud', { variant: 'error' });
    }
  }

  async function onCancelar() {
    if (!window.confirm('¿Cancelar esta solicitud? Esta acción no se puede deshacer.')) return;
    try {
      await solicitudService.cancelar(id);
      enqueueSnackbar('Solicitud cancelada', { variant: 'success' });
      await cargarSolicitud();
    } catch (error) {
      enqueueSnackbar(error?.message || 'No se pudo cancelar la solicitud', { variant: 'error' });
    }
  }

  async function onConfirmar(valores) {
    const archivo = valores.archivo?.[0];
    const errorArchivo = validarArchivo(archivo);
    if (errorArchivo) {
      setArchivoErrorConfirmar(errorArchivo);
      return;
    }
    setArchivoErrorConfirmar(null);

    const formData = new FormData();
    formData.append('ordenFormalNumero', valores.ordenFormalNumero);
    formData.append('archivo', archivo);

    try {
      await solicitudService.confirmar(id, formData);
      enqueueSnackbar('Solicitud confirmada', { variant: 'success' });
      resetConfirmar();
      await cargarSolicitud();
    } catch (error) {
      enqueueSnackbar(error?.message || 'No se pudo confirmar la solicitud', { variant: 'error' });
    }
  }

  async function onCrearCotizacion(valores) {
    const archivo = valores.archivo?.[0];
    if (archivo) {
      const errorArchivo = validarArchivo(archivo);
      if (errorArchivo) {
        setArchivoErrorCotizacion(errorArchivo);
        return;
      }
    }
    setArchivoErrorCotizacion(null);

    const formData = new FormData();
    if (valores.proveedorId) formData.append('proveedorId', valores.proveedorId);
    formData.append('monto', valores.monto);
    if (valores.observaciones) formData.append('observaciones', valores.observaciones);
    if (archivo) formData.append('archivo', archivo);

    try {
      await cotizacionService.crear(id, formData);
      enqueueSnackbar('Cotización agregada', { variant: 'success' });
      resetCotizacion();
      setArchivoErrorCotizacion(null);
      await cargarCotizaciones();
    } catch (error) {
      enqueueSnackbar(error?.message || 'No se pudo agregar la cotización', { variant: 'error' });
    }
  }

  async function onSeleccionarCotizacion(cotizacionId) {
    try {
      await cotizacionService.seleccionar(id, cotizacionId);
      enqueueSnackbar('Cotización seleccionada', { variant: 'success' });
      await cargarCotizaciones();
    } catch (error) {
      enqueueSnackbar(error?.message || 'No se pudo seleccionar la cotización', { variant: 'error' });
    }
  }

  async function onCrearComentario(valores) {
    try {
      await solicitudComentarioService.crear(id, valores.texto);
      enqueueSnackbar('Comentario agregado', { variant: 'success' });
      resetComentario();
      await cargarComentarios();
    } catch (error) {
      enqueueSnackbar(error?.message || 'No se pudo agregar el comentario', { variant: 'error' });
    }
  }

  if (cargando) return <p className="text-sm text-slate-500 dark:text-slate-400">Cargando...</p>;

  if (!solicitud) {
    return (
      <EmptyState
        icon={ClipboardList}
        title="No se pudo cargar la solicitud"
        description="La solicitud solicitada no existe o no está disponible."
        action={
          <Link to="/solicitudes" className={VOLVER_CLASSNAME}>
            <ArrowLeft className="w-4 h-4" />
            Volver a Solicitudes
          </Link>
        }
      />
    );
  }

  const esDueño = solicitud.solicitanteUsuarioId === user?.id;
  const hayCotizacionSeleccionada = cotizaciones.some((cotizacion) => cotizacion.seleccionada);

  return (
    <div>
      <button
        onClick={() => navigate('/solicitudes')}
        className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 mb-4"
      >
        <ArrowLeft className="w-4 h-4" /> Volver
      </button>

      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-display font-semibold text-slate-800 dark:text-slate-100">{solicitud.codigo}</h2>
          <p className="text-xs text-slate-400 dark:text-slate-500">{solicitud.descripcion}</p>
        </div>
        <StatusChip status={solicitud.estado} />
      </div>

      <div className="bg-white dark:bg-centhrix-card rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 overflow-hidden">
        <div role="tablist" aria-label="Secciones de la solicitud" className="flex border-b border-gray-100 dark:border-slate-700">
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
            aria-selected={tabActiva === 'cotizaciones'}
            onClick={() => setTabActiva('cotizaciones')}
            className={`px-6 py-4 text-sm font-medium ${tabActiva === 'cotizaciones' ? 'text-slate-900 dark:text-slate-100' : 'text-slate-500 dark:text-slate-400'}`}
          >
            Cotizaciones
          </button>
          <button
            role="tab"
            aria-selected={tabActiva === 'comentarios'}
            onClick={() => setTabActiva('comentarios')}
            className={`px-6 py-4 text-sm font-medium ${tabActiva === 'comentarios' ? 'text-slate-900 dark:text-slate-100' : 'text-slate-500 dark:text-slate-400'}`}
          >
            Comentarios
          </button>
        </div>

        <div className="p-6">
          {tabActiva === 'detalle' && (
            <div className="space-y-4">
              <div>
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Descripción</p>
                <p className="text-sm text-slate-700 dark:text-slate-200">{solicitud.descripcion}</p>
              </div>
              {solicitud.montoEstimado && (
                <div>
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Monto estimado</p>
                  <p className="text-sm text-slate-700 dark:text-slate-200">{solicitud.montoEstimado}</p>
                </div>
              )}
              {solicitud.ordenFormalNumero && (
                <div>
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Orden formal</p>
                  <p className="text-sm text-slate-700 dark:text-slate-200">{solicitud.ordenFormalNumero}</p>
                </div>
              )}

              <div className="flex items-center gap-3 pt-2 flex-wrap">
                {solicitud.estado === 'cotizando' && tienePermiso('solicitudes', 'cotizar') && (
                  <Button icon={Send} onClick={onEnviarAprobacion} disabled={!hayCotizacionSeleccionada}>
                    Enviar a aprobación
                  </Button>
                )}
                {solicitud.estado === 'en_aprobacion' && tienePermiso('solicitudes', 'aprobar') && (
                  <>
                    <Button variant="success" icon={CheckCircle} onClick={onAprobar}>
                      Aprobar
                    </Button>
                    <Button variant="danger" icon={XCircle} onClick={onRechazar}>
                      Rechazar
                    </Button>
                  </>
                )}
                {['cotizando', 'en_aprobacion'].includes(solicitud.estado) && esDueño && (
                  <Button variant="danger" icon={Ban} onClick={onCancelar}>
                    Cancelar
                  </Button>
                )}
              </div>

              {solicitud.estado === 'aprobada' && tienePermiso('solicitudes', 'confirmar') && (
                <form className="space-y-4 pt-4 border-t border-gray-100 dark:border-slate-700">
                  <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Confirmar con orden formal</h3>
                  <Input label="Número de orden formal" {...registerConfirmar('ordenFormalNumero', { required: true })} />
                  <div>
                    <label htmlFor="confirmar-archivo" className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
                      Archivo de la orden formal *
                    </label>
                    <input id="confirmar-archivo" type="file" accept={TIPOS_PERMITIDOS_ACCEPT} className="w-full text-sm" {...registerConfirmar('archivo', { required: true })} />
                    {archivoErrorConfirmar && (
                      <p role="alert" className="text-xs text-red-500 mt-1">
                        {archivoErrorConfirmar}
                      </p>
                    )}
                  </div>
                  <Button icon={Upload} onClick={handleSubmitConfirmar(onConfirmar)}>
                    Confirmar
                  </Button>
                </form>
              )}
            </div>
          )}

          {tabActiva === 'cotizaciones' && (
            <div className="space-y-8">
              <div>
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3">Cotizaciones recibidas</h3>
                {cotizaciones.length === 0 ? (
                  <p className="text-sm text-slate-400 dark:text-slate-500">Sin cotizaciones todavía.</p>
                ) : (
                  <ul className="divide-y divide-gray-100 dark:divide-slate-700">
                    {cotizaciones.map((cotizacion) => (
                      <li key={cotizacion.id} className="py-3 flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm text-slate-700 dark:text-slate-200">
                            {cotizacion.Proveedor?.razonSocial || 'Sin proveedor asociado'} — {cotizacion.monto}
                          </p>
                          {cotizacion.observaciones && <p className="text-xs text-slate-400 dark:text-slate-500">{cotizacion.observaciones}</p>}
                        </div>
                        <div className="flex items-center gap-2">
                          {cotizacion.seleccionada && <StatusChip status="aprobado" customLabel="Seleccionada" />}
                          {!cotizacion.seleccionada && solicitud.estado === 'cotizando' && tienePermiso('solicitudes', 'cotizar') && (
                            <Button variant="outline" size="sm" icon={Star} onClick={() => onSeleccionarCotizacion(cotizacion.id)}>
                              Seleccionar
                            </Button>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {solicitud.estado === 'cotizando' && tienePermiso('solicitudes', 'cotizar') && (
                <form className="space-y-4 pt-4 border-t border-gray-100 dark:border-slate-700">
                  <Input label="Monto" type="number" {...registerCotizacion('monto', { required: true })} />
                  <div>
                    <label htmlFor="cotizacion-proveedorId" className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
                      Proveedor (opcional)
                    </label>
                    <select
                      id="cotizacion-proveedorId"
                      className="w-full py-2.5 px-4 border border-slate-200 dark:border-slate-600 rounded-xl text-sm bg-white dark:bg-centhrix-surface text-slate-900 dark:text-slate-100"
                      {...registerCotizacion('proveedorId')}
                    >
                      <option value="">Sin proveedor asociado</option>
                      {proveedores.map((proveedor) => (
                        <option key={proveedor.id} value={proveedor.id}>
                          {proveedor.razonSocial}
                        </option>
                      ))}
                    </select>
                  </div>
                  <Input label="Observaciones" {...registerCotizacion('observaciones')} />
                  <div>
                    <label htmlFor="cotizacion-archivo" className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
                      Archivo (opcional)
                    </label>
                    <input id="cotizacion-archivo" type="file" accept={TIPOS_PERMITIDOS_ACCEPT} className="w-full text-sm" {...registerCotizacion('archivo')} />
                    {archivoErrorCotizacion && (
                      <p role="alert" className="text-xs text-red-500 mt-1">
                        {archivoErrorCotizacion}
                      </p>
                    )}
                  </div>
                  <Button icon={Upload} onClick={handleSubmitCotizacion(onCrearCotizacion)}>
                    Agregar cotización
                  </Button>
                </form>
              )}
            </div>
          )}

          {tabActiva === 'comentarios' && (
            <div className="space-y-6">
              <ul className="divide-y divide-gray-100 dark:divide-slate-700">
                {comentarios.length === 0 && <li className="py-4 text-sm text-slate-400 dark:text-slate-500">Sin comentarios todavía.</li>}
                {comentarios.map((comentario) => (
                  <li key={comentario.id} className="py-3">
                    <p className="text-xs text-slate-400 dark:text-slate-500">
                      {comentario.Usuario ? `${comentario.Usuario.nombre} ${comentario.Usuario.apellido}` : 'Usuario'} — {new Date(comentario.createdAt).toLocaleString()}
                    </p>
                    <p className="text-sm text-slate-700 dark:text-slate-200">{comentario.texto}</p>
                  </li>
                ))}
              </ul>

              {tienePermiso('solicitudes', 'comentar') && (
                <form className="space-y-4 pt-4 border-t border-gray-100 dark:border-slate-700">
                  <Input label="Comentario" {...registerComentario('texto', { required: true })} />
                  <Button onClick={handleSubmitComentario(onCrearComentario)}>Comentar</Button>
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

- [ ] **Step 4: Agregar la ruta en `App.jsx`**

En `frontend/src/App.jsx`, agrega el import (junto al de `SolicitudesListado`):

```js
import SolicitudDetalle from './pages/solicitudes/SolicitudDetalle';
```

Agrega la ruta, justo después del bloque de `/solicitudes` (mismo patrón que `/proveedores/:id`):

```jsx
<Route
  path="/solicitudes/:id"
  element={
    <PermissionRoute modulo="solicitudes" accion="ver">
      <SolicitudDetalle />
    </PermissionRoute>
  }
/>
```

- [ ] **Step 5: Ejecutar y confirmar que pasa**

Run: `cd frontend && npx vitest run src/pages/solicitudes/SolicitudDetalle.test.jsx`
Expected: PASS (13/13).

Run también la suite completa del frontend para confirmar que nada se rompió: `cd frontend && npm test`
Expected: todos los tests en verde.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/solicitudes/SolicitudDetalle.jsx frontend/src/pages/solicitudes/SolicitudDetalle.test.jsx frontend/src/App.jsx
git commit -m "feat(solicitudes): pantalla de detalle con tabs Detalle/Cotizaciones/Comentarios"
```

---

## Verificación final

Antes de dar el ciclo por cerrado:

- [ ] `cd server && npm test` — suite completa en verde (incluye todos los tests nuevos de las Tareas 1-5 más los preexistentes).
- [ ] `cd frontend && npm test` — suite completa en verde (incluye todos los tests nuevos de las Tareas 6-8 más los preexistentes).
- [ ] Prueba manual rápida en el navegador (`npm run dev` en `server/` y `frontend/`): iniciar sesión como `admin`, crear una Solicitud, agregar dos cotizaciones, seleccionar una, enviar a aprobación, aprobar (con un usuario `aprobador_area` de la misma área), confirmar con un archivo, y verificar que el estado final es `confirmada` y aparece correctamente en el listado con su `StatusChip`.
