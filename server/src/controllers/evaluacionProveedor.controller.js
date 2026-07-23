const { Proveedor, EvaluacionProveedor, Auditoria, sequelize } = require('../models');
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
  // La conexión a la BD está fijada a '-05:00' (Bogotá) en config/database.js:18.
  // Restar ese mismo offset (5h) al instante UTC actual y tomar su fecha UTC
  // equivale a la fecha calendario en Bogotá, sin importar la zona horaria del
  // proceso de Node — evita que `completar` calcule "hoy" como el día
  // siguiente durante las horas UTC 00:00-04:59 (19:00-23:59 hora Bogotá).
  const hoy = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const proveedor = await Proveedor.findByPk(evaluacion.proveedorId);

  const proximaFecha = new Date(`${hoy}T00:00:00`);
  proximaFecha.setFullYear(proximaFecha.getFullYear() + 1);

  await sequelize.transaction(async (t) => {
    await evaluacion.update({
      estado: 'completada', puntaje: puntajeNumerico, observaciones: observaciones || null, fechaRealizada: hoy,
    }, { transaction: t });

    await proveedor.update({
      fechaUltimaEvaluacion: hoy,
      fechaProximaEvaluacion: proximaFecha.toISOString().slice(0, 10),
    }, { transaction: t });
  });

  await Auditoria.registrar({
    tabla: 'evaluaciones_proveedor', registroId: evaluacion.id, accion: 'actualizar',
    usuarioId: req.user.id, usuarioNombre: req.user.nombreCompleto,
    descripcion: 'Evaluación de proveedor completada', datosAnteriores, datosNuevos: evaluacion.toJSON(),
  });

  return success(res, evaluacion);
}

module.exports = { listar, listarTodas, crear, iniciar, completar };
