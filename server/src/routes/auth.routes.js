const express = require('express');
const router = express.Router();
const { verificarToken } = require('../middlewares/auth');
const authController = require('../controllers/auth.controller');
const asyncHandler = require('../utils/asyncHandler');
const { loginLimiter, refreshLimiter } = require('../middlewares/rateLimit');

router.post('/login', loginLimiter, asyncHandler(authController.login));
router.post('/refresh', refreshLimiter, asyncHandler(authController.refresh));
router.get('/me', verificarToken, asyncHandler(authController.me));

module.exports = router;
