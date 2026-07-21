const { registrar, calcularNivelPorStatusCode } = require('../services/logServidor.service');

function registrarLogsRequest(req, res, next) {
  const inicio = Date.now();
  res.on('finish', () => {
    registrar({
      nivel: calcularNivelPorStatusCode(res.statusCode),
      metodo: req.method,
      ruta: req.originalUrl,
      statusCode: res.statusCode,
      duracionMs: Date.now() - inicio,
      mensaje: `${req.method} ${req.originalUrl} → ${res.statusCode}`,
      usuarioId: req.user?.id || null,
      usuarioNombre: req.user?.nombreCompleto || null,
      ip: req.ip,
    });
  });
  next();
}

module.exports = { registrarLogsRequest };
