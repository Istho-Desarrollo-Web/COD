import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { SnackbarProvider } from 'notistack';
import AreasListado from './AreasListado';
import areaService from '../../api/area.service';
import usuarioService from '../../api/usuario.service';
import rolService from '../../api/rol.service';
import { useAuth } from '../../context/AuthContext';

vi.mock('../../api/area.service');
vi.mock('../../api/usuario.service');
vi.mock('../../api/rol.service');
vi.mock('../../context/AuthContext');

function renderPagina() {
  return render(
    <MemoryRouter initialEntries={['/areas']}>
      <SnackbarProvider>
        <Routes>
          <Route path="/areas" element={<AreasListado />} />
          <Route path="/areas/:id" element={<p>Detalle de Área</p>} />
        </Routes>
      </SnackbarProvider>
    </MemoryRouter>
  );
}

describe('AreasListado', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    window.innerWidth = 1280;
    usuarioService.listar.mockResolvedValue([]);
    rolService.listar.mockResolvedValue([]);
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

  it('shows the empty state instead of hanging when loading areas fails', async () => {
    useAuth.mockReturnValue({ isAdmin: false });
    areaService.listar.mockRejectedValue(new Error('Network error'));
    renderPagina();

    expect(await screen.findByText('Sin áreas todavía')).toBeInTheDocument();
    expect(await screen.findByText('Network error')).toBeInTheDocument();
  });

  it('shows an error and keeps the modal open when creating an area fails', async () => {
    useAuth.mockReturnValue({ isAdmin: true });
    areaService.listar.mockResolvedValue([]);
    areaService.crear.mockRejectedValue(new Error('El código ya existe'));
    renderPagina();

    await screen.findByText('Sin áreas todavía');
    await userEvent.click(screen.getByRole('button', { name: /crear área/i }));

    await userEvent.type(screen.getByLabelText('Nombre'), 'SGI');
    await userEvent.type(screen.getByLabelText('Código'), 'SGI');
    await userEvent.click(screen.getByRole('button', { name: 'Crear' }));

    expect(await screen.findByText('El código ya existe')).toBeInTheDocument();
    expect(screen.getByLabelText('Nombre')).toHaveValue('SGI');
    expect(screen.getByLabelText('Código')).toHaveValue('SGI');
  });

  it('creates an area without a líder when the checkbox is left unchecked', async () => {
    useAuth.mockReturnValue({ isAdmin: true });
    areaService.listar.mockResolvedValue([]);
    areaService.crear.mockResolvedValue({ id: 1, nombre: 'SGI', codigo: 'SGI' });
    renderPagina();

    await screen.findByText('Sin áreas todavía');
    await userEvent.click(screen.getByRole('button', { name: /crear área/i }));
    await userEvent.type(screen.getByLabelText('Nombre'), 'SGI');
    await userEvent.type(screen.getByLabelText('Código'), 'SGI');
    await userEvent.click(screen.getByRole('button', { name: 'Crear' }));

    await waitFor(() => expect(areaService.crear).toHaveBeenCalledWith({ nombre: 'SGI', codigo: 'SGI' }));
  });

  it('creates a new lider usuario inline when "Asignar líder de área" and "Usuario nuevo" are used', async () => {
    useAuth.mockReturnValue({ isAdmin: true });
    areaService.listar.mockResolvedValue([]);
    rolService.listar.mockResolvedValue([{ id: 3, nombre: 'lider_area' }]);
    areaService.crear.mockResolvedValue({ id: 1, nombre: 'RRHH', codigo: 'RRHH', liderUsuarioId: 10 });
    renderPagina();

    await screen.findByText('Sin áreas todavía');
    await userEvent.click(screen.getByRole('button', { name: /crear área/i }));
    await userEvent.type(screen.getByLabelText('Nombre'), 'RRHH');
    await userEvent.type(screen.getByLabelText('Código'), 'RRHH');

    await userEvent.click(screen.getByLabelText('Asignar líder de área'));
    await userEvent.type(screen.getByLabelText('Nombre del líder'), 'Juan');
    await userEvent.type(screen.getByLabelText('Apellido del líder'), 'Pérez');
    await userEvent.type(screen.getByLabelText('Email del líder'), 'jperez@istho.com.co');
    await userEvent.type(screen.getByLabelText('Contraseña del líder'), 'Clave123!');
    await userEvent.selectOptions(screen.getByLabelText('Rol del líder'), '3');

    await userEvent.click(screen.getByRole('button', { name: 'Crear' }));

    await waitFor(() =>
      expect(areaService.crear).toHaveBeenCalledWith({
        nombre: 'RRHH',
        codigo: 'RRHH',
        nuevoUsuario: {
          username: 'jperez',
          email: 'jperez@istho.com.co',
          nombre: 'Juan',
          apellido: 'Pérez',
          password: 'Clave123!',
          rolId: 3,
          requiereCambioPassword: true,
        },
      })
    );
  });

  it('assigns an existing usuario as líder when "Usuario existente" is selected', async () => {
    useAuth.mockReturnValue({ isAdmin: true });
    areaService.listar.mockResolvedValue([]);
    usuarioService.listar.mockResolvedValue([{ id: 7, nombre: 'Ana', apellido: 'Gómez', username: 'agomez' }]);
    areaService.crear.mockResolvedValue({ id: 1, nombre: 'TI', codigo: 'TI', liderUsuarioId: 7 });
    renderPagina();

    await screen.findByText('Sin áreas todavía');
    await userEvent.click(screen.getByRole('button', { name: /crear área/i }));
    await userEvent.type(screen.getByLabelText('Nombre'), 'TI');
    await userEvent.type(screen.getByLabelText('Código'), 'TI');

    await userEvent.click(screen.getByLabelText('Asignar líder de área'));
    await userEvent.click(screen.getByLabelText('Usuario existente'));
    await userEvent.selectOptions(screen.getByLabelText('Usuario líder'), '7');

    await userEvent.click(screen.getByRole('button', { name: 'Crear' }));

    await waitFor(() => expect(areaService.crear).toHaveBeenCalledWith({ nombre: 'TI', codigo: 'TI', liderUsuarioId: 7 }));
  });

  it('shows a validation error and blocks submission when "Nombre del líder" is left empty', async () => {
    useAuth.mockReturnValue({ isAdmin: true });
    areaService.listar.mockResolvedValue([]);
    rolService.listar.mockResolvedValue([{ id: 3, nombre: 'lider_area' }]);
    renderPagina();

    await screen.findByText('Sin áreas todavía');
    await userEvent.click(screen.getByRole('button', { name: /crear área/i }));
    await userEvent.type(screen.getByLabelText('Nombre'), 'RRHH');
    await userEvent.type(screen.getByLabelText('Código'), 'RRHH');

    await userEvent.click(screen.getByLabelText('Asignar líder de área'));
    await userEvent.type(screen.getByLabelText('Apellido del líder'), 'Pérez');
    await userEvent.type(screen.getByLabelText('Email del líder'), 'jperez@istho.com.co');
    await userEvent.type(screen.getByLabelText('Contraseña del líder'), 'Clave123!');
    await userEvent.selectOptions(screen.getByLabelText('Rol del líder'), '3');

    await userEvent.click(screen.getByRole('button', { name: 'Crear' }));

    expect(await screen.findByText('El nombre del líder es obligatorio')).toBeInTheDocument();
    expect(areaService.crear).not.toHaveBeenCalled();
  });

  it('pre-selects the "lider_area" role once the catalog loads, but still lets the admin change it', async () => {
    useAuth.mockReturnValue({ isAdmin: true });
    areaService.listar.mockResolvedValue([]);
    rolService.listar.mockResolvedValue([
      { id: 3, nombre: 'lider_area' },
      { id: 5, nombre: 'admin' },
    ]);
    areaService.crear.mockResolvedValue({ id: 1, nombre: 'RRHH', codigo: 'RRHH' });
    renderPagina();

    await screen.findByText('Sin áreas todavía');
    await userEvent.click(screen.getByRole('button', { name: /crear área/i }));

    await userEvent.click(screen.getByLabelText('Asignar líder de área'));

    await waitFor(() => expect(screen.getByLabelText('Rol del líder')).toHaveValue('3'));

    await userEvent.selectOptions(screen.getByLabelText('Rol del líder'), '5');
    expect(screen.getByLabelText('Rol del líder')).toHaveValue('5');

    await userEvent.type(screen.getByLabelText('Nombre'), 'RRHH');
    await userEvent.type(screen.getByLabelText('Código'), 'RRHH');
    await userEvent.type(screen.getByLabelText('Nombre del líder'), 'Juan');
    await userEvent.type(screen.getByLabelText('Apellido del líder'), 'Pérez');
    await userEvent.type(screen.getByLabelText('Email del líder'), 'jperez@istho.com.co');
    await userEvent.type(screen.getByLabelText('Contraseña del líder'), 'Clave123!');

    await userEvent.click(screen.getByRole('button', { name: 'Crear' }));

    await waitFor(() =>
      expect(areaService.crear).toHaveBeenCalledWith(
        expect.objectContaining({
          nuevoUsuario: expect.objectContaining({ rolId: 5 }),
        })
      )
    );
  });

  it('shows a validation error and blocks submission when "Usuario líder" is left unselected', async () => {
    useAuth.mockReturnValue({ isAdmin: true });
    areaService.listar.mockResolvedValue([]);
    usuarioService.listar.mockResolvedValue([{ id: 7, nombre: 'Ana', apellido: 'Gómez', username: 'agomez' }]);
    renderPagina();

    await screen.findByText('Sin áreas todavía');
    await userEvent.click(screen.getByRole('button', { name: /crear área/i }));
    await userEvent.type(screen.getByLabelText('Nombre'), 'TI');
    await userEvent.type(screen.getByLabelText('Código'), 'TI');

    await userEvent.click(screen.getByLabelText('Asignar líder de área'));
    await userEvent.click(screen.getByLabelText('Usuario existente'));

    await userEvent.click(screen.getByRole('button', { name: 'Crear' }));

    expect(await screen.findByText('El usuario líder es obligatorio')).toBeInTheDocument();
    expect(areaService.crear).not.toHaveBeenCalled();
  });

  it('navigates to the área detail when a tarjeta is clicked', async () => {
    useAuth.mockReturnValue({ isAdmin: false });
    areaService.listar.mockResolvedValue([{ id: 1, nombre: 'Financiera', codigo: 'FIN', saludDocumentalPct: '92.0' }]);
    renderPagina();

    await screen.findByText('Financiera');
    await userEvent.click(screen.getByLabelText('Ver como tarjetas'));
    await userEvent.click(screen.getByText('Financiera'));

    expect(await screen.findByText('Detalle de Área')).toBeInTheDocument();
  });

  it('navigates to the área detail via keyboard when a tarjeta is focused', async () => {
    useAuth.mockReturnValue({ isAdmin: false });
    areaService.listar.mockResolvedValue([{ id: 1, nombre: 'Financiera', codigo: 'FIN', saludDocumentalPct: '92.0' }]);
    renderPagina();

    await screen.findByText('Financiera');
    await userEvent.click(screen.getByLabelText('Ver como tarjetas'));
    screen.getByText('Financiera').closest('[role="button"]').focus();
    await userEvent.keyboard('{Enter}');

    expect(await screen.findByText('Detalle de Área')).toBeInTheDocument();
  });

  it('navigates to the área detail when a table row is clicked', async () => {
    useAuth.mockReturnValue({ isAdmin: false });
    areaService.listar.mockResolvedValue([{ id: 1, nombre: 'Financiera', codigo: 'FIN', saludDocumentalPct: '92.0' }]);
    renderPagina();

    await userEvent.click(await screen.findByText('Financiera'));

    expect(await screen.findByText('Detalle de Área')).toBeInTheDocument();
  });
});
