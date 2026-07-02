const express = require('express');
const router = express.Router();
const { verificarToken } = require('../middlewares/auth');
const { requierePermiso } = require('../middlewares/roles');
const controller = require('../controllers/area.controller');

router.get('/', verificarToken, requierePermiso('areas', 'ver'), controller.listar);
router.post('/', verificarToken, requierePermiso('areas', 'ver'), controller.crear);
router.get('/:id', verificarToken, requierePermiso('areas', 'ver'), controller.obtener);

module.exports = router;
