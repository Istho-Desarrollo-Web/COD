const DIA_MS = 24 * 60 * 60 * 1000;
const DIAS_ALERTA_VENCIMIENTO = 30;

function calcularEstadoProveedorDocumento({ vigenciaHasta, hoy = new Date() }) {
  if (!vigenciaHasta) return 'vigente';
  const fechaVencimiento = new Date(`${vigenciaHasta}T00:00:00`);
  const diasRestantes = Math.floor((fechaVencimiento.getTime() - hoy.getTime()) / DIA_MS);
  if (diasRestantes < 0) return 'vencido';
  if (diasRestantes <= DIAS_ALERTA_VENCIMIENTO) return 'por_vencer';
  return 'vigente';
}

module.exports = { calcularEstadoProveedorDocumento };
