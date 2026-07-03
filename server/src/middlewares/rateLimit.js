const rateLimit = require('express-rate-limit');
const { error } = require('../utils/responses');

// Throttles POST /api/v1/auth/login per IP. Timing-safe comparison in the
// login controller mitigates user enumeration, but does nothing to slow down
// brute-force password guessing against a known username — this limiter does.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    error(res, 'Demasiados intentos de inicio de sesión. Intente nuevamente más tarde.', 429);
  },
});

module.exports = { loginLimiter };
