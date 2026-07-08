import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AdministracionInicio from './AdministracionInicio';
import { useAuth } from '../../context/AuthContext';

vi.mock('../../context/AuthContext');

function renderPagina() {
  return render(
    <MemoryRouter>
      <AdministracionInicio />
    </MemoryRouter>
  );
}

describe('AdministracionInicio', () => {
  it('shows a link to Usuarios when the user has usuarios.ver', () => {
    useAuth.mockReturnValue({ tienePermiso: (modulo, accion) => modulo === 'usuarios' && accion === 'ver' });
    renderPagina();
    expect(screen.getByRole('link', { name: /usuarios/i })).toHaveAttribute('href', '/administracion/usuarios');
  });

  it('shows a message when the user has no admin submodule access', () => {
    useAuth.mockReturnValue({ tienePermiso: () => false });
    renderPagina();
    expect(screen.getByText('No tienes acceso a ningún submódulo de administración todavía.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /usuarios/i })).not.toBeInTheDocument();
  });
});
