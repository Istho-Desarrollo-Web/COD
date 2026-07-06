import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { vi } from 'vitest';
import { AdminRoute } from './AdminRoute';
import { useAuth } from '../../context/AuthContext';

vi.mock('../../context/AuthContext');

function renderConRuta() {
  return render(
    <MemoryRouter initialEntries={['/administracion']}>
      <Routes>
        <Route path="/inicio" element={<p>Inicio</p>} />
        <Route
          path="/administracion"
          element={
            <AdminRoute>
              <p>Panel admin</p>
            </AdminRoute>
          }
        />
      </Routes>
    </MemoryRouter>
  );
}

describe('AdminRoute', () => {
  it('redirects non-admins to /inicio', () => {
    useAuth.mockReturnValue({ isAdmin: false });
    renderConRuta();
    expect(screen.getByText('Inicio')).toBeInTheDocument();
  });

  it('renders children for admins', () => {
    useAuth.mockReturnValue({ isAdmin: true });
    renderConRuta();
    expect(screen.getByText('Panel admin')).toBeInTheDocument();
  });
});
