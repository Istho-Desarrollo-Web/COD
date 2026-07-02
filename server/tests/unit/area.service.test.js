const { calcularSaludDocumental } = require('../../src/services/area.service');

describe('calcularSaludDocumental', () => {
  it('returns 100 when there are no documents', () => {
    expect(calcularSaludDocumental({ vigentes: 0, porVencer: 0, vencidos: 0 })).toBe(100);
  });

  it('computes the percentage of vigentes over the total', () => {
    expect(calcularSaludDocumental({ vigentes: 3, porVencer: 1, vencidos: 1 })).toBe(60);
  });

  it('rounds to 1 decimal', () => {
    expect(calcularSaludDocumental({ vigentes: 1, porVencer: 1, vencidos: 1 })).toBe(33.3);
  });
});
