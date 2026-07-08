import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SnackbarProvider } from 'notistack';
import CarpetasModal from './CarpetasModal';
import carpetaService from '../../api/carpeta.service';

vi.mock('../../api/carpeta.service');

const AREAS = [
  { id: 1, nombre: 'RRHH' },
  { id: 2, nombre: 'Financiera' },
];

function renderModal(props = {}) {
  return render(
    <SnackbarProvider>
      <CarpetasModal isOpen areas={AREAS} onClose={() => {}} {...props} />
    </SnackbarProvider>
  );
}

describe('CarpetasModal', () => {
  it('loads carpetas for the first selected area and shows their computed path', async () => {
    carpetaService.listar.mockResolvedValue([{ id: 10, nombre: 'Contratos', carpetaPadreId: null, areaId: 1, subcarpetas: [{ id: 11, nombre: 'Nómina', carpetaPadreId: 10, areaId: 1, subcarpetas: [] }] }]);
    renderModal();

    await userEvent.selectOptions(screen.getByLabelText('Área de las carpetas'), '1');
    await waitFor(() => expect(carpetaService.listar).toHaveBeenCalledWith(1));

    // Scoped to the <ul> — the carpeta-padre <select> below renders the same names as options.
    const lista = screen.getByRole('list');
    expect(await within(lista).findByText('Contratos')).toBeInTheDocument();
    expect(within(lista).getByText('Contratos / Nómina')).toBeInTheDocument();
  });

  it('creates a carpeta under the selected parent and reloads the list', async () => {
    carpetaService.listar.mockResolvedValue([{ id: 10, nombre: 'Contratos', carpetaPadreId: null, areaId: 1, subcarpetas: [] }]);
    carpetaService.crear.mockResolvedValue({ id: 12, nombre: 'Políticas' });
    renderModal();

    await userEvent.selectOptions(screen.getByLabelText('Área de las carpetas'), '1');
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

  it('notifies the parent with the affected area id after creating a carpeta', async () => {
    carpetaService.listar.mockResolvedValue([{ id: 10, nombre: 'Contratos', carpetaPadreId: null, areaId: 1, subcarpetas: [] }]);
    carpetaService.crear.mockResolvedValue({ id: 12, nombre: 'Políticas' });
    const onCarpetaCreada = vi.fn();
    renderModal({ onCarpetaCreada });

    await userEvent.selectOptions(screen.getByLabelText('Área de las carpetas'), '1');
    await within(screen.getByRole('list')).findByText('Contratos');

    await userEvent.type(screen.getByLabelText('Nombre de la nueva carpeta'), 'Políticas');
    await userEvent.click(screen.getByRole('button', { name: 'Crear carpeta' }));

    await waitFor(() => expect(onCarpetaCreada).toHaveBeenCalledWith(1));
  });

  it('shows an error when creation fails', async () => {
    carpetaService.listar.mockResolvedValue([]);
    carpetaService.crear.mockRejectedValue(new Error('El nombre ya existe en esta área'));
    renderModal();

    await userEvent.selectOptions(screen.getByLabelText('Área de las carpetas'), '1');
    await waitFor(() => expect(carpetaService.listar).toHaveBeenCalled());
    await userEvent.type(screen.getByLabelText('Nombre de la nueva carpeta'), 'Contratos');
    await userEvent.click(screen.getByRole('button', { name: 'Crear carpeta' }));

    expect(await screen.findByText('El nombre ya existe en esta área')).toBeInTheDocument();
  });
});
