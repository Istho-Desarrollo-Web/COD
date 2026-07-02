const { DataTypes } = require('sequelize');

const parseJsonField = (value) => {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
};

module.exports = (sequelize) => {
  const Auditoria = sequelize.define(
    'Auditoria',
    {
      tabla: { type: DataTypes.STRING(100), allowNull: false },
      registroId: { type: DataTypes.INTEGER, allowNull: false },
      accion: { type: DataTypes.ENUM('crear', 'actualizar', 'eliminar', 'login', 'logout'), allowNull: false },
      usuarioId: { type: DataTypes.INTEGER, allowNull: true },
      usuarioNombre: { type: DataTypes.STRING(150), allowNull: true },
      datosAnteriores: {
        type: DataTypes.JSON,
        allowNull: true,
        get() {
          return parseJsonField(this.getDataValue('datosAnteriores'));
        },
      },
      datosNuevos: {
        type: DataTypes.JSON,
        allowNull: true,
        get() {
          return parseJsonField(this.getDataValue('datosNuevos'));
        },
      },
      ipAddress: { type: DataTypes.STRING(45), allowNull: true },
      userAgent: { type: DataTypes.STRING(255), allowNull: true },
      descripcion: { type: DataTypes.STRING(255), allowNull: true },
    },
    { tableName: 'auditorias', underscored: true }
  );

  Auditoria.registrar = async function registrar(datos) {
    try {
      return await Auditoria.create(datos);
    } catch (err) {
      console.error('Auditoria.registrar falló (no interrumpe la operación principal):', err.message);
      return null;
    }
  };

  return Auditoria;
};
