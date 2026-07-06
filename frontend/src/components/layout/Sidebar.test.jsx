import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import Sidebar from './Sidebar';
import { useAuth } from '../../context/AuthContext';

vi.mock('../../context/AuthContext');

describe('Sidebar', () => {
  it('shows only the modules the user has ver on', () => {
    useAuth.mockReturnValue({
      tienePermiso: (modulo, accion) => accion === 'ver' && ['inicio', 'areas'].includes(modulo),
    });
    render(<Sidebar collapsed={false} />, { wrapper: MemoryRouter });

    expect(screen.getByText('Inicio')).toBeInTheDocument();
    expect(screen.getByText('Áreas')).toBeInTheDocument();
    expect(screen.queryByText('Documentos')).not.toBeInTheDocument();
    expect(screen.queryByText('Administración')).not.toBeInTheDocument();
  });

  it('shows Administración when the user has ver on any admin sub-module', () => {
    useAuth.mockReturnValue({
      tienePermiso: (modulo, accion) => accion === 'ver' && ['inicio', 'auditoria'].includes(modulo),
    });
    render(<Sidebar collapsed={false} />, { wrapper: MemoryRouter });

    expect(screen.getByText('Administración')).toBeInTheDocument();
  });

  it('hides labels when collapsed', () => {
    useAuth.mockReturnValue({ tienePermiso: () => true });
    render(<Sidebar collapsed />, { wrapper: MemoryRouter });
    expect(screen.queryByText('Inicio')).not.toBeInTheDocument();
  });
});
