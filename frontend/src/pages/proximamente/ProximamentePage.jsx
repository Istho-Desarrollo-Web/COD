import PropTypes from 'prop-types';
import { Construction } from 'lucide-react';

export default function ProximamentePage({ nombre }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="w-16 h-16 bg-white dark:bg-centhrix-surface rounded-full flex items-center justify-center shadow-sm mb-4">
        <Construction className="w-8 h-8 text-slate-400 dark:text-slate-500" />
      </div>
      <h2 className="text-xl font-display font-semibold text-slate-800 dark:text-slate-100 mb-1">{nombre}</h2>
      <p className="text-sm text-slate-500 dark:text-slate-400">Módulo en construcción.</p>
    </div>
  );
}

ProximamentePage.propTypes = { nombre: PropTypes.string.isRequired };
