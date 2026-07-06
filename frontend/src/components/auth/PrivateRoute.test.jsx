import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { vi } from 'vitest';
import { PrivateRoute } from './PrivateRoute';
import { useAuth } from '../../context/AuthContext';

vi.mock('../../context/AuthContext');

function renderConRuta(initialPath = '/protegida') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/login" element={<p>Página de login</p>} />
        <Route
          path="/protegida"
          element={
            <PrivateRoute>
              <p>Contenido protegido</p>
            </PrivateRoute>
          }
        />
      </Routes>
    </MemoryRouter>
  );
}

describe('PrivateRoute', () => {
  it('renders nothing while auth state is loading', () => {
    useAuth.mockReturnValue({ isAuthenticated: false, isLoading: true });
    renderConRuta();
    expect(screen.queryByText('Contenido protegido')).not.toBeInTheDocument();
    expect(screen.queryByText('Página de login')).not.toBeInTheDocument();
  });

  it('redirects to /login when not authenticated', () => {
    useAuth.mockReturnValue({ isAuthenticated: false, isLoading: false });
    renderConRuta();
    expect(screen.getByText('Página de login')).toBeInTheDocument();
  });

  it('renders children when authenticated', () => {
    useAuth.mockReturnValue({ isAuthenticated: true, isLoading: false });
    renderConRuta();
    expect(screen.getByText('Contenido protegido')).toBeInTheDocument();
  });
});
