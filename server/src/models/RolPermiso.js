const { DataTypes } = require('sequelize');

module.exports = (sequelize) =>
  sequelize.define(
    'RolPermiso',
    {
      rolId: { type: DataTypes.INTEGER, allowNull: false },
      modulo: { type: DataTypes.STRING(50), allowNull: false },
      acciones: { type: DataTypes.JSON, allowNull: false },
    },
    { tableName: 'rol_permisos', underscored: true }
  );
