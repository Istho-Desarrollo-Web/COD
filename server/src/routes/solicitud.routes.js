const express = require('express');
const router = express.Router();
const { verificarToken } = require('../middlewares/auth');
const { requierePermiso } = require('../middlewares/roles');
const { subirArchivoUnico } = require('../middlewares/upload');
const controller = require('../controllers/solicitud.controller');
const cotizacionController = require('../controllers/cotizacion.controller');
const comentarioController = require('../controllers/solicitudComentario.controller');
const facturaController = require('../controllers/factura.controller');
const asyncHandler = require('../utils/asyncHandler');

router.get('/', verificarToken, requierePermiso('solicitudes', 'ver'), asyncHandler(controller.listar));
router.post('/', verificarToken, requierePermiso('solicitudes', 'crear'), asyncHandler(controller.crear));
router.get('/tipos', verificarToken, requierePermiso('solicitudes', 'ver'), asyncHandler(controller.listarTipos));
router.get('/:id', verificarToken, requierePermiso('solicitudes', 'ver'), asyncHandler(controller.obtener));
router.post('/:id/enviar-aprobacion', verificarToken, requierePermiso('solicitudes', 'cotizar'), asyncHandler(controller.enviarAprobacion));
router.post('/:id/aprobar', verificarToken, requierePermiso('solicitudes', 'aprobar'), asyncHandler(controller.aprobar));
router.post('/:id/rechazar', verificarToken, requierePermiso('solicitudes', 'aprobar'), asyncHandler(controller.rechazar));
router.post('/:id/confirmar', verificarToken, requierePermiso('solicitudes', 'confirmar'), subirArchivoUnico, asyncHandler(controller.confirmar));
router.post('/:id/cancelar', verificarToken, requierePermiso('solicitudes', 'crear'), asyncHandler(controller.cancelar));

router.get('/:id/cotizaciones', verificarToken, requierePermiso('solicitudes', 'ver'), asyncHandler(cotizacionController.listar));
router.post('/:id/cotizaciones', verificarToken, requierePermiso('solicitudes', 'cotizar'), subirArchivoUnico, asyncHandler(cotizacionController.crear));
router.post('/:id/cotizaciones/:cotizacionId/seleccionar', verificarToken, requierePermiso('solicitudes', 'cotizar'), asyncHandler(cotizacionController.seleccionar));

router.get('/:id/comentarios', verificarToken, requierePermiso('solicitudes', 'ver'), asyncHandler(comentarioController.listar));
router.post('/:id/comentarios', verificarToken, requierePermiso('solicitudes', 'comentar'), asyncHandler(comentarioController.crear));

router.get('/:id/factura', verificarToken, requierePermiso('solicitudes', 'ver'), asyncHandler(facturaController.obtener));
router.post('/:id/facturar', verificarToken, requierePermiso('solicitudes', 'facturar'), subirArchivoUnico, asyncHandler(facturaController.facturar));
router.get('/:id/factura/descargar', verificarToken, requierePermiso('solicitudes', 'ver'), asyncHandler(facturaController.descargar));

module.exports = router;
