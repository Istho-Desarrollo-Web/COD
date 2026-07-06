import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { SnackbarProvider } from 'notistack';
import AreasListado from './AreasListado';
import areaService from '../../api/area.service';
import { useAuth } from '../../context/AuthContext';

vi.mock('../../api/area.service');
vi.mock('../../context/AuthContext');

function renderPagina() {
  return render(
    <SnackbarProvider>
      <AreasListado />
    </SnackbarProvider>
  );
}

describe('AreasListado', () => {
  beforeEach(() => {
    localStorage.clear();
    window.innerWidth = 1280;
  });

  it('renders the empty state when there are no areas', async () => {
    useAuth.mockReturnValue({ isAdmin: false });
    areaService.listar.mockResolvedValue([]);
    renderPagina();
    expect(await screen.findByText('Sin áreas todavía')).toBeInTheDocument();
  });

  it('renders areas in list view by default', async () => {
    useAuth.mockReturnValue({ isAdmin: false });
    areaService.listar.mockResolvedValue([{ id: 1, nombre: 'Financiera', codigo: 'FIN', saludDocumentalPct: '92.0' }]);
    renderPagina();
    expect(await screen.findByText('Financiera')).toBeInTheDocument();
    expect(screen.getByText('92.0%')).toBeInTheDocument();
  });

  it('hides the "Crear área" button for non-admins', async () => {
    useAuth.mockReturnValue({ isAdmin: false });
    areaService.listar.mockResolvedValue([]);
    renderPagina();
    await screen.findByText('Sin áreas todavía');
    expect(screen.queryByRole('button', { name: /crear área/i })).not.toBeInTheDocument();
  });

  it('shows the "Crear área" button for admins and creates an area on submit', async () => {
    useAuth.mockReturnValue({ isAdmin: true });
    areaService.listar.mockResolvedValue([]);
    areaService.crear.mockResolvedValue({ id: 1, nombre: 'SGI', codigo: 'SGI' });
    renderPagina();

    await screen.findByText('Sin áreas todavía');
    await userEvent.click(screen.getByRole('button', { name: /crear área/i }));

    await userEvent.type(screen.getByLabelText('Nombre'), 'SGI');
    await userEvent.type(screen.getByLabelText('Código'), 'SGI');

    areaService.listar.mockResolvedValue([{ id: 1, nombre: 'SGI', codigo: 'SGI', saludDocumentalPct: '100.0' }]);
    await userEvent.click(screen.getByRole('button', { name: 'Crear' }));

    await waitFor(() => expect(areaService.crear).toHaveBeenCalledWith({ nombre: 'SGI', codigo: 'SGI' }));
    expect((await screen.findAllByText('SGI')).length).toBeGreaterThan(0);
    expect(await screen.findByText('Área creada exitosamente')).toBeInTheDocument();
  });

  it('switches to tarjetas view via ViewToggle', async () => {
    useAuth.mockReturnValue({ isAdmin: false });
    areaService.listar.mockResolvedValue([{ id: 1, nombre: 'Financiera', codigo: 'FIN', saludDocumentalPct: '30.0' }]);
    renderPagina();

    await screen.findByText('Financiera');
    await userEvent.click(screen.getByLabelText('Ver como tarjetas'));

    expect(screen.getByText('30.0% al día')).toBeInTheDocument();
  });
});
