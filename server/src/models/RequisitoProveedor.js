const { DataTypes } = require('sequelize');

module.exports = (sequelize) =>
  sequelize.define(
    'RequisitoProveedor',
    {
      nombre: { type: DataTypes.STRING(150), allowNull: false, unique: true },
      tipoDocumentoId: { type: DataTypes.INTEGER, allowNull: true },
      criticidadMinima: { type: DataTypes.ENUM('alta', 'media', 'baja'), allowNull: false },
      obligatorio: { type: DataTypes.BOOLEAN, defaultValue: true },
      vigenciaAplica: { type: DataTypes.BOOLEAN, defaultValue: false },
      activo: { type: DataTypes.BOOLEAN, defaultValue: true },
    },
    { tableName: 'requisitos_proveedor', underscored: true }
  );
