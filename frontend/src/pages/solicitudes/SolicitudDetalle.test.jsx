import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SnackbarProvider } from 'notistack';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import SolicitudDetalle from './SolicitudDetalle';
import solicitudService from '../../api/solicitud.service';
import cotizacionService from '../../api/cotizacion.service';
import solicitudComentarioService from '../../api/solicitudComentario.service';
import proveedorService from '../../api/proveedor.service';
import facturaService from '../../api/factura.service';
import { useAuth } from '../../context/AuthContext';

vi.mock('../../api/solicitud.service');
vi.mock('../../api/cotizacion.service');
vi.mock('../../api/solicitudComentario.service');
vi.mock('../../api/proveedor.service');
vi.mock('../../api/factura.service');
vi.mock('../../context/AuthContext');

const SOLICITUD = {
  id: 1, codigo: 'SOL-2026-1', descripcion: 'Compra de sillas', montoEstimado: 500000,
  estado: 'cotizando', solicitanteUsuarioId: 42,
};

function renderPagina() {
  return render(
    <MemoryRouter initialEntries={['/solicitudes/1']}>
      <SnackbarProvider>
        <Routes>
          <Route path="/solicitudes/:id" element={<SolicitudDetalle />} />
          <Route path="/solicitudes" element={<p>Solicitudes</p>} />
        </Routes>
      </SnackbarProvider>
    </MemoryRouter>
  );
}

describe('SolicitudDetalle', () => {
  beforeEach(() => {
    useAuth.mockReturnValue({ user: { id: 42 }, tienePermiso: () => true });
    solicitudService.obtener.mockResolvedValue(SOLICITUD);
    cotizacionService.listar.mockResolvedValue([]);
    solicitudComentarioService.listar.mockResolvedValue([]);
    proveedorService.listar.mockResolvedValue([]);
    facturaService.obtener.mockResolvedValue(null);
  });

  it('shows the solicitud info', async () => {
    renderPagina();
    expect(await screen.findByText('SOL-2026-1')).toBeInTheDocument();
    expect(screen.getByText('Compra de sillas')).toBeInTheDocument();
  });

  it('disables "Enviar a aprobación" when there is no cotización seleccionada', async () => {
    renderPagina();
    await screen.findByText('SOL-2026-1');
    expect(screen.getByRole('button', { name: 'Enviar a aprobación' })).toBeDisabled();
  });

  it('enables "Enviar a aprobación" and sends it when a cotización is seleccionada', async () => {
    cotizacionService.listar.mockResolvedValue([{ id: 5, monto: 90000, seleccionada: true }]);
    solicitudService.enviarAprobacion.mockResolvedValue({ solicitud: { ...SOLICITUD, estado: 'en_aprobacion' } });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderPagina();
    await screen.findByText('SOL-2026-1');

    const boton = await screen.findByRole('button', { name: 'Enviar a aprobación' });
    expect(boton).not.toBeDisabled();
    await userEvent.click(boton);

    await waitFor(() => expect(solicitudService.enviarAprobacion).toHaveBeenCalledWith('1'));
  });

  it('shows Aprobar/Rechazar only while en_aprobacion, and aprueba exitosamente', async () => {
    solicitudService.obtener.mockResolvedValue({ ...SOLICITUD, estado: 'en_aprobacion' });
    solicitudService.aprobar.mockResolvedValue({ ...SOLICITUD, estado: 'aprobada' });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderPagina();
    await screen.findByText('SOL-2026-1');

    await userEvent.click(screen.getByRole('button', { name: 'Aprobar' }));
    await waitFor(() => expect(solicitudService.aprobar).toHaveBeenCalledWith('1'));
  });

  it('rejects a solicitud with a motivo', async () => {
    solicitudService.obtener.mockResolvedValue({ ...SOLICITUD, estado: 'en_aprobacion' });
    solicitudService.rechazar.mockResolvedValue({ ...SOLICITUD, estado: 'rechazada' });
    vi.spyOn(window, 'prompt').mockReturnValue('Sin presupuesto');
    renderPagina();
    await screen.findByText('SOL-2026-1');

    await userEvent.click(screen.getByRole('button', { name: 'Rechazar' }));
    await waitFor(() => expect(solicitudService.rechazar).toHaveBeenCalledWith('1', 'Sin presupuesto'));
  });

  it('shows "Cancelar" only for the owner while cotizando/en_aprobacion', async () => {
    renderPagina();
    await screen.findByText('SOL-2026-1');
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument();
  });

  it('hides "Cancelar" when the current user is not the owner', async () => {
    useAuth.mockReturnValue({ user: { id: 999 }, tienePermiso: () => true });
    renderPagina();
    await screen.findByText('SOL-2026-1');
    expect(screen.queryByRole('button', { name: 'Cancelar' })).not.toBeInTheDocument();
  });

  it('cancels the solicitud', async () => {
    solicitudService.cancelar.mockResolvedValue({ ...SOLICITUD, estado: 'cancelada' });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderPagina();
    await screen.findByText('SOL-2026-1');

    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(solicitudService.cancelar).toHaveBeenCalledWith('1'));
  });

  it('shows the confirmar form only when aprobada, and confirms with orden formal', async () => {
    solicitudService.obtener.mockResolvedValue({ ...SOLICITUD, estado: 'aprobada' });
    solicitudService.confirmar.mockResolvedValue({ ...SOLICITUD, estado: 'confirmada' });
    renderPagina();
    await screen.findByText('SOL-2026-1');

    await userEvent.type(screen.getByLabelText('Número de orden formal'), 'OF-2026-001');
    const archivo = new File(['contenido'], 'orden.pdf', { type: 'application/pdf' });
    await userEvent.upload(screen.getByLabelText('Archivo de la orden formal *'), archivo);
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    await waitFor(() => expect(solicitudService.confirmar).toHaveBeenCalledWith('1', expect.any(FormData)));
  });

  it('adds a cotización from the Cotizaciones tab', async () => {
    cotizacionService.crear.mockResolvedValue({ id: 5 });
    renderPagina();
    await screen.findByText('SOL-2026-1');
    await userEvent.click(screen.getByRole('tab', { name: 'Cotizaciones' }));

    await userEvent.type(screen.getByLabelText('Monto'), '90000');
    await userEvent.click(screen.getByRole('button', { name: 'Agregar cotización' }));

    await waitFor(() => expect(cotizacionService.crear).toHaveBeenCalledWith('1', expect.any(FormData)));
  });

  it('selects a cotización from the Cotizaciones tab', async () => {
    cotizacionService.listar.mockResolvedValue([{ id: 5, monto: 90000, seleccionada: false }]);
    cotizacionService.seleccionar.mockResolvedValue({ id: 5, seleccionada: true });
    renderPagina();
    await screen.findByText('SOL-2026-1');
    await userEvent.click(screen.getByRole('tab', { name: 'Cotizaciones' }));

    await userEvent.click(await screen.findByRole('button', { name: 'Seleccionar' }));
    await waitFor(() => expect(cotizacionService.seleccionar).toHaveBeenCalledWith('1', 5));
  });

  it('lists and posts comentarios', async () => {
    solicitudComentarioService.listar.mockResolvedValue([
      { id: 1, texto: 'Primer comentario', createdAt: '2026-07-01T00:00:00.000Z', Usuario: { nombre: 'Ana', apellido: 'Ruiz' } },
    ]);
    solicitudComentarioService.crear.mockResolvedValue({ id: 2 });
    renderPagina();
    await screen.findByText('SOL-2026-1');
    await userEvent.click(screen.getByRole('tab', { name: 'Comentarios' }));

    expect(await screen.findByText('Primer comentario')).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Comentario'), 'Segundo comentario');
    await userEvent.click(screen.getByRole('button', { name: 'Comentar' }));

    await waitFor(() => expect(solicitudComentarioService.crear).toHaveBeenCalledWith('1', 'Segundo comentario'));
  });

  it('hides "Comentar" when the user lacks the comentar permission', async () => {
    useAuth.mockReturnValue({ user: { id: 42 }, tienePermiso: (modulo, accion) => accion !== 'comentar' });
    renderPagina();
    await screen.findByText('SOL-2026-1');
    await userEvent.click(screen.getByRole('tab', { name: 'Comentarios' }));

    expect(screen.queryByRole('button', { name: 'Comentar' })).not.toBeInTheDocument();
  });

  it('shows the "Registrar factura" form only when confirmada, and registra la factura', async () => {
    solicitudService.obtener.mockResolvedValue({ ...SOLICITUD, estado: 'confirmada' });
    facturaService.registrar.mockResolvedValue({ id: 9, numero: 'FAC-2026-001' });
    renderPagina();
    await screen.findByText('SOL-2026-1');

    await userEvent.type(screen.getByLabelText('Número de factura'), 'FAC-2026-001');
    await userEvent.type(screen.getByLabelText('Monto'), '500000');
    await userEvent.type(screen.getByLabelText('Fecha de pago'), '2026-07-23');
    const archivo = new File(['contenido'], 'factura.pdf', { type: 'application/pdf' });
    await userEvent.upload(screen.getByLabelText('Archivo de la factura *'), archivo);
    await userEvent.click(screen.getByRole('button', { name: 'Registrar factura' }));

    await waitFor(() => expect(facturaService.registrar).toHaveBeenCalledWith('1', expect.any(FormData)));
  });

  it('hides the "Registrar factura" form when the solicitud is not confirmada', async () => {
    renderPagina();
    await screen.findByText('SOL-2026-1');
    expect(screen.queryByRole('button', { name: 'Registrar factura' })).not.toBeInTheDocument();
  });

  it('shows the factura read-only block and downloads it when cerrada', async () => {
    solicitudService.obtener.mockResolvedValue({ ...SOLICITUD, estado: 'cerrada' });
    facturaService.obtener.mockResolvedValue({ id: 9, numero: 'FAC-2026-001', monto: 500000, fechaPago: '2026-07-23' });
    renderPagina();
    await screen.findByText('SOL-2026-1');

    expect(await screen.findByText('FAC-2026-001')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Descargar' }));
    expect(facturaService.descargar).toHaveBeenCalledWith('1');
  });
});
