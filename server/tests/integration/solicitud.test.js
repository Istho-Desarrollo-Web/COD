const { sequelize } = require('../../src/config/database');
const { createMigrator } = require('../../src/config/migrator');
const { Area, TipoSolicitud, NivelAprobacion, Solicitud, Cotizacion, SolicitudAprobacion, Usuario, Rol, Proveedor, SolicitudComentario, Factura } = require('../../src/models');
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

  it('links Cotizacion -> Proveedor via the belongsTo association and enforces the FK', async () => {
    const area = await Area.create({ nombre: 'Operaciones FK', codigo: `OPSFK${Date.now()}` });
    const tipo = await TipoSolicitud.findOne({ where: { nombre: 'compra' } });
    const solicitante = await Usuario.unscoped().findOne({ where: { username: 'admin' } });
    const proveedor = await Proveedor.create({
      tipo: 'proveedor', documentoIdentificacion: `900999999-1${Date.now()}`, razonSocial: 'Insumos XYZ SAS',
      criticidad: 'relevante', estado: 'activo',
    });

    const solicitud = await Solicitud.create({
      codigo: `SOL-2026-FK${Date.now()}`, tipoSolicitudId: tipo.id, areaSolicitanteId: area.id,
      solicitanteUsuarioId: solicitante.id, descripcion: 'Compra con proveedor asociado',
      montoEstimado: 100000, estado: 'cotizando',
    });

    const cotizacion = await Cotizacion.create({ solicitudId: solicitud.id, proveedorId: proveedor.id, monto: 95000 });

    const cotizacionConProveedor = await Cotizacion.findByPk(cotizacion.id, { include: Proveedor });
    expect(cotizacionConProveedor.Proveedor).not.toBeNull();
    expect(cotizacionConProveedor.Proveedor.id).toBe(proveedor.id);

    const proveedorConCotizaciones = await Proveedor.findByPk(proveedor.id, { include: Cotizacion });
    expect(proveedorConCotizaciones.Cotizacions.some((c) => c.id === cotizacion.id)).toBe(true);

    await expect(
      Cotizacion.create({ solicitudId: solicitud.id, proveedorId: 999999999, monto: 1000 })
    ).rejects.toThrow(/foreign key constraint/i);
  });
});

describe('SolicitudComentario', () => {
  it('vincula un comentario a una Solicitud y a un Usuario', async () => {
    const area = await Area.create({ nombre: 'Comentario Modelo', codigo: `COM${Date.now()}` });
    const tipo = await TipoSolicitud.findOne({ where: { nombre: 'compra' } });
    const solicitante = await Usuario.unscoped().findOne({ where: { username: 'admin' } });

    const solicitud = await Solicitud.create({
      codigo: `SOL-COMENT-${Date.now()}`, tipoSolicitudId: tipo.id, areaSolicitanteId: area.id,
      solicitanteUsuarioId: solicitante.id, descripcion: 'Solicitud para comentar', estado: 'cotizando',
    });

    const comentario = await SolicitudComentario.create({ solicitudId: solicitud.id, usuarioId: solicitante.id, texto: 'Primer comentario' });

    expect(comentario.solicitudId).toBe(solicitud.id);
    expect(comentario.usuarioId).toBe(solicitante.id);

    const conSolicitud = await SolicitudComentario.findByPk(comentario.id, { include: Solicitud });
    expect(conSolicitud.Solicitud.id).toBe(solicitud.id);
  });
});

describe('Factura', () => {
  it('vincula una Factura 1:1 a una Solicitud e impide una segunda factura para la misma solicitud', async () => {
    const area = await Area.create({ nombre: 'Factura Modelo', codigo: `FAC${Date.now()}` });
    const tipo = await TipoSolicitud.findOne({ where: { nombre: 'compra' } });
    const solicitante = await Usuario.unscoped().findOne({ where: { username: 'admin' } });

    const solicitud = await Solicitud.create({
      codigo: `SOL-FACTURA-${Date.now()}`, tipoSolicitudId: tipo.id, areaSolicitanteId: area.id,
      solicitanteUsuarioId: solicitante.id, descripcion: 'Solicitud para facturar', estado: 'confirmada',
    });

    const factura = await Factura.create({
      solicitudId: solicitud.id, numero: 'FAC-001', monto: 90000,
      fechaPago: '2026-07-23', facturaS3Key: 'solicitudes/1/factura.pdf',
    });

    expect(factura.solicitudId).toBe(solicitud.id);

    const conSolicitud = await Factura.findByPk(factura.id, { include: Solicitud });
    expect(conSolicitud.Solicitud.id).toBe(solicitud.id);

    await expect(
      Factura.create({ solicitudId: solicitud.id, numero: 'FAC-002', monto: 50000, fechaPago: '2026-07-24', facturaS3Key: 'solicitudes/1/factura2.pdf' })
    ).rejects.toThrow();
  });
});
