const express = require('express');
const router = express.Router();
const { verificarToken } = require('../middlewares/auth');
const authController = require('../controllers/auth.controller');
const asyncHandler = require('../utils/asyncHandler');

router.post('/login', asyncHandler(authController.login));
router.get('/me', verificarToken, asyncHandler(authController.me));

module.exports = router;
