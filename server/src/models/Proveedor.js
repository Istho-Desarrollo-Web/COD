const { DataTypes } = require('sequelize');

module.exports = (sequelize) =>
  sequelize.define(
    'Proveedor',
    {
      tipo: { type: DataTypes.ENUM('proveedor', 'contratista'), allowNull: false },
      documentoIdentificacion: { type: DataTypes.STRING(30), allowNull: false, unique: true },
      razonSocial: { type: DataTypes.STRING(200), allowNull: false },
      criticidad: { type: DataTypes.ENUM('critico', 'relevante', 'basico'), allowNull: false, defaultValue: 'relevante' },
      categoria: { type: DataTypes.STRING(100), allowNull: true },
      responsableUsuarioId: { type: DataTypes.INTEGER, allowNull: true },
      areaSolicitanteId: { type: DataTypes.INTEGER, allowNull: true },
      estado: { type: DataTypes.ENUM('activo', 'inactivo', 'en_evaluacion', 'suspendido', 'registro_aprobado'), allowNull: false, defaultValue: 'en_evaluacion' },
      fechaUltimaEvaluacion: { type: DataTypes.DATEONLY, allowNull: true },
      fechaProximaEvaluacion: { type: DataTypes.DATEONLY, allowNull: true },
    },
    { tableName: 'proveedores', underscored: true }
  );
