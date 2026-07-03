const { RequisitoProveedor } = require('../models');

const REQUISITOS = [
  { nombre: 'Cámara de Comercio', criticidadMinima: 'baja', obligatorio: true, vigenciaAplica: false },
  { nombre: 'RUT', criticidadMinima: 'baja', obligatorio: true, vigenciaAplica: false },
  { nombre: 'Certificado SST', criticidadMinima: 'media', obligatorio: true, vigenciaAplica: true },
  { nombre: 'Certificado SARLAFT', criticidadMinima: 'alta', obligatorio: true, vigenciaAplica: true },
  { nombre: 'Póliza de responsabilidad civil', criticidadMinima: 'alta', obligatorio: true, vigenciaAplica: true },
];

module.exports = async function seedRequisitosProveedor() {
  for (const requisito of REQUISITOS) {
    await RequisitoProveedor.findOrCreate({ where: { nombre: requisito.nombre }, defaults: requisito });
  }
};
