module.exports = {
  up: async ({ context: queryInterface }) => {
    const { DataTypes } = require('sequelize');

    await queryInterface.createTable('solicitudes', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      codigo: { type: DataTypes.STRING(30), allowNull: false, unique: true },
      tipo_solicitud_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'tipos_solicitud', key: 'id' } },
      area_solicitante_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'areas', key: 'id' } },
      plantilla_origen_id: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'plantillas_formulario', key: 'id' } },
      solicitante_usuario_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'usuarios', key: 'id' } },
      descripcion: { type: DataTypes.TEXT, allowNull: true },
      monto_estimado: { type: DataTypes.DECIMAL(14, 2), allowNull: true },
      nivel_aprobacion_id: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'niveles_aprobacion', key: 'id' } },
      estado: {
        type: DataTypes.ENUM('borrador', 'cotizando', 'en_aprobacion', 'aprobada', 'rechazada', 'confirmada', 'cerrada', 'cancelada'),
        allowNull: false, defaultValue: 'borrador',
      },
      orden_formal_numero: { type: DataTypes.STRING(30), allowNull: true },
      orden_formal_s3_key: { type: DataTypes.STRING(500), allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false },
      updated_at: { type: DataTypes.DATE, allowNull: false },
    });

    await queryInterface.createTable('cotizaciones', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      solicitud_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'solicitudes', key: 'id' } },
      proveedor_id: { type: DataTypes.INTEGER, allowNull: true },
      monto: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
      s3_key: { type: DataTypes.STRING(500), allowNull: true },
      seleccionada: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      observaciones: { type: DataTypes.TEXT, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false },
      updated_at: { type: DataTypes.DATE, allowNull: false },
    });

    await queryInterface.createTable('solicitud_aprobaciones', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      solicitud_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'solicitudes', key: 'id' } },
      nivel_aprobacion_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'niveles_aprobacion', key: 'id' } },
      aprobador_usuario_id: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'usuarios', key: 'id' } },
      estado: { type: DataTypes.ENUM('pendiente', 'aprobado', 'rechazado'), allowNull: false, defaultValue: 'pendiente' },
      comentario: { type: DataTypes.TEXT, allowNull: true },
      orden: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
      fecha_resolucion: { type: DataTypes.DATE, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false },
      updated_at: { type: DataTypes.DATE, allowNull: false },
    });
  },
  down: async ({ context: queryInterface }) => {
    await queryInterface.dropTable('solicitud_aprobaciones');
    await queryInterface.dropTable('cotizaciones');
    await queryInterface.dropTable('solicitudes');
  },
};
