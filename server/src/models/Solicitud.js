const { DataTypes } = require('sequelize');

module.exports = (sequelize) =>
  sequelize.define(
    'Solicitud',
    {
      codigo: { type: DataTypes.STRING(30), allowNull: false, unique: true },
      tipoSolicitudId: { type: DataTypes.INTEGER, allowNull: false },
      areaSolicitanteId: { type: DataTypes.INTEGER, allowNull: false },
      plantillaOrigenId: { type: DataTypes.INTEGER, allowNull: true },
      solicitanteUsuarioId: { type: DataTypes.INTEGER, allowNull: false },
      descripcion: { type: DataTypes.TEXT, allowNull: true },
      montoEstimado: { type: DataTypes.DECIMAL(14, 2), allowNull: true },
      nivelAprobacionId: { type: DataTypes.INTEGER, allowNull: true },
      estado: {
        type: DataTypes.ENUM('borrador', 'cotizando', 'en_aprobacion', 'aprobada', 'rechazada', 'confirmada', 'cerrada', 'cancelada'),
        allowNull: false, defaultValue: 'borrador',
      },
      ordenFormalNumero: { type: DataTypes.STRING(30), allowNull: true },
      ordenFormalS3Key: { type: DataTypes.STRING(500), allowNull: true },
    },
    { tableName: 'solicitudes', underscored: true }
  );
