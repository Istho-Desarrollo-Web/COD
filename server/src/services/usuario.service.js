const bcrypt = require('bcryptjs');

async function hashearPassword(password) {
  return bcrypt.hash(password, 10);
}

module.exports = { hashearPassword };
