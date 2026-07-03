module.exports = {
  up: async ({ context: queryInterface }) => {
    const { DataTypes } = require('sequelize');

    await queryInterface.createTable('tipos_solicitud', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      nombre: { type: DataTypes.STRING(100), allowNull: false, unique: true },
      activo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      created_at: { type: DataTypes.DATE, allowNull: false },
      updated_at: { type: DataTypes.DATE, allowNull: false },
    });

    await queryInterface.createTable('niveles_aprobacion', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      tipo_solicitud_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'tipos_solicitud', key: 'id' } },
      monto_desde: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
      monto_hasta: { type: DataTypes.DECIMAL(14, 2), allowNull: true },
      rol_aprobador: { type: DataTypes.STRING(50), allowNull: false },
      orden: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      activo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      created_at: { type: DataTypes.DATE, allowNull: false },
      updated_at: { type: DataTypes.DATE, allowNull: false },
    });
  },
  down: async ({ context: queryInterface }) => {
    await queryInterface.dropTable('niveles_aprobacion');
    await queryInterface.dropTable('tipos_solicitud');
  },
};
