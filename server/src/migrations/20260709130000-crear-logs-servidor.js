module.exports = {
  up: async ({ context: queryInterface }) => {
    const { DataTypes } = require('sequelize');

    await queryInterface.createTable('logs_servidor', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      nivel: { type: DataTypes.ENUM('info', 'warn', 'error'), allowNull: false },
      metodo: { type: DataTypes.STRING(10), allowNull: true },
      ruta: { type: DataTypes.STRING(255), allowNull: true },
      status_code: { type: DataTypes.INTEGER, allowNull: true },
      duracion_ms: { type: DataTypes.INTEGER, allowNull: true },
      mensaje: { type: DataTypes.STRING(500), allowNull: false },
      stack: { type: DataTypes.TEXT, allowNull: true },
      usuario_id: { type: DataTypes.INTEGER, allowNull: true },
      usuario_nombre: { type: DataTypes.STRING(150), allowNull: true },
      ip: { type: DataTypes.STRING(45), allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false },
      updated_at: { type: DataTypes.DATE, allowNull: false },
    });
  },
  down: async ({ context: queryInterface }) => {
    await queryInterface.dropTable('logs_servidor');
  },
};
