import { Link } from 'react-router-dom';
import { Users, ScrollText } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

const SUBMODULOS = [
  { path: '/administracion/usuarios', label: 'Usuarios', icon: Users, modulo: 'usuarios' },
  { path: '/administracion/logs', label: 'Logs del servidor', icon: ScrollText, modulo: 'logs_servidor' },
];

export default function AdministracionInicio() {
  const { tienePermiso } = useAuth();
  const visibles = SUBMODULOS.filter(({ modulo }) => tienePermiso(modulo, 'ver'));

  return (
    <div>
      <h2 className="text-xl font-display font-semibold text-slate-800 dark:text-slate-100 mb-6">Administración</h2>

      {visibles.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">No tienes acceso a ningún submódulo de administración todavía.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {visibles.map(({ path, label, icon: Icon }) => (
            <Link
              key={path}
              to={path}
              className="bg-white dark:bg-centhrix-card rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-slate-700 flex items-center gap-3 hover:border-orange-300 dark:hover:border-orange-500/40 transition-colors"
            >
              <Icon className="w-6 h-6 text-orange-500" />
              <span className="font-medium text-slate-800 dark:text-slate-100">{label}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
