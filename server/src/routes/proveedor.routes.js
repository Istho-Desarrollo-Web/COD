const express = require('express');
const router = express.Router();
const { verificarToken } = require('../middlewares/auth');
const { requierePermiso } = require('../middlewares/roles');
const { subirArchivoUnico } = require('../middlewares/upload');
const controller = require('../controllers/proveedor.controller');
const documentoController = require('../controllers/proveedorDocumento.controller');
const asyncHandler = require('../utils/asyncHandler');

router.get('/', verificarToken, requierePermiso('proveedores', 'ver'), asyncHandler(controller.listar));
router.post('/', verificarToken, requierePermiso('proveedores', 'crear'), asyncHandler(controller.crear));
router.get('/:id', verificarToken, requierePermiso('proveedores', 'ver'), asyncHandler(controller.obtener));
router.put('/:id', verificarToken, requierePermiso('proveedores', 'editar'), asyncHandler(controller.editar));
router.delete('/:id', verificarToken, requierePermiso('proveedores', 'eliminar'), asyncHandler(controller.eliminar));
router.post('/:id/aprobar', verificarToken, requierePermiso('proveedores', 'editar'), asyncHandler(controller.aprobar));
router.post('/:id/rechazar', verificarToken, requierePermiso('proveedores', 'editar'), asyncHandler(controller.rechazar));

router.get('/:id/documentos', verificarToken, requierePermiso('proveedores', 'ver'), asyncHandler(documentoController.listar));
router.post('/:id/documentos', verificarToken, requierePermiso('proveedores', 'editar'), subirArchivoUnico, asyncHandler(documentoController.crear));
router.get('/:id/documentos/:docId/descargar', verificarToken, requierePermiso('proveedores', 'ver'), asyncHandler(documentoController.descargar));
router.delete('/:id/documentos/:docId', verificarToken, requierePermiso('proveedores', 'editar'), asyncHandler(documentoController.eliminar));

module.exports = router;
