jest.mock('../../src/models', () => ({
  NivelAprobacion: { findOne: jest.fn() },
}));
const { NivelAprobacion } = require('../../src/models');
const { resolverNivelAprobacion } = require('../../src/services/nivelAprobacion.service');

describe('resolverNivelAprobacion', () => {
  it('queries NivelAprobacion for a range containing monto, ordered by orden ASC', async () => {
    NivelAprobacion.findOne.mockResolvedValue({ id: 2, rolAprobador: 'financiera' });
    const nivel = await resolverNivelAprobacion(1, 5_000_000);
    expect(nivel).toEqual({ id: 2, rolAprobador: 'financiera' });
    expect(NivelAprobacion.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tipoSolicitudId: 1, montoDesde: expect.anything() }),
        order: [['orden', 'ASC']],
      })
    );
  });

  it('returns null when no matching NivelAprobacion is found', async () => {
    NivelAprobacion.findOne.mockResolvedValue(null);
    expect(await resolverNivelAprobacion(1, 999)).toBeNull();
  });

  it('escalates to aprobador_ejecutivo when criticidad is critico, regardless of monto', async () => {
    NivelAprobacion.findOne.mockResolvedValue({ id: 3, rolAprobador: 'aprobador_ejecutivo' });
    const nivel = await resolverNivelAprobacion(1, 500, 'critico');
    expect(nivel).toEqual({ id: 3, rolAprobador: 'aprobador_ejecutivo' });
    expect(NivelAprobacion.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tipoSolicitudId: 1, activo: true, rolAprobador: 'aprobador_ejecutivo' },
        order: [['orden', 'ASC']],
      })
    );
  });

  it('falls back to monto-based resolution when criticidad is not critico', async () => {
    NivelAprobacion.findOne.mockResolvedValue({ id: 1, rolAprobador: 'aprobador_area' });
    const nivel = await resolverNivelAprobacion(1, 500_000, 'relevante');
    expect(nivel).toEqual({ id: 1, rolAprobador: 'aprobador_area' });
    expect(NivelAprobacion.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tipoSolicitudId: 1, montoDesde: expect.anything() }),
        order: [['orden', 'ASC']],
      })
    );
  });
});
