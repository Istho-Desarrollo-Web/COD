import { useState, useRef, useEffect, useCallback, useId } from 'react';
import PropTypes from 'prop-types';
import { DayPicker } from 'react-day-picker';
import { es } from 'react-day-picker/locale';
import { Calendar, ChevronDown, ChevronLeft, ChevronRight, X } from 'lucide-react';

const MONTHS_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

const YEAR_START = 1950;
const YEAR_END = new Date().getFullYear() + 15;
const ALL_YEARS = Array.from({ length: YEAR_END - YEAR_START + 1 }, (_, i) => YEAR_START + i);

const parseDate = (str) => {
  if (!str) return undefined;
  const d = new Date(str + 'T00:00:00');
  return isNaN(d.getTime()) ? undefined : d;
};

const formatToIso = (date) => {
  if (!date) return '';
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
};

const formatDisplay = (date) => {
  if (!date) return null;
  return [
    String(date.getDate()).padStart(2, '0'),
    String(date.getMonth() + 1).padStart(2, '0'),
    date.getFullYear(),
  ].join('/');
};

const NavBtn = ({ onClick, children, className = '' }) => (
  <button
    type="button"
    onClick={onClick}
    className={`p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-centhrix-surface text-slate-500 dark:text-slate-400 transition-colors ${className}`}
  >
    {children}
  </button>
);

const DatePicker = ({
  value,
  onChange,
  placeholder = 'dd/mm/aaaa',
  label,
  clearable = true,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [panelStyle, setPanelStyle] = useState({});
  const [view, setView] = useState('days');
  const [displayMonth, setDisplayMonth] = useState(() => parseDate(value) || new Date());

  const ref = useRef(null);
  const buttonRef = useRef(null);
  const panelRef = useRef(null);
  const yearsRef = useRef(null);
  const triggerId = useId();
  const selected = parseDate(value);

  const currentYear = displayMonth.getFullYear();
  const currentMonth = displayMonth.getMonth();

  useEffect(() => {
    const d = parseDate(value);
    if (d) setDisplayMonth(d);
  }, [value]);

  useEffect(() => {
    if (!isOpen) setView('days');
  }, [isOpen]);

  useEffect(() => {
    if (view === 'years' && yearsRef.current) {
      const btn = yearsRef.current.querySelector('[data-current="true"]');
      if (btn) btn.scrollIntoView({ block: 'center' });
    }
  }, [view]);

  const handleToggle = useCallback(() => {
    if (!isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const PANEL_W = 288;
      const calendarHeight = 360;
      const spaceBelow = window.innerHeight - rect.bottom;
      const top = spaceBelow >= calendarHeight ? rect.bottom + 6 : rect.top - calendarHeight - 6;
      const left = Math.max(4, Math.min(rect.left, window.innerWidth - PANEL_W - 4));
      setPanelStyle({ position: 'fixed', top, left, zIndex: 9999 });
    }
    setIsOpen((v) => !v);
  }, [isOpen]);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const handleScroll = (e) => {
      if (panelRef.current && panelRef.current.contains(e.target)) return;
      setIsOpen(false);
    };
    window.addEventListener('scroll', handleScroll, true);
    return () => window.removeEventListener('scroll', handleScroll, true);
  }, [isOpen]);

  const handleSelect = (date) => {
    onChange?.(formatToIso(date) || '');
    if (date) setIsOpen(false);
  };

  const handleClear = (e) => {
    e.stopPropagation();
    onChange?.('');
  };

  const prevMonth = () => setDisplayMonth(new Date(currentYear, currentMonth - 1));
  const nextMonth = () => setDisplayMonth(new Date(currentYear, currentMonth + 1));

  const btnCaption = 'px-2 py-1 rounded-lg text-sm font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-centhrix-surface transition-colors';

  return (
    <div ref={ref} className="relative">
      {label && (
        <label htmlFor={triggerId} className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
          {label}
        </label>
      )}

      <button
        ref={buttonRef}
        id={triggerId}
        type="button"
        onClick={handleToggle}
        className="flex items-center justify-between gap-2 w-full bg-white dark:bg-centhrix-surface border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:border-slate-300 dark:hover:border-slate-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all duration-200 px-4 py-2.5 rounded-xl text-sm"
      >
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
          <span className={selected ? 'text-slate-800 dark:text-slate-100' : 'text-slate-400'}>
            {selected ? formatDisplay(selected) : placeholder}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {clearable && selected && (
            <span
              role="button"
              tabIndex={-1}
              onClick={handleClear}
              className="text-slate-400 hover:text-red-500 transition-colors p-0.5 rounded"
            >
              <X className="w-3.5 h-3.5" />
            </span>
          )}
          <ChevronDown
            className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          />
        </div>
      </button>

      {isOpen && (
        <div
          ref={panelRef}
          style={panelStyle}
          className="bg-white dark:bg-centhrix-card border border-slate-200 dark:border-slate-700 rounded-2xl shadow-xl animate-fadeIn overflow-hidden w-72"
        >
          {view === 'days' && (
            <>
              <div className="flex items-center justify-between px-3 pt-3 pb-1">
                <NavBtn onClick={prevMonth}>
                  <ChevronLeft className="w-4 h-4" />
                </NavBtn>
                <div className="flex items-center gap-0.5">
                  <button type="button" onClick={() => setView('months')} className={btnCaption}>
                    {MONTHS_ES[currentMonth]}
                  </button>
                  <button type="button" onClick={() => setView('years')} className={btnCaption}>
                    {currentYear}
                  </button>
                </div>
                <NavBtn onClick={nextMonth}>
                  <ChevronRight className="w-4 h-4" />
                </NavBtn>
              </div>
              <DayPicker
                mode="single"
                selected={selected}
                onSelect={handleSelect}
                month={displayMonth}
                onMonthChange={setDisplayMonth}
                locale={es}
                classNames={{
                  root: 'px-3 pb-3',
                  months: '',
                  month: '',
                  month_caption: 'hidden',
                  caption_label: 'hidden',
                  nav: 'hidden',
                  month_grid: 'w-full border-collapse',
                  weekdays: '',
                  weekday: 'w-9 h-8 text-center text-xs font-medium text-slate-400 dark:text-slate-500',
                  weeks: '',
                  week: '',
                  day: 'p-0 text-center',
                  day_button: 'w-9 h-9 rounded-lg text-sm text-slate-700 dark:text-slate-200 hover:bg-orange-50 dark:hover:bg-orange-900/20 hover:text-orange-600 dark:hover:text-orange-400 transition-colors duration-150 mx-auto',
                  selected: '[&>button]:bg-orange-500 [&>button]:text-white [&>button]:hover:bg-orange-600',
                  today: '[&>button]:font-bold [&>button]:ring-1 [&>button]:ring-orange-400',
                  outside: '[&>button]:text-slate-300 dark:[&>button]:text-slate-600 [&>button]:hover:bg-transparent',
                  disabled: '[&>button]:opacity-30 [&>button]:cursor-not-allowed [&>button]:hover:bg-transparent',
                }}
              />
            </>
          )}

          {view === 'months' && (
            <div className="p-3">
              <div className="flex items-center justify-between mb-3">
                <button type="button" onClick={() => setView('days')} className={`flex items-center gap-1 ${btnCaption}`}>
                  <ChevronLeft className="w-3.5 h-3.5" />
                  Volver
                </button>
                <button type="button" onClick={() => setView('years')} className={btnCaption}>
                  {currentYear}
                </button>
              </div>
              <div className="grid grid-cols-3 gap-1">
                {MONTHS_ES.map((m, i) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => { setDisplayMonth(new Date(currentYear, i)); setView('days'); }}
                    className={`py-2 rounded-lg text-sm transition-colors ${
                      i === currentMonth
                        ? 'bg-orange-500 text-white font-semibold'
                        : 'text-slate-700 dark:text-slate-200 hover:bg-orange-50 dark:hover:bg-orange-900/20 hover:text-orange-600 dark:hover:text-orange-400'
                    }`}
                  >
                    {m.slice(0, 3)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {view === 'years' && (
            <div className="p-3">
              <div className="flex items-center justify-between mb-3">
                <button type="button" onClick={() => setView('months')} className={`flex items-center gap-1 ${btnCaption}`}>
                  <ChevronLeft className="w-3.5 h-3.5" />
                  Volver
                </button>
                <span className="text-sm font-semibold text-slate-500 dark:text-slate-400">Seleccionar año</span>
              </div>
              <div ref={yearsRef} className="grid grid-cols-4 gap-1 max-h-44 overflow-y-auto">
                {ALL_YEARS.map((y) => (
                  <button
                    key={y}
                    type="button"
                    data-current={y === currentYear ? 'true' : undefined}
                    onClick={() => { setDisplayMonth(new Date(y, currentMonth)); setView('months'); }}
                    className={`py-2 rounded-lg text-sm transition-colors ${
                      y === currentYear
                        ? 'bg-orange-500 text-white font-semibold'
                        : 'text-slate-700 dark:text-slate-200 hover:bg-orange-50 dark:hover:bg-orange-900/20 hover:text-orange-600 dark:hover:text-orange-400'
                    }`}
                  >
                    {y}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

DatePicker.propTypes = {
  value: PropTypes.string,
  onChange: PropTypes.func,
  placeholder: PropTypes.string,
  label: PropTypes.string,
  clearable: PropTypes.bool,
};

export default DatePicker;
