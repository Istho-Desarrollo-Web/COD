module.exports = {
  up: async ({ context: queryInterface }) => {
    const { DataTypes } = require('sequelize');

    await queryInterface.createTable('proveedores', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      tipo: { type: DataTypes.ENUM('proveedor', 'contratista'), allowNull: false },
      documento_identificacion: { type: DataTypes.STRING(30), allowNull: false, unique: true },
      razon_social: { type: DataTypes.STRING(200), allowNull: false },
      criticidad: { type: DataTypes.ENUM('alta', 'media', 'baja'), allowNull: false, defaultValue: 'media' },
      categoria: { type: DataTypes.STRING(100), allowNull: true },
      responsable_usuario_id: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'usuarios', key: 'id' } },
      estado: { type: DataTypes.ENUM('activo', 'inactivo', 'en_evaluacion', 'suspendido'), allowNull: false, defaultValue: 'en_evaluacion' },
      fecha_ultima_evaluacion: { type: DataTypes.DATEONLY, allowNull: true },
      fecha_proxima_evaluacion: { type: DataTypes.DATEONLY, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false },
      updated_at: { type: DataTypes.DATE, allowNull: false },
    });

    await queryInterface.createTable('requisitos_proveedor', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      nombre: { type: DataTypes.STRING(150), allowNull: false, unique: true },
      criticidad_minima: { type: DataTypes.ENUM('alta', 'media', 'baja'), allowNull: false },
      obligatorio: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      vigencia_aplica: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      activo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      created_at: { type: DataTypes.DATE, allowNull: false },
      updated_at: { type: DataTypes.DATE, allowNull: false },
    });

    await queryInterface.createTable('proveedor_documentos', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      proveedor_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'proveedores', key: 'id' } },
      requisito_id: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'requisitos_proveedor', key: 'id' } },
      s3_key: { type: DataTypes.STRING(500), allowNull: true },
      vigencia_desde: { type: DataTypes.DATEONLY, allowNull: true },
      vigencia_hasta: { type: DataTypes.DATEONLY, allowNull: true },
      estado: { type: DataTypes.ENUM('vigente', 'por_vencer', 'vencido'), allowNull: false, defaultValue: 'vigente' },
      version: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'v1' },
      created_at: { type: DataTypes.DATE, allowNull: false },
      updated_at: { type: DataTypes.DATE, allowNull: false },
    });

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
    await queryInterface.dropTable('proveedor_documentos');
    await queryInterface.dropTable('requisitos_proveedor');
    await queryInterface.dropTable('proveedores');
  },
};
