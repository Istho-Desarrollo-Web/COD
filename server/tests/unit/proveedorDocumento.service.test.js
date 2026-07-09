const { calcularEstadoProveedorDocumento } = require('../../src/services/proveedorDocumento.service');

function fechaEnDias(dias) {
  return new Date(Date.now() + dias * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

describe('calcularEstadoProveedorDocumento', () => {
  it('returns vigente when there is no vigenciaHasta', () => {
    expect(calcularEstadoProveedorDocumento({ vigenciaHasta: null })).toBe('vigente');
  });

  it('returns vigente when vigenciaHasta is more than 30 days away', () => {
    expect(calcularEstadoProveedorDocumento({ vigenciaHasta: fechaEnDias(45) })).toBe('vigente');
  });

  it('returns por_vencer when vigenciaHasta is within 30 days', () => {
    expect(calcularEstadoProveedorDocumento({ vigenciaHasta: fechaEnDias(15) })).toBe('por_vencer');
  });

  it('returns vencido when vigenciaHasta already passed', () => {
    expect(calcularEstadoProveedorDocumento({ vigenciaHasta: fechaEnDias(-1) })).toBe('vencido');
  });
});
