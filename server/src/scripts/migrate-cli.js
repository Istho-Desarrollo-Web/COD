const { sequelize } = require('../config/database');
const { createMigrator } = require('../config/migrator');

async function main() {
  const command = process.argv[2];
  const migrator = createMigrator(sequelize);

  try {
    if (command === 'up') {
      const applied = await migrator.up();
      console.log(`Migraciones aplicadas: ${applied.map((m) => m.name).join(', ') || '(ninguna pendiente)'}`);
    } else if (command === 'down') {
      const reverted = await migrator.down();
      console.log(`Migración revertida: ${reverted.map((m) => m.name).join(', ')}`);
    } else if (command === 'status') {
      const pending = await migrator.pending();
      console.log(`Pendientes: ${pending.map((m) => m.name).join(', ') || '(ninguna)'}`);
    } else {
      console.error('Uso: node migrate-cli.js <up|down|status>');
      process.exitCode = 1;
    }
  } finally {
    await sequelize.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
