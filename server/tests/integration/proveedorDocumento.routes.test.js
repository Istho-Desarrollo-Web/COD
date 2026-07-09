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
