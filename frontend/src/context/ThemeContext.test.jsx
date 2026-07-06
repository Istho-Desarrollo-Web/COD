import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider, useTheme } from './ThemeContext';

function Consumidor() {
  const { isDark, toggleTheme } = useTheme();
  return (
    <div>
      <p>{isDark ? 'oscuro' : 'claro'}</p>
      <button onClick={toggleTheme}>alternar</button>
    </div>
  );
}

describe('ThemeContext', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
  });

  it('defaults to light theme with no dark class applied', () => {
    render(
      <ThemeProvider>
        <Consumidor />
      </ThemeProvider>
    );
    expect(screen.getByText('claro')).toBeInTheDocument();
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('toggling adds the dark class and persists the preference', async () => {
    render(
      <ThemeProvider>
        <Consumidor />
      </ThemeProvider>
    );
    await userEvent.click(screen.getByText('alternar'));
    expect(screen.getByText('oscuro')).toBeInTheDocument();
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(localStorage.getItem('cod_theme')).toBe('dark');
  });

  it('starts dark when cod_theme was previously saved as dark', () => {
    localStorage.setItem('cod_theme', 'dark');
    render(
      <ThemeProvider>
        <Consumidor />
      </ThemeProvider>
    );
    expect(screen.getByText('oscuro')).toBeInTheDocument();
  });
});
