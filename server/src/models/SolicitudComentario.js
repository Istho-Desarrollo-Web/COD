const { DataTypes } = require('sequelize');

module.exports = (sequelize) =>
  sequelize.define(
    'SolicitudComentario',
    {
      solicitudId: { type: DataTypes.INTEGER, allowNull: false },
      usuarioId: { type: DataTypes.INTEGER, allowNull: false },
      texto: { type: DataTypes.TEXT, allowNull: false },
    },
    { tableName: 'solicitud_comentarios', underscored: true }
  );
