const { calcularEstadoDocumento } = require('../../src/services/documento.service');

describe('calcularEstadoDocumento', () => {
  const hoy = new Date('2026-07-02T00:00:00-05:00');

  it('returns sin_vigencia when there is no vigenciaHasta', () => {
    expect(calcularEstadoDocumento({ vigenciaHasta: null, diasAlerta: 30, hoy })).toBe('sin_vigencia');
  });

  it('returns vencido when vigenciaHasta is in the past', () => {
    expect(calcularEstadoDocumento({ vigenciaHasta: '2026-06-01', diasAlerta: 30, hoy })).toBe('vencido');
  });

  it('returns por_vencer when within the alert window', () => {
    expect(calcularEstadoDocumento({ vigenciaHasta: '2026-07-15', diasAlerta: 30, hoy })).toBe('por_vencer');
  });

  it('returns vigente when outside the alert window', () => {
    expect(calcularEstadoDocumento({ vigenciaHasta: '2026-12-31', diasAlerta: 30, hoy })).toBe('vigente');
  });
});
