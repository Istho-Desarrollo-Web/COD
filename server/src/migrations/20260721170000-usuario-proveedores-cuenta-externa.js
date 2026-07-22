const { DataTypes } = require('sequelize');

// Paso 6 del refactor de roles: modelo de datos (sin pantalla todavía) para
// la cuenta externa de un Colaborador que representa a un Proveedor —
// relación N:M vía tabla puente explícita, mismo patrón que usuario_roles
// (Paso 2). El scoping de autorización real (qué ve un colaborador externo)
// queda para un ciclo futuro. Ver
// docs/superpowers/specs/2026-07-21-cod-modelo-roles-definitivo.md.
module.exports = {
  up: async ({ context: queryInterface }) => {
    await queryInterface.createTable('usuario_proveedores', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      usuario_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'usuarios', key: 'id' } },
      proveedor_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'proveedores', key: 'id' } },
      created_at: { type: DataTypes.DATE, allowNull: false },
      updated_at: { type: DataTypes.DATE, allowNull: false },
    });
    await queryInterface.addConstraint('usuario_proveedores', {
      fields: ['usuario_id', 'proveedor_id'],
      type: 'unique',
      name: 'uq_usuario_proveedores_usuario_proveedor',
    });
  },
  down: async ({ context: queryInterface }) => {
    await queryInterface.dropTable('usuario_proveedores');
  },
};
