require('dotenv').config();
const { sequelize } = require('../config/database');
const { ejecutar } = require('../jobs/evaluacionProveedor.job');

ejecutar()
  .then((resultado) => {
    console.log('Job de evaluaciones de proveedores completado:', resultado);
    return sequelize.close();
  })
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Error ejecutando el job de evaluaciones de proveedores:', err);
    process.exit(1);
  });
