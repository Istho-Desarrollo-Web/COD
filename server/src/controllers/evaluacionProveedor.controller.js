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
