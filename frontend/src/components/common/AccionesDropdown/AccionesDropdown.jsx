import { useState, useRef, useEffect, useId } from 'react';
import PropTypes from 'prop-types';
import { MoreVertical } from 'lucide-react';

const AccionesDropdown = ({ acciones = [] }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const menuId = useId();
  const visibles = acciones.filter((a) => !a.hidden);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  if (visibles.length === 0) return null;

  const btnBase = 'flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl transition-colors';
  const btnOutline = `${btnBase} bg-white dark:bg-centhrix-card text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-centhrix-surface`;
  const btnPrimary = `${btnBase} bg-orange-500 text-white hover:bg-orange-600`;

  return (
    <>
      <div className="hidden md:flex items-center gap-2">
        {visibles.map((a, i) => {
          const Icon = a.icon;
          const cls = a.variant === 'primary' ? btnPrimary : btnOutline;
          return (
            <button key={i} onClick={a.onClick} className={cls}>
              {Icon && <Icon className="w-4 h-4" />}
              {a.label}
            </button>
          );
        })}
      </div>

      <div className="md:hidden relative" ref={ref}>
        <button
          onClick={() => setOpen(!open)}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={menuId}
          aria-label="Más acciones"
          className="p-2.5 bg-white dark:bg-centhrix-card border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-centhrix-surface transition-colors"
        >
          <MoreVertical className="w-5 h-5 text-slate-600 dark:text-slate-300" aria-hidden="true" />
        </button>

        {open && (
          <div
            id={menuId}
            role="menu"
            className="absolute right-0 top-full mt-2 w-48 bg-white dark:bg-centhrix-card border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg z-50 py-1 overflow-hidden"
          >
            {visibles.map((a, i) => {
              const Icon = a.icon;
              return (
                <button
                  key={i}
                  role="menuitem"
                  onClick={() => {
                    setOpen(false);
                    a.onClick();
                  }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-centhrix-surface transition-colors"
                >
                  {Icon && <Icon className="w-4 h-4 text-slate-500 dark:text-slate-400" aria-hidden="true" />}
                  {a.label}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
};

AccionesDropdown.propTypes = {
  acciones: PropTypes.arrayOf(
    PropTypes.shape({
      label: PropTypes.string.isRequired,
      icon: PropTypes.elementType,
      onClick: PropTypes.func.isRequired,
      variant: PropTypes.string,
      hidden: PropTypes.bool,
    })
  ),
};

export default AccionesDropdown;
