import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { vi } from 'vitest';
import { PermissionRoute } from './PermissionRoute';
import { useAuth } from '../../context/AuthContext';

vi.mock('../../context/AuthContext');

function renderConRuta() {
  return render(
    <MemoryRouter initialEntries={['/documentos']}>
      <Routes>
        <Route path="/inicio" element={<p>Inicio</p>} />
        <Route
          path="/documentos"
          element={
            <PermissionRoute modulo="documentos" accion="ver">
              <p>Documentos</p>
            </PermissionRoute>
          }
        />
      </Routes>
    </MemoryRouter>
  );
}

describe('PermissionRoute', () => {
  it('redirects to /inicio when the user lacks the permission', () => {
    useAuth.mockReturnValue({ tienePermiso: () => false });
    renderConRuta();
    expect(screen.getByText('Inicio')).toBeInTheDocument();
  });

  it('renders children when the user has the permission', () => {
    useAuth.mockReturnValue({ tienePermiso: (modulo, accion) => modulo === 'documentos' && accion === 'ver' });
    renderConRuta();
    expect(screen.getByText('Documentos')).toBeInTheDocument();
  });
});
