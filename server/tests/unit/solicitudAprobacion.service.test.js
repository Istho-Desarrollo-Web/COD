const { sequelize } = require('../../src/config/database');
const { createMigrator } = require('../../src/config/migrator');
const { Area, TipoSolicitud, Solicitud, Cotizacion, Usuario, Proveedor } = require('../../src/models');
const seedNivelesAprobacion = require('../../src/scripts/seedNivelesAprobacion');
const { enviarAprobacion } = require('../../src/services/solicitudAprobacion.service');

let area;
let tipo;
let solicitante;

beforeAll(async () => {
  await sequelize.authenticate();
  await createMigrator(sequelize).up();
  await seedNivelesAprobacion();
  area = await Area.create({ nombre: 'Servicio Aprobacion Solicitud', codigo: `SRVAPRSOL${Date.now()}` });
  tipo = await TipoSolicitud.findOne({ where: { nombre: 'compra' } });
  solicitante = await Usuario.unscoped().findOne({ where: { username: 'admin' } });
});

afterAll(async () => {
  await sequelize.close();
});

async function crearSolicitud(montoEstimado = 100000) {
  return Solicitud.create({
    codigo: `SOL-TEST-${Date.now()}${Math.random()}`,
    tipoSolicitudId: tipo.id, areaSolicitanteId: area.id, solicitanteUsuarioId: solicitante.id,
    descripcion: 'Solicitud de prueba', montoEstimado, estado: 'cotizando',
  });
}

describe('solicitudAprobacion.service', () => {
  it('resuelve el nivel por el monto de la cotización seleccionada, no por montoEstimado', async () => {
    const solicitud = await crearSolicitud(50_000_000);
    const cotizacion = await Cotizacion.create({ solicitudId: solicitud.id, monto: 500_000, seleccionada: true });

    const { nivel, aprobacion } = await enviarAprobacion(solicitud, cotizacion);

    expect(nivel.rolAprobador).toBe('aprobador_area');
    expect(aprobacion.estado).toBe('pendiente');
    expect(aprobacion.nivelAprobacionId).toBe(nivel.id);

    const solicitudActualizada = await Solicitud.findByPk(solicitud.id);
    expect(solicitudActualizada.estado).toBe('en_aprobacion');
    expect(solicitudActualizada.nivelAprobacionId).toBe(nivel.id);
  });

  it('escala a aprobador_ejecutivo cuando la cotización seleccionada tiene un proveedor crítico, sin importar el monto', async () => {
    const proveedorCritico = await Proveedor.create({
      tipo: 'proveedor', documentoIdentificacion: `960${Date.now()}`, razonSocial: 'Proveedor Crítico SAS',
      criticidad: 'critico', areaSolicitanteId: area.id,
    });
    const solicitud = await crearSolicitud(300_000);
    const cotizacion = await Cotizacion.create({
      solicitudId: solicitud.id, proveedorId: proveedorCritico.id, monto: 300_000, seleccionada: true,
    });
    const cotizacionConProveedor = await Cotizacion.findByPk(cotizacion.id, { include: Proveedor });

    const { nivel } = await enviarAprobacion(solicitud, cotizacionConProveedor);

    expect(nivel.rolAprobador).toBe('aprobador_ejecutivo');
  });

  it('resuelve solo por monto cuando la cotización seleccionada no tiene proveedor vinculado', async () => {
    const solicitud = await crearSolicitud(300_000);
    const cotizacion = await Cotizacion.create({ solicitudId: solicitud.id, monto: 15_000_000, seleccionada: true });

    const { nivel } = await enviarAprobacion(solicitud, cotizacion);

    expect(nivel.rolAprobador).toBe('aprobador_ejecutivo');
  });

  it('devuelve nivel: null cuando no hay un NivelAprobacion configurado para el tipo/monto, sin tocar la solicitud', async () => {
    const otroTipo = await TipoSolicitud.create({ nombre: `tipo_sin_niveles_${Date.now()}` });
    const solicitud = await Solicitud.create({
      codigo: `SOL-TEST-SINNIVEL-${Date.now()}`,
      tipoSolicitudId: otroTipo.id, areaSolicitanteId: area.id, solicitanteUsuarioId: solicitante.id,
      descripcion: 'Sin niveles configurados', estado: 'cotizando',
    });
    const cotizacion = await Cotizacion.create({ solicitudId: solicitud.id, monto: 500_000, seleccionada: true });

    const resultado = await enviarAprobacion(solicitud, cotizacion);

    expect(resultado.nivel).toBeNull();
    const solicitudSinCambios = await Solicitud.findByPk(solicitud.id);
    expect(solicitudSinCambios.estado).toBe('cotizando');
  });
});
