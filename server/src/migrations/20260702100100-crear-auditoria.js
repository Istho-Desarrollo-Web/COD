module.exports = {
  up: async ({ context: queryInterface }) => {
    const { DataTypes } = require('sequelize');
    await queryInterface.createTable('auditorias', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      tabla: { type: DataTypes.STRING(100), allowNull: false },
      registro_id: { type: DataTypes.INTEGER, allowNull: false },
      accion: { type: DataTypes.ENUM('crear', 'actualizar', 'eliminar', 'login', 'logout'), allowNull: false },
      usuario_id: { type: DataTypes.INTEGER, allowNull: true },
      usuario_nombre: { type: DataTypes.STRING(150), allowNull: true },
      datos_anteriores: { type: DataTypes.JSON, allowNull: true },
      datos_nuevos: { type: DataTypes.JSON, allowNull: true },
      ip_address: { type: DataTypes.STRING(45), allowNull: true },
      user_agent: { type: DataTypes.STRING(255), allowNull: true },
      descripcion: { type: DataTypes.STRING(255), allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false },
      updated_at: { type: DataTypes.DATE, allowNull: false },
    });
  },
  down: async ({ context: queryInterface }) => {
    await queryInterface.dropTable('auditorias');
  },
};
