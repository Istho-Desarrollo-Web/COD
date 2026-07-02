const { Umzug, SequelizeStorage } = require('umzug');
const path = require('path');

function createMigrator(sequelize) {
  return new Umzug({
    migrations: {
      glob: path.join(__dirname, '../migrations/*.js'),
    },
    context: sequelize.getQueryInterface(),
    storage: new SequelizeStorage({ sequelize }),
    logger: console,
  });
}

module.exports = { createMigrator };
