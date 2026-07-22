const { DataTypes, QueryTypes } = require('sequelize');

// Paso 2 del refactor de roles: Usuario.areaId (nullable, para roles
// globales/transversales) + relación muchos-a-muchos Usuario<->Rol vía
// usuario_roles. Reemplaza la columna usuarios.rol_id (uno-a-uno) — permite
// el caso Analista de SGI (Gestor documental + Auditor simultáneos). Ver
// docs/superpowers/specs/2026-07-21-cod-modelo-roles-definitivo.md.
module.exports = {
  up: async ({ context: queryInterface }) => {
    await queryInterface.addColumn('usuarios', 'area_id', {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'areas', key: 'id' },
    });

    await queryInterface.createTable('usuario_roles', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      usuario_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'usuarios', key: 'id' } },
      rol_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'roles', key: 'id' } },
      created_at: { type: DataTypes.DATE, allowNull: false },
      updated_at: { type: DataTypes.DATE, allowNull: false },
    });
    await queryInterface.addConstraint('usuario_roles', {
      fields: ['usuario_id', 'rol_id'],
      type: 'unique',
      name: 'uq_usuario_roles_usuario_rol',
    });

    // Cada usuario existente conserva su único rol de hoy como su primera
    // fila en la tabla puente.
    await queryInterface.sequelize.query(
      `INSERT INTO usuario_roles (usuario_id, rol_id, created_at, updated_at)
       SELECT id, rol_id, NOW(), NOW() FROM usuarios WHERE rol_id IS NOT NULL`
    );

    // MySQL no permite dropear una columna con FK sin antes tumbar la
    // constraint — el nombre lo asigna MySQL automáticamente al definirla
    // como `references` en la migración original, así que se busca en
    // information_schema en vez de asumir un nombre fijo.
    const filasConstraint = await queryInterface.sequelize.query(
      `SELECT CONSTRAINT_NAME AS nombre FROM information_schema.KEY_COLUMN_USAGE
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'usuarios' AND COLUMN_NAME = 'rol_id'
         AND REFERENCED_TABLE_NAME = 'roles' LIMIT 1`,
      { type: QueryTypes.SELECT }
    );

    if (filasConstraint[0]?.nombre) {
      await queryInterface.removeConstraint('usuarios', filasConstraint[0].nombre);
    }
    await queryInterface.removeColumn('usuarios', 'rol_id');
  },

  down: async ({ context: queryInterface }) => {
    await queryInterface.addColumn('usuarios', 'rol_id', {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'roles', key: 'id' },
    });

    // Si un usuario tenía más de un rol, se restaura el de mayor `nivel`
    // como "primario" — el resto de sus roles adicionales se pierde en el
    // rollback (limitación documentada, igual que en la migración del
    // Paso 1: este down() no pretende ser una inversa perfecta).
    await queryInterface.sequelize.query(`
      UPDATE usuarios u
      SET rol_id = (
        SELECT ur.rol_id FROM usuario_roles ur
        JOIN roles r ON r.id = ur.rol_id
        WHERE ur.usuario_id = u.id
        ORDER BY r.nivel DESC
        LIMIT 1
      )
    `);

    await queryInterface.dropTable('usuario_roles');
    await queryInterface.removeColumn('usuarios', 'area_id');
  },
};
