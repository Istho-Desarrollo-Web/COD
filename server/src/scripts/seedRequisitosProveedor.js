const { RequisitoProveedor, TipoDocumento } = require('../models');

const REQUISITOS = [
  { nombre: 'Cámara de Comercio', criticidadMinima: 'basico', obligatorio: true, vigenciaAplica: false },
  { nombre: 'RUT', criticidadMinima: 'basico', obligatorio: true, vigenciaAplica: false },
  { nombre: 'Certificado SST', criticidadMinima: 'relevante', obligatorio: true, vigenciaAplica: true },
  { nombre: 'Certificado SARLAFT', criticidadMinima: 'critico', obligatorio: true, vigenciaAplica: true },
  { nombre: 'Póliza de responsabilidad civil', criticidadMinima: 'critico', obligatorio: true, vigenciaAplica: true },
];

module.exports = async function seedRequisitosProveedor() {
  for (const requisito of REQUISITOS) {
    const [fila] = await RequisitoProveedor.findOrCreate({ where: { nombre: requisito.nombre }, defaults: requisito });

    if (!fila.tipoDocumentoId) {
      const tipoDocumento = await TipoDocumento.findOne({ where: { nombre: requisito.nombre } });
      if (tipoDocumento) await fila.update({ tipoDocumentoId: tipoDocumento.id });
    }
  }
};
