async function enviarAprobacion(solicitud, cotizacionSeleccionada) {
  const { resolverNivelAprobacion } = require('./nivelAprobacion.service');
  const criticidad = cotizacionSeleccionada.Proveedor?.criticidad;
  const nivel = await resolverNivelAprobacion(
    solicitud.tipoSolicitudId,
    cotizacionSeleccionada.monto,
    criticidad
  );
  if (!nivel) return { nivel: null };

  const { SolicitudAprobacion } = require('../models');
  const aprobacion = await SolicitudAprobacion.create({
    solicitudId: solicitud.id,
    nivelAprobacionId: nivel.id,
    estado: 'pendiente',
    orden: 1,
  });
  await solicitud.update({ nivelAprobacionId: nivel.id, estado: 'en_aprobacion' });
  return { nivel, aprobacion };
}

module.exports = { enviarAprobacion };
