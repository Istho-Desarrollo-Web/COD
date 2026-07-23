module.exports = {
  up: async ({ context: queryInterface }) => {
    const { DataTypes } = require('sequelize');

    await queryInterface.createTable('facturas', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      solicitud_id: {
        type: DataTypes.INTEGER, allowNull: false, unique: true,
        references: { model: 'solicitudes', key: 'id' },
      },
      numero: { type: DataTypes.STRING(30), allowNull: false },
      monto: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
      fecha_pago: { type: DataTypes.DATEONLY, allowNull: false },
      factura_s3_key: { type: DataTypes.STRING(500), allowNull: false },
      observaciones: { type: DataTypes.TEXT, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false },
      updated_at: { type: DataTypes.DATE, allowNull: false },
    });
  },
  down: async ({ context: queryInterface }) => {
    await queryInterface.dropTable('facturas');
  },
};
