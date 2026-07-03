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
const PlantillaFormulario = require('./PlantillaFormulario')(sequelize);
const TipoSolicitud = require('./TipoSolicitud')(sequelize);
const NivelAprobacion = require('./NivelAprobacion')(sequelize);
const Solicitud = require('./Solicitud')(sequelize);
const Cotizacion = require('./Cotizacion')(sequelize);
const SolicitudAprobacion = require('./SolicitudAprobacion')(sequelize);

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

Area.hasMany(PlantillaFormulario, { foreignKey: 'areaId' });
PlantillaFormulario.belongsTo(Area, { foreignKey: 'areaId' });

TipoSolicitud.hasMany(NivelAprobacion, { foreignKey: 'tipoSolicitudId' });
NivelAprobacion.belongsTo(TipoSolicitud, { foreignKey: 'tipoSolicitudId' });

Area.hasMany(Solicitud, { foreignKey: 'areaSolicitanteId' });
Solicitud.belongsTo(Area, { foreignKey: 'areaSolicitanteId' });
TipoSolicitud.hasMany(Solicitud, { foreignKey: 'tipoSolicitudId' });
Solicitud.belongsTo(TipoSolicitud, { foreignKey: 'tipoSolicitudId' });
Solicitud.hasMany(Cotizacion, { foreignKey: 'solicitudId' });
Cotizacion.belongsTo(Solicitud, { foreignKey: 'solicitudId' });
Solicitud.hasMany(SolicitudAprobacion, { foreignKey: 'solicitudId' });
SolicitudAprobacion.belongsTo(Solicitud, { foreignKey: 'solicitudId' });
SolicitudAprobacion.belongsTo(NivelAprobacion, { foreignKey: 'nivelAprobacionId' });

module.exports = {
  sequelize, Usuario, Rol, Permiso, RolPermiso, Auditoria,
  Area, Carpeta, TipoDocumento, Documento, DocumentoVersionHistorial, PlantillaFormulario,
  TipoSolicitud, NivelAprobacion, Solicitud, Cotizacion, SolicitudAprobacion,
};
