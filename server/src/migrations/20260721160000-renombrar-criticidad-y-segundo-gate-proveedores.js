const { DataTypes } = require('sequelize');

// Paso 4 del refactor de roles: (a) renombra el ENUM de criticidad de
// Proveedor/RequisitoProveedor (alta/media/baja -> critico/relevante/basico)
// vía el patrón seguro de 3 pasos para ENUMs de MySQL (ensanchar -> traducir
// filas -> angostar); (b) agrega 'registro_aprobado' al ENUM de
// Proveedor.estado para el segundo gate de aprobación. Ver
// docs/superpowers/specs/2026-07-21-cod-modelo-roles-definitivo.md.
module.exports = {
  up: async ({ context: queryInterface }) => {
    await queryInterface.changeColumn('proveedores', 'criticidad', {
      type: DataTypes.ENUM('alta', 'media', 'baja', 'critico', 'relevante', 'basico'),
      allowNull: false,
      defaultValue: 'media',
    });
    await queryInterface.changeColumn('requisitos_proveedor', 'criticidad_minima', {
      type: DataTypes.ENUM('alta', 'media', 'baja', 'critico', 'relevante', 'basico'),
      allowNull: false,
    });
    await queryInterface.changeColumn('proveedores', 'estado', {
      type: DataTypes.ENUM('activo', 'inactivo', 'en_evaluacion', 'suspendido', 'registro_aprobado'),
      allowNull: false,
      defaultValue: 'en_evaluacion',
    });

    await queryInterface.sequelize.query(`
      UPDATE proveedores SET criticidad = CASE criticidad
        WHEN 'alta' THEN 'critico' WHEN 'media' THEN 'relevante' WHEN 'baja' THEN 'basico'
        ELSE criticidad END
    `);
    await queryInterface.sequelize.query(`
      UPDATE requisitos_proveedor SET criticidad_minima = CASE criticidad_minima
        WHEN 'alta' THEN 'critico' WHEN 'media' THEN 'relevante' WHEN 'baja' THEN 'basico'
        ELSE criticidad_minima END
    `);

    await queryInterface.changeColumn('proveedores', 'criticidad', {
      type: DataTypes.ENUM('critico', 'relevante', 'basico'),
      allowNull: false,
      defaultValue: 'relevante',
    });
    await queryInterface.changeColumn('requisitos_proveedor', 'criticidad_minima', {
      type: DataTypes.ENUM('critico', 'relevante', 'basico'),
      allowNull: false,
    });
  },

  down: async ({ context: queryInterface }) => {
    await queryInterface.changeColumn('proveedores', 'criticidad', {
      type: DataTypes.ENUM('alta', 'media', 'baja', 'critico', 'relevante', 'basico'),
      allowNull: false,
      defaultValue: 'relevante',
    });
    await queryInterface.changeColumn('requisitos_proveedor', 'criticidad_minima', {
      type: DataTypes.ENUM('alta', 'media', 'baja', 'critico', 'relevante', 'basico'),
      allowNull: false,
    });

    await queryInterface.sequelize.query(`
      UPDATE proveedores SET criticidad = CASE criticidad
        WHEN 'critico' THEN 'alta' WHEN 'relevante' THEN 'media' WHEN 'basico' THEN 'baja'
        ELSE criticidad END
    `);
    await queryInterface.sequelize.query(`
      UPDATE requisitos_proveedor SET criticidad_minima = CASE criticidad_minima
        WHEN 'critico' THEN 'alta' WHEN 'relevante' THEN 'media' WHEN 'basico' THEN 'baja'
        ELSE criticidad_minima END
    `);

    await queryInterface.changeColumn('proveedores', 'criticidad', {
      type: DataTypes.ENUM('alta', 'media', 'baja'),
      allowNull: false,
      defaultValue: 'media',
    });
    await queryInterface.changeColumn('requisitos_proveedor', 'criticidad_minima', {
      type: DataTypes.ENUM('alta', 'media', 'baja'),
      allowNull: false,
    });

    await queryInterface.sequelize.query(`UPDATE proveedores SET estado = 'en_evaluacion' WHERE estado = 'registro_aprobado'`);
    await queryInterface.changeColumn('proveedores', 'estado', {
      type: DataTypes.ENUM('activo', 'inactivo', 'en_evaluacion', 'suspendido'),
      allowNull: false,
      defaultValue: 'en_evaluacion',
    });
  },
};
