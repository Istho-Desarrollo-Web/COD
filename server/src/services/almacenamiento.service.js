const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

const DIRECTORIO_BASE = path.join(__dirname, '..', '..', 'uploads', 'documentos');

function guardarArchivo(file, areaId) {
  const extension = path.extname(file.originalname);
  const nombreArchivo = `${randomUUID()}${extension}`;
  const directorioArea = path.join(DIRECTORIO_BASE, String(areaId));
  fs.mkdirSync(directorioArea, { recursive: true });
  const rutaAbsoluta = path.join(directorioArea, nombreArchivo);
  fs.writeFileSync(rutaAbsoluta, file.buffer);
  const ruta = path.join('documentos', String(areaId), nombreArchivo);
  return { ruta };
}

function obtenerRutaAbsoluta(ruta) {
  return path.join(__dirname, '..', '..', 'uploads', ruta);
}

function eliminarArchivo(ruta) {
  const rutaAbsoluta = obtenerRutaAbsoluta(ruta);
  if (fs.existsSync(rutaAbsoluta)) fs.unlinkSync(rutaAbsoluta);
}

module.exports = { guardarArchivo, obtenerRutaAbsoluta, eliminarArchivo };
