function calcularNivelPorStatusCode(statusCode) {
  if (statusCode >= 500) return 'error';
  if (statusCode >= 400) return 'warn';
  return 'info';
}

async function registrar(datos) {
  const { LogServidor } = require('../models');
  try {
    return await LogServidor.create(datos);
  } catch (err) {
    console.error('logServidor.service.registrar falló (no interrumpe la operación principal):', err.message);
    return null;
  }
}

module.exports = { calcularNivelPorStatusCode, registrar };
