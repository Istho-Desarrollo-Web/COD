const { DataTypes } = require('sequelize');

module.exports = (sequelize) =>
  sequelize.define(
    'PlantillaFormulario',
    {
      codigo: { type: DataTypes.STRING(50), allowNull: false, unique: true },
      nombre: { type: DataTypes.STRING(200), allowNull: false },
      areaId: { type: DataTypes.INTEGER, allowNull: false },
      version: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'v1' },
      s3Key: { type: DataTypes.STRING(500), allowNull: true },
      activo: { type: DataTypes.BOOLEAN, defaultValue: true },
    },
    { tableName: 'plantillas_formulario', underscored: true }
  );
