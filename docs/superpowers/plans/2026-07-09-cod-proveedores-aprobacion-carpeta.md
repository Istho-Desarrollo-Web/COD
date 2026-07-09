# Aprobación de Proveedores + Carpeta del Expediente Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar un flujo de Aprobar/Rechazar sobre `Proveedor` que, al aprobar, crea una carpeta real en el módulo Documentos (bajo el área que solicitó el proveedor) y refleja ahí los documentos ya subidos al expediente (`ProveedorDocumento`).

**Architecture:** Tres columnas nuevas nullable (`Proveedor.areaSolicitanteId`, `RequisitoProveedor.tipoDocumentoId`, `Carpeta.proveedorId`), dos endpoints nuevos (`POST /proveedores/:id/aprobar`, `POST /proveedores/:id/rechazar`) gateados por el permiso `proveedores:editar` ya existente, un servicio nuevo (`proveedorAprobacion.service.js`) que corre la creación de carpeta + reflejo de documentos dentro de una transacción de Sequelize, y dos piezas de frontend (selector de área al crear, botones Aprobar/Rechazar en el detalle).

**Tech Stack:** Node/Express/Sequelize (MySQL) + Jest/Supertest en el backend; React + react-hook-form + Vitest/Testing Library en el frontend — mismo stack que el resto del proyecto, sin dependencias nuevas.

## Global Constraints

- Las 3 columnas nuevas son aditivas y **nullable** en la migración — no requieren backfill de los proveedores/requisitos/carpetas ya existentes.
- `POST /proveedores` exige `areaSolicitanteId` a partir de este plan (`badRequest()` si falta) — los proveedores creados antes de este plan pueden completarlo después vía `PUT /proveedores/:id`.
- Aprobar/Rechazar solo son válidos mientras `Proveedor.estado === 'en_evaluacion'`; ambos gateados por el permiso ya existente `proveedores:editar` (no se agrega ninguna acción nueva al catálogo de permisos).
- `Auditoria.accion` es un ENUM fijo (`'crear' | 'actualizar' | 'eliminar' | 'login' | 'logout'`) — Aprobar y Rechazar registran `accion: 'actualizar'` con el detalle en `descripcion` (no se agrega ningún valor nuevo al ENUM).
- El reflejo de documentos ocurre **una única vez**, en el momento de aprobar — no hay sincronización continua con el expediente después de la aprobación (fuera de alcance, ver spec).
- El `TipoDocumento` de cada `Documento` reflejado se resuelve por `RequisitoProveedor.tipoDocumentoId` cuando el `ProveedorDocumento` tiene un requisito asociado con ese campo poblado; en cualquier otro caso (sin requisito, o requisito sin `tipoDocumentoId`) se usa el `TipoDocumento` genérico `"Documento de proveedor"`.
- Toda mutación nueva sigue el patrón ya establecido: `Auditoria.registrar(...)` se llama **después** de que la transacción de Sequelize (si la hay) resolvió con éxito, nunca dentro de ella (mismo patrón que `area.controller.js:crear`).
- Specs de referencia: `docs/superpowers/specs/2026-07-09-cod-proveedores-aprobacion-carpeta-design.md` (este plan) y `docs/superpowers/specs/2026-07-09-cod-proveedores-design.md` (módulo base ya implementado).

---

### Task 1: Migración de esquema + modelos + asociaciones

**Files:**
- Create: `server/src/migrations/20260709120000-agrega-columnas-aprobacion-proveedores.js`
- Modify: `server/src/models/Proveedor.js`
- Modify: `server/src/models/RequisitoProveedor.js`
- Modify: `server/src/models/Carpeta.js`
- Modify: `server/src/models/index.js`
- Test: `server/tests/integration/proveedor.test.js`

**Interfaces:**
- Produces: `Proveedor.areaSolicitanteId` (INTEGER, nullable, FK a `areas.id`), `RequisitoProveedor.tipoDocumentoId` (INTEGER, nullable, FK a `tipos_documento.id`), `Carpeta.proveedorId` (INTEGER, nullable, FK a `proveedores.id`); asociaciones `Area.hasMany(Proveedor, {foreignKey:'areaSolicitanteId'})`/`Proveedor.belongsTo(Area, {foreignKey:'areaSolicitanteId'})`, `TipoDocumento.hasMany(RequisitoProveedor, {foreignKey:'tipoDocumentoId'})`/`RequisitoProveedor.belongsTo(TipoDocumento, {foreignKey:'tipoDocumentoId'})`, `Proveedor.hasMany(Carpeta, {foreignKey:'proveedorId'})`/`Carpeta.belongsTo(Proveedor, {foreignKey:'proveedorId'})`.

- [ ] **Step 1: Escribir el test que falla**

Agregar al final de `server/tests/integration/proveedor.test.js` (después del `describe` existente). Primero, actualizar el require de modelos en la línea 3 para incluir `Area`, `TipoDocumento`, `Carpeta`:

```js
const { Proveedor, RequisitoProveedor, ProveedorDocumento, EvaluacionProveedor, Area, TipoDocumento, Carpeta } = require('../../src/models');
```

Y agregar este `describe` al final del archivo:

```js
describe('Columnas de aprobación (areaSolicitanteId, tipoDocumentoId, proveedorId)', () => {
  it('Proveedor.areaSolicitanteId referencia un Area', async () => {
    const area = await Area.create({ nombre: 'Compras', codigo: `COMPRAS${Date.now()}` });
    const proveedor = await Proveedor.create({
      tipo: 'proveedor', documentoIdentificacion: `920${Date.now()}`, razonSocial: 'Con Área SAS',
      areaSolicitanteId: area.id,
    });
    expect(proveedor.areaSolicitanteId).toBe(area.id);
  });

  it('RequisitoProveedor.tipoDocumentoId referencia un TipoDocumento', async () => {
    const tipoDocumento = await TipoDocumento.create({ nombre: `Tipo Prueba ${Date.now()}` });
    const requisito = await RequisitoProveedor.findOne({ where: { nombre: 'RUT' } });
    await requisito.update({ tipoDocumentoId: tipoDocumento.id });
    const recargado = await RequisitoProveedor.findByPk(requisito.id);
    expect(recargado.tipoDocumentoId).toBe(tipoDocumento.id);
  });

  it('Carpeta.proveedorId referencia un Proveedor, y es opcional para carpetas normales', async () => {
    const area = await Area.create({ nombre: 'Compras 2', codigo: `COMPRAS2${Date.now()}` });
    const proveedor = await Proveedor.create({
      tipo: 'proveedor', documentoIdentificacion: `921${Date.now()}`, razonSocial: 'Con Carpeta SAS', areaSolicitanteId: area.id,
    });
    const carpetaNormal = await Carpeta.create({ areaId: area.id, nombre: 'Procesos' });
    const carpetaDeProveedor = await Carpeta.create({ areaId: area.id, nombre: proveedor.razonSocial, proveedorId: proveedor.id });

    expect(carpetaNormal.proveedorId).toBeNull();
    expect(carpetaDeProveedor.proveedorId).toBe(proveedor.id);
  });
});
```

- [ ] **Step 2: Ejecutar el test y confirmar que falla**

Run: `cd server && npx jest tests/integration/proveedor.test.js --runInBand`
Expected: FAIL — `areaSolicitanteId`/`tipoDocumentoId`/`proveedorId` no existen todavía en las tablas ni en los modelos (error de columna desconocida o `undefined`).

- [ ] **Step 3: Crear la migración**

Crear `server/src/migrations/20260709120000-agrega-columnas-aprobacion-proveedores.js`:

```js
module.exports = {
  up: async ({ context: queryInterface }) => {
    const { DataTypes } = require('sequelize');

    await queryInterface.addColumn('proveedores', 'area_solicitante_id', {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'areas', key: 'id' },
    });

    await queryInterface.addColumn('requisitos_proveedor', 'tipo_documento_id', {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'tipos_documento', key: 'id' },
    });

    await queryInterface.addColumn('carpetas', 'proveedor_id', {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'proveedores', key: 'id' },
    });
  },
  down: async ({ context: queryInterface }) => {
    await queryInterface.removeColumn('carpetas', 'proveedor_id');
    await queryInterface.removeColumn('requisitos_proveedor', 'tipo_documento_id');
    await queryInterface.removeColumn('proveedores', 'area_solicitante_id');
  },
};
```

- [ ] **Step 4: Actualizar los modelos**

En `server/src/models/Proveedor.js`, agregar el campo dentro del objeto de definición (después de `responsableUsuarioId`):

```js
      responsableUsuarioId: { type: DataTypes.INTEGER, allowNull: true },
      areaSolicitanteId: { type: DataTypes.INTEGER, allowNull: true },
      estado: { type: DataTypes.ENUM('activo', 'inactivo', 'en_evaluacion', 'suspendido'), allowNull: false, defaultValue: 'en_evaluacion' },
```

En `server/src/models/RequisitoProveedor.js`, agregar el campo (después de `nombre`):

```js
      nombre: { type: DataTypes.STRING(150), allowNull: false, unique: true },
      tipoDocumentoId: { type: DataTypes.INTEGER, allowNull: true },
      criticidadMinima: { type: DataTypes.ENUM('alta', 'media', 'baja'), allowNull: false },
```

En `server/src/models/Carpeta.js`, agregar el campo (después de `carpetaPadreId`):

```js
      carpetaPadreId: { type: DataTypes.INTEGER, allowNull: true },
      proveedorId: { type: DataTypes.INTEGER, allowNull: true },
      orden: { type: DataTypes.INTEGER, defaultValue: 0 },
```

- [ ] **Step 5: Agregar las asociaciones en `models/index.js`**

Agregar estas líneas justo después del bloque existente `Proveedor.hasMany(EvaluacionProveedor, ...)` / `EvaluacionProveedor.belongsTo(Proveedor, ...)` (líneas 64-65):

```js
Area.hasMany(Proveedor, { foreignKey: 'areaSolicitanteId' });
Proveedor.belongsTo(Area, { foreignKey: 'areaSolicitanteId' });
TipoDocumento.hasMany(RequisitoProveedor, { foreignKey: 'tipoDocumentoId' });
RequisitoProveedor.belongsTo(TipoDocumento, { foreignKey: 'tipoDocumentoId' });
Proveedor.hasMany(Carpeta, { foreignKey: 'proveedorId' });
Carpeta.belongsTo(Proveedor, { foreignKey: 'proveedorId' });
```

- [ ] **Step 6: Ejecutar el test y confirmar que pasa**

Run: `cd server && npx jest tests/integration/proveedor.test.js --runInBand`
Expected: PASS (5 tests: 2 ya existentes + 3 nuevos)

- [ ] **Step 7: Commit**

```bash
git add server/src/migrations/20260709120000-agrega-columnas-aprobacion-proveedores.js server/src/models/Proveedor.js server/src/models/RequisitoProveedor.js server/src/models/Carpeta.js server/src/models/index.js server/tests/integration/proveedor.test.js
git commit -m "feat(backend): agrega columnas areaSolicitanteId, tipoDocumentoId y proveedorId"
```

---

### Task 2: Seeds — TipoDocumento genérico/nuevos + mapeo de RequisitoProveedor

**Files:**
- Modify: `server/src/scripts/seedTiposDocumento.js`
- Modify: `server/src/scripts/seedRequisitosProveedor.js`
- Test: `server/tests/integration/proveedor.test.js`

**Interfaces:**
- Consumes: `RequisitoProveedor.tipoDocumentoId` y `TipoDocumento` (Task 1).
- Produces: `TipoDocumento` filas seedeadas `"Cámara de Comercio"`, `"RUT"`, `"Póliza de responsabilidad civil"`, `"Documento de proveedor"` (además de las 7 ya existentes); cada uno de los 5 `RequisitoProveedor` seedeados queda con `tipoDocumentoId` apuntando al `TipoDocumento` de su mismo nombre.

- [ ] **Step 1: Escribir el test que falla**

Agregar al `describe('Proveedor domain', ...)` existente en `server/tests/integration/proveedor.test.js` (junto al test de `seedRequisitosProveedor is idempotent`, reemplazando el require de scripts en la línea 4 para incluir también `seedTiposDocumento`):

```js
const seedRequisitosProveedor = require('../../src/scripts/seedRequisitosProveedor');
const seedTiposDocumento = require('../../src/scripts/seedTiposDocumento');
```

Y este test nuevo dentro de `describe('Proveedor domain', ...)`:

```js
  it('seedRequisitosProveedor maps each requisito to a TipoDocumento of the same name', async () => {
    await seedTiposDocumento();
    await seedRequisitosProveedor();

    const rut = await RequisitoProveedor.findOne({ where: { nombre: 'RUT' } });
    const tipoRut = await TipoDocumento.findByPk(rut.tipoDocumentoId);
    expect(tipoRut.nombre).toBe('RUT');

    const sarlaft = await RequisitoProveedor.findOne({ where: { nombre: 'Certificado SARLAFT' } });
    const tipoSarlaft = await TipoDocumento.findByPk(sarlaft.tipoDocumentoId);
    expect(tipoSarlaft.nombre).toBe('Certificado SARLAFT');

    const generico = await TipoDocumento.findOne({ where: { nombre: 'Documento de proveedor' } });
    expect(generico).not.toBeNull();
  });
```

- [ ] **Step 2: Ejecutar el test y confirmar que falla**

Run: `cd server && npx jest tests/integration/proveedor.test.js --runInBand`
Expected: FAIL — `rut.tipoDocumentoId` es `null` (el seed todavía no lo asigna) y/o no existe un `TipoDocumento` llamado `'Documento de proveedor'`.

- [ ] **Step 3: Actualizar `seedTiposDocumento.js`**

Reemplazar el archivo completo:

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
  { nombre: 'Cámara de Comercio', diasAlertaVencimientoDefault: 30 },
  { nombre: 'RUT', diasAlertaVencimientoDefault: 30 },
  { nombre: 'Póliza de responsabilidad civil', diasAlertaVencimientoDefault: 30 },
  { nombre: 'Documento de proveedor', diasAlertaVencimientoDefault: 30 },
];

module.exports = async function seedTiposDocumento() {
  for (const tipo of TIPOS) {
    await TipoDocumento.findOrCreate({ where: { nombre: tipo.nombre }, defaults: tipo });
  }
};
```

- [ ] **Step 4: Actualizar `seedRequisitosProveedor.js`**

Reemplazar el archivo completo:

```js
const { RequisitoProveedor, TipoDocumento } = require('../models');

const REQUISITOS = [
  { nombre: 'Cámara de Comercio', criticidadMinima: 'baja', obligatorio: true, vigenciaAplica: false },
  { nombre: 'RUT', criticidadMinima: 'baja', obligatorio: true, vigenciaAplica: false },
  { nombre: 'Certificado SST', criticidadMinima: 'media', obligatorio: true, vigenciaAplica: true },
  { nombre: 'Certificado SARLAFT', criticidadMinima: 'alta', obligatorio: true, vigenciaAplica: true },
  { nombre: 'Póliza de responsabilidad civil', criticidadMinima: 'alta', obligatorio: true, vigenciaAplica: true },
];

module.exports = async function seedRequisitosProveedor() {
  for (const requisito of REQUISITOS) {
    const [fila] = await RequisitoProveedor.findOrCreate({ where: { nombre: requisito.nombre }, defaults: requisito });

    if (!fila.tipoDocumentoId) {
      const tipoDocumento = await TipoDocumento.findOne({ where: { nombre: requisito.nombre } });
      if (tipoDocumento) await fila.update({ tipoDocumentoId: tipoDocumento.id });
    }
  }
};
```

(Nota: `seedTiposDocumento()` debe correr antes que `seedRequisitosProveedor()` para que el `TipoDocumento` de cada nombre ya exista — los tests de integración que llaman a ambos scripts deben respetar ese orden; ver Task 4.)

- [ ] **Step 5: Ejecutar el test y confirmar que pasa**

Run: `cd server && npx jest tests/integration/proveedor.test.js --runInBand`
Expected: PASS (6 tests)

- [ ] **Step 6: Commit**

```bash
git add server/src/scripts/seedTiposDocumento.js server/src/scripts/seedRequisitosProveedor.js server/tests/integration/proveedor.test.js
git commit -m "feat(backend): mapea cada RequisitoProveedor a su TipoDocumento y agrega el genérico"
```

---

### Task 3: Exigir `areaSolicitanteId` al crear un Proveedor

**Files:**
- Modify: `server/src/controllers/proveedor.controller.js`
- Modify: `server/tests/integration/proveedor.routes.test.js`

**Interfaces:**
- Consumes: `Proveedor.areaSolicitanteId` (Task 1).
- Produces: `POST /proveedores` responde `400` si falta `areaSolicitanteId`; `PUT /proveedores/:id` acepta `areaSolicitanteId` como campo editable parcial (mismo patrón que `criticidad`/`categoria`).

- [ ] **Step 1: Escribir el test que falla**

En `server/tests/integration/proveedor.routes.test.js`, agregar el import de `Area` en la línea 7 y crear un fixture de área en `beforeAll`. Reemplazar las líneas 1-14:

```js
const request = require('supertest');
const bcrypt = require('bcryptjs');
const { sequelize } = require('../../src/config/database');
const { createMigrator } = require('../../src/config/migrator');
const seedRolesPermisos = require('../../src/scripts/seedRolesPermisos');
const seedRequisitosProveedor = require('../../src/scripts/seedRequisitosProveedor');
const seedTiposDocumento = require('../../src/scripts/seedTiposDocumento');
const { Rol, Usuario, Area } = require('../../src/models');
const { invalidarCachePermisos } = require('../../src/middlewares/roles');
const { app } = require('../../server');

let token;
let financieraToken;
let solicitanteToken;
let area;

beforeAll(async () => {
  await sequelize.authenticate();
  await createMigrator(sequelize).up();
  await seedTiposDocumento();
  await seedRolesPermisos();
  await seedRequisitosProveedor();
  invalidarCachePermisos();

  area = await Area.create({ nombre: 'Compras Proveedores', codigo: `COMPRASPROV${Date.now()}` });

```

(el resto de `beforeAll` — creación de `token`, `financieraToken`, `solicitanteToken` — queda igual que antes, solo se agregó `seedTiposDocumento`, el import de `Area` y la creación de `area` antes del login de admin.)

Ahora actualizar cada `.send({...})` de creación de proveedor en el archivo para incluir `areaSolicitanteId: area.id`. Reemplazar los 6 bloques `.send({ tipo: ..., documentoIdentificacion, razonSocial: ... })` existentes (tests `creates and lists...`, `returns 409...`, `allows financiera...`, `returns 403...`, `edits a proveedor...`) agregando `areaSolicitanteId: area.id` a cada uno. Por ejemplo, el primer test queda:

```js
  it('creates and lists a proveedor, defaulting estado to en_evaluacion', async () => {
    const documentoIdentificacion = `900${Date.now()}`;
    const createRes = await request(app)
      .post('/api/v1/proveedores')
      .set('Authorization', `Bearer ${token}`)
      .send({ tipo: 'proveedor', documentoIdentificacion, razonSocial: 'Insumos ABC SAS', criticidad: 'media', areaSolicitanteId: area.id });
    expect(createRes.status).toBe(201);
    expect(createRes.body.data.estado).toBe('en_evaluacion');

    const listRes = await request(app).get('/api/v1/proveedores').set('Authorization', `Bearer ${token}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.data.some((p) => p.documentoIdentificacion === documentoIdentificacion)).toBe(true);
  });
```

Aplicar el mismo agregado de `areaSolicitanteId: area.id` a los `.send(...)` de: `returns 409 (not a hang)...` (ambos `first` y `second`), `allows financiera to create a proveedor`, `returns 403 when solicitante tries...`, `edits a proveedor and gives it a logical baja on delete`. El test `returns 400 when razonSocial is missing` **no** se toca (debe seguir fallando por falta de `razonSocial`, no de área).

Y agregar este test nuevo al final de `describe('Proveedores API', ...)`:

```js
  it('returns 400 when areaSolicitanteId is missing', async () => {
    const res = await request(app)
      .post('/api/v1/proveedores')
      .set('Authorization', `Bearer ${token}`)
      .send({ tipo: 'proveedor', documentoIdentificacion: `906${Date.now()}`, razonSocial: 'Sin Área SAS' });
    expect(res.status).toBe(400);
  });

  it('allows setting areaSolicitanteId later via edit, for a proveedor created without one', async () => {
    const proveedorSinArea = await require('../../src/models').Proveedor.create({
      tipo: 'proveedor', documentoIdentificacion: `907${Date.now()}`, razonSocial: 'Legado SAS',
    });
    const editRes = await request(app)
      .put(`/api/v1/proveedores/${proveedorSinArea.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ areaSolicitanteId: area.id });
    expect(editRes.status).toBe(200);
    expect(editRes.body.data.areaSolicitanteId).toBe(area.id);
  });
```

- [ ] **Step 2: Ejecutar el test y confirmar que falla**

Run: `cd server && npx jest tests/integration/proveedor.routes.test.js --runInBand`
Expected: FAIL — el nuevo test `returns 400 when areaSolicitanteId is missing` recibe `201` en vez de `400` (el controlador todavía no lo exige).

- [ ] **Step 3: Actualizar `proveedor.controller.js`**

Reemplazar la función `crear`:

```js
async function crear(req, res) {
  const { tipo, documentoIdentificacion, razonSocial, criticidad, categoria, responsableUsuarioId, areaSolicitanteId } = req.body;

  if (!tipo || !documentoIdentificacion || !razonSocial || !areaSolicitanteId) {
    return badRequest(res, 'tipo, documentoIdentificacion, razonSocial y areaSolicitanteId son obligatorios');
  }

  // La unicidad de documentoIdentificacion la aplica la restricción UNIQUE de
  // la tabla; un duplicado lanza SequelizeUniqueConstraintError, que el
  // middleware de errores global (server.js) ya traduce a 409 — mismo
  // mecanismo que usa Area.codigo, sin necesidad de un pre-chequeo manual aquí.
  const proveedor = await Proveedor.create({
    tipo, documentoIdentificacion, razonSocial, areaSolicitanteId,
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
```

Y en `editar`, agregar `areaSolicitanteId` a la desestructuración y a los cambios parciales:

```js
async function editar(req, res) {
  const proveedor = await Proveedor.findByPk(req.params.id);
  if (!proveedor) return notFound(res, 'Proveedor no encontrado');

  const { razonSocial, criticidad, categoria, responsableUsuarioId, estado, areaSolicitanteId } = req.body;

  const datosAnteriores = proveedor.toJSON();
  const cambios = {};
  if (razonSocial !== undefined) cambios.razonSocial = razonSocial;
  if (criticidad !== undefined) cambios.criticidad = criticidad;
  if (categoria !== undefined) cambios.categoria = categoria;
  if (responsableUsuarioId !== undefined) cambios.responsableUsuarioId = responsableUsuarioId;
  if (estado !== undefined) cambios.estado = estado;
  if (areaSolicitanteId !== undefined) cambios.areaSolicitanteId = areaSolicitanteId;

  await proveedor.update(cambios);

  await Auditoria.registrar({
    tabla: 'proveedores', registroId: proveedor.id, accion: 'actualizar',
    usuarioId: req.user.id, usuarioNombre: req.user.nombreCompleto, datosAnteriores, datosNuevos: proveedor.toJSON(),
  });

  return success(res, proveedor);
}
```

- [ ] **Step 4: Ejecutar el test y confirmar que pasa**

Run: `cd server && npx jest tests/integration/proveedor.routes.test.js --runInBand`
Expected: PASS (10 tests: 8 ya existentes + 2 nuevos)

- [ ] **Step 5: Commit**

```bash
git add server/src/controllers/proveedor.controller.js server/tests/integration/proveedor.routes.test.js
git commit -m "feat(backend): exige areaSolicitanteId al crear un proveedor"
```

---

### Task 4: Servicio de aprobación + endpoints Aprobar/Rechazar

**Files:**
- Create: `server/src/services/proveedorAprobacion.service.js`
- Create: `server/tests/unit/proveedorAprobacion.service.test.js`
- Modify: `server/src/controllers/proveedor.controller.js`
- Modify: `server/src/routes/proveedor.routes.js`
- Modify: `server/tests/integration/proveedor.routes.test.js`

**Interfaces:**
- Consumes: `Proveedor.areaSolicitanteId`, `RequisitoProveedor.tipoDocumentoId`, `Carpeta.proveedorId` (Task 1); `TipoDocumento` `"Documento de proveedor"` seedeado y requisitos mapeados (Task 2); `guardarArchivo(file, subdir)`/`obtenerRutaAbsoluta(ruta)` de `server/src/services/almacenamiento.service.js`; `calcularEstadoDocumento({vigenciaHasta, diasAlerta})` de `server/src/services/documento.service.js`.
- Produces: `aprobarProveedor(proveedor)` — función async exportada por `proveedorAprobacion.service.js`, recibe la instancia de `Proveedor` ya cargada y devuelve `{ carpeta, documentosReflejados }` (`carpeta` es la subcarpeta del proveedor recién creada; `documentosReflejados` es un entero). Deja `proveedor.estado === 'activo'` al terminar (mismo objeto Sequelize actualizado). `POST /proveedores/:id/aprobar` y `POST /proveedores/:id/rechazar` en las rutas, gateados por `requierePermiso('proveedores', 'editar')`.

- [ ] **Step 1: Escribir el test del servicio (unitario) que falla**

Crear `server/tests/unit/proveedorAprobacion.service.test.js`:

```js
const path = require('path');
const fs = require('fs');
const { sequelize } = require('../../src/config/database');
const { createMigrator } = require('../../src/config/migrator');
const { Area, Proveedor, ProveedorDocumento, RequisitoProveedor, Carpeta, Documento } = require('../../src/models');
const seedTiposDocumento = require('../../src/scripts/seedTiposDocumento');
const seedRequisitosProveedor = require('../../src/scripts/seedRequisitosProveedor');
const { guardarArchivo } = require('../../src/services/almacenamiento.service');
const { aprobarProveedor } = require('../../src/services/proveedorAprobacion.service');

let area;
let requisitoRut;

beforeAll(async () => {
  await sequelize.authenticate();
  await createMigrator(sequelize).up();
  await seedTiposDocumento();
  await seedRequisitosProveedor();
  area = await Area.create({ nombre: 'Aprobación Servicio', codigo: `APRSERV${Date.now()}` });
  requisitoRut = await RequisitoProveedor.findOne({ where: { nombre: 'RUT' } });
});

afterAll(async () => {
  await sequelize.close();
});

async function crearProveedorConDocumento({ conRequisito = true } = {}) {
  const proveedor = await Proveedor.create({
    tipo: 'proveedor', documentoIdentificacion: `930${Date.now()}${Math.random()}`, razonSocial: `Aprobado ${Date.now()}`,
    areaSolicitanteId: area.id,
  });
  const { ruta } = guardarArchivo(
    { originalname: 'rut-original.pdf', buffer: Buffer.from('contenido de prueba') },
    `proveedores/${proveedor.id}`
  );
  await ProveedorDocumento.create({
    proveedorId: proveedor.id,
    requisitoId: conRequisito ? requisitoRut.id : null,
    s3Key: ruta,
    vigenciaHasta: '2099-01-01',
    estado: 'vigente',
  });
  return proveedor;
}

describe('proveedorAprobacion.service', () => {
  it('crea la carpeta raíz "Proveedores" y una subcarpeta con el nombre del proveedor', async () => {
    const proveedor = await crearProveedorConDocumento();
    const { carpeta } = await aprobarProveedor(proveedor);

    expect(carpeta.nombre).toBe(proveedor.razonSocial);
    expect(carpeta.proveedorId).toBe(proveedor.id);

    const raiz = await Carpeta.findByPk(carpeta.carpetaPadreId);
    expect(raiz.nombre).toBe('Proveedores');
    expect(raiz.areaId).toBe(area.id);
    expect(raiz.proveedorId).toBeNull();
  });

  it('refleja cada ProveedorDocumento como un Documento en la subcarpeta, usando el tipoDocumento del requisito', async () => {
    const proveedor = await crearProveedorConDocumento({ conRequisito: true });
    const { carpeta, documentosReflejados } = await aprobarProveedor(proveedor);

    expect(documentosReflejados).toBe(1);
    const documentos = await Documento.findAll({ where: { carpetaId: carpeta.id } });
    expect(documentos).toHaveLength(1);
    expect(documentos[0].nombre).toBe('RUT');
    expect(documentos[0].areaId).toBe(area.id);

    const tipoDocumento = await require('../../src/models').TipoDocumento.findByPk(documentos[0].tipoDocumentoId);
    expect(tipoDocumento.nombre).toBe('RUT');
  });

  it('usa el TipoDocumento genérico cuando el ProveedorDocumento no tiene requisito asociado', async () => {
    const proveedor = await crearProveedorConDocumento({ conRequisito: false });
    const { carpeta } = await aprobarProveedor(proveedor);

    const documentos = await Documento.findAll({ where: { carpetaId: carpeta.id } });
    expect(documentos[0].nombre).toBe('Documento de proveedor');
    const tipoDocumento = await require('../../src/models').TipoDocumento.findByPk(documentos[0].tipoDocumentoId);
    expect(tipoDocumento.nombre).toBe('Documento de proveedor');
  });

  it('deja al proveedor en estado activo', async () => {
    const proveedor = await crearProveedorConDocumento();
    await aprobarProveedor(proveedor);
    const recargado = await Proveedor.findByPk(proveedor.id);
    expect(recargado.estado).toBe('activo');
  });

  it('no duplica la carpeta raíz "Proveedores" al aprobar un segundo proveedor de la misma área', async () => {
    const proveedor1 = await crearProveedorConDocumento();
    const proveedor2 = await crearProveedorConDocumento();
    await aprobarProveedor(proveedor1);
    await aprobarProveedor(proveedor2);

    const raices = await Carpeta.findAll({ where: { areaId: area.id, nombre: 'Proveedores', carpetaPadreId: null } });
    expect(raices).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Ejecutar el test y confirmar que falla**

Run: `cd server && npx jest tests/unit/proveedorAprobacion.service.test.js --runInBand`
Expected: FAIL — `Cannot find module '../../src/services/proveedorAprobacion.service'`

- [ ] **Step 3: Implementar el servicio**

Crear `server/src/services/proveedorAprobacion.service.js`:

```js
const fs = require('fs');
const path = require('path');
const { calcularEstadoDocumento } = require('./documento.service');
const { guardarArchivo, obtenerRutaAbsoluta } = require('./almacenamiento.service');

async function aprobarProveedor(proveedor) {
  const { sequelize, Carpeta, Documento, ProveedorDocumento, RequisitoProveedor, TipoDocumento } = require('../models');

  return sequelize.transaction(async (t) => {
    const areaId = proveedor.areaSolicitanteId;

    const [carpetaRaiz] = await Carpeta.findOrCreate({
      where: { areaId, proveedorId: null, carpetaPadreId: null, nombre: 'Proveedores' },
      transaction: t,
    });

    const subcarpeta = await Carpeta.create(
      { areaId, carpetaPadreId: carpetaRaiz.id, proveedorId: proveedor.id, nombre: proveedor.razonSocial },
      { transaction: t }
    );

    const documentosExpediente = await ProveedorDocumento.findAll({ where: { proveedorId: proveedor.id }, transaction: t });
    const tipoGenerico = await TipoDocumento.findOne({ where: { nombre: 'Documento de proveedor' }, transaction: t });

    let documentosReflejados = 0;
    for (const documentoExpediente of documentosExpediente) {
      if (!documentoExpediente.s3Key) continue;

      let nombreDocumento = 'Documento de proveedor';
      let tipoDocumentoId = tipoGenerico.id;
      if (documentoExpediente.requisitoId) {
        const requisito = await RequisitoProveedor.findByPk(documentoExpediente.requisitoId, { transaction: t });
        if (requisito) {
          nombreDocumento = requisito.nombre;
          if (requisito.tipoDocumentoId) tipoDocumentoId = requisito.tipoDocumentoId;
        }
      }

      const bufferOriginal = fs.readFileSync(obtenerRutaAbsoluta(documentoExpediente.s3Key));
      const extension = path.extname(documentoExpediente.s3Key);
      const { ruta } = guardarArchivo({ originalname: `${nombreDocumento}${extension}`, buffer: bufferOriginal }, areaId);

      const tipoDocumento = await TipoDocumento.findByPk(tipoDocumentoId, { transaction: t });
      const estado = calcularEstadoDocumento({
        vigenciaHasta: documentoExpediente.vigenciaHasta,
        diasAlerta: tipoDocumento.diasAlertaVencimientoDefault,
      });

      await Documento.create(
        {
          areaId,
          carpetaId: subcarpeta.id,
          tipoDocumentoId,
          nombre: nombreDocumento,
          vigenciaDesde: documentoExpediente.vigenciaDesde,
          vigenciaHasta: documentoExpediente.vigenciaHasta,
          estado,
          s3Key: ruta,
        },
        { transaction: t }
      );
      documentosReflejados += 1;
    }

    await proveedor.update({ estado: 'activo' }, { transaction: t });

    return { carpeta: subcarpeta, documentosReflejados };
  });
}

module.exports = { aprobarProveedor };
```

- [ ] **Step 4: Ejecutar el test del servicio y confirmar que pasa**

Run: `cd server && npx jest tests/unit/proveedorAprobacion.service.test.js --runInBand`
Expected: PASS (5 tests)

- [ ] **Step 5: Escribir los tests de ruta que fallan**

Agregar al final de `server/tests/integration/proveedor.routes.test.js` (después del `describe('Requisitos de Proveedor API', ...)` ya existente):

```js
describe('Aprobar y rechazar proveedor', () => {
  it('aprueba un proveedor en_evaluacion, crea su carpeta y refleja los documentos del expediente', async () => {
    const createRes = await request(app)
      .post('/api/v1/proveedores')
      .set('Authorization', `Bearer ${token}`)
      .send({ tipo: 'proveedor', documentoIdentificacion: `940${Date.now()}`, razonSocial: 'Aprobación Ruta SAS', areaSolicitanteId: area.id });
    const id = createRes.body.data.id;

    await request(app)
      .post(`/api/v1/proveedores/${id}/documentos`)
      .set('Authorization', `Bearer ${token}`)
      .attach('archivo', path.join(__dirname, '../fixtures/documento-prueba.pdf'));

    const aprobarRes = await request(app).post(`/api/v1/proveedores/${id}/aprobar`).set('Authorization', `Bearer ${token}`);
    expect(aprobarRes.status).toBe(200);
    expect(aprobarRes.body.data.proveedor.estado).toBe('activo');
    expect(aprobarRes.body.data.documentosReflejados).toBe(1);
    expect(aprobarRes.body.data.carpeta.nombre).toBe('Aprobación Ruta SAS');
  });

  it('returns 400 when approving a proveedor that is not en_evaluacion', async () => {
    const createRes = await request(app)
      .post('/api/v1/proveedores')
      .set('Authorization', `Bearer ${token}`)
      .send({ tipo: 'proveedor', documentoIdentificacion: `941${Date.now()}`, razonSocial: 'Doble Aprobación SAS', areaSolicitanteId: area.id });
    const id = createRes.body.data.id;

    await request(app).post(`/api/v1/proveedores/${id}/aprobar`).set('Authorization', `Bearer ${token}`);
    const segundaRes = await request(app).post(`/api/v1/proveedores/${id}/aprobar`).set('Authorization', `Bearer ${token}`);
    expect(segundaRes.status).toBe(400);
  });

  it('returns 400 when approving a proveedor without areaSolicitanteId', async () => {
    const proveedorSinArea = await require('../../src/models').Proveedor.create({
      tipo: 'proveedor', documentoIdentificacion: `942${Date.now()}`, razonSocial: 'Sin Área Aprobación SAS',
    });
    const res = await request(app).post(`/api/v1/proveedores/${proveedorSinArea.id}/aprobar`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  it('rechaza un proveedor en_evaluacion con motivo', async () => {
    const createRes = await request(app)
      .post('/api/v1/proveedores')
      .set('Authorization', `Bearer ${token}`)
      .send({ tipo: 'proveedor', documentoIdentificacion: `943${Date.now()}`, razonSocial: 'Rechazo SAS', areaSolicitanteId: area.id });
    const id = createRes.body.data.id;

    const rechazarRes = await request(app)
      .post(`/api/v1/proveedores/${id}/rechazar`)
      .set('Authorization', `Bearer ${token}`)
      .send({ motivo: 'Documentación incompleta' });
    expect(rechazarRes.status).toBe(200);
    expect(rechazarRes.body.data.estado).toBe('inactivo');
  });

  it('returns 400 when rechazando without motivo', async () => {
    const createRes = await request(app)
      .post('/api/v1/proveedores')
      .set('Authorization', `Bearer ${token}`)
      .send({ tipo: 'proveedor', documentoIdentificacion: `944${Date.now()}`, razonSocial: 'Sin Motivo SAS', areaSolicitanteId: area.id });
    const id = createRes.body.data.id;

    const res = await request(app).post(`/api/v1/proveedores/${id}/rechazar`).set('Authorization', `Bearer ${token}`).send({});
    expect(res.status).toBe(400);
  });

  it('returns 403 when solicitante tries to approve a proveedor', async () => {
    const createRes = await request(app)
      .post('/api/v1/proveedores')
      .set('Authorization', `Bearer ${token}`)
      .send({ tipo: 'proveedor', documentoIdentificacion: `945${Date.now()}`, razonSocial: 'No Autorizado Aprobar SAS', areaSolicitanteId: area.id });
    const id = createRes.body.data.id;

    const res = await request(app).post(`/api/v1/proveedores/${id}/aprobar`).set('Authorization', `Bearer ${solicitanteToken}`);
    expect(res.status).toBe(403);
  });
});
```

Agregar `path` al require de módulos de Node al inicio del archivo (junto a `request`, `bcrypt`):

```js
const path = require('path');
```

- [ ] **Step 6: Ejecutar los tests de ruta y confirmar que fallan**

Run: `cd server && npx jest tests/integration/proveedor.routes.test.js --runInBand`
Expected: FAIL — `POST /proveedores/:id/aprobar` y `POST /proveedores/:id/rechazar` no existen todavía (404).

- [ ] **Step 7: Implementar `aprobar`/`rechazar` en el controller**

En `server/src/controllers/proveedor.controller.js`, reemplazar las dos líneas de import existentes al inicio del archivo (`const { Proveedor, Auditoria } = require('../models');` y `const { success, created, notFound, badRequest } = require('../utils/responses');`) por estas tres líneas:

```js
const { Proveedor, Auditoria } = require('../models');
const { success, created, notFound, badRequest, serverError } = require('../utils/responses');
const { aprobarProveedor } = require('../services/proveedorAprobacion.service');
```

Y agregar estas dos funciones antes de `module.exports`:

```js
async function aprobar(req, res) {
  const proveedor = await Proveedor.findByPk(req.params.id);
  if (!proveedor) return notFound(res, 'Proveedor no encontrado');
  if (proveedor.estado !== 'en_evaluacion') return badRequest(res, 'El proveedor ya fue aprobado o rechazado');
  if (!proveedor.areaSolicitanteId) return badRequest(res, 'Completa el área solicitante antes de aprobar');

  let resultado;
  try {
    resultado = await aprobarProveedor(proveedor);
  } catch (err) {
    return serverError(res, `No se pudo completar la aprobación: ${err.message}`, err);
  }

  const proveedorActualizado = await Proveedor.findByPk(proveedor.id);

  await Auditoria.registrar({
    tabla: 'proveedores', registroId: proveedor.id, accion: 'actualizar',
    usuarioId: req.user.id, usuarioNombre: req.user.nombreCompleto,
    descripcion: `Proveedor aprobado — ${resultado.documentosReflejados} documento(s) reflejado(s) en la carpeta`,
    datosNuevos: proveedorActualizado.toJSON(),
  });

  return success(res, { proveedor: proveedorActualizado, carpeta: resultado.carpeta, documentosReflejados: resultado.documentosReflejados });
}

async function rechazar(req, res) {
  const proveedor = await Proveedor.findByPk(req.params.id);
  if (!proveedor) return notFound(res, 'Proveedor no encontrado');
  if (proveedor.estado !== 'en_evaluacion') return badRequest(res, 'El proveedor ya fue aprobado o rechazado');

  const { motivo } = req.body;
  if (!motivo) return badRequest(res, 'El motivo del rechazo es obligatorio');

  const datosAnteriores = proveedor.toJSON();
  await proveedor.update({ estado: 'inactivo' });

  await Auditoria.registrar({
    tabla: 'proveedores', registroId: proveedor.id, accion: 'actualizar',
    usuarioId: req.user.id, usuarioNombre: req.user.nombreCompleto,
    descripcion: `Proveedor rechazado: ${motivo}`, datosAnteriores, datosNuevos: proveedor.toJSON(),
  });

  return success(res, proveedor, 'Proveedor rechazado');
}
```

Y actualizar `module.exports` al final del archivo:

```js
module.exports = { listar, obtener, crear, editar, eliminar, aprobar, rechazar };
```

- [ ] **Step 8: Agregar las rutas**

En `server/src/routes/proveedor.routes.js`, agregar estas dos líneas después de `router.delete('/:id', ...)`:

```js
router.post('/:id/aprobar', verificarToken, requierePermiso('proveedores', 'editar'), asyncHandler(controller.aprobar));
router.post('/:id/rechazar', verificarToken, requierePermiso('proveedores', 'editar'), asyncHandler(controller.rechazar));
```

- [ ] **Step 9: Ejecutar los tests de ruta y confirmar que pasan**

Run: `cd server && npx jest tests/integration/proveedor.routes.test.js --runInBand`
Expected: PASS (16 tests: 10 ya existentes + 6 nuevos)

- [ ] **Step 10: Ejecutar toda la suite de backend**

Run: `cd server && npm test`
Expected: PASS (todos los test suites)

- [ ] **Step 11: Commit**

```bash
git add server/src/services/proveedorAprobacion.service.js server/tests/unit/proveedorAprobacion.service.test.js server/src/controllers/proveedor.controller.js server/src/routes/proveedor.routes.js server/tests/integration/proveedor.routes.test.js
git commit -m "feat(backend): agrega POST /proveedores/:id/aprobar y /rechazar con creación de carpeta"
```

---

### Task 5: Frontend — selector de área al crear + servicio aprobar/rechazar

**Files:**
- Modify: `frontend/src/api/proveedor.service.js`
- Modify: `frontend/src/api/proveedor.service.test.js`
- Modify: `frontend/src/pages/proveedores/ProveedoresListado.jsx`
- Modify: `frontend/src/pages/proveedores/ProveedoresListado.test.jsx`

**Interfaces:**
- Consumes: `POST /proveedores/:id/aprobar`, `POST /proveedores/:id/rechazar` (Task 4); `areaService.listar()` ya existente (`frontend/src/api/area.service.js`).
- Produces: `proveedorService.aprobar(id) => Promise<{proveedor, carpeta, documentosReflejados}>`, `proveedorService.rechazar(id, motivo) => Promise<proveedor>` — usados por Task 6.

- [ ] **Step 1: Escribir los tests que fallan (servicio)**

Agregar al final de `frontend/src/api/proveedor.service.test.js`:

```js
  it('aprobar posts to the aprobar endpoint and returns the result', async () => {
    mock.onPost('/proveedores/3/aprobar').reply(200, {
      success: true,
      data: { proveedor: { id: 3, estado: 'activo' }, carpeta: { id: 10, nombre: 'Insumos ABC' }, documentosReflejados: 2 },
    });
    const resultado = await proveedorService.aprobar(3);
    expect(resultado).toEqual({ proveedor: { id: 3, estado: 'activo' }, carpeta: { id: 10, nombre: 'Insumos ABC' }, documentosReflejados: 2 });
  });

  it('rechazar posts the motivo and returns the updated proveedor', async () => {
    mock.onPost('/proveedores/3/rechazar').reply(200, { success: true, data: { id: 3, estado: 'inactivo' } });
    const proveedor = await proveedorService.rechazar(3, 'Documentación incompleta');
    expect(proveedor).toEqual({ id: 3, estado: 'inactivo' });
    expect(JSON.parse(mock.history.post.find((r) => r.url === '/proveedores/3/rechazar').data)).toEqual({ motivo: 'Documentación incompleta' });
  });
```

- [ ] **Step 2: Ejecutar los tests y confirmar que fallan**

Run: `cd frontend && npx vitest run src/api/proveedor.service.test.js`
Expected: FAIL — `proveedorService.aprobar is not a function`

- [ ] **Step 3: Implementar en `proveedor.service.js`**

Reemplazar el archivo completo:

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

async function aprobar(id) {
  const response = await apiClient.post(`/proveedores/${id}/aprobar`);
  return response.data;
}

async function rechazar(id, motivo) {
  const response = await apiClient.post(`/proveedores/${id}/rechazar`, { motivo });
  return response.data;
}

export default { listar, obtener, crear, editar, eliminar, aprobar, rechazar };
```

- [ ] **Step 4: Ejecutar los tests del servicio y confirmar que pasan**

Run: `cd frontend && npx vitest run src/api/proveedor.service.test.js`
Expected: PASS (7 tests)

- [ ] **Step 5: Escribir el test que falla (selector de área)**

En `frontend/src/pages/proveedores/ProveedoresListado.test.jsx`, agregar el import y mock de `area.service` (después de la línea `import { useAuth } from '../../context/AuthContext';`):

```js
import areaService from '../../api/area.service';
```

y agregar `vi.mock('../../api/area.service');` después de `vi.mock('../../context/AuthContext');`.

En el `beforeEach` existente, agregar un valor por defecto:

```js
  beforeEach(() => {
    useAuth.mockReturnValue({ tienePermiso: () => true });
    areaService.listar.mockResolvedValue([{ id: 7, nombre: 'Financiera' }]);
  });
```

Y reemplazar el test `'creates a proveedor through the modal'` para seleccionar el área antes de enviar:

```js
  it('creates a proveedor through the modal', async () => {
    proveedorService.listar.mockResolvedValue([]);
    proveedorService.crear.mockResolvedValue({ id: 2, razonSocial: 'Nuevo SAS' });
    renderPagina();

    await screen.findByText('Sin proveedores todavía');
    await userEvent.click(screen.getByText('Crear proveedor'));
    await userEvent.selectOptions(screen.getByLabelText('Área solicitante'), '7');
    await userEvent.type(screen.getByLabelText('Documento de identificación'), '900999888');
    await userEvent.type(screen.getByLabelText('Razón social'), 'Nuevo SAS');
    await userEvent.click(screen.getByRole('button', { name: 'Crear' }));

    await waitFor(() =>
      expect(proveedorService.crear).toHaveBeenCalledWith(
        expect.objectContaining({ areaSolicitanteId: 7, documentoIdentificacion: '900999888', razonSocial: 'Nuevo SAS' })
      )
    );
  });
```

- [ ] **Step 6: Ejecutar el test y confirmar que falla**

Run: `cd frontend && npx vitest run src/pages/proveedores/ProveedoresListado.test.jsx`
Expected: FAIL — no existe un campo con label `'Área solicitante'`.

- [ ] **Step 7: Implementar el selector en `ProveedoresListado.jsx`**

Agregar el import de `areaService` (después de `import proveedorService from '../../api/proveedor.service';`):

```js
import areaService from '../../api/area.service';
```

Agregar el estado y la carga de áreas (después de la declaración de `const [modalAbierto, setModalAbierto] = useState(false);`):

```js
  const [areas, setAreas] = useState([]);
```

Agregar el `useEffect` de carga (después del `useEffect` existente que llama a `cargarProveedores`):

```js
  useEffect(() => {
    async function cargarAreas() {
      try {
        const data = await areaService.listar();
        setAreas(data);
      } catch {
        setAreas([]);
      }
    }
    cargarAreas();
  }, []);
```

Actualizar `onCrear` para incluir `areaSolicitanteId`:

```js
  async function onCrear(valores) {
    try {
      await proveedorService.crear({
        tipo: valores.tipo,
        documentoIdentificacion: valores.documentoIdentificacion,
        razonSocial: valores.razonSocial,
        criticidad: valores.criticidad,
        categoria: valores.categoria || null,
        areaSolicitanteId: Number(valores.areaSolicitanteId),
      });
      enqueueSnackbar('Proveedor creado exitosamente', { variant: 'success' });
      cerrarModal();
      await cargarProveedores();
    } catch (error) {
      enqueueSnackbar(error?.message || 'No se pudo crear el proveedor', { variant: 'error' });
    }
  }
```

Y agregar el campo `<select>` en el formulario del modal, justo después del cierre del `<div>` del campo "Categoría" no existe todavía — agregarlo antes del `<Input label="Categoría" ... />` final (después del bloque `<div>` de "Criticidad"):

```jsx
          <div>
            <label htmlFor="crear-area-solicitante" className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
              Área solicitante
            </label>
            <select
              id="crear-area-solicitante"
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

          <Input label="Categoría" {...register('categoria')} />
```

(reemplaza el `<Input label="Categoría" {...register('categoria')} />` ya existente al final del formulario — queda en el mismo lugar, con el nuevo bloque de área justo antes).

- [ ] **Step 8: Ejecutar el test y confirmar que pasa**

Run: `cd frontend && npx vitest run src/pages/proveedores/ProveedoresListado.test.jsx`
Expected: PASS (6 tests)

- [ ] **Step 9: Ejecutar toda la suite de frontend**

Run: `cd frontend && npm test -- --run`
Expected: PASS (todos los archivos de test)

- [ ] **Step 10: Commit**

```bash
git add frontend/src/api/proveedor.service.js frontend/src/api/proveedor.service.test.js frontend/src/pages/proveedores/ProveedoresListado.jsx frontend/src/pages/proveedores/ProveedoresListado.test.jsx
git commit -m "feat(frontend): agrega selector de área al crear proveedor y aprobar()/rechazar() al servicio"
```

---

### Task 6: Frontend — botones Aprobar/Rechazar en ProveedorDetalle

**Files:**
- Modify: `frontend/src/pages/proveedores/ProveedorDetalle.jsx`
- Modify: `frontend/src/pages/proveedores/ProveedorDetalle.test.jsx`

**Interfaces:**
- Consumes: `proveedorService.aprobar(id)`, `proveedorService.rechazar(id, motivo)` (Task 5).

- [ ] **Step 1: Escribir los tests que fallan**

Agregar al final de `frontend/src/pages/proveedores/ProveedorDetalle.test.jsx` (dentro del `describe('ProveedorDetalle', ...)`, antes del cierre):

```js
  it('shows Aprobar and Rechazar buttons only while en_evaluacion, and approves successfully', async () => {
    proveedorService.obtener.mockResolvedValue({ ...PROVEEDOR, estado: 'en_evaluacion' });
    proveedorService.aprobar.mockResolvedValue({ proveedor: { ...PROVEEDOR, estado: 'activo' }, carpeta: { id: 9, nombre: 'Insumos ABC' }, documentosReflejados: 2 });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderPagina();
    await screen.findByText('Insumos ABC');

    await userEvent.click(screen.getByRole('button', { name: 'Aprobar' }));

    await waitFor(() => expect(proveedorService.aprobar).toHaveBeenCalledWith('1'));
  });

  it('hides Aprobar and Rechazar when estado is not en_evaluacion', async () => {
    proveedorService.obtener.mockResolvedValue({ ...PROVEEDOR, estado: 'activo' });
    renderPagina();
    await screen.findByText('Insumos ABC');

    expect(screen.queryByRole('button', { name: 'Aprobar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Rechazar' })).not.toBeInTheDocument();
  });

  it('rejects a proveedor with a motivo', async () => {
    proveedorService.obtener.mockResolvedValue({ ...PROVEEDOR, estado: 'en_evaluacion' });
    proveedorService.rechazar.mockResolvedValue({ ...PROVEEDOR, estado: 'inactivo' });
    vi.spyOn(window, 'prompt').mockReturnValue('Documentación incompleta');
    renderPagina();
    await screen.findByText('Insumos ABC');

    await userEvent.click(screen.getByRole('button', { name: 'Rechazar' }));

    await waitFor(() => expect(proveedorService.rechazar).toHaveBeenCalledWith('1', 'Documentación incompleta'));
  });

  it('hides Aprobar and Rechazar when the user lacks the editar permission', async () => {
    useAuth.mockReturnValue({ tienePermiso: () => false });
    proveedorService.obtener.mockResolvedValue({ ...PROVEEDOR, estado: 'en_evaluacion' });
    renderPagina();
    await screen.findByText('Insumos ABC');

    expect(screen.queryByRole('button', { name: 'Aprobar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Rechazar' })).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Ejecutar los tests y confirmar que fallan**

Run: `cd frontend && npx vitest run src/pages/proveedores/ProveedorDetalle.test.jsx`
Expected: FAIL — no existe ningún botón con nombre `'Aprobar'`/`'Rechazar'`.

- [ ] **Step 3: Implementar los botones en `ProveedorDetalle.jsx`**

Actualizar el import de iconos (línea 5):

```js
import { ArrowLeft, Download, Trash2, Upload, Truck, CheckCircle, XCircle } from 'lucide-react';
```

Agregar los handlers después de `onEliminar` (antes de `onSubirDocumento`):

```js
  async function onAprobar() {
    if (!window.confirm('¿Aprobar este proveedor? Se creará su carpeta en el módulo de Documentos con los documentos ya subidos al expediente.')) return;
    try {
      const resultado = await proveedorService.aprobar(id);
      enqueueSnackbar(`Proveedor aprobado. Se reflejaron ${resultado.documentosReflejados} documento(s) en su carpeta.`, { variant: 'success' });
      await cargarProveedor();
    } catch (error) {
      enqueueSnackbar(error?.message || 'No se pudo aprobar el proveedor', { variant: 'error' });
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
      await proveedorService.rechazar(id, motivo);
      enqueueSnackbar('Proveedor rechazado', { variant: 'success' });
      await cargarProveedor();
    } catch (error) {
      enqueueSnackbar(error?.message || 'No se pudo rechazar el proveedor', { variant: 'error' });
    }
  }
```

Y agregar los botones en el tab "Detalle", dentro del `<div className="flex items-center gap-3 pt-2">` ya existente, antes del botón "Guardar cambios":

```jsx
              <div className="flex items-center gap-3 pt-2">
                {proveedor.estado === 'en_evaluacion' && tienePermiso('proveedores', 'editar') && (
                  <>
                    <Button variant="success" icon={CheckCircle} onClick={onAprobar}>
                      Aprobar
                    </Button>
                    <Button variant="danger" icon={XCircle} onClick={onRechazar}>
                      Rechazar
                    </Button>
                  </>
                )}
                {tienePermiso('proveedores', 'editar') && <Button onClick={handleSubmit(onGuardar)}>Guardar cambios</Button>}
                {tienePermiso('proveedores', 'eliminar') && (
                  <Button variant="danger" onClick={onEliminar}>
                    Dar de baja
                  </Button>
                )}
              </div>
```

- [ ] **Step 4: Ejecutar los tests y confirmar que pasan**

Run: `cd frontend && npx vitest run src/pages/proveedores/ProveedorDetalle.test.jsx`
Expected: PASS (14 tests: 10 ya existentes + 4 nuevos)

- [ ] **Step 5: Ejecutar toda la suite de frontend**

Run: `cd frontend && npm test -- --run`
Expected: PASS (todos los archivos de test)

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/proveedores/ProveedorDetalle.jsx frontend/src/pages/proveedores/ProveedorDetalle.test.jsx
git commit -m "feat(frontend): agrega botones Aprobar/Rechazar en el detalle del proveedor"
```

---

### Task 7: Documentación (README)

**Files:**
- Modify: `README.md`

**Interfaces:**
- Ninguna — solo texto descriptivo.

- [ ] **Step 1: Actualizar la sección de Proveedores**

En `README.md`, reemplazar el párrafo del módulo de Proveedores (línea 72) para mencionar el nuevo flujo:

```markdown
El módulo de Proveedores y Contratistas (`/proveedores`) ya está implementado: listado con filtros (estado, tipo, criticidad), creación (con selección del área solicitante), y detalle (`/proveedores/:id`) con edición inline, baja lógica, y expediente documental — un checklist de los requisitos aplicables según la criticidad del proveedor (Cámara de Comercio, RUT, Certificado SST, Certificado SARLAFT, Póliza de responsabilidad civil), y subida/descarga/eliminación de los documentos que los cubren, con cálculo automático de vigencia (vigente/por vencer/vencido, umbral fijo de 30 días). Mientras el proveedor está `en_evaluacion`, se puede Aprobar (crea su carpeta en el área solicitante dentro del módulo Documentos, con una subcarpeta a su nombre bajo una carpeta raíz "Proveedores", y refleja ahí — una sola vez — cada documento ya subido al expediente) o Rechazar (con motivo).
```

Y agregar una línea a la lista de specs de documentación (después de la línea de "Diseño del módulo de Proveedores y Contratistas..."):

```markdown
- Diseño de la aprobación de proveedores y creación de su carpeta en Documentos: `docs/superpowers/specs/2026-07-09-cod-proveedores-aprobacion-carpeta-design.md`
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: documenta el flujo de aprobación de proveedores y creación de carpeta"
```

---

## Self-Review

**Cobertura del spec:**
- Columnas nuevas (`areaSolicitanteId`, `tipoDocumentoId`, `proveedorId`) → Task 1.
- Seeds de `TipoDocumento`/mapeo de `RequisitoProveedor` → Task 2.
- `areaSolicitanteId` obligatorio al crear → Task 3.
- `POST /proveedores/:id/aprobar` (transacción: carpeta raíz + subcarpeta + reflejo de documentos + estado activo) y `POST /proveedores/:id/rechazar` (motivo, estado inactivo) → Task 4.
- Selector de área en el formulario de creación + `proveedorService.aprobar/rechazar` → Task 5.
- Botones Aprobar/Rechazar en el detalle, gateados por `estado === 'en_evaluacion'` y permiso `editar` → Task 6.
- Documentación → Task 7.
- Fuera de alcance (sin sincronización continua, sin link "Ver carpeta", sin reversión de aprobación) — ninguna tarea lo implementa, correcto.

**Placeholders:** ninguno — todo el código de cada paso está completo y es el que se espera commitear tal cual.

**Consistencia de tipos:** `aprobarProveedor(proveedor) => Promise<{carpeta, documentosReflejados}>` (Task 4) es exactamente lo que consume el controller en el mismo Task 4 y lo que el test unitario de Task 4 verifica. `proveedorService.aprobar(id) => Promise<{proveedor, carpeta, documentosReflejados}>` (Task 5) es exactamente la forma de respuesta que arma `aprobar()` en el controller (Task 4) y lo que usa `ProveedorDetalle.jsx` (Task 6) para el mensaje de éxito. `proveedorService.rechazar(id, motivo) => Promise<proveedor>` (Task 5) coincide con `rechazar()` del controller devolviendo `success(res, proveedor, ...)` (Task 4) y con el uso en Task 6.
