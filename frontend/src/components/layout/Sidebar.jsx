import { NavLink } from 'react-router-dom';
import PropTypes from 'prop-types';
import { Home, Building2, FileText, ClipboardList, Truck, FileSpreadsheet, BarChart3, Settings } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

const MODULOS = [
  { path: '/inicio', label: 'Inicio', icon: Home, modulo: 'inicio' },
  { path: '/areas', label: 'Áreas', icon: Building2, modulo: 'areas' },
  { path: '/documentos', label: 'Documentos', icon: FileText, modulo: 'documentos' },
  { path: '/solicitudes', label: 'Solicitudes', icon: ClipboardList, modulo: 'solicitudes' },
  { path: '/proveedores', label: 'Proveedores', icon: Truck, modulo: 'proveedores' },
  { path: '/formularios', label: 'Formularios', icon: FileSpreadsheet, modulo: 'formularios' },
  { path: '/reportes', label: 'Reportes', icon: BarChart3, modulo: 'reportes' },
  { path: '/administracion', label: 'Administración', icon: Settings, modulo: 'administracion' },
];

const ADMIN_SUBMODULOS = ['usuarios', 'roles', 'matriz_accesos', 'sesiones', 'auditoria'];

export default function Sidebar({ collapsed }) {
  const { tienePermiso } = useAuth();

  const modulosVisibles = MODULOS.filter(({ modulo }) => {
    if (modulo === 'administracion') {
      return ADMIN_SUBMODULOS.some((sub) => tienePermiso(sub, 'ver'));
    }
    return tienePermiso(modulo, 'ver');
  });

  return (
    <aside
      className={`fixed top-24 left-4 bottom-4 z-30 bg-white dark:bg-centhrix-card rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 transition-all duration-200 ${collapsed ? 'w-16' : 'w-56'} overflow-y-auto`}
    >
      <nav aria-label="Navegación principal" className="p-2 flex flex-col gap-1">
        {modulosVisibles.map(({ path, label, icon: Icon }) => (
          <NavLink
            key={path}
            to={path}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-orange-500 text-white'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-centhrix-surface'
              }`
            }
          >
            <Icon className="w-5 h-5 shrink-0" />
            {!collapsed && <span>{label}</span>}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}

Sidebar.propTypes = { collapsed: PropTypes.bool.isRequired };
