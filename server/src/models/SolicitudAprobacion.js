const { DataTypes } = require('sequelize');

module.exports = (sequelize) =>
  sequelize.define(
    'SolicitudAprobacion',
    {
      solicitudId: { type: DataTypes.INTEGER, allowNull: false },
      nivelAprobacionId: { type: DataTypes.INTEGER, allowNull: false },
      aprobadorUsuarioId: { type: DataTypes.INTEGER, allowNull: true },
      estado: { type: DataTypes.ENUM('pendiente', 'aprobado', 'rechazado'), allowNull: false, defaultValue: 'pendiente' },
      comentario: { type: DataTypes.TEXT, allowNull: true },
      orden: { type: DataTypes.INTEGER, defaultValue: 1 },
      fechaResolucion: { type: DataTypes.DATE, allowNull: true },
    },
    { tableName: 'solicitud_aprobaciones', underscored: true }
  );
