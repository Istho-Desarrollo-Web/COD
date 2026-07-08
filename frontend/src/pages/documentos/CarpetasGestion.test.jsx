import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SnackbarProvider } from 'notistack';
import { MemoryRouter } from 'react-router-dom';
import CarpetasGestion from './CarpetasGestion';
import carpetaService from '../../api/carpeta.service';
import areaService from '../../api/area.service';

vi.mock('../../api/carpeta.service');
vi.mock('../../api/area.service');

const AREAS = [
  { id: 1, nombre: 'RRHH' },
  { id: 2, nombre: 'Financiera' },
];

function renderPagina() {
  return render(
    <MemoryRouter>
      <SnackbarProvider>
        <CarpetasGestion />
      </SnackbarProvider>
    </MemoryRouter>
  );
}

describe('CarpetasGestion', () => {
  beforeEach(() => {
    areaService.listar.mockResolvedValue(AREAS);
  });

  it('loads its own areas catalog and lets the user pick one', async () => {
    carpetaService.listar.mockResolvedValue([{ id: 10, nombre: 'Contratos', carpetaPadreId: null, areaId: 1, subcarpetas: [{ id: 11, nombre: 'Nómina', carpetaPadreId: 10, areaId: 1, subcarpetas: [] }] }]);
    renderPagina();

    await userEvent.click(screen.getByLabelText('Área de las carpetas'));
    await userEvent.click(await screen.findByText('RRHH'));
    await waitFor(() => expect(carpetaService.listar).toHaveBeenCalledWith(1));

    const lista = screen.getByRole('list');
    expect(await within(lista).findByText('Contratos')).toBeInTheDocument();
    expect(within(lista).getByText('Contratos / Nómina')).toBeInTheDocument();
  });

  it('creates a carpeta under the selected parent and reloads the list', async () => {
    carpetaService.listar.mockResolvedValue([{ id: 10, nombre: 'Contratos', carpetaPadreId: null, areaId: 1, subcarpetas: [] }]);
    carpetaService.crear.mockResolvedValue({ id: 12, nombre: 'Políticas' });
    renderPagina();

    await userEvent.click(screen.getByLabelText('Área de las carpetas'));
    await userEvent.click(await screen.findByText('RRHH'));
    await within(screen.getByRole('list')).findByText('Contratos');

    await userEvent.type(screen.getByLabelText('Nombre de la nueva carpeta'), 'Políticas');
    await userEvent.selectOptions(screen.getByLabelText('Carpeta padre (opcional)'), '10');

    carpetaService.listar.mockResolvedValue([
      { id: 10, nombre: 'Contratos', carpetaPadreId: null, areaId: 1, subcarpetas: [{ id: 12, nombre: 'Políticas', carpetaPadreId: 10, areaId: 1, subcarpetas: [] }] },
    ]);
    await userEvent.click(screen.getByRole('button', { name: 'Crear carpeta' }));

    await waitFor(() => expect(carpetaService.crear).toHaveBeenCalledWith({ areaId: 1, nombre: 'Políticas', carpetaPadreId: '10' }));
    expect(await screen.findByText('Carpeta creada exitosamente')).toBeInTheDocument();
    expect(within(screen.getByRole('list')).getByText('Contratos / Políticas')).toBeInTheDocument();
  });

  it('shows an error when creation fails', async () => {
    carpetaService.listar.mockResolvedValue([]);
    carpetaService.crear.mockRejectedValue(new Error('El nombre ya existe en esta área'));
    renderPagina();

    await userEvent.click(screen.getByLabelText('Área de las carpetas'));
    await userEvent.click(await screen.findByText('RRHH'));
    await waitFor(() => expect(carpetaService.listar).toHaveBeenCalled());
    await userEvent.type(screen.getByLabelText('Nombre de la nueva carpeta'), 'Contratos');
    await userEvent.click(screen.getByRole('button', { name: 'Crear carpeta' }));

    expect(await screen.findByText('El nombre ya existe en esta área')).toBeInTheDocument();
  });

  it('navigates back to Documentos', async () => {
    renderPagina();
    expect(screen.getByRole('link', { name: /volver a documentos/i })).toHaveAttribute('href', '/documentos');
  });
});
