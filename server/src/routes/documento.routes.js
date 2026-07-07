const express = require('express');
const router = express.Router();
const { verificarToken } = require('../middlewares/auth');
const { requierePermiso } = require('../middlewares/roles');
const { subirArchivoUnico } = require('../middlewares/upload');
const controller = require('../controllers/documento.controller');
const asyncHandler = require('../utils/asyncHandler');

router.get('/', verificarToken, requierePermiso('documentos', 'ver'), asyncHandler(controller.listar));
router.post('/', verificarToken, requierePermiso('documentos', 'crear'), subirArchivoUnico, asyncHandler(controller.crear));
router.get('/:id', verificarToken, requierePermiso('documentos', 'ver'), asyncHandler(controller.obtener));
router.put('/:id', verificarToken, requierePermiso('documentos', 'editar'), asyncHandler(controller.editar));
router.delete('/:id', verificarToken, requierePermiso('documentos', 'eliminar'), asyncHandler(controller.eliminar));
router.get('/:id/versiones', verificarToken, requierePermiso('documentos', 'ver'), asyncHandler(controller.listarVersiones));
router.post('/:id/versiones', verificarToken, requierePermiso('documentos', 'aprobar_version'), subirArchivoUnico, asyncHandler(controller.subirVersion));

module.exports = router;
