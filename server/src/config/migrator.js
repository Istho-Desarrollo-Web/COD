const { Umzug, SequelizeStorage } = require('umzug');
const path = require('path');

function createMigrator(sequelize) {
  return new Umzug({
    migrations: {
      glob: ['*.js', { cwd: path.join(__dirname, '../migrations') }],
    },
    context: sequelize.getQueryInterface(),
    storage: new SequelizeStorage({ sequelize }),
    logger: console,
  });
}

module.exports = { createMigrator };
