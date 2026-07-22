import { Menu, LogOut, Moon, Sun, UserCircle } from 'lucide-react';
import PropTypes from 'prop-types';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';

const TITULOS_MODULO = {
  '/inicio': 'Inicio',
  '/areas': 'Áreas',
  '/documentos': 'Documentos',
  '/solicitudes': 'Solicitudes',
  '/proveedores': 'Proveedores y contratistas',
  '/formularios': 'Formularios',
  '/reportes': 'Reportes',
  '/administracion': 'Administración',
};

export default function FloatingHeader({ onToggleSidebar, currentPath }) {
  const { user, logout } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const titulo = TITULOS_MODULO[currentPath] || 'COD';

  return (
    <header className="fixed top-4 left-4 right-4 z-40 bg-white/90 dark:bg-centhrix-card/90 backdrop-blur-md rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 px-4 py-3 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onToggleSidebar}
          aria-label="Alternar menú lateral"
          className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-centhrix-surface text-slate-600 dark:text-slate-300"
        >
          <Menu className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-display font-semibold text-slate-800 dark:text-slate-100">{titulo}</h1>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={toggleTheme}
          aria-label={isDark ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
          className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-centhrix-surface text-slate-600 dark:text-slate-300"
        >
          {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
        </button>

        <div className="flex items-center gap-2 pl-2 border-l border-slate-200 dark:border-slate-600">
          <UserCircle className="w-6 h-6 text-slate-400" />
          <div className="hidden sm:block text-sm">
            <p className="font-medium text-slate-700 dark:text-slate-200">{user?.nombre}</p>
            <p className="text-xs text-slate-400 dark:text-slate-500">{user?.roles?.map((rol) => rol.nombre).join(', ')}</p>
          </div>
          <button
            type="button"
            onClick={logout}
            aria-label="Cerrar sesión"
            className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-centhrix-surface text-slate-600 dark:text-slate-300"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </div>
    </header>
  );
}

FloatingHeader.propTypes = {
  onToggleSidebar: PropTypes.func.isRequired,
  currentPath: PropTypes.string.isRequired,
};
