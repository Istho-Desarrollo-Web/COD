import { createContext, useContext, useEffect, useState } from 'react';
import PropTypes from 'prop-types';

const ThemeContext = createContext(null);
const THEME_KEY = 'cod_theme';

export function ThemeProvider({ children }) {
  const [isDark, setIsDark] = useState(() => localStorage.getItem(THEME_KEY) === 'dark');

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
    localStorage.setItem(THEME_KEY, isDark ? 'dark' : 'light');
  }, [isDark]);

  function toggleTheme() {
    setIsDark((prev) => !prev);
  }

  return <ThemeContext.Provider value={{ isDark, toggleTheme }}>{children}</ThemeContext.Provider>;
}

ThemeProvider.propTypes = { children: PropTypes.node.isRequired };

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme debe usarse dentro de ThemeProvider');
  return context;
}
