module.exports = {
  up: async ({ context: queryInterface }) => {
    const { DataTypes } = require('sequelize');

    const tablasExistentes = await queryInterface.showAllTables();
    if (tablasExistentes.includes('evaluaciones_proveedor')) {
      // La tabla ya existe en algunos entornos (creada antes de que este
      // proyecto adoptara migraciones para todo — ver Global Constraints
      // de este plan) — no recrearla evita un error de "tabla ya existe"
      // al correr esta migración ahí; en un entorno nuevo sí la crea.
      return;
    }

    await queryInterface.createTable('evaluaciones_proveedor', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      proveedor_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'proveedores', key: 'id' } },
      periodo: { type: DataTypes.INTEGER, allowNull: false },
      fecha_programada: { type: DataTypes.DATEONLY, allowNull: false },
      fecha_realizada: { type: DataTypes.DATEONLY, allowNull: true },
      responsable_usuario_id: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'usuarios', key: 'id' } },
      puntaje: { type: DataTypes.DECIMAL(5, 2), allowNull: true },
      estado: { type: DataTypes.ENUM('pendiente', 'en_proceso', 'completada', 'vencida'), allowNull: false, defaultValue: 'pendiente' },
      observaciones: { type: DataTypes.TEXT, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false },
      updated_at: { type: DataTypes.DATE, allowNull: false },
    });
  },
  down: async ({ context: queryInterface }) => {
    await queryInterface.dropTable('evaluaciones_proveedor');
  },
};
