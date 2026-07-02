const { DataTypes } = require('sequelize');

module.exports = (sequelize) =>
  sequelize.define(
    'Area',
    {
      nombre: { type: DataTypes.STRING(100), allowNull: false },
      codigo: { type: DataTypes.STRING(20), allowNull: false, unique: true },
      liderUsuarioId: { type: DataTypes.INTEGER, allowNull: true },
      saludDocumentalPct: { type: DataTypes.DECIMAL(5, 1), allowNull: false, defaultValue: 100 },
      activo: { type: DataTypes.BOOLEAN, defaultValue: true },
    },
    { tableName: 'areas', underscored: true }
  );
