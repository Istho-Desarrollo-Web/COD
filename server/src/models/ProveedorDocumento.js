const { DataTypes } = require('sequelize');

module.exports = (sequelize) =>
  sequelize.define(
    'ProveedorDocumento',
    {
      proveedorId: { type: DataTypes.INTEGER, allowNull: false },
      requisitoId: { type: DataTypes.INTEGER, allowNull: true },
      s3Key: { type: DataTypes.STRING(500), allowNull: true },
      vigenciaDesde: { type: DataTypes.DATEONLY, allowNull: true },
      vigenciaHasta: { type: DataTypes.DATEONLY, allowNull: true },
      estado: { type: DataTypes.ENUM('vigente', 'por_vencer', 'vencido'), allowNull: false, defaultValue: 'vigente' },
      version: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'v1' },
    },
    { tableName: 'proveedor_documentos', underscored: true }
  );
