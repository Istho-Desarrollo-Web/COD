const { TipoDocumento } = require('../models');

const TIPOS = [
  { nombre: 'Procedimiento', diasAlertaVencimientoDefault: 30 },
  { nombre: 'Formato', diasAlertaVencimientoDefault: 30 },
  { nombre: 'Manual', diasAlertaVencimientoDefault: 60 },
  { nombre: 'Contrato', diasAlertaVencimientoDefault: 60 },
  { nombre: 'Legal', diasAlertaVencimientoDefault: 15 },
  { nombre: 'Certificado SST', diasAlertaVencimientoDefault: 30 },
  { nombre: 'Certificado SARLAFT', diasAlertaVencimientoDefault: 15 },
];

module.exports = async function seedTiposDocumento() {
  for (const tipo of TIPOS) {
    await TipoDocumento.findOrCreate({ where: { nombre: tipo.nombre }, defaults: tipo });
  }
};
