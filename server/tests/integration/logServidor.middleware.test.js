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
