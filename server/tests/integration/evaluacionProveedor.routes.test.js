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
