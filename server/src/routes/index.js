const express = require('express');
const router = express.Router();

router.use('/auth', require('./auth.routes'));
router.use('/areas', require('./area.routes'));
router.use('/tipos-documento', require('./tipoDocumento.routes'));
router.use('/carpetas', require('./carpeta.routes'));
router.use('/documentos', require('./documento.routes'));
router.use('/roles', require('./rol.routes'));
router.use('/usuarios', require('./usuario.routes'));
router.use('/proveedores', require('./proveedor.routes'));
router.use('/requisitos-proveedor', require('./requisitoProveedor.routes'));

module.exports = router;
