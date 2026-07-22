const express = require('express');
const router = express.Router();
const { verificarToken } = require('../middlewares/auth');
const { requierePermiso } = require('../middlewares/roles');
const { subirArchivoUnico } = require('../middlewares/upload');
const controller = require('../controllers/proveedor.controller');
const documentoController = require('../controllers/proveedorDocumento.controller');
const asyncHandler = require('../utils/asyncHandler');

router.get('/', verificarToken, requierePermiso('proveedores', 'ver'), asyncHandler(controller.listar));
router.post('/', verificarToken, requierePermiso('proveedores', 'gestionar'), asyncHandler(controller.crear));
router.get('/:id', verificarToken, requierePermiso('proveedores', 'ver'), asyncHandler(controller.obtener));
router.put('/:id', verificarToken, requierePermiso('proveedores', 'gestionar'), asyncHandler(controller.editar));
router.delete('/:id', verificarToken, requierePermiso('proveedores', 'eliminar'), asyncHandler(controller.eliminar));
router.post('/:id/aprobar-registro', verificarToken, requierePermiso('proveedores', 'aprobar'), asyncHandler(controller.aprobarRegistro));
router.post('/:id/aprobar-requisitos', verificarToken, requierePermiso('proveedores', 'aprobar'), asyncHandler(controller.aprobarRequisitos));
router.post('/:id/rechazar', verificarToken, requierePermiso('proveedores', 'aprobar'), asyncHandler(controller.rechazar));

router.get('/:id/documentos', verificarToken, requierePermiso('proveedores', 'ver'), asyncHandler(documentoController.listar));
router.post('/:id/documentos', verificarToken, requierePermiso('proveedores', 'gestionar'), subirArchivoUnico, asyncHandler(documentoController.crear));
router.get('/:id/documentos/:docId/descargar', verificarToken, requierePermiso('proveedores', 'ver'), asyncHandler(documentoController.descargar));
router.delete('/:id/documentos/:docId', verificarToken, requierePermiso('proveedores', 'gestionar'), asyncHandler(documentoController.eliminar));

module.exports = router;
