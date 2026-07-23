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
const Proveedor = require('./Proveedor')(sequelize);
const RequisitoProveedor = require('./RequisitoProveedor')(sequelize);
const ProveedorDocumento = require('./ProveedorDocumento')(sequelize);
const EvaluacionProveedor = require('./EvaluacionProveedor')(sequelize);
const LogServidor = require('./LogServidor')(sequelize);
const UsuarioRol = require('./UsuarioRol')(sequelize);
const UsuarioProveedor = require('./UsuarioProveedor')(sequelize);
const SolicitudComentario = require('./SolicitudComentario')(sequelize);
const Factura = require('./Factura')(sequelize);

Usuario.belongsToMany(Rol, { through: UsuarioRol, as: 'roles', foreignKey: 'usuarioId', otherKey: 'rolId' });
Rol.belongsToMany(Usuario, { through: UsuarioRol, as: 'usuarios', foreignKey: 'rolId', otherKey: 'usuarioId' });
Rol.hasMany(RolPermiso, { foreignKey: 'rolId' });
RolPermiso.belongsTo(Rol, { foreignKey: 'rolId' });

Area.hasMany(Usuario, { foreignKey: 'areaId' });
Usuario.belongsTo(Area, { foreignKey: 'areaId' });

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
Proveedor.hasMany(Cotizacion, { foreignKey: 'proveedorId' });
Cotizacion.belongsTo(Proveedor, { foreignKey: 'proveedorId' });
Solicitud.hasMany(SolicitudAprobacion, { foreignKey: 'solicitudId' });
SolicitudAprobacion.belongsTo(Solicitud, { foreignKey: 'solicitudId' });
SolicitudAprobacion.belongsTo(NivelAprobacion, { foreignKey: 'nivelAprobacionId' });

Solicitud.hasMany(SolicitudComentario, { foreignKey: 'solicitudId' });
SolicitudComentario.belongsTo(Solicitud, { foreignKey: 'solicitudId' });
Usuario.hasMany(SolicitudComentario, { foreignKey: 'usuarioId' });
SolicitudComentario.belongsTo(Usuario, { foreignKey: 'usuarioId' });

Solicitud.hasOne(Factura, { foreignKey: 'solicitudId' });
Factura.belongsTo(Solicitud, { foreignKey: 'solicitudId' });

Proveedor.hasMany(ProveedorDocumento, { foreignKey: 'proveedorId' });
ProveedorDocumento.belongsTo(Proveedor, { foreignKey: 'proveedorId' });
RequisitoProveedor.hasMany(ProveedorDocumento, { foreignKey: 'requisitoId' });
ProveedorDocumento.belongsTo(RequisitoProveedor, { foreignKey: 'requisitoId' });
Proveedor.hasMany(EvaluacionProveedor, { foreignKey: 'proveedorId' });
EvaluacionProveedor.belongsTo(Proveedor, { foreignKey: 'proveedorId' });

Area.hasMany(Proveedor, { foreignKey: 'areaSolicitanteId' });
Proveedor.belongsTo(Area, { foreignKey: 'areaSolicitanteId' });
TipoDocumento.hasMany(RequisitoProveedor, { foreignKey: 'tipoDocumentoId' });
RequisitoProveedor.belongsTo(TipoDocumento, { foreignKey: 'tipoDocumentoId' });
Proveedor.hasMany(Carpeta, { foreignKey: 'proveedorId' });
Carpeta.belongsTo(Proveedor, { foreignKey: 'proveedorId' });

Usuario.belongsToMany(Proveedor, { through: UsuarioProveedor, as: 'proveedoresRepresentados', foreignKey: 'usuarioId', otherKey: 'proveedorId' });
Proveedor.belongsToMany(Usuario, { through: UsuarioProveedor, as: 'colaboradoresExternos', foreignKey: 'proveedorId', otherKey: 'usuarioId' });

module.exports = {
  sequelize, Usuario, Rol, Permiso, RolPermiso, UsuarioRol, UsuarioProveedor, Auditoria,
  Area, Carpeta, TipoDocumento, Documento, DocumentoVersionHistorial, PlantillaFormulario,
  TipoSolicitud, NivelAprobacion, Solicitud, Cotizacion, SolicitudAprobacion, SolicitudComentario, Factura,
  Proveedor, RequisitoProveedor, ProveedorDocumento, EvaluacionProveedor,
  LogServidor,
};
