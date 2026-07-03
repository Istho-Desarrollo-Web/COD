module.exports = {
  up: async ({ context: queryInterface }) => {
    const { DataTypes } = require('sequelize');

    await queryInterface.createTable('carpetas', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      area_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'areas', key: 'id' } },
      nombre: { type: DataTypes.STRING(150), allowNull: false },
      carpeta_padre_id: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'carpetas', key: 'id' } },
      orden: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      activo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      created_at: { type: DataTypes.DATE, allowNull: false },
      updated_at: { type: DataTypes.DATE, allowNull: false },
    });

    await queryInterface.createTable('tipos_documento', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      nombre: { type: DataTypes.STRING(100), allowNull: false, unique: true },
      dias_alerta_vencimiento_default: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 30 },
      activo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      created_at: { type: DataTypes.DATE, allowNull: false },
      updated_at: { type: DataTypes.DATE, allowNull: false },
    });
  },
  down: async ({ context: queryInterface }) => {
    await queryInterface.dropTable('tipos_documento');
    await queryInterface.dropTable('carpetas');
  },
};
