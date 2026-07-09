const express = require('express');
const router = express.Router();
const { verificarToken } = require('../middlewares/auth');
const { requierePermiso } = require('../middlewares/roles');
const controller = require('../controllers/proveedor.controller');
const asyncHandler = require('../utils/asyncHandler');

router.get('/', verificarToken, requierePermiso('proveedores', 'ver'), asyncHandler(controller.listar));
router.post('/', verificarToken, requierePermiso('proveedores', 'crear'), asyncHandler(controller.crear));
router.get('/:id', verificarToken, requierePermiso('proveedores', 'ver'), asyncHandler(controller.obtener));
router.put('/:id', verificarToken, requierePermiso('proveedores', 'editar'), asyncHandler(controller.editar));
router.delete('/:id', verificarToken, requierePermiso('proveedores', 'eliminar'), asyncHandler(controller.eliminar));

module.exports = router;
