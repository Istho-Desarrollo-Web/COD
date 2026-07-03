const { DataTypes } = require('sequelize');

module.exports = (sequelize) =>
  sequelize.define(
    'EvaluacionProveedor',
    {
      proveedorId: { type: DataTypes.INTEGER, allowNull: false },
      periodo: { type: DataTypes.INTEGER, allowNull: false },
      fechaProgramada: { type: DataTypes.DATEONLY, allowNull: false },
      fechaRealizada: { type: DataTypes.DATEONLY, allowNull: true },
      responsableUsuarioId: { type: DataTypes.INTEGER, allowNull: true },
      puntaje: { type: DataTypes.DECIMAL(5, 2), allowNull: true },
      estado: { type: DataTypes.ENUM('pendiente', 'en_proceso', 'completada', 'vencida'), allowNull: false, defaultValue: 'pendiente' },
      observaciones: { type: DataTypes.TEXT, allowNull: true },
    },
    { tableName: 'evaluaciones_proveedor', underscored: true }
  );
