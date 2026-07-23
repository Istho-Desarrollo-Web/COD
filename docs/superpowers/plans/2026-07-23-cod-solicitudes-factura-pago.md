# Módulo de Solicitudes/Compras — ciclo 2 (Factura/Pago) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cerrar el ciclo de vida de `Solicitud` agregando el paso factura/pago: un nuevo modelo `Factura` (1:1 con `Solicitud`), un endpoint que registra factura+pago en un solo paso y transiciona `confirmada → cerrada`, un endpoint de descarga del archivo, y la UI correspondiente dentro de `SolicitudDetalle.jsx`.

**Architecture:** Backend: modelo `Factura` (migración + asociación `hasOne`/`belongsTo`), sub-recurso `factura.controller.js` montado directamente en `solicitud.routes.js` (mismo patrón que `cotizacion.controller.js`/`solicitudComentario.controller.js` — sin un archivo `factura.routes.js` separado, ya que este proyecto no usa routers por sub-recurso), nuevo permiso `solicitudes:facturar` seedeado solo a `gestor_compras`. Frontend: `factura.service.js` (wrapper de API) y una extensión de la pestaña "Detalle" ya existente en `SolicitudDetalle.jsx` — sin pestaña nueva.

**Tech Stack:** Node/Express + Sequelize (MySQL) en `server/`; React (Vite) + React Hook Form + Vitest/Testing Library en `frontend/`; Jest + supertest para tests de integración backend.

## Global Constraints

- Una sola `Factura` por `Solicitud` — FK `solicitudId` con `unique: true` a nivel de columna, sin modelo `Pago` separado ni pagos parciales.
- Los campos de pago (`fechaPago`) viven dentro de `Factura`; no hay un campo `montoPagado` separado — `monto` representa el total ya pagado.
- Un solo archivo por request (`subirArchivoUnico`, campo `archivo`) — sin comprobante de pago como archivo separado, sin middleware nuevo de multer.
- Sin estado intermedio `'facturada'` — `POST /:id/facturar` mueve `Solicitud.estado` de `'confirmada'` directamente a `'cerrada'` en una sola operación.
- Nuevo permiso `solicitudes:facturar` en `CATALOGO_MODULOS.solicitudes` (`server/src/models/Permiso.js`) y en el seed (`server/src/scripts/seedRolesPermisos.js`), asignado **únicamente** a `gestor_compras` — no se agrega a `aprobador_area`/`aprobador_ejecutivo`.
- `GET /solicitudes/:id/factura` devuelve `200` con `data: null` cuando la solicitud no tiene factura todavía (nunca `404` por ausencia de factura — `404` es solo para `Solicitud` inexistente).
- Descarga del archivo vía endpoint dedicado y autenticado `GET /solicitudes/:id/factura/descargar` (`res.download(obtenerRutaAbsoluta(...))`, mismo patrón que `proveedorDocumento.controller.js`), no un archivo servido estáticamente.
- Toda mutación (`Factura`, `Solicitud`) registra en `Auditoria.registrar(...)`, igual que el resto del sistema.
- Visibilidad: usa el helper centralizado `tieneVisibilidadAmplia` de `server/src/utils/visibilidadSolicitud.js` — nunca una copia local del chequeo.
- Frontend: `describe`/`it` en inglés, `vi.mock(...)` para servicios (Vitest + Testing Library), mismo patrón de `FormData` + `Content-Type: undefined` que el resto de `frontend/src/api/*.service.js`.
- Spec de referencia: `docs/superpowers/specs/2026-07-22-cod-solicitudes-factura-pago-design.md`.

---

### Task 1: Backend — Modelo `Factura` + migración + asociación

**Files:**
- Create: `server/src/migrations/20260723100000-crear-facturas.js`
- Create: `server/src/models/Factura.js`
- Modify: `server/src/models/index.js`
- Modify: `server/tests/integration/solicitud.test.js`

**Interfaces:**
- Consumes: nada nuevo — usa `Solicitud` y `Usuario`, ya existentes en `server/src/models/index.js`.
- Produces: modelo `Factura` exportado desde `server/src/models/index.js` con campos `{ id, solicitudId, numero, monto, fechaPago, facturaS3Key, observaciones, createdAt, updatedAt }`; asociación `Solicitud.hasOne(Factura, { foreignKey: 'solicitudId' })` / `Factura.belongsTo(Solicitud, { foreignKey: 'solicitudId' })`. Las Tareas 2 y 3 dependen de este modelo.

- [ ] **Step 1: Escribir el test que falla**

Modificar `server/tests/integration/solicitud.test.js`: agregar `Factura` al `require` de la línea 3 (queda `const { Area, TipoSolicitud, NivelAprobacion, Solicitud, Cotizacion, SolicitudAprobacion, Usuario, Rol, Proveedor, SolicitudComentario, Factura } = require('../../src/models');`) y agregar al final del archivo (después del `describe('SolicitudComentario', ...)` existente):

```js
describe('Factura', () => {
  it('vincula una Factura 1:1 a una Solicitud e impide una segunda factura para la misma solicitud', async () => {
    const area = await Area.create({ nombre: 'Factura Modelo', codigo: `FACTURAMODELO${Date.now()}` });
    const tipo = await TipoSolicitud.findOne({ where: { nombre: 'compra' } });
    const solicitante = await Usuario.unscoped().findOne({ where: { username: 'admin' } });

    const solicitud = await Solicitud.create({
      codigo: `SOL-FACTURA-${Date.now()}`, tipoSolicitudId: tipo.id, areaSolicitanteId: area.id,
      solicitanteUsuarioId: solicitante.id, descripcion: 'Solicitud para facturar', estado: 'confirmada',
    });

    const factura = await Factura.create({
      solicitudId: solicitud.id, numero: 'FAC-001', monto: 90000,
      fechaPago: '2026-07-23', facturaS3Key: 'solicitudes/1/factura.pdf',
    });

    expect(factura.solicitudId).toBe(solicitud.id);

    const conSolicitud = await Factura.findByPk(factura.id, { include: Solicitud });
    expect(conSolicitud.Solicitud.id).toBe(solicitud.id);

    await expect(
      Factura.create({ solicitudId: solicitud.id, numero: 'FAC-002', monto: 50000, fechaPago: '2026-07-24', facturaS3Key: 'solicitudes/1/factura2.pdf' })
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `cd server && npx jest tests/integration/solicitud.test.js -t "Factura"`
Expected: FAIL con `TypeError: Cannot read properties of undefined (reading 'create')` (`Factura` es `undefined` — todavía no existe en `models/index.js`).

- [ ] **Step 3: Crear la migración**

`server/src/migrations/20260723100000-crear-facturas.js`:

```js
module.exports = {
  up: async ({ context: queryInterface }) => {
    const { DataTypes } = require('sequelize');

    await queryInterface.createTable('facturas', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      solicitud_id: {
        type: DataTypes.INTEGER, allowNull: false, unique: true,
        references: { model: 'solicitudes', key: 'id' },
      },
      numero: { type: DataTypes.STRING(30), allowNull: false },
      monto: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
      fecha_pago: { type: DataTypes.DATEONLY, allowNull: false },
      factura_s3_key: { type: DataTypes.STRING(500), allowNull: false },
      observaciones: { type: DataTypes.TEXT, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false },
      updated_at: { type: DataTypes.DATE, allowNull: false },
    });
  },
  down: async ({ context: queryInterface }) => {
    await queryInterface.dropTable('facturas');
  },
};
```

- [ ] **Step 4: Crear el modelo**

`server/src/models/Factura.js`:

```js
const { DataTypes } = require('sequelize');

module.exports = (sequelize) =>
  sequelize.define(
    'Factura',
    {
      solicitudId: { type: DataTypes.INTEGER, allowNull: false, unique: true },
      numero: { type: DataTypes.STRING(30), allowNull: false },
      monto: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
      fechaPago: { type: DataTypes.DATEONLY, allowNull: false },
      facturaS3Key: { type: DataTypes.STRING(500), allowNull: false },
      observaciones: { type: DataTypes.TEXT, allowNull: true },
    },
    { tableName: 'facturas', underscored: true }
  );
```

- [ ] **Step 5: Registrar el modelo y la asociación en `models/index.js`**

En `server/src/models/index.js`, después de la línea `const SolicitudComentario = require('./SolicitudComentario')(sequelize);` (línea 26), agregar:

```js
const Factura = require('./Factura')(sequelize);
```

Después del bloque de asociaciones de `SolicitudComentario` (después de la línea `SolicitudComentario.belongsTo(Usuario, { foreignKey: 'usuarioId' });`), agregar:

```js
Solicitud.hasOne(Factura, { foreignKey: 'solicitudId' });
Factura.belongsTo(Solicitud, { foreignKey: 'solicitudId' });
```

En el `module.exports`, agregar `Factura` a la lista (queda `TipoSolicitud, NivelAprobacion, Solicitud, Cotizacion, SolicitudAprobacion, SolicitudComentario, Factura,`).

- [ ] **Step 6: Correr el test para verificar que pasa**

Run: `cd server && npx jest tests/integration/solicitud.test.js -t "Factura"`
Expected: PASS (1 test).

Run también el archivo completo para confirmar que no rompe los tests existentes: `cd server && npx jest tests/integration/solicitud.test.js`
Expected: PASS (todos los tests del archivo).

- [ ] **Step 7: Commit**

```bash
git add server/src/migrations/20260723100000-crear-facturas.js server/src/models/Factura.js server/src/models/index.js server/tests/integration/solicitud.test.js
git commit -m "feat(solicitudes): modelo Factura y migracion (1:1 con Solicitud)"
```

---

### Task 2: Backend — Permiso `solicitudes:facturar` + `factura.controller.js` + rutas

**Files:**
- Modify: `server/src/models/Permiso.js`
- Modify: `server/src/scripts/seedRolesPermisos.js`
- Create: `server/src/controllers/factura.controller.js`
- Modify: `server/src/routes/solicitud.routes.js`
- Create: `server/tests/integration/factura.routes.test.js`

**Interfaces:**
- Consumes: `Factura`/`Solicitud`/`Auditoria` de `../models` (Task 1 y ya existentes); `tieneVisibilidadAmplia` de `../utils/visibilidadSolicitud`; `guardarArchivo`/`obtenerRutaAbsoluta` de `../services/almacenamiento.service`; `subirArchivoUnico` de `../middlewares/upload`; `success`/`created`/`notFound`/`badRequest`/`forbidden` de `../utils/responses`.
- Produces: `GET /solicitudes/:id/factura` (obtener), `POST /solicitudes/:id/facturar` (registrar factura+pago, multipart con campo `archivo`), `GET /solicitudes/:id/factura/descargar` (descarga autenticada). Permiso `solicitudes:facturar`, gateado solo a `gestor_compras` en el seed. La Tarea 3 (frontend) consume estas tres rutas.

- [ ] **Step 1: Escribir el test que falla**

Crear `server/tests/integration/factura.routes.test.js`:

```js
const request = require('supertest');
const path = require('path');
const bcrypt = require('bcryptjs');
const { sequelize } = require('../../src/config/database');
const { createMigrator } = require('../../src/config/migrator');
const seedRolesPermisos = require('../../src/scripts/seedRolesPermisos');
const seedNivelesAprobacion = require('../../src/scripts/seedNivelesAprobacion');
const { Rol, Usuario, Area, TipoSolicitud } = require('../../src/models');
const { invalidarCachePermisos } = require('../../src/middlewares/roles');
const { app } = require('../../server');

let adminToken;
let gestorComprasToken;
let solicitanteToken;
let otroSolicitanteToken;
let aprobadorAreaToken;
let area;
let tipoCompra;

async function crearUsuarioConRol(rolNombre, prefijo, areaId = null) {
  const rol = await Rol.findOne({ where: { nombre: rolNombre } });
  const username = `${prefijo}_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
  const usuario = await Usuario.create({
    username, email: `${username}@istho.com.co`,
    passwordHash: await bcrypt.hash('Clave123!', 10), nombre: prefijo, apellido: 'Factura', areaId,
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

  area = await Area.create({ nombre: 'Factura Area', codigo: `FACTURAAREA${Date.now()}` });
  tipoCompra = await TipoSolicitud.findOne({ where: { nombre: 'compra' } });

  const adminLogin = await request(app)
    .post('/api/v1/auth/login')
    .send({ username: 'admin', password: process.env.SEED_PASSWORD_ADMIN || 'CambiarAhora123!' });
  adminToken = adminLogin.body.data.token;

  gestorComprasToken = await crearUsuarioConRol('gestor_compras', 'gestor_compras_fac');
  solicitanteToken = await crearUsuarioConRol('solicitante', 'solicitante_fac', area.id);
  otroSolicitanteToken = await crearUsuarioConRol('solicitante', 'otro_solicitante_fac', area.id);
  aprobadorAreaToken = await crearUsuarioConRol('aprobador_area', 'aprobador_area_fac', area.id);
});

afterAll(async () => {
  await sequelize.close();
});

async function crearSolicitudConfirmada(monto = 500000) {
  const creada = await request(app)
    .post('/api/v1/solicitudes')
    .set('Authorization', `Bearer ${solicitanteToken}`)
    .send({ tipoSolicitudId: tipoCompra.id, areaSolicitanteId: area.id, descripcion: 'Solicitud para facturar', montoEstimado: monto });
  const solicitudId = creada.body.data.id;

  const cotizacionRes = await request(app)
    .post(`/api/v1/solicitudes/${solicitudId}/cotizaciones`)
    .set('Authorization', `Bearer ${gestorComprasToken}`)
    .send({ monto });
  const cotizacionId = cotizacionRes.body.data.id;
  await request(app)
    .post(`/api/v1/solicitudes/${solicitudId}/cotizaciones/${cotizacionId}/seleccionar`)
    .set('Authorization', `Bearer ${gestorComprasToken}`);
  await request(app).post(`/api/v1/solicitudes/${solicitudId}/enviar-aprobacion`).set('Authorization', `Bearer ${gestorComprasToken}`);
  await request(app).post(`/api/v1/solicitudes/${solicitudId}/aprobar`).set('Authorization', `Bearer ${aprobadorAreaToken}`);
  await request(app)
    .post(`/api/v1/solicitudes/${solicitudId}/confirmar`)
    .set('Authorization', `Bearer ${gestorComprasToken}`)
    .field('ordenFormalNumero', 'OF-2026-FAC')
    .attach('archivo', path.join(__dirname, '../fixtures/documento-prueba.pdf'));

  return solicitudId;
}

describe('Factura API', () => {
  it('registra la factura de una solicitud confirmada y la cierra', async () => {
    const solicitudId = await crearSolicitudConfirmada();
    const res = await request(app)
      .post(`/api/v1/solicitudes/${solicitudId}/facturar`)
      .set('Authorization', `Bearer ${gestorComprasToken}`)
      .field('numero', 'FAC-2026-001')
      .field('monto', 500000)
      .field('fechaPago', '2026-07-23')
      .attach('archivo', path.join(__dirname, '../fixtures/documento-prueba.pdf'));
    expect(res.status).toBe(201);
    expect(res.body.data.numero).toBe('FAC-2026-001');
    expect(res.body.data.solicitudId).toBe(solicitudId);

    const solicitudRes = await request(app)
      .get(`/api/v1/solicitudes/${solicitudId}`)
      .set('Authorization', `Bearer ${gestorComprasToken}`);
    expect(solicitudRes.body.data.estado).toBe('cerrada');
  });

  it('returns 400 cuando la solicitud no está confirmada', async () => {
    const creada = await request(app)
      .post('/api/v1/solicitudes')
      .set('Authorization', `Bearer ${solicitanteToken}`)
      .send({ tipoSolicitudId: tipoCompra.id, areaSolicitanteId: area.id, descripcion: 'Solicitud sin confirmar' });
    const res = await request(app)
      .post(`/api/v1/solicitudes/${creada.body.data.id}/facturar`)
      .set('Authorization', `Bearer ${gestorComprasToken}`)
      .field('numero', 'FAC-2026-002')
      .field('monto', 90000)
      .field('fechaPago', '2026-07-23')
      .attach('archivo', path.join(__dirname, '../fixtures/documento-prueba.pdf'));
    expect(res.status).toBe(400);
  });

  it('returns 400 cuando falta numero, monto, fechaPago o el archivo', async () => {
    const solicitudId = await crearSolicitudConfirmada();
    const res = await request(app)
      .post(`/api/v1/solicitudes/${solicitudId}/facturar`)
      .set('Authorization', `Bearer ${gestorComprasToken}`)
      .field('monto', 500000)
      .field('fechaPago', '2026-07-23')
      .attach('archivo', path.join(__dirname, '../fixtures/documento-prueba.pdf'));
    expect(res.status).toBe(400);
  });

  it('returns 403 cuando un rol sin el permiso facturar intenta registrar la factura', async () => {
    const solicitudId = await crearSolicitudConfirmada();
    const res = await request(app)
      .post(`/api/v1/solicitudes/${solicitudId}/facturar`)
      .set('Authorization', `Bearer ${aprobadorAreaToken}`)
      .field('numero', 'FAC-2026-003')
      .field('monto', 500000)
      .field('fechaPago', '2026-07-23')
      .attach('archivo', path.join(__dirname, '../fixtures/documento-prueba.pdf'));
    expect(res.status).toBe(403);
  });

  it('GET /:id/factura devuelve null antes de facturar y la factura completa después', async () => {
    const solicitudId = await crearSolicitudConfirmada();
    const antes = await request(app)
      .get(`/api/v1/solicitudes/${solicitudId}/factura`)
      .set('Authorization', `Bearer ${gestorComprasToken}`);
    expect(antes.status).toBe(200);
    expect(antes.body.data).toBeNull();

    await request(app)
      .post(`/api/v1/solicitudes/${solicitudId}/facturar`)
      .set('Authorization', `Bearer ${gestorComprasToken}`)
      .field('numero', 'FAC-2026-004')
      .field('monto', 500000)
      .field('fechaPago', '2026-07-23')
      .attach('archivo', path.join(__dirname, '../fixtures/documento-prueba.pdf'));

    const despues = await request(app)
      .get(`/api/v1/solicitudes/${solicitudId}/factura`)
      .set('Authorization', `Bearer ${gestorComprasToken}`);
    expect(despues.status).toBe(200);
    expect(despues.body.data.numero).toBe('FAC-2026-004');
  });

  it('returns 403 cuando un solicitante que no es el dueño intenta ver la factura, pero el dueño sí puede', async () => {
    const solicitudId = await crearSolicitudConfirmada();
    const resAjeno = await request(app)
      .get(`/api/v1/solicitudes/${solicitudId}/factura`)
      .set('Authorization', `Bearer ${otroSolicitanteToken}`);
    expect(resAjeno.status).toBe(403);

    const resDueño = await request(app)
      .get(`/api/v1/solicitudes/${solicitudId}/factura`)
      .set('Authorization', `Bearer ${solicitanteToken}`);
    expect(resDueño.status).toBe(200);
  });

  it('super_administrador (visibilidad amplia) puede ver la factura de una solicitud que no es suya', async () => {
    const solicitudId = await crearSolicitudConfirmada();
    const res = await request(app)
      .get(`/api/v1/solicitudes/${solicitudId}/factura`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
  });

  it('descarga el archivo de la factura', async () => {
    const solicitudId = await crearSolicitudConfirmada();
    await request(app)
      .post(`/api/v1/solicitudes/${solicitudId}/facturar`)
      .set('Authorization', `Bearer ${gestorComprasToken}`)
      .field('numero', 'FAC-2026-005')
      .field('monto', 500000)
      .field('fechaPago', '2026-07-23')
      .attach('archivo', path.join(__dirname, '../fixtures/documento-prueba.pdf'));

    const res = await request(app)
      .get(`/api/v1/solicitudes/${solicitudId}/factura/descargar`)
      .set('Authorization', `Bearer ${gestorComprasToken}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/pdf/);
  });

  it('returns 404 al descargar si la solicitud no tiene factura registrada', async () => {
    const solicitudId = await crearSolicitudConfirmada();
    const res = await request(app)
      .get(`/api/v1/solicitudes/${solicitudId}/factura/descargar`)
      .set('Authorization', `Bearer ${gestorComprasToken}`);
    expect(res.status).toBe(404);
  });

  it('returns 403 cuando un solicitante que no es el dueño intenta descargar la factura', async () => {
    const solicitudId = await crearSolicitudConfirmada();
    await request(app)
      .post(`/api/v1/solicitudes/${solicitudId}/facturar`)
      .set('Authorization', `Bearer ${gestorComprasToken}`)
      .field('numero', 'FAC-2026-006')
      .field('monto', 500000)
      .field('fechaPago', '2026-07-23')
      .attach('archivo', path.join(__dirname, '../fixtures/documento-prueba.pdf'));

    const res = await request(app)
      .get(`/api/v1/solicitudes/${solicitudId}/factura/descargar`)
      .set('Authorization', `Bearer ${otroSolicitanteToken}`);
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `cd server && npx jest tests/integration/factura.routes.test.js`
Expected: FAIL — las rutas `/solicitudes/:id/factura*` no existen todavía (`404` de Express, o error porque `requierePermiso('solicitudes', 'facturar')` no reconoce la acción `facturar` en el catálogo).

- [ ] **Step 3: Agregar el permiso `facturar` al catálogo**

En `server/src/models/Permiso.js`, línea 10, cambiar:

```js
  solicitudes: ['ver', 'crear', 'comentar', 'cotizar', 'aprobar', 'confirmar', 'exportar'],
```

por:

```js
  solicitudes: ['ver', 'crear', 'comentar', 'cotizar', 'aprobar', 'confirmar', 'facturar', 'exportar'],
```

- [ ] **Step 4: Agregar el permiso `facturar` al seed de `gestor_compras`**

En `server/src/scripts/seedRolesPermisos.js`, dentro de `PERMISOS_POR_ROL.gestor_compras` (línea 42), cambiar:

```js
    solicitudes: ['ver', 'crear', 'comentar', 'cotizar', 'confirmar'],
```

por:

```js
    solicitudes: ['ver', 'crear', 'comentar', 'cotizar', 'confirmar', 'facturar'],
```

- [ ] **Step 5: Crear el controller**

`server/src/controllers/factura.controller.js`:

```js
const { Solicitud, Factura, Auditoria } = require('../models');
const { success, created, notFound, badRequest, forbidden } = require('../utils/responses');
const { guardarArchivo, obtenerRutaAbsoluta } = require('../services/almacenamiento.service');
const { tieneVisibilidadAmplia } = require('../utils/visibilidadSolicitud');

// `obtener`/`descargar` están gateados por `solicitudes:ver`, que también
// tienen `solicitante`/`gestor_documental` (visibilidad restringida a lo
// propio); sin este chequeo, cualquier solicitante podría leer el monto o
// descargar el archivo de facturas de solicitudes ajenas recorriendo ids
// secuenciales (IDOR). `facturar` no lo necesita: está gateado por
// `solicitudes:facturar`, que en el seed actual solo tiene `gestor_compras`
// (rol de visibilidad amplia).
async function obtener(req, res) {
  const solicitud = await Solicitud.findByPk(req.params.id);
  if (!solicitud) return notFound(res, 'Solicitud no encontrada');

  if (!tieneVisibilidadAmplia(req.user.roles) && solicitud.solicitanteUsuarioId !== req.user.id) {
    return forbidden(res, 'No puedes ver la factura de esta solicitud');
  }

  const factura = await Factura.findOne({ where: { solicitudId: solicitud.id } });
  return success(res, factura);
}

async function facturar(req, res) {
  const solicitud = await Solicitud.findByPk(req.params.id);
  if (!solicitud) return notFound(res, 'Solicitud no encontrada');
  if (solicitud.estado !== 'confirmada') return badRequest(res, 'La solicitud debe estar confirmada para registrar su factura');

  const { numero, monto, fechaPago } = req.body;
  if (!numero || !monto || !fechaPago) return badRequest(res, 'numero, monto y fechaPago son obligatorios');
  if (!req.file) return badRequest(res, 'El archivo de la factura es obligatorio');

  const facturaExistente = await Factura.findOne({ where: { solicitudId: solicitud.id } });
  if (facturaExistente) return badRequest(res, 'Esta solicitud ya tiene una factura registrada');

  const { ruta } = guardarArchivo(req.file, `solicitudes/${solicitud.id}`);
  const factura = await Factura.create({
    solicitudId: solicitud.id, numero, monto, fechaPago, facturaS3Key: ruta,
  });
  await solicitud.update({ estado: 'cerrada' });

  await Auditoria.registrar({
    tabla: 'solicitudes', registroId: solicitud.id, accion: 'actualizar',
    usuarioId: req.user.id, usuarioNombre: req.user.nombreCompleto,
    descripcion: 'Solicitud cerrada con registro de factura y pago', datosNuevos: solicitud.toJSON(),
  });

  return created(res, 'Factura registrada', factura);
}

async function descargar(req, res) {
  const solicitud = await Solicitud.findByPk(req.params.id);
  if (!solicitud) return notFound(res, 'Solicitud no encontrada');

  if (!tieneVisibilidadAmplia(req.user.roles) && solicitud.solicitanteUsuarioId !== req.user.id) {
    return forbidden(res, 'No puedes descargar la factura de esta solicitud');
  }

  const factura = await Factura.findOne({ where: { solicitudId: solicitud.id } });
  if (!factura) return notFound(res, 'Esta solicitud no tiene una factura registrada');

  return res.download(obtenerRutaAbsoluta(factura.facturaS3Key));
}

module.exports = { obtener, facturar, descargar };
```

- [ ] **Step 6: Montar las rutas en `solicitud.routes.js`**

En `server/src/routes/solicitud.routes.js`, agregar el require después de la línea 8 (`const comentarioController = require('../controllers/solicitudComentario.controller');`):

```js
const facturaController = require('../controllers/factura.controller');
```

Y agregar, después de las rutas de `comentarioController` (después de la línea `router.post('/:id/comentarios', ...)`):

```js
router.get('/:id/factura', verificarToken, requierePermiso('solicitudes', 'ver'), asyncHandler(facturaController.obtener));
router.post('/:id/facturar', verificarToken, requierePermiso('solicitudes', 'facturar'), subirArchivoUnico, asyncHandler(facturaController.facturar));
router.get('/:id/factura/descargar', verificarToken, requierePermiso('solicitudes', 'ver'), asyncHandler(facturaController.descargar));
```

- [ ] **Step 7: Correr el test para verificar que pasa**

Run: `cd server && npx jest tests/integration/factura.routes.test.js`
Expected: PASS (10/10 tests).

Correr también la suite completa para confirmar que no hay regresiones: `cd server && npm test`
Expected: PASS (todos los tests, incluyendo los de ciclo 1).

- [ ] **Step 8: Commit**

```bash
git add server/src/models/Permiso.js server/src/scripts/seedRolesPermisos.js server/src/controllers/factura.controller.js server/src/routes/solicitud.routes.js server/tests/integration/factura.routes.test.js
git commit -m "feat(solicitudes): endpoint de factura/pago, cierra la solicitud (confirmada -> cerrada)"
```

---

### Task 3: Frontend — `factura.service.js`

**Files:**
- Create: `frontend/src/api/factura.service.js`
- Create: `frontend/src/api/factura.service.test.js`

**Interfaces:**
- Consumes: `apiClient` de `./client` (patrón ya usado por `cotizacion.service.js`/`proveedorDocumento.service.js`).
- Produces: `facturaService.obtener(solicitudId)` → `Promise<Factura|null>`; `facturaService.registrar(solicitudId, formData)` → `Promise<Factura>`; `facturaService.descargar(solicitudId)` → `Promise<void>` (dispara la descarga del archivo en el navegador). La Tarea 4 consume estas tres funciones.

- [ ] **Step 1: Escribir el test que falla**

Crear `frontend/src/api/factura.service.test.js`:

```js
import MockAdapter from 'axios-mock-adapter';
import apiClient from './client';
import facturaService from './factura.service';

describe('factura.service', () => {
  let mock;

  beforeEach(() => {
    mock = new MockAdapter(apiClient);
  });

  afterEach(() => {
    mock.restore();
  });

  it('obtener returns null when the solicitud has no factura yet', async () => {
    mock.onGet('/solicitudes/1/factura').reply(200, { success: true, data: null });
    const factura = await facturaService.obtener(1);
    expect(factura).toBeNull();
  });

  it('obtener returns the factura for a solicitud', async () => {
    mock.onGet('/solicitudes/1/factura').reply(200, { success: true, data: { id: 5, numero: 'FAC-2026-001' } });
    const factura = await facturaService.obtener(1);
    expect(factura).toEqual({ id: 5, numero: 'FAC-2026-001' });
  });

  it('registrar posts the given FormData and returns the created factura', async () => {
    const formData = new FormData();
    formData.append('numero', 'FAC-2026-001');
    mock.onPost('/solicitudes/1/facturar').reply(201, { success: true, data: { id: 5, numero: 'FAC-2026-001' } });
    const factura = await facturaService.registrar(1, formData);
    expect(factura).toEqual({ id: 5, numero: 'FAC-2026-001' });
    expect(mock.history.post[0].data).toBe(formData);
  });

  it('descargar fetches the file as a blob and triggers a download', async () => {
    const blob = new Blob(['contenido'], { type: 'application/pdf' });
    mock.onGet('/solicitudes/1/factura/descargar').reply(200, blob);

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

    await facturaService.descargar(1);

    expect(createObjectURL).toHaveBeenCalled();
    expect(click).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
    expect(enlaceCreado.download).toBe('solicitud-1-factura');

    document.createElement.mockRestore();
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `cd frontend && npx vitest run src/api/factura.service.test.js`
Expected: FAIL — `Failed to resolve import "./factura.service"`.

- [ ] **Step 3: Crear el servicio**

`frontend/src/api/factura.service.js`:

```js
import apiClient from './client';

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

async function obtener(solicitudId) {
  const response = await apiClient.get(`/solicitudes/${solicitudId}/factura`);
  return response.data;
}

async function registrar(solicitudId, formData) {
  const response = await apiClient.post(`/solicitudes/${solicitudId}/facturar`, formData, {
    headers: { 'Content-Type': undefined },
  });
  return response.data;
}

async function descargar(solicitudId) {
  const blob = await apiClient.get(`/solicitudes/${solicitudId}/factura/descargar`, { responseType: 'blob' });
  descargarBlob(blob, `solicitud-${solicitudId}-factura`);
}

export default { obtener, registrar, descargar };
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `cd frontend && npx vitest run src/api/factura.service.test.js`
Expected: PASS (4/4 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api/factura.service.js frontend/src/api/factura.service.test.js
git commit -m "feat(solicitudes): servicio API de factura en el frontend"
```

---

### Task 4: Frontend — extensión de `SolicitudDetalle.jsx`

**Files:**
- Modify: `frontend/src/pages/solicitudes/SolicitudDetalle.jsx`
- Modify: `frontend/src/pages/solicitudes/SolicitudDetalle.test.jsx`

**Interfaces:**
- Consumes: `facturaService.obtener/registrar/descargar` (Task 3); patrones ya existentes en el archivo (`useForm`, `validarArchivo`, `TIPOS_PERMITIDOS_ACCEPT`, `Input`, `Button`, `tienePermiso`, `enqueueSnackbar`).
- Produces: `SolicitudDetalle.jsx` con el formulario "Registrar factura" (visible cuando `estado === 'confirmada'` y `tienePermiso('solicitudes', 'facturar')`) y el bloque de solo lectura con botón "Descargar" (visible cuando `estado === 'cerrada'`), ambos dentro de la pestaña "Detalle" existente.

- [ ] **Step 1: Escribir los tests que fallan**

En `frontend/src/pages/solicitudes/SolicitudDetalle.test.jsx`, agregar el import después de la línea 9 (`import proveedorService from '../../api/proveedor.service';`):

```js
import facturaService from '../../api/factura.service';
```

Agregar el mock después de la línea 15 (`vi.mock('../../api/proveedor.service');`):

```js
vi.mock('../../api/factura.service');
```

En el `beforeEach` (dentro de `describe('SolicitudDetalle', ...)`), agregar después de la línea `proveedorService.listar.mockResolvedValue([]);`:

```js
    facturaService.obtener.mockResolvedValue(null);
```

Agregar, al final del archivo, antes del cierre `});` del `describe('SolicitudDetalle', ...)` (después del último `it(...)` — el de `'hides "Comentar" when the user lacks the comentar permission'`):

```js

  it('shows the "Registrar factura" form only when confirmada, and registra la factura', async () => {
    solicitudService.obtener.mockResolvedValue({ ...SOLICITUD, estado: 'confirmada' });
    facturaService.registrar.mockResolvedValue({ id: 9, numero: 'FAC-2026-001' });
    renderPagina();
    await screen.findByText('SOL-2026-1');

    await userEvent.type(screen.getByLabelText('Número de factura'), 'FAC-2026-001');
    await userEvent.type(screen.getByLabelText('Monto'), '500000');
    await userEvent.type(screen.getByLabelText('Fecha de pago'), '2026-07-23');
    const archivo = new File(['contenido'], 'factura.pdf', { type: 'application/pdf' });
    await userEvent.upload(screen.getByLabelText('Archivo de la factura *'), archivo);
    await userEvent.click(screen.getByRole('button', { name: 'Registrar factura' }));

    await waitFor(() => expect(facturaService.registrar).toHaveBeenCalledWith('1', expect.any(FormData)));
  });

  it('hides the "Registrar factura" form when the solicitud is not confirmada', async () => {
    renderPagina();
    await screen.findByText('SOL-2026-1');
    expect(screen.queryByRole('button', { name: 'Registrar factura' })).not.toBeInTheDocument();
  });

  it('shows the factura read-only block and downloads it when cerrada', async () => {
    solicitudService.obtener.mockResolvedValue({ ...SOLICITUD, estado: 'cerrada' });
    facturaService.obtener.mockResolvedValue({ id: 9, numero: 'FAC-2026-001', monto: 500000, fechaPago: '2026-07-23' });
    renderPagina();
    await screen.findByText('SOL-2026-1');

    expect(await screen.findByText('FAC-2026-001')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Descargar' }));
    expect(facturaService.descargar).toHaveBeenCalledWith('1');
  });
});
```

- [ ] **Step 2: Correr los tests para verificar que fallan**

Run: `cd frontend && npx vitest run src/pages/solicitudes/SolicitudDetalle.test.jsx`
Expected: FAIL — los 3 tests nuevos fallan porque el formulario/bloque de factura todavía no existe (`Unable to find a label with the text of: Número de factura`, etc.).

- [ ] **Step 3: Implementar la extensión en `SolicitudDetalle.jsx`**

Agregar el import después de la línea 9 (`import proveedorService from '../../api/proveedor.service';`):

```js
import facturaService from '../../api/factura.service';
```

Agregar el ícono `FileText` al import de `lucide-react` (línea 5), quedando:

```js
import { ArrowLeft, CheckCircle, XCircle, Send, Upload, Ban, ClipboardList, Star, FileText } from 'lucide-react';
```

Agregar el estado, después de la línea `const [archivoErrorConfirmar, setArchivoErrorConfirmar] = useState(null);`:

```js
  const [factura, setFactura] = useState(null);
  const [archivoErrorFactura, setArchivoErrorFactura] = useState(null);
```

Agregar el `useForm` de factura, después de la línea `const { register: registerConfirmar, handleSubmit: handleSubmitConfirmar, reset: resetConfirmar } = useForm();`:

```js
  const { register: registerFactura, handleSubmit: handleSubmitFactura, reset: resetFactura } = useForm();
```

Agregar la carga de la factura, después del bloque `useEffect(() => { cargarComentarios(); ... }, [id]);` (después de la línea 84):

```js

  async function cargarFactura() {
    try {
      const data = await facturaService.obtener(id);
      setFactura(data);
    } catch {
      setFactura(null);
    }
  }

  useEffect(() => {
    cargarFactura();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
```

Agregar el handler `onFacturar` y `onDescargarFactura`, después de la función `onConfirmar` (después de su llave de cierre, línea 168):

```js

  async function onFacturar(valores) {
    const archivo = valores.archivo?.[0];
    const errorArchivo = validarArchivo(archivo);
    if (errorArchivo) {
      setArchivoErrorFactura(errorArchivo);
      return;
    }
    setArchivoErrorFactura(null);

    const formData = new FormData();
    formData.append('numero', valores.numero);
    formData.append('monto', valores.monto);
    formData.append('fechaPago', valores.fechaPago);
    formData.append('archivo', archivo);

    try {
      await facturaService.registrar(id, formData);
      enqueueSnackbar('Factura registrada', { variant: 'success' });
      resetFactura();
      await cargarSolicitud();
      await cargarFactura();
    } catch (error) {
      enqueueSnackbar(error?.message || 'No se pudo registrar la factura', { variant: 'error' });
    }
  }

  async function onDescargarFactura() {
    try {
      await facturaService.descargar(id);
    } catch (error) {
      enqueueSnackbar(error?.message || 'No se pudo descargar la factura', { variant: 'error' });
    }
  }
```

En el JSX de la pestaña "Detalle", después del bloque `{solicitud.estado === 'aprobada' && tienePermiso('solicitudes', 'confirmar') && (...)}` (justo antes del cierre `</div>` de la línea 344 que cierra el `<div className="space-y-4">` de la pestaña Detalle), agregar:

```jsx

              {solicitud.estado === 'confirmada' && tienePermiso('solicitudes', 'facturar') && (
                <form className="space-y-4 pt-4 border-t border-gray-100 dark:border-slate-700">
                  <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Registrar factura</h3>
                  <Input label="Número de factura" {...registerFactura('numero', { required: true })} />
                  <Input label="Monto" type="number" {...registerFactura('monto', { required: true })} />
                  <Input label="Fecha de pago" type="date" {...registerFactura('fechaPago', { required: true })} />
                  <div>
                    <label htmlFor="factura-archivo" className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
                      Archivo de la factura *
                    </label>
                    <input id="factura-archivo" type="file" accept={TIPOS_PERMITIDOS_ACCEPT} className="w-full text-sm" {...registerFactura('archivo', { required: true })} />
                    {archivoErrorFactura && (
                      <p role="alert" className="text-xs text-red-500 mt-1">
                        {archivoErrorFactura}
                      </p>
                    )}
                  </div>
                  <Button icon={Upload} onClick={handleSubmitFactura(onFacturar)}>
                    Registrar factura
                  </Button>
                </form>
              )}

              {solicitud.estado === 'cerrada' && factura && (
                <div className="space-y-4 pt-4 border-t border-gray-100 dark:border-slate-700">
                  <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Factura</h3>
                  <div>
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Número de factura</p>
                    <p className="text-sm text-slate-700 dark:text-slate-200">{factura.numero}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Monto</p>
                    <p className="text-sm text-slate-700 dark:text-slate-200">{factura.monto}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Fecha de pago</p>
                    <p className="text-sm text-slate-700 dark:text-slate-200">{factura.fechaPago}</p>
                  </div>
                  <Button variant="outline" size="sm" icon={FileText} onClick={onDescargarFactura}>
                    Descargar
                  </Button>
                </div>
              )}
```

- [ ] **Step 4: Correr los tests para verificar que pasan**

Run: `cd frontend && npx vitest run src/pages/solicitudes/SolicitudDetalle.test.jsx`
Expected: PASS (todos los tests, incluyendo los 3 nuevos).

Correr también la suite completa del frontend para confirmar que no hay regresiones: `cd frontend && npm test`
Expected: PASS (todos los tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/solicitudes/SolicitudDetalle.jsx frontend/src/pages/solicitudes/SolicitudDetalle.test.jsx
git commit -m "feat(solicitudes): registrar y descargar factura desde el detalle de la solicitud"
```
