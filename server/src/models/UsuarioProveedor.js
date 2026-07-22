const { DataTypes } = require('sequelize');

module.exports = (sequelize) =>
  sequelize.define(
    'UsuarioProveedor',
    {
      usuarioId: { type: DataTypes.INTEGER, allowNull: false },
      proveedorId: { type: DataTypes.INTEGER, allowNull: false },
    },
    { tableName: 'usuario_proveedores', underscored: true }
  );
