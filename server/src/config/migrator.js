const { Umzug, SequelizeStorage } = require('umzug');
const path = require('path');

const logger = {
  info: ({ event, name, durationSeconds }) => {
    if (event === 'migrating') return console.log(`  → aplicando  ${name}`);
    if (event === 'migrated') return console.log(`  ✓ aplicada   ${name} (${durationSeconds}s)`);
    if (event === 'reverting') return console.log(`  → revirtiendo ${name}`);
    if (event === 'reverted') return console.log(`  ✓ revertida  ${name} (${durationSeconds}s)`);
  },
  warn: (message) => console.warn(message),
  error: (message) => console.error(message),
  debug: () => {},
};

function createMigrator(sequelize) {
  return new Umzug({
    migrations: {
      glob: ['*.js', { cwd: path.join(__dirname, '../migrations') }],
    },
    context: sequelize.getQueryInterface(),
    storage: new SequelizeStorage({ sequelize }),
    logger,
  });
}

module.exports = { createMigrator };
