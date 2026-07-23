const cron = require('node-cron');

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
      const fechaProgramada = new Date(`${evaluacionActiva.fechaProgramada}T00:00:00`);
      if (fechaProgramada < hoy) {
        await evaluacionActiva.update({ estado: 'vencida' });
        marcadasVencidas += 1;
      }
      continue;
    }

    if (proveedor.fechaProximaEvaluacion) {
      const fechaProxima = new Date(`${proveedor.fechaProximaEvaluacion}T00:00:00`);
      if (fechaProxima <= hoy) {
        await EvaluacionProveedor.create({
          proveedorId: proveedor.id,
          periodo: fechaProxima.getFullYear(),
          fechaProgramada: proveedor.fechaProximaEvaluacion,
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
