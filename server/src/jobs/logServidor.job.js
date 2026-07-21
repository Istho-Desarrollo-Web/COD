const cron = require('node-cron');

const RETENCION_DIAS = 14;

async function purgar() {
  const { Op } = require('sequelize');
  const { LogServidor } = require('../models');

  const limite = new Date(Date.now() - RETENCION_DIAS * 24 * 60 * 60 * 1000);
  const eliminados = await LogServidor.destroy({ where: { createdAt: { [Op.lt]: limite } } });
  return { eliminados };
}

function programar() {
  const expresion = process.env.CRON_PURGA_LOGS || '0 4 * * *';
  cron.schedule(expresion, () => {
    purgar().catch((err) => console.error('Error en job logServidor (purga):', err));
  });
}

module.exports = { purgar, programar };
