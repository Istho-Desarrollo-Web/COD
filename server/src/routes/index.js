const express = require('express');
const router = express.Router();

router.use('/auth', require('./auth.routes'));
router.use('/areas', require('./area.routes'));

module.exports = router;
