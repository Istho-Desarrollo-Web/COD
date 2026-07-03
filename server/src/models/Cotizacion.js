const { DataTypes } = require('sequelize');

module.exports = (sequelize) =>
  sequelize.define(
    'Cotizacion',
    {
      solicitudId: { type: DataTypes.INTEGER, allowNull: false },
      proveedorId: { type: DataTypes.INTEGER, allowNull: true },
      monto: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
      s3Key: { type: DataTypes.STRING(500), allowNull: true },
      seleccionada: { type: DataTypes.BOOLEAN, defaultValue: false },
      observaciones: { type: DataTypes.TEXT, allowNull: true },
    },
    { tableName: 'cotizaciones', underscored: true }
  );
