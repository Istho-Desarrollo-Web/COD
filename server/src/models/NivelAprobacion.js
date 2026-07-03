const { DataTypes } = require('sequelize');

module.exports = (sequelize) =>
  sequelize.define(
    'NivelAprobacion',
    {
      tipoSolicitudId: { type: DataTypes.INTEGER, allowNull: false },
      montoDesde: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
      montoHasta: { type: DataTypes.DECIMAL(14, 2), allowNull: true },
      rolAprobador: { type: DataTypes.STRING(50), allowNull: false },
      orden: { type: DataTypes.INTEGER, defaultValue: 0 },
      activo: { type: DataTypes.BOOLEAN, defaultValue: true },
    },
    { tableName: 'niveles_aprobacion', underscored: true }
  );
