require('dotenv').config();
const { sequelize } = require('../config/database');
const { ejecutar, ejecutarProveedores } = require('../jobs/recalcularEstadosDocumentos.job');

Promise.all([ejecutar(), ejecutarProveedores()])
  .then(([resultadoDocumentos, resultadoProveedores]) => {
    console.log('Recálculo de estados completado:', resultadoDocumentos);
    console.log('Recálculo de estados de proveedores completado:', resultadoProveedores);
    return sequelize.close();
  })
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Error ejecutando el recálculo de estados:', err);
    process.exit(1);
  });
