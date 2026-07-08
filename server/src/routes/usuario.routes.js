const express = require('express');
const router = express.Router();
const { verificarToken } = require('../middlewares/auth');
const { requierePermiso } = require('../middlewares/roles');
const controller = require('../controllers/usuario.controller');
const asyncHandler = require('../utils/asyncHandler');

router.get('/', verificarToken, requierePermiso('usuarios', 'ver'), asyncHandler(controller.listar));
router.get('/:id', verificarToken, requierePermiso('usuarios', 'ver'), asyncHandler(controller.obtener));
router.post('/', verificarToken, requierePermiso('usuarios', 'crear'), asyncHandler(controller.crear));
router.put('/:id', verificarToken, requierePermiso('usuarios', 'editar'), asyncHandler(controller.editar));
router.delete('/:id', verificarToken, requierePermiso('usuarios', 'eliminar'), asyncHandler(controller.eliminar));

module.exports = router;
