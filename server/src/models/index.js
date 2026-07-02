const { sequelize } = require('../config/database');

const Usuario = require('./Usuario')(sequelize);
const Rol = require('./Rol')(sequelize);
const Permiso = require('./Permiso')(sequelize);
const RolPermiso = require('./RolPermiso')(sequelize);
const Auditoria = require('./Auditoria')(sequelize);
const Area = require('./Area')(sequelize);

Rol.hasMany(Usuario, { foreignKey: 'rolId' });
Usuario.belongsTo(Rol, { foreignKey: 'rolId' });
Rol.hasMany(RolPermiso, { foreignKey: 'rolId' });
RolPermiso.belongsTo(Rol, { foreignKey: 'rolId' });

module.exports = { sequelize, Usuario, Rol, Permiso, RolPermiso, Auditoria, Area };
