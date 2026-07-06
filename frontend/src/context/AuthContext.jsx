import { createContext, useContext, useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import authService from '../api/auth.service';
import { getStoredToken } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function hidratar() {
      const token = getStoredToken();
      if (!token) {
        setIsLoading(false);
        return;
      }
      try {
        const usuarioActual = await authService.obtenerUsuarioActual();
        setUser(usuarioActual);
      } catch {
        authService.logout();
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    }
    hidratar();
  }, []);

  async function login(username, password) {
    const usuarioAutenticado = await authService.login(username, password);
    setUser(usuarioAutenticado);
    return usuarioAutenticado;
  }

  function logout() {
    authService.logout();
    setUser(null);
  }

  function tienePermiso(modulo, accion) {
    if (!user) return false;
    if (user.rol === 'admin') return true;
    return (user.permisos?.[modulo] || []).includes(accion);
  }

  const value = {
    user,
    isAuthenticated: !!user,
    isLoading,
    isAdmin: user?.rol === 'admin',
    login,
    logout,
    tienePermiso,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

AuthProvider.propTypes = { children: PropTypes.node.isRequired };

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return context;
}
