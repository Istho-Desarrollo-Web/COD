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

  it('da un margen de gracia de 30 días: la evaluación creada no nace ya vencida', async () => {
    const fechaProximaEvaluacion = fechaEnDias(-1);
    const proveedor = await Proveedor.create({
      tipo: 'proveedor', documentoIdentificacion: `936${Date.now()}`, razonSocial: 'Job Evaluación Gracia SAS',
      estado: 'activo', fechaProximaEvaluacion,
    });

    await ejecutar();

    const evaluacion = await EvaluacionProveedor.findOne({ where: { proveedorId: proveedor.id } });
    expect(evaluacion).not.toBeNull();
    expect(evaluacion.fechaProgramada).not.toBe(fechaProximaEvaluacion);

    const diffDias = Math.round(
      (new Date(`${evaluacion.fechaProgramada}T00:00:00Z`) - new Date(`${fechaProximaEvaluacion}T00:00:00Z`))
        / (24 * 60 * 60 * 1000)
    );
    expect(diffDias).toBe(30);
  });

  it('al marcar vencida una evaluación, reprograma fechaProximaEvaluacion del proveedor ~30 días adelante', async () => {
    const proveedor = await Proveedor.create({
      tipo: 'proveedor', documentoIdentificacion: `937${Date.now()}`, razonSocial: 'Job Evaluación Reprograma SAS',
      estado: 'activo', fechaProximaEvaluacion: fechaEnDias(-40),
    });
    const evaluacion = await EvaluacionProveedor.create({
      proveedorId: proveedor.id, periodo: 2025, fechaProgramada: fechaEnDias(-5), estado: 'pendiente',
    });

    await ejecutar();

    await evaluacion.reload();
    expect(evaluacion.estado).toBe('vencida');

    await proveedor.reload();
    expect(proveedor.fechaProximaEvaluacion).not.toBeNull();

    const diffDias = Math.round(
      (new Date(`${proveedor.fechaProximaEvaluacion}T00:00:00Z`) - new Date(`${fechaEnDias(0)}T00:00:00Z`))
        / (24 * 60 * 60 * 1000)
    );
    expect(diffDias).toBeGreaterThanOrEqual(29);
    expect(diffDias).toBeLessThanOrEqual(31);
  });
});
