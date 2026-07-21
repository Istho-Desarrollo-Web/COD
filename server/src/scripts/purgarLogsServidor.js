require('dotenv').config();
const { sequelize } = require('../config/database');
const { purgar } = require('../jobs/logServidor.job');

purgar()
  .then((resultado) => {
    console.log('Purga de logs del servidor completada:', resultado);
    return sequelize.close();
  })
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Error purgando logs del servidor:', err);
    process.exit(1);
  });
