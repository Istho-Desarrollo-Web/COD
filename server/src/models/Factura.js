const { DataTypes } = require('sequelize');

module.exports = (sequelize) =>
  sequelize.define(
    'Factura',
    {
      solicitudId: { type: DataTypes.INTEGER, allowNull: false, unique: true },
      numero: { type: DataTypes.STRING(30), allowNull: false },
      monto: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
      fechaPago: { type: DataTypes.DATEONLY, allowNull: false },
      facturaS3Key: { type: DataTypes.STRING(500), allowNull: false },
      observaciones: { type: DataTypes.TEXT, allowNull: true },
    },
    { tableName: 'facturas', underscored: true }
  );
