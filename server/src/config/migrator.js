const { Umzug, SequelizeStorage } = require('umzug');
const path = require('path');

function createMigrator(sequelize) {
  // Use relative path from the process's current working directory
  // Convert to forward slashes for glob compatibility on Windows
  const relativeGlob = path.relative(process.cwd(), path.join(__dirname, '../migrations/*.js')).replace(/\\/g, '/');

  return new Umzug({
    migrations: {
      glob: relativeGlob,
    },
    context: sequelize.getQueryInterface(),
    storage: new SequelizeStorage({ sequelize }),
    logger: console,
  });
}

module.exports = { createMigrator };
