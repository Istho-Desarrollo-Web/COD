import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SnackbarProvider } from 'notistack';
import UsuariosListado from './UsuariosListado';
import usuarioService from '../../api/usuario.service';
import rolService from '../../api/rol.service';
import { useAuth } from '../../context/AuthContext';

vi.mock('../../api/usuario.service');
vi.mock('../../api/rol.service');
vi.mock('../../context/AuthContext');

const ROLES = [{ id: 3, nombre: 'lider_area' }];

function renderPagina() {
  return render(
    <SnackbarProvider>
      <UsuariosListado />
    </SnackbarProvider>
  );
}

describe('UsuariosListado', () => {
  beforeEach(() => {
    localStorage.clear();
    window.innerWidth = 1280;
    rolService.listar.mockResolvedValue(ROLES);
  });

  it('renders the empty state when there are no usuarios', async () => {
    useAuth.mockReturnValue({ tienePermiso: () => false });
    usuarioService.listar.mockResolvedValue([]);
    renderPagina();
    expect(await screen.findByText('Sin usuarios todavía')).toBeInTheDocument();
  });

  it('renders usuarios resolving the rol name', async () => {
    useAuth.mockReturnValue({ tienePermiso: () => false });
    usuarioService.listar.mockResolvedValue([
      { id: 1, nombre: 'Juan', apellido: 'Pérez', username: 'jperez', email: 'jperez@istho.com.co', rolId: 3, activo: true },
    ]);
    renderPagina();
    expect(await screen.findByText('lider_area')).toBeInTheDocument();
  });

  it('hides "Crear usuario" without the crear permission', async () => {
    useAuth.mockReturnValue({ tienePermiso: () => false });
    usuarioService.listar.mockResolvedValue([]);
    renderPagina();
    await screen.findByText('Sin usuarios todavía');
    expect(screen.queryByRole('button', { name: /crear usuario/i })).not.toBeInTheDocument();
  });

  it('suggests a username from nombre+apellido and creates the usuario', async () => {
    useAuth.mockReturnValue({ tienePermiso: (modulo, accion) => modulo === 'usuarios' && accion === 'crear' });
    usuarioService.listar.mockResolvedValue([]);
    usuarioService.crear.mockResolvedValue({ id: 1, username: 'jperez' });
    renderPagina();

    await screen.findByText('Sin usuarios todavía');
    await userEvent.click(screen.getByRole('button', { name: /crear usuario/i }));

    await userEvent.type(screen.getByLabelText('Nombre'), 'Juan');
    await userEvent.type(screen.getByLabelText('Apellido'), 'Pérez');
    await userEvent.tab();

    expect(screen.getByLabelText('Username')).toHaveValue('jperez');

    await userEvent.type(screen.getByLabelText('Email'), 'jperez@istho.com.co');
    await userEvent.type(screen.getByLabelText('Contraseña'), 'Clave123!');
    await userEvent.selectOptions(screen.getByLabelText('Rol'), '3');

    usuarioService.listar.mockResolvedValue([
      { id: 1, nombre: 'Juan', apellido: 'Pérez', username: 'jperez', email: 'jperez@istho.com.co', rolId: 3, activo: true },
    ]);
    await userEvent.click(screen.getByRole('button', { name: 'Crear' }));

    await waitFor(() =>
      expect(usuarioService.crear).toHaveBeenCalledWith(
        expect.objectContaining({
          username: 'jperez',
          nombre: 'Juan',
          apellido: 'Pérez',
          email: 'jperez@istho.com.co',
          password: 'Clave123!',
          rolId: 3,
          requiereCambioPassword: true,
        })
      )
    );
    expect(await screen.findByText('Usuario creado exitosamente')).toBeInTheDocument();
  });

  it('edits an existing usuario without requiring a new password', async () => {
    useAuth.mockReturnValue({ tienePermiso: (modulo, accion) => modulo === 'usuarios' && ['ver', 'editar'].includes(accion) });
    usuarioService.listar.mockResolvedValue([
      { id: 1, nombre: 'Juan', apellido: 'Pérez', username: 'jperez', email: 'jperez@istho.com.co', rolId: 3, activo: true, requiereCambioPassword: true },
    ]);
    usuarioService.editar.mockResolvedValue({ id: 1, nombre: 'Juan Carlos' });
    renderPagina();

    await screen.findByText('jperez');
    await userEvent.click(screen.getByText('jperez'));

    const nombreInput = screen.getByLabelText('Nombre');
    await userEvent.clear(nombreInput);
    await userEvent.type(nombreInput, 'Juan Carlos');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(usuarioService.editar).toHaveBeenCalledWith(1, expect.objectContaining({ nombre: 'Juan Carlos' })));
    const cambiosEnviados = usuarioService.editar.mock.calls[0][1];
    expect(cambiosEnviados.password).toBeUndefined();
  });

  it('deletes a usuario after confirmation', async () => {
    useAuth.mockReturnValue({ tienePermiso: (modulo, accion) => modulo === 'usuarios' && ['ver', 'editar', 'eliminar'].includes(accion) });
    usuarioService.listar.mockResolvedValue([
      { id: 1, nombre: 'Juan', apellido: 'Pérez', username: 'jperez', email: 'jperez@istho.com.co', rolId: 3, activo: true },
    ]);
    usuarioService.eliminar.mockResolvedValue(null);
    window.confirm = vi.fn(() => true);
    renderPagina();

    await screen.findByText('jperez');
    await userEvent.click(screen.getByText('jperez'));
    await userEvent.click(screen.getByRole('button', { name: 'Eliminar' }));

    await waitFor(() => expect(usuarioService.eliminar).toHaveBeenCalledWith(1));
  });

  it('shows an error when loading usuarios fails', async () => {
    useAuth.mockReturnValue({ tienePermiso: () => false });
    usuarioService.listar.mockRejectedValue(new Error('Network error'));
    renderPagina();
    expect(await screen.findByText('Sin usuarios todavía')).toBeInTheDocument();
    expect(await screen.findByText('Network error')).toBeInTheDocument();
  });
});
