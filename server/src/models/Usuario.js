const { DataTypes } = require('sequelize');

module.exports = (sequelize) =>
  sequelize.define(
    'Usuario',
    {
      username: { type: DataTypes.STRING(50), allowNull: false, unique: true },
      email: { type: DataTypes.STRING(150), allowNull: false, unique: true },
      passwordHash: { type: DataTypes.STRING(255), allowNull: false },
      nombre: { type: DataTypes.STRING(100), allowNull: false },
      apellido: { type: DataTypes.STRING(100), allowNull: false },
      areaId: { type: DataTypes.INTEGER, allowNull: true },
      activo: { type: DataTypes.BOOLEAN, defaultValue: true },
      requiereCambioPassword: { type: DataTypes.BOOLEAN, defaultValue: false },
      ultimoAcceso: { type: DataTypes.DATE, allowNull: true },
    },
    {
      tableName: 'usuarios',
      underscored: true,
      defaultScope: { attributes: { exclude: ['passwordHash'] } },
      scopes: { conPassword: { attributes: {} } },
    }
  );
