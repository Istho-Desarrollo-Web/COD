const { DataTypes } = require('sequelize');

module.exports = (sequelize) =>
  sequelize.define(
    'Carpeta',
    {
      areaId: { type: DataTypes.INTEGER, allowNull: false },
      nombre: { type: DataTypes.STRING(150), allowNull: false },
      carpetaPadreId: { type: DataTypes.INTEGER, allowNull: true },
      orden: { type: DataTypes.INTEGER, defaultValue: 0 },
      activo: { type: DataTypes.BOOLEAN, defaultValue: true },
    },
    { tableName: 'carpetas', underscored: true }
  );
