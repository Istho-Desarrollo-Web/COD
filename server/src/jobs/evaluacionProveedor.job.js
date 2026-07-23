const cron = require('node-cron');

const DIAS_GRACIA_EVALUACION = 30;
const DIA_MS = 24 * 60 * 60 * 1000;
const OFFSET_BOGOTA_MS = 5 * 60 * 60 * 1000;

// Interpreta un valor DATEONLY como medianoche en Bogota (UTC-5, el mismo
// timezone al que esta fijada la conexion a la BD en config/database.js:18) -
// sin depender del timezone del proceso de Node donde corre el job.
function medianocheBogota(valorDateOnly) {
  return new Date(`${valorDateOnly}T00:00:00-05:00`);
}

// Inverso: dado un instante, produce el string YYYY-MM-DD del dia calendario
// en Bogota para ese instante (para guardarlo en un campo DATEONLY).
function comoFechaBogota(instante) {
  return new Date(instante.getTime() - OFFSET_BOGOTA_MS).toISOString().slice(0, 10);
}

async function ejecutar() {
  const { Proveedor, EvaluacionProveedor } = require('../models');

  const hoy = new Date();
  const proveedoresActivos = await Proveedor.findAll({ where: { estado: 'activo' } });

  let marcadasVencidas = 0;
  let creadasPendientes = 0;

  for (const proveedor of proveedoresActivos) {
    const evaluacionActiva = await EvaluacionProveedor.findOne({
      where: { proveedorId: proveedor.id, estado: ['pendiente', 'en_proceso'] },
    });

    if (evaluacionActiva) {
      const fechaProgramada = medianocheBogota(evaluacionActiva.fechaProgramada);
      if (fechaProgramada < hoy) {
        await evaluacionActiva.update({ estado: 'vencida' });
        // Reprograma fechaProximaEvaluacion DIAS_GRACIA_EVALUACION dias adelante
        // en vez de dejarla intacta - de lo contrario el job vuelve a crear y
        // vencer una evaluacion cada ~2 dias indefinidamente (hallazgo de la
        // revision final de ciclo 3, aprobado por el usuario).
        await proveedor.update({
          fechaProximaEvaluacion: comoFechaBogota(new Date(hoy.getTime() + DIAS_GRACIA_EVALUACION * DIA_MS)),
        });
        marcadasVencidas += 1;
      }
      continue;
    }

    if (proveedor.fechaProximaEvaluacion) {
      const fechaProxima = medianocheBogota(proveedor.fechaProximaEvaluacion);
      if (fechaProxima <= hoy) {
        await EvaluacionProveedor.create({
          proveedorId: proveedor.id,
          periodo: Number(proveedor.fechaProximaEvaluacion.slice(0, 4)),
          // Da DIAS_GRACIA_EVALUACION dias de margen real antes de que pueda
          // marcarse vencida, en vez de nacer ya vencida (antes: fechaProgramada
          // = fechaProximaEvaluacion, que ya habia pasado).
          // Se basa en "hoy" (no en fechaProxima) para garantizar el margen
          // completo de DIAS_GRACIA_EVALUACION dias incluso si el job no corrio
          // por un periodo prolongado y fechaProximaEvaluacion quedo muy
          // atrasada - de lo contrario la evaluacion podria nacer ya vencida
          // otra vez (hallazgo de revision, caso de downtime extendido).
          fechaProgramada: comoFechaBogota(new Date(hoy.getTime() + DIAS_GRACIA_EVALUACION * DIA_MS)),
          estado: 'pendiente',
        });
        creadasPendientes += 1;
      }
    }
  }

  return { marcadasVencidas, creadasPendientes };
}

function programar() {
  const expresion = process.env.CRON_EVALUACIONES_PROVEEDOR || '0 4 * * *';
  cron.schedule(expresion, () => {
    ejecutar().catch((err) => console.error('Error en job evaluacionProveedor:', err));
  });
}

module.exports = { ejecutar, programar };
