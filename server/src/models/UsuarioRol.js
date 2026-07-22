const { DataTypes } = require('sequelize');

module.exports = (sequelize) =>
  sequelize.define(
    'UsuarioRol',
    {
      usuarioId: { type: DataTypes.INTEGER, allowNull: false },
      rolId: { type: DataTypes.INTEGER, allowNull: false },
    },
    { tableName: 'usuario_roles', underscored: true }
  );
