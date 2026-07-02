module.exports = {
  up: async ({ context: queryInterface }) => {
    const { DataTypes } = require('sequelize');

    await queryInterface.createTable('roles', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      nombre: { type: DataTypes.STRING(50), allowNull: false, unique: true },
      nivel: { type: DataTypes.INTEGER, allowNull: false },
      descripcion: { type: DataTypes.STRING(255), allowNull: true },
      activo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      created_at: { type: DataTypes.DATE, allowNull: false },
      updated_at: { type: DataTypes.DATE, allowNull: false },
    });

    await queryInterface.createTable('usuarios', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      username: { type: DataTypes.STRING(50), allowNull: false, unique: true },
      email: { type: DataTypes.STRING(150), allowNull: false, unique: true },
      password_hash: { type: DataTypes.STRING(255), allowNull: false },
      nombre: { type: DataTypes.STRING(100), allowNull: false },
      apellido: { type: DataTypes.STRING(100), allowNull: false },
      rol_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'roles', key: 'id' } },
      activo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      requiere_cambio_password: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      ultimo_acceso: { type: DataTypes.DATE, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false },
      updated_at: { type: DataTypes.DATE, allowNull: false },
    });

    await queryInterface.createTable('rol_permisos', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      rol_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'roles', key: 'id' } },
      modulo: { type: DataTypes.STRING(50), allowNull: false },
      acciones: { type: DataTypes.JSON, allowNull: false },
      created_at: { type: DataTypes.DATE, allowNull: false },
      updated_at: { type: DataTypes.DATE, allowNull: false },
    });
    await queryInterface.addConstraint('rol_permisos', {
      fields: ['rol_id', 'modulo'],
      type: 'unique',
      name: 'uq_rol_permisos_rol_modulo',
    });
  },
  down: async ({ context: queryInterface }) => {
    await queryInterface.dropTable('rol_permisos');
    await queryInterface.dropTable('usuarios');
    await queryInterface.dropTable('roles');
  },
};
