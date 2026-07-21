const { DataTypes } = require('sequelize');

module.exports = (sequelize) =>
  sequelize.define(
    'LogServidor',
    {
      nivel: { type: DataTypes.ENUM('info', 'warn', 'error'), allowNull: false },
      metodo: { type: DataTypes.STRING(10), allowNull: true },
      ruta: { type: DataTypes.STRING(255), allowNull: true },
      statusCode: { type: DataTypes.INTEGER, allowNull: true },
      duracionMs: { type: DataTypes.INTEGER, allowNull: true },
      mensaje: { type: DataTypes.STRING(500), allowNull: false },
      stack: { type: DataTypes.TEXT, allowNull: true },
      usuarioId: { type: DataTypes.INTEGER, allowNull: true },
      usuarioNombre: { type: DataTypes.STRING(150), allowNull: true },
      ip: { type: DataTypes.STRING(45), allowNull: true },
    },
    { tableName: 'logs_servidor', underscored: true }
  );
