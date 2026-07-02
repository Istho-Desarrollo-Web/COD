module.exports = {
  up: async ({ context: queryInterface }) => {
    const { DataTypes } = require('sequelize');
    await queryInterface.createTable('areas', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      nombre: { type: DataTypes.STRING(100), allowNull: false },
      codigo: { type: DataTypes.STRING(20), allowNull: false, unique: true },
      lider_usuario_id: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'usuarios', key: 'id' } },
      salud_documental_pct: { type: DataTypes.DECIMAL(5, 1), allowNull: false, defaultValue: 100 },
      activo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      created_at: { type: DataTypes.DATE, allowNull: false },
      updated_at: { type: DataTypes.DATE, allowNull: false },
    });
  },
  down: async ({ context: queryInterface }) => {
    await queryInterface.dropTable('areas');
  },
};
