module.exports = {
  up: async ({ context: queryInterface }) => {
    const { DataTypes } = require('sequelize');

    await queryInterface.addColumn('proveedores', 'area_solicitante_id', {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'areas', key: 'id' },
    });

    await queryInterface.addColumn('requisitos_proveedor', 'tipo_documento_id', {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'tipos_documento', key: 'id' },
    });

    await queryInterface.addColumn('carpetas', 'proveedor_id', {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'proveedores', key: 'id' },
    });
  },
  down: async ({ context: queryInterface }) => {
    await queryInterface.removeColumn('carpetas', 'proveedor_id');
    await queryInterface.removeColumn('requisitos_proveedor', 'tipo_documento_id');
    await queryInterface.removeColumn('proveedores', 'area_solicitante_id');
  },
};
