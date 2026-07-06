import { List, LayoutGrid } from 'lucide-react';
import PropTypes from 'prop-types';

export default function ViewToggle({ modo, onChange }) {
  return (
    <div className="inline-flex rounded-xl border border-slate-200 dark:border-slate-600 overflow-hidden">
      <button
        type="button"
        onClick={() => onChange('lista')}
        aria-pressed={modo === 'lista'}
        aria-label="Ver como lista"
        className={`p-2 ${modo === 'lista' ? 'bg-orange-500 text-white' : 'bg-white dark:bg-centhrix-card text-slate-500 dark:text-slate-300'}`}
      >
        <List className="w-4 h-4" />
      </button>
      <button
        type="button"
        onClick={() => onChange('tarjetas')}
        aria-pressed={modo === 'tarjetas'}
        aria-label="Ver como tarjetas"
        className={`p-2 ${modo === 'tarjetas' ? 'bg-orange-500 text-white' : 'bg-white dark:bg-centhrix-card text-slate-500 dark:text-slate-300'}`}
      >
        <LayoutGrid className="w-4 h-4" />
      </button>
    </div>
  );
}

ViewToggle.propTypes = {
  modo: PropTypes.oneOf(['lista', 'tarjetas']).isRequired,
  onChange: PropTypes.func.isRequired,
};
