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
});
