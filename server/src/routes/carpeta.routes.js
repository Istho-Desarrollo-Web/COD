const express = require('express');
const router = express.Router();
const { verificarToken } = require('../middlewares/auth');
const { requierePermiso } = require('../middlewares/roles');
const controller = require('../controllers/carpeta.controller');
const asyncHandler = require('../utils/asyncHandler');

router.get('/', verificarToken, requierePermiso('documentos', 'ver'), asyncHandler(controller.listar));
router.post('/', verificarToken, requierePermiso('documentos', 'crear'), asyncHandler(controller.crear));

module.exports = router;
