const { TipoDocumento } = require('../models');

const TIPOS = [
  { nombre: 'Procedimiento', diasAlertaVencimientoDefault: 30 },
  { nombre: 'Formato', diasAlertaVencimientoDefault: 30 },
  { nombre: 'Manual', diasAlertaVencimientoDefault: 60 },
  { nombre: 'Contrato', diasAlertaVencimientoDefault: 60 },
  { nombre: 'Legal', diasAlertaVencimientoDefault: 15 },
  { nombre: 'Certificado SST', diasAlertaVencimientoDefault: 30 },
  { nombre: 'Certificado SARLAFT', diasAlertaVencimientoDefault: 15 },
  { nombre: 'Cámara de Comercio', diasAlertaVencimientoDefault: 30 },
  { nombre: 'RUT', diasAlertaVencimientoDefault: 30 },
  { nombre: 'Póliza de responsabilidad civil', diasAlertaVencimientoDefault: 30 },
  { nombre: 'Documento de proveedor', diasAlertaVencimientoDefault: 30 },
];

module.exports = async function seedTiposDocumento() {
  for (const tipo of TIPOS) {
    await TipoDocumento.findOrCreate({ where: { nombre: tipo.nombre }, defaults: tipo });
  }
};
