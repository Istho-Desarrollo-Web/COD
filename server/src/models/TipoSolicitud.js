const { DataTypes } = require('sequelize');

module.exports = (sequelize) =>
  sequelize.define(
    'TipoSolicitud',
    { nombre: { type: DataTypes.STRING(100), allowNull: false, unique: true }, activo: { type: DataTypes.BOOLEAN, defaultValue: true } },
    { tableName: 'tipos_solicitud', underscored: true }
  );
