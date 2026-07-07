const express = require('express');
const router = express.Router();

router.use('/auth', require('./auth.routes'));
router.use('/areas', require('./area.routes'));
router.use('/tipos-documento', require('./tipoDocumento.routes'));
router.use('/carpetas', require('./carpeta.routes'));

module.exports = router;
