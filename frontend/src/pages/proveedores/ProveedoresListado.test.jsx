import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SnackbarProvider } from 'notistack';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ProveedoresListado from './ProveedoresListado';
import proveedorService from '../../api/proveedor.service';
import { useAuth } from '../../context/AuthContext';

vi.mock('../../api/proveedor.service');
vi.mock('../../context/AuthContext');

function renderPagina() {
  return render(
    <MemoryRouter initialEntries={['/proveedores']}>
      <SnackbarProvider>
        <Routes>
          <Route path="/proveedores" element={<ProveedoresListado />} />
          <Route path="/proveedores/:id" element={<p>Detalle de Proveedor</p>} />
        </Routes>
      </SnackbarProvider>
    </MemoryRouter>
  );
}

describe('ProveedoresListado', () => {
  beforeEach(() => {
    useAuth.mockReturnValue({ tienePermiso: () => true });
  });

  it('renders the list of proveedores', async () => {
    proveedorService.listar.mockResolvedValue([
      { id: 1, razonSocial: 'Insumos ABC', documentoIdentificacion: '900123', tipo: 'proveedor', criticidad: 'media', estado: 'activo' },
    ]);
    renderPagina();
    expect(await screen.findByText('Insumos ABC')).toBeInTheDocument();
  });

  it('shows an empty state when there are no proveedores', async () => {
    proveedorService.listar.mockResolvedValue([]);
    renderPagina();
    expect(await screen.findByText('Sin proveedores todavía')).toBeInTheDocument();
  });

  it('creates a proveedor through the modal', async () => {
    proveedorService.listar.mockResolvedValue([]);
    proveedorService.crear.mockResolvedValue({ id: 2, razonSocial: 'Nuevo SAS' });
    renderPagina();

    await screen.findByText('Sin proveedores todavía');
    await userEvent.click(screen.getByText('Crear proveedor'));
    await userEvent.type(screen.getByLabelText('Documento de identificación'), '900999888');
    await userEvent.type(screen.getByLabelText('Razón social'), 'Nuevo SAS');
    await userEvent.click(screen.getByRole('button', { name: 'Crear' }));

    await waitFor(() =>
      expect(proveedorService.crear).toHaveBeenCalledWith(
        expect.objectContaining({ documentoIdentificacion: '900999888', razonSocial: 'Nuevo SAS' })
      )
    );
  });

  it('hides "Crear proveedor" when the user lacks the crear permission', async () => {
    useAuth.mockReturnValue({ tienePermiso: () => false });
    proveedorService.listar.mockResolvedValue([]);
    renderPagina();
    await screen.findByText('Sin proveedores todavía');
    expect(screen.queryByText('Crear proveedor')).not.toBeInTheDocument();
  });

  it('filters proveedores by estado', async () => {
    proveedorService.listar.mockResolvedValue([]);
    renderPagina();
    await screen.findByText('Sin proveedores todavía');

    await userEvent.click(screen.getByLabelText('Estado'));
    await userEvent.click(await screen.findByRole('button', { name: 'Activo' }));

    await waitFor(() => expect(proveedorService.listar).toHaveBeenLastCalledWith({ estado: 'activo' }));
  });

  it('navigates to the proveedor detail when a table row is clicked', async () => {
    proveedorService.listar.mockResolvedValue([
      { id: 1, razonSocial: 'Insumos ABC', documentoIdentificacion: '900123', tipo: 'proveedor', criticidad: 'media', estado: 'activo' },
    ]);
    renderPagina();

    await userEvent.click(await screen.findByText('Insumos ABC'));
    expect(await screen.findByText('Detalle de Proveedor')).toBeInTheDocument();
  });
});
