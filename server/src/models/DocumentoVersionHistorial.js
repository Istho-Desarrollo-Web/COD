const { DataTypes } = require('sequelize');

module.exports = (sequelize) =>
  sequelize.define(
    'DocumentoVersionHistorial',
    {
      documentoId: { type: DataTypes.INTEGER, allowNull: false },
      version: { type: DataTypes.STRING(20), allowNull: false },
      s3Key: { type: DataTypes.STRING(500), allowNull: true },
      vigenciaDesde: { type: DataTypes.DATEONLY, allowNull: true },
      vigenciaHasta: { type: DataTypes.DATEONLY, allowNull: true },
      subidoPorUsuarioId: { type: DataTypes.INTEGER, allowNull: true },
    },
    { tableName: 'documento_version_historial', underscored: true }
  );
