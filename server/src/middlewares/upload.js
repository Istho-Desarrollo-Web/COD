const multer = require('multer');
const { badRequest } = require('../utils/responses');

const TIPOS_PERMITIDOS = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'image/jpeg',
  'image/png',
]);

const TAMANO_MAXIMO_BYTES = 20 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: TAMANO_MAXIMO_BYTES },
  fileFilter(req, file, cb) {
    if (!TIPOS_PERMITIDOS.has(file.mimetype)) return cb(new Error('TIPO_NO_PERMITIDO'));
    cb(null, true);
  },
});

function subirArchivoUnico(req, res, next) {
  upload.single('archivo')(req, res, (err) => {
    if (!err) return next();
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      return badRequest(res, 'El archivo excede el tamaño máximo de 20MB');
    }
    if (err.message === 'TIPO_NO_PERMITIDO') {
      return badRequest(res, 'Tipo de archivo no permitido');
    }
    return next(err);
  });
}

module.exports = { subirArchivoUnico };
