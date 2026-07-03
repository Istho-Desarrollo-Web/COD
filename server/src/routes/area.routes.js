const express = require('express');
const router = express.Router();
const { verificarToken } = require('../middlewares/auth');
const { requierePermiso } = require('../middlewares/roles');
const controller = require('../controllers/area.controller');
const asyncHandler = require('../utils/asyncHandler');

router.get('/', verificarToken, requierePermiso('areas', 'ver'), asyncHandler(controller.listar));
router.post('/', verificarToken, requierePermiso('areas', 'ver'), asyncHandler(controller.crear));
router.get('/:id', verificarToken, requierePermiso('areas', 'ver'), asyncHandler(controller.obtener));

module.exports = router;
