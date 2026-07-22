const request = require('supertest');
const bcrypt = require('bcryptjs');
const { sequelize } = require('../../src/config/database');
const { createMigrator } = require('../../src/config/migrator');
const seedRolesPermisos = require('../../src/scripts/seedRolesPermisos');
const seedTiposDocumento = require('../../src/scripts/seedTiposDocumento');
const { Area, Carpeta, TipoDocumento, Documento, Rol, Usuario } = require('../../src/models');
const { app } = require('../../server');

let token;
let gestorComprasToken;
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

  // gestor_compras no tiene ningún permiso de `documentos` en la matriz
  // nueva (igual que `operaciones` no lo tenía en la vieja) — sirve como
  // fixture de "rol sin acceso a documentos" para las pruebas 403 de abajo.
  const gestorComprasRol = await Rol.findOne({ where: { nombre: 'gestor_compras' } });
  const gestorComprasUsername = `gestor_compras_doc_${Date.now()}`;
  const gestorComprasUsuario = await Usuario.create({
    username: gestorComprasUsername,
    email: `${gestorComprasUsername}@istho.com.co`,
    passwordHash: await bcrypt.hash('ClaveGestorCompras123!', 10),
    nombre: 'Gestor',
    apellido: 'Compras',
  });
  await gestorComprasUsuario.setRoles([gestorComprasRol.id]);
  const loginRes = await request(app)
    .post('/api/v1/auth/login')
    .send({ username: gestorComprasUsername, password: 'ClaveGestorCompras123!' });
  gestorComprasToken = loginRes.body.data.token;
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
    const res = await request(app).get(`/api/v1/documentos?areaId=${area.id}`).set('Authorization', `Bearer ${gestorComprasToken}`);
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
      .set('Authorization', `Bearer ${gestorComprasToken}`)
      .field('areaId', String(area.id))
      .field('carpetaId', String(carpeta.id))
      .field('tipoDocumentoId', String(tipoDocumento.id))
      .field('nombre', 'No debería crearse')
      .attach('archivo', 'tests/fixtures/documento-prueba.pdf');
    expect(res.status).toBe(403);
  });
});

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
      .send({ vigenciaHasta: '2026-01-15' });

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
      .set('Authorization', `Bearer ${gestorComprasToken}`)
      .send({ nombre: 'No debería editarse' });
    expect(res.status).toBe(403);
  });
});

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

  it('returns 403 for a role without documentos.eliminar (gestor_documental has no eliminar)', async () => {
    const gestorDocumentalRol = await Rol.findOne({ where: { nombre: 'gestor_documental' } });
    const liderUsername = `lider_delete_${Date.now()}`;
    const liderUsuario = await Usuario.create({
      username: liderUsername,
      email: `${liderUsername}@istho.com.co`,
      passwordHash: await bcrypt.hash('ClaveLider123!', 10),
      nombre: 'Lider',
      apellido: 'Prueba',
    });
    await liderUsuario.setRoles([gestorDocumentalRol.id]);
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
    const solicitanteUsuario = await Usuario.create({
      username: solicitanteUsername,
      email: `${solicitanteUsername}@istho.com.co`,
      passwordHash: await bcrypt.hash('ClaveSolicitante123!', 10),
      nombre: 'Solicitante',
      apellido: 'Version',
    });
    await solicitanteUsuario.setRoles([solicitanteRol.id]);
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

  it('returns 404 when listing versions for a soft-deleted documento', async () => {
    const createRes = await request(app)
      .post('/api/v1/documentos')
      .set('Authorization', `Bearer ${token}`)
      .field('areaId', String(area.id))
      .field('carpetaId', String(carpeta.id))
      .field('tipoDocumentoId', String(tipoDocumento.id))
      .field('nombre', 'Eliminado para versiones')
      .attach('archivo', 'tests/fixtures/documento-prueba.pdf');
    const id = createRes.body.data.id;

    await request(app).delete(`/api/v1/documentos/${id}`).set('Authorization', `Bearer ${token}`);

    const res = await request(app)
      .get(`/api/v1/documentos/${id}/versiones`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});

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
      .set('Authorization', `Bearer ${gestorComprasToken}`);
    expect(res.status).toBe(403);
  });

  it('returns 404 when downloading the current file of a soft-deleted documento', async () => {
    const createRes = await request(app)
      .post('/api/v1/documentos')
      .set('Authorization', `Bearer ${token}`)
      .field('areaId', String(area.id))
      .field('carpetaId', String(carpeta.id))
      .field('tipoDocumentoId', String(tipoDocumento.id))
      .field('nombre', 'Eliminado para descarga')
      .attach('archivo', 'tests/fixtures/documento-prueba.pdf');
    const id = createRes.body.data.id;

    await request(app).delete(`/api/v1/documentos/${id}`).set('Authorization', `Bearer ${token}`);

    const res = await request(app).get(`/api/v1/documentos/${id}/descargar`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('returns 404 when downloading a historical version of a soft-deleted documento', async () => {
    const createRes = await request(app)
      .post('/api/v1/documentos')
      .set('Authorization', `Bearer ${token}`)
      .field('areaId', String(area.id))
      .field('carpetaId', String(carpeta.id))
      .field('tipoDocumentoId', String(tipoDocumento.id))
      .field('nombre', 'Eliminado con historial')
      .attach('archivo', 'tests/fixtures/documento-prueba.pdf');
    const id = createRes.body.data.id;

    await request(app)
      .post(`/api/v1/documentos/${id}/versiones`)
      .set('Authorization', `Bearer ${token}`)
      .field('version', 'v2')
      .attach('archivo', 'tests/fixtures/documento-prueba.pdf');

    const historialRes = await request(app).get(`/api/v1/documentos/${id}/versiones`).set('Authorization', `Bearer ${token}`);
    const versionAnteriorId = historialRes.body.data.find((v) => v.version === 'v1').id;

    await request(app).delete(`/api/v1/documentos/${id}`).set('Authorization', `Bearer ${token}`);

    const res = await request(app)
      .get(`/api/v1/documentos/${id}/versiones/${versionAnteriorId}/descargar`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});
