module.exports = {
  up: async ({ context: queryInterface }) => {
    const { DataTypes } = require('sequelize');
    await queryInterface.createTable('plantillas_formulario', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      codigo: { type: DataTypes.STRING(50), allowNull: false, unique: true },
      nombre: { type: DataTypes.STRING(200), allowNull: false },
      area_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'areas', key: 'id' } },
      version: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'v1' },
      s3_key: { type: DataTypes.STRING(500), allowNull: true },
      activo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      created_at: { type: DataTypes.DATE, allowNull: false },
      updated_at: { type: DataTypes.DATE, allowNull: false },
    });
  },
  down: async ({ context: queryInterface }) => {
    await queryInterface.dropTable('plantillas_formulario');
  },
};
