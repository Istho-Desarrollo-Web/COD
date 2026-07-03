const { DataTypes } = require('sequelize');

module.exports = (sequelize) =>
  sequelize.define(
    'TipoDocumento',
    {
      nombre: { type: DataTypes.STRING(100), allowNull: false, unique: true },
      diasAlertaVencimientoDefault: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 30 },
      activo: { type: DataTypes.BOOLEAN, defaultValue: true },
    },
    { tableName: 'tipos_documento', underscored: true }
  );
