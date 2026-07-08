import { useState, useRef, useEffect, useCallback, useId } from 'react';
import { createPortal } from 'react-dom';
import PropTypes from 'prop-types';
import { ChevronDown, Check, Search, X } from 'lucide-react';

const SEARCH_THRESHOLD = 6;

const FilterDropdown = ({
  label,
  options = [],
  value,
  onChange,
  placeholder = 'Seleccionar',
  multiple = false,
  icon: Icon,
  compact = false,
  searchable,
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [panelStyle, setPanelStyle] = useState({});
  const [search, setSearch] = useState('');
  const containerRef = useRef(null);
  const buttonRef = useRef(null);
  const panelRef = useRef(null);
  const searchRef = useRef(null);
  const triggerId = useId();

  const showSearch = searchable !== undefined ? searchable : options.length > SEARCH_THRESHOLD;

  const filteredOptions = showSearch && search.trim()
    ? options.filter((o) => o.label.toLowerCase().includes(search.toLowerCase()))
    : options;

  const handleToggle = useCallback(() => {
    if (disabled) return;
    if (!isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const left = Math.max(4, Math.min(rect.left, window.innerWidth - rect.width - 4));
      setPanelStyle({
        position: 'fixed',
        top: rect.bottom + 6,
        left,
        width: rect.width,
        zIndex: 9999,
      });
    }
    setIsOpen((prev) => !prev);
  }, [isOpen, disabled]);

  useEffect(() => {
    if (isOpen && showSearch) {
      requestAnimationFrame(() => searchRef.current?.focus());
    }
    if (!isOpen) setSearch('');
  }, [isOpen, showSearch]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        containerRef.current && !containerRef.current.contains(event.target) &&
        !(panelRef.current && panelRef.current.contains(event.target))
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const handleScroll = (e) => {
      if (panelRef.current && panelRef.current.contains(e.target)) return;
      if (searchRef.current && document.activeElement === searchRef.current) return;
      setIsOpen(false);
    };
    window.addEventListener('scroll', handleScroll, true);
    return () => window.removeEventListener('scroll', handleScroll, true);
  }, [isOpen]);

  const handleSelect = useCallback((optionValue) => {
    if (multiple) {
      const currentValues = Array.isArray(value) ? value : [];
      const newValues = currentValues.includes(optionValue)
        ? currentValues.filter((v) => v !== optionValue)
        : [...currentValues, optionValue];
      onChange?.(newValues);
    } else {
      onChange?.(optionValue);
      setIsOpen(false);
    }
  }, [multiple, value, onChange]);

  const getDisplayValue = () => {
    if (multiple && Array.isArray(value) && value.length > 0) {
      if (value.length === 1) {
        const option = options.find((o) => o.value === value[0]);
        return option?.label || value[0];
      }
      return `${value.length} seleccionados`;
    }

    if (!multiple && value) {
      const option = options.find((o) => o.value === value);
      return option?.label || value;
    }

    return placeholder;
  };

  const isSelected = (optionValue) => {
    if (multiple) {
      return Array.isArray(value) && value.includes(optionValue);
    }
    return value === optionValue;
  };

  return (
    <div ref={containerRef} className="relative">
      {label && <label htmlFor={triggerId} className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{label}</label>}

      <button
        ref={buttonRef}
        id={triggerId}
        type="button"
        onClick={handleToggle}
        disabled={disabled}
        className={`
          flex items-center justify-between gap-2 w-full
          bg-white dark:bg-centhrix-card border border-slate-200 dark:border-slate-600
          hover:border-slate-300 dark:hover:border-slate-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500
          transition-all duration-200
          disabled:bg-slate-50 dark:disabled:bg-centhrix-card disabled:cursor-not-allowed disabled:hover:border-slate-200 dark:disabled:hover:border-slate-600
          ${compact ? 'px-2.5 py-1.5 rounded-lg text-xs' : 'px-4 py-2.5 rounded-xl text-sm'}
        `}
      >
        <div className="flex items-center gap-2">
          {Icon && <Icon className={compact ? 'w-3 h-3 text-slate-400' : 'w-4 h-4 text-slate-400'} />}
          <span className={value ? 'text-slate-800 dark:text-slate-100' : 'text-slate-400 dark:text-slate-500'}>{getDisplayValue()}</span>
        </div>
        <ChevronDown
          className={`text-slate-400 dark:text-slate-500 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''} ${compact ? 'w-3 h-3' : 'w-4 h-4'}`}
        />
      </button>

      {isOpen && createPortal(
        <div
          ref={panelRef}
          style={panelStyle}
          className={`
            bg-white dark:bg-centhrix-card border border-slate-200 dark:border-slate-600 shadow-lg dark:shadow-slate-900/50
            animate-fadeIn overflow-hidden
            ${compact ? 'rounded-lg' : 'rounded-xl'}
          `}
        >
          {showSearch && (
            <div className={`border-b border-slate-100 dark:border-slate-700 ${compact ? 'p-1.5' : 'p-2'}`}>
              <div className="relative flex items-center">
                <Search className={`absolute left-2.5 text-slate-400 dark:text-slate-500 pointer-events-none ${compact ? 'w-3 h-3' : 'w-3.5 h-3.5'}`} />
                <input
                  ref={searchRef}
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => e.key === 'Escape' && setIsOpen(false)}
                  placeholder="Buscar..."
                  className={`
                    w-full bg-slate-50 dark:bg-centhrix-surface border border-slate-200 dark:border-slate-600
                    rounded-lg text-slate-700 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500
                    focus:outline-none focus:ring-1 focus:ring-orange-500/40 focus:border-orange-400
                    transition-colors
                    ${compact ? 'pl-7 pr-6 py-1 text-xs' : 'pl-8 pr-7 py-1.5 text-xs'}
                  `}
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => { setSearch(''); searchRef.current?.focus(); }}
                    className="absolute right-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                  >
                    <X className={compact ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="max-h-52 overflow-y-auto">
            {filteredOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => handleSelect(option.value)}
                className={`
                  flex items-center justify-between w-full
                  text-slate-700 dark:text-slate-200 hover:bg-orange-50 dark:hover:bg-orange-500/10 hover:text-orange-600 dark:hover:text-orange-400
                  transition-colors duration-150
                  ${compact ? 'px-3 py-2 text-xs' : 'px-4 py-2.5 text-sm'}
                `}
              >
                <span>{option.label}</span>
                {isSelected(option.value) && <Check className={compact ? 'w-3 h-3 text-orange-500' : 'w-4 h-4 text-orange-500'} />}
              </button>
            ))}

            {filteredOptions.length === 0 && (
              <div className={`text-slate-500 dark:text-slate-400 text-center ${compact ? 'px-3 py-2 text-xs' : 'px-4 py-3 text-sm'}`}>
                {search ? 'Sin resultados' : 'No hay opciones'}
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

FilterDropdown.propTypes = {
  label: PropTypes.string,
  options: PropTypes.arrayOf(
    PropTypes.shape({
      value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
      label: PropTypes.string.isRequired,
    })
  ),
  value: PropTypes.oneOfType([PropTypes.string, PropTypes.number, PropTypes.array]),
  onChange: PropTypes.func,
  placeholder: PropTypes.string,
  multiple: PropTypes.bool,
  icon: PropTypes.elementType,
  compact: PropTypes.bool,
  searchable: PropTypes.bool,
  disabled: PropTypes.bool,
};

export default FilterDropdown;
