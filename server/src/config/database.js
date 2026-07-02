const path = require('path');
require('dotenv').config({
  path: path.resolve(__dirname, '../../', process.env.NODE_ENV === 'test' ? '.env.test' : '.env'),
});
const { Sequelize } = require('sequelize');

const RETRYABLE_ERRORS = ['ECONNREFUSED', 'ETIMEDOUT', 'PROTOCOL_CONNECTION_LOST'];

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 3306,
    dialect: 'mysql',
    logging: false,
    timezone: '-05:00',
    pool: {
      max: parseInt(process.env.DB_POOL_MAX, 10) || 5,
      min: 0,
      acquire: 30000,
      idle: 10000,
      evict: 5000,
    },
  }
);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function connectWithRetry(instance = sequelize, { maxAttempts = 10, baseDelayMs = 3000 } = {}) {
  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      await instance.authenticate();
      return;
    } catch (err) {
      attempt += 1;
      const isRetryable = RETRYABLE_ERRORS.includes(err.original?.code) || RETRYABLE_ERRORS.includes(err.code);
      if (!isRetryable || attempt >= maxAttempts) {
        throw err;
      }
      const delay = baseDelayMs * 2 ** (attempt - 1);
      await sleep(delay);
    }
  }
}

module.exports = { sequelize, connectWithRetry };
