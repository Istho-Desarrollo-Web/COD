// Backfills the FK constraint on cotizaciones.proveedor_id -> proveedores.id.
// The column was created nullable, without a `references` clause, in
// 20260702100700-crear-solicitudes.js because the `proveedores` table did not
// exist yet at that point in the migration sequence (it was created afterward
// in 20260702100800-crear-proveedores.js). This migration only adds the
// constraint — it does not touch the column definition or existing data.
module.exports = {
  up: async ({ context: queryInterface }) => {
    await queryInterface.addConstraint('cotizaciones', {
      fields: ['proveedor_id'],
      type: 'foreign key',
      name: 'fk_cotizaciones_proveedor_id',
      references: { table: 'proveedores', field: 'id' },
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE',
    });
  },
  down: async ({ context: queryInterface }) => {
    await queryInterface.removeConstraint('cotizaciones', 'fk_cotizaciones_proveedor_id');
    // MySQL's `ALTER TABLE ... DROP FOREIGN KEY` only removes the FK itself; it
    // leaves behind the accompanying index of the same name. Drop it too so a
    // later re-run of `up()` doesn't fail with "Duplicate key name".
    await queryInterface.removeIndex('cotizaciones', 'fk_cotizaciones_proveedor_id');
  },
};
