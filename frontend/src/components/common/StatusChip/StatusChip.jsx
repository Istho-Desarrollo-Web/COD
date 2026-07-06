import PropTypes from 'prop-types';

const STATUS_CONFIG = {
  activo: { bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-400', label: 'activo' },
  inactivo: { bg: 'bg-gray-100 dark:bg-centhrix-surface', text: 'text-gray-700 dark:text-slate-300', label: 'inactivo' },

  saludable: { bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-400', label: 'saludable' },
  atencion: { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-400', label: 'atención' },
  critico: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-400', label: 'crítico' },

  vigente: { bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-400', label: 'vigente' },
  por_vencer: { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-400', label: 'por vencer' },
  vencido: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-400', label: 'vencido' },
  sin_vigencia: { bg: 'bg-gray-100 dark:bg-centhrix-surface', text: 'text-gray-700 dark:text-slate-300', label: 'sin vigencia' },

  borrador: { bg: 'bg-gray-100 dark:bg-centhrix-surface', text: 'text-gray-700 dark:text-slate-300', label: 'borrador' },
  cotizando: { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-400', label: 'cotizando' },
  en_aprobacion: { bg: 'bg-violet-100 dark:bg-violet-900/30', text: 'text-violet-700 dark:text-violet-400', label: 'en aprobación' },
  aprobada: { bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-400', label: 'aprobada' },
  rechazada: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-400', label: 'rechazada' },
  confirmada: { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-400', label: 'confirmada' },
  cerrada: { bg: 'bg-gray-100 dark:bg-centhrix-surface', text: 'text-gray-700 dark:text-slate-300', label: 'cerrada' },
  cancelada: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-400', label: 'cancelada' },

  pendiente: { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-400', label: 'pendiente' },
  aprobado: { bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-400', label: 'aprobado' },
  rechazado: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-400', label: 'rechazado' },
};

const StatusChip = ({ status, customLabel, size = 'md' }) => {
  const config = STATUS_CONFIG[status] || {
    bg: 'bg-gray-100 dark:bg-centhrix-surface',
    text: 'text-gray-700 dark:text-slate-300',
    label: status,
  };

  const sizeClasses = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-2.5 py-1 text-xs',
    lg: 'px-3 py-1.5 text-sm',
  };

  return (
    <span
      className={`
        inline-flex items-center rounded-full font-medium
        ${config.bg} ${config.text} ${sizeClasses[size]}
      `}
    >
      {customLabel || config.label}
    </span>
  );
};

StatusChip.propTypes = {
  status: PropTypes.string.isRequired,
  customLabel: PropTypes.string,
  size: PropTypes.oneOf(['sm', 'md', 'lg']),
};

export default StatusChip;
