const express = require('express');
const router = express.Router();
const { verificarToken } = require('../middlewares/auth');
const authController = require('../controllers/auth.controller');

router.post('/login', authController.login);
router.get('/me', verificarToken, authController.me);

module.exports = router;
