require('dotenv').config();
const { sequelize } = require('../config/database');
const { ejecutar } = require('../jobs/recalcularEstadosDocumentos.job');

ejecutar()
  .then((resultado) => {
    console.log('Recálculo de estados completado:', resultado);
    return sequelize.close();
  })
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Error ejecutando el recálculo de estados:', err);
    process.exit(1);
  });
