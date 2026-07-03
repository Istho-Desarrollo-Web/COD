const { sequelize } = require('../../src/config/database');
const { createMigrator } = require('../../src/config/migrator');
const { Area, TipoSolicitud, NivelAprobacion, Solicitud, Cotizacion, SolicitudAprobacion, Usuario, Rol } = require('../../src/models');
const seedRolesPermisos = require('../../src/scripts/seedRolesPermisos');
const seedNivelesAprobacion = require('../../src/scripts/seedNivelesAprobacion');

beforeAll(async () => {
  await sequelize.authenticate();
  await createMigrator(sequelize).up();
  await seedRolesPermisos();
  await seedNivelesAprobacion();
});

afterAll(async () => {
  await sequelize.close();
});

describe('Solicitud workflow tables', () => {
  it('links Solicitud -> Cotizacion -> SolicitudAprobacion', async () => {
    const area = await Area.create({ nombre: 'Operaciones', codigo: `OPS2${Date.now()}` });
    const tipo = await TipoSolicitud.findOne({ where: { nombre: 'compra' } });
    const nivel = await NivelAprobacion.findOne({ where: { tipoSolicitudId: tipo.id, orden: 1 } });
    const solicitante = await Usuario.unscoped().findOne({ where: { username: 'admin' } });

    const solicitud = await Solicitud.create({
      codigo: `SOL-2026-0001${Date.now()}`, tipoSolicitudId: tipo.id, areaSolicitanteId: area.id,
      solicitanteUsuarioId: solicitante.id, descripcion: 'Compra de resmas de papel',
      montoEstimado: 500000, nivelAprobacionId: nivel.id, estado: 'cotizando',
    });

    const cotizacion = await Cotizacion.create({ solicitudId: solicitud.id, monto: 480000, seleccionada: true });
    const aprobacion = await SolicitudAprobacion.create({
      solicitudId: solicitud.id, nivelAprobacionId: nivel.id, aprobadorUsuarioId: solicitante.id, estado: 'pendiente', orden: 1,
    });

    expect(cotizacion.solicitudId).toBe(solicitud.id);
    expect(aprobacion.solicitudId).toBe(solicitud.id);
  });
});
