const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const { sequelize, connectWithRetry } = require('./src/config/database');
const { createMigrator } = require('./src/config/migrator');

function validateEnv() {
  const isProduccion = process.env.NODE_ENV === 'production';
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET debe existir y tener al menos 32 caracteres');
  }
  if (isProduccion && process.env.JWT_SECRET.includes('cambiar')) {
    throw new Error('JWT_SECRET no puede contener "cambiar" en producción');
  }
  if (!process.env.DB_NAME || !process.env.DB_USER || !process.env.DB_HOST) {
    throw new Error('DB_NAME, DB_USER y DB_HOST son obligatorios');
  }
  if (isProduccion && !process.env.CORS_ORIGIN) {
    throw new Error('CORS_ORIGIN es obligatorio en producción');
  }
}

validateEnv();

const app = express();

app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(compression());
app.use(express.json());

app.get('/health', async (req, res) => {
  let dbStatus = 'connecting';
  try {
    await sequelize.authenticate();
    dbStatus = 'connected';
  } catch {
    dbStatus = 'error';
  }
  res.json({
    success: true,
    environment: process.env.NODE_ENV,
    timestamp: new Date().toISOString(),
    database: dbStatus,
  });
});

app.use('/api/v1', require('./src/routes'));

async function initializeDatabase() {
  await connectWithRetry(sequelize);
  const migrator = createMigrator(sequelize);
  await migrator.up();
  await require('./src/scripts/seedRolesPermisos')();
  await require('./src/scripts/seedTiposDocumento')();
  await require('./src/scripts/seedNivelesAprobacion')();
  await require('./src/scripts/seedRequisitosProveedor')();
}

if (require.main === module) {
  const PORT = process.env.PORT || 5000;
  initializeDatabase()
    .then(() => {
      app.listen(PORT, () => console.log(`COD API escuchando en puerto ${PORT}`));
    })
    .catch((err) => {
      console.error('Error inicializando la base de datos:', err);
      process.exit(1);
    });
}

module.exports = { app, initializeDatabase };
