module.exports = {
  up: async ({ context: queryInterface }) => {
    const { DataTypes } = require('sequelize');

    await queryInterface.createTable('documentos', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      area_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'areas', key: 'id' } },
      carpeta_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'carpetas', key: 'id' } },
      tipo_documento_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'tipos_documento', key: 'id' } },
      nombre: { type: DataTypes.STRING(200), allowNull: false },
      codigo: { type: DataTypes.STRING(50), allowNull: true },
      version: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'v1' },
      vigencia_desde: { type: DataTypes.DATEONLY, allowNull: true },
      vigencia_hasta: { type: DataTypes.DATEONLY, allowNull: true },
      dias_alerta_vencimiento: { type: DataTypes.INTEGER, allowNull: true },
      estado: {
        type: DataTypes.ENUM('vigente', 'por_vencer', 'vencido', 'sin_vigencia'),
        allowNull: false,
        defaultValue: 'sin_vigencia',
      },
      s3_key: { type: DataTypes.STRING(500), allowNull: true },
      responsable_usuario_id: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'usuarios', key: 'id' } },
      activo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      created_at: { type: DataTypes.DATE, allowNull: false },
      updated_at: { type: DataTypes.DATE, allowNull: false },
    });

    await queryInterface.createTable('documento_version_historial', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      documento_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'documentos', key: 'id' } },
      version: { type: DataTypes.STRING(20), allowNull: false },
      s3_key: { type: DataTypes.STRING(500), allowNull: true },
      vigencia_desde: { type: DataTypes.DATEONLY, allowNull: true },
      vigencia_hasta: { type: DataTypes.DATEONLY, allowNull: true },
      subido_por_usuario_id: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'usuarios', key: 'id' } },
      created_at: { type: DataTypes.DATE, allowNull: false },
      updated_at: { type: DataTypes.DATE, allowNull: false },
    });
  },
  down: async ({ context: queryInterface }) => {
    await queryInterface.dropTable('documento_version_historial');
    await queryInterface.dropTable('documentos');
  },
};
