const { DataTypes } = require('sequelize');

module.exports = (sequelize) =>
  sequelize.define(
    'Rol',
    {
      nombre: { type: DataTypes.STRING(50), allowNull: false, unique: true },
      nivel: { type: DataTypes.INTEGER, allowNull: false },
      descripcion: { type: DataTypes.STRING(255) },
      activo: { type: DataTypes.BOOLEAN, defaultValue: true },
    },
    { tableName: 'roles', underscored: true }
  );
