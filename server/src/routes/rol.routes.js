const express = require('express');
const router = express.Router();
const { verificarToken } = require('../middlewares/auth');
const { requierePermiso } = require('../middlewares/roles');
const controller = require('../controllers/rol.controller');
const asyncHandler = require('../utils/asyncHandler');

router.get('/', verificarToken, requierePermiso('roles', 'ver'), asyncHandler(controller.listar));
router.get('/matriz-accesos', verificarToken, requierePermiso('matriz_accesos', 'ver'), asyncHandler(controller.matrizAccesos));

module.exports = router;
