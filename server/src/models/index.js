const { sequelize } = require('../config/database');

const Usuario = require('./Usuario')(sequelize);
const Rol = require('./Rol')(sequelize);
const Permiso = require('./Permiso')(sequelize);
const RolPermiso = require('./RolPermiso')(sequelize);
const Auditoria = require('./Auditoria')(sequelize);
const Area = require('./Area')(sequelize);
const Carpeta = require('./Carpeta')(sequelize);
const TipoDocumento = require('./TipoDocumento')(sequelize);
const Documento = require('./Documento')(sequelize);
const DocumentoVersionHistorial = require('./DocumentoVersionHistorial')(sequelize);

Rol.hasMany(Usuario, { foreignKey: 'rolId' });
Usuario.belongsTo(Rol, { foreignKey: 'rolId' });
Rol.hasMany(RolPermiso, { foreignKey: 'rolId' });
RolPermiso.belongsTo(Rol, { foreignKey: 'rolId' });

Area.hasMany(Carpeta, { foreignKey: 'areaId' });
Carpeta.belongsTo(Area, { foreignKey: 'areaId' });
Carpeta.hasMany(Carpeta, { as: 'subcarpetas', foreignKey: 'carpetaPadreId' });

Area.hasMany(Documento, { foreignKey: 'areaId' });
Documento.belongsTo(Area, { foreignKey: 'areaId' });
Carpeta.hasMany(Documento, { foreignKey: 'carpetaId' });
Documento.belongsTo(Carpeta, { foreignKey: 'carpetaId' });
TipoDocumento.hasMany(Documento, { foreignKey: 'tipoDocumentoId' });
Documento.belongsTo(TipoDocumento, { foreignKey: 'tipoDocumentoId' });
Documento.hasMany(DocumentoVersionHistorial, { foreignKey: 'documentoId' });
DocumentoVersionHistorial.belongsTo(Documento, { foreignKey: 'documentoId' });

module.exports = {
  sequelize, Usuario, Rol, Permiso, RolPermiso, Auditoria,
  Area, Carpeta, TipoDocumento, Documento, DocumentoVersionHistorial,
};
