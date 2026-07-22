import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SnackbarProvider } from 'notistack';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import SolicitudesListado from './SolicitudesListado';
import solicitudService from '../../api/solicitud.service';
import { useAuth } from '../../context/AuthContext';
import areaService from '../../api/area.service';

vi.mock('../../api/solicitud.service');
vi.mock('../../context/AuthContext');
vi.mock('../../api/area.service');

function renderPagina() {
  return render(
    <MemoryRouter initialEntries={['/solicitudes']}>
      <SnackbarProvider>
        <Routes>
          <Route path="/solicitudes" element={<SolicitudesListado />} />
          <Route path="/solicitudes/:id" element={<p>Detalle de Solicitud</p>} />
        </Routes>
      </SnackbarProvider>
    </MemoryRouter>
  );
}

describe('SolicitudesListado', () => {
  beforeEach(() => {
    useAuth.mockReturnValue({ tienePermiso: () => true });
    areaService.listar.mockResolvedValue([{ id: 7, nombre: 'Financiera' }]);
    solicitudService.listarTipos.mockResolvedValue([
      { id: 1, nombre: 'compra' },
      { id: 2, nombre: 'contratacion_servicio' },
    ]);
  });

  it('renders the list of solicitudes', async () => {
    solicitudService.listar.mockResolvedValue([
      { id: 1, codigo: 'SOL-2026-1', descripcion: 'Compra de sillas', montoEstimado: 500000, estado: 'cotizando' },
    ]);
    renderPagina();
    expect(await screen.findByText('SOL-2026-1')).toBeInTheDocument();
  });

  it('shows an empty state when there are no solicitudes', async () => {
    solicitudService.listar.mockResolvedValue([]);
    renderPagina();
    expect(await screen.findByText('Sin solicitudes todavía')).toBeInTheDocument();
  });

  it('creates a solicitud through the modal', async () => {
    solicitudService.listar.mockResolvedValue([]);
    solicitudService.crear.mockResolvedValue({ id: 2, codigo: 'SOL-2026-2' });
    renderPagina();

    await screen.findByText('Sin solicitudes todavía');
    await userEvent.click(screen.getByText('Crear solicitud'));
    await userEvent.selectOptions(screen.getByLabelText('Tipo de solicitud'), '1');
    await userEvent.selectOptions(screen.getByLabelText('Área solicitante'), '7');
    await userEvent.type(screen.getByLabelText('Descripción'), 'Compra de equipos');
    await userEvent.click(screen.getByRole('button', { name: 'Crear' }));

    await waitFor(() =>
      expect(solicitudService.crear).toHaveBeenCalledWith(
        expect.objectContaining({ tipoSolicitudId: 1, areaSolicitanteId: 7, descripcion: 'Compra de equipos' })
      )
    );
  });

  it('hides "Crear solicitud" when the user lacks the crear permission', async () => {
    useAuth.mockReturnValue({ tienePermiso: () => false });
    solicitudService.listar.mockResolvedValue([]);
    renderPagina();
    await screen.findByText('Sin solicitudes todavía');
    expect(screen.queryByText('Crear solicitud')).not.toBeInTheDocument();
  });

  it('filters solicitudes by estado', async () => {
    solicitudService.listar.mockResolvedValue([]);
    renderPagina();
    await screen.findByText('Sin solicitudes todavía');

    await userEvent.click(screen.getByLabelText('Estado'));
    await userEvent.click(await screen.findByRole('button', { name: 'Cotizando' }));

    await waitFor(() => expect(solicitudService.listar).toHaveBeenLastCalledWith({ estado: 'cotizando' }));
  });

  it('navigates to the solicitud detail when a table row is clicked', async () => {
    solicitudService.listar.mockResolvedValue([
      { id: 1, codigo: 'SOL-2026-1', descripcion: 'Compra de sillas', montoEstimado: 500000, estado: 'cotizando' },
    ]);
    renderPagina();

    await userEvent.click(await screen.findByText('SOL-2026-1'));
    expect(await screen.findByText('Detalle de Solicitud')).toBeInTheDocument();
  });
});
