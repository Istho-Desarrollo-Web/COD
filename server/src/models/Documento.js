const { DataTypes } = require('sequelize');

module.exports = (sequelize) =>
  sequelize.define(
    'Documento',
    {
      areaId: { type: DataTypes.INTEGER, allowNull: false },
      carpetaId: { type: DataTypes.INTEGER, allowNull: false },
      tipoDocumentoId: { type: DataTypes.INTEGER, allowNull: false },
      nombre: { type: DataTypes.STRING(200), allowNull: false },
      codigo: { type: DataTypes.STRING(50), allowNull: true },
      version: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'v1' },
      vigenciaDesde: { type: DataTypes.DATEONLY, allowNull: true },
      vigenciaHasta: { type: DataTypes.DATEONLY, allowNull: true },
      diasAlertaVencimiento: { type: DataTypes.INTEGER, allowNull: true },
      estado: {
        type: DataTypes.ENUM('vigente', 'por_vencer', 'vencido', 'sin_vigencia'),
        allowNull: false,
        defaultValue: 'sin_vigencia',
      },
      s3Key: { type: DataTypes.STRING(500), allowNull: true },
      responsableUsuarioId: { type: DataTypes.INTEGER, allowNull: true },
      activo: { type: DataTypes.BOOLEAN, defaultValue: true },
    },
    { tableName: 'documentos', underscored: true }
  );
