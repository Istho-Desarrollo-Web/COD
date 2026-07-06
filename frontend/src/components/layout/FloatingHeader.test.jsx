import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import FloatingHeader from './FloatingHeader';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';

vi.mock('../../context/AuthContext');
vi.mock('../../context/ThemeContext');

describe('FloatingHeader', () => {
  beforeEach(() => {
    useAuth.mockReturnValue({ user: { nombre: 'Ana', rol: 'admin' }, logout: vi.fn() });
    useTheme.mockReturnValue({ isDark: false, toggleTheme: vi.fn() });
  });

  it('renders the module title for the current path', () => {
    render(<FloatingHeader onToggleSidebar={vi.fn()} currentPath="/areas" />);
    expect(screen.getByText('Áreas')).toBeInTheDocument();
  });

  it('calls onToggleSidebar when the menu button is clicked', async () => {
    const onToggleSidebar = vi.fn();
    render(<FloatingHeader onToggleSidebar={onToggleSidebar} currentPath="/inicio" />);
    await userEvent.click(screen.getByLabelText('Alternar menú lateral'));
    expect(onToggleSidebar).toHaveBeenCalledTimes(1);
  });

  it('calls toggleTheme when the theme button is clicked', async () => {
    const toggleTheme = vi.fn();
    useTheme.mockReturnValue({ isDark: false, toggleTheme });
    render(<FloatingHeader onToggleSidebar={vi.fn()} currentPath="/inicio" />);
    await userEvent.click(screen.getByLabelText('Cambiar a tema oscuro'));
    expect(toggleTheme).toHaveBeenCalledTimes(1);
  });

  it('calls logout when the logout button is clicked', async () => {
    const logout = vi.fn();
    useAuth.mockReturnValue({ user: { nombre: 'Ana', rol: 'admin' }, logout });
    render(<FloatingHeader onToggleSidebar={vi.fn()} currentPath="/inicio" />);
    await userEvent.click(screen.getByLabelText('Cerrar sesión'));
    expect(logout).toHaveBeenCalledTimes(1);
  });
});
