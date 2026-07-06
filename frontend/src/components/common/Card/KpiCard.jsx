import PropTypes from 'prop-types';

const KpiCard = ({
  title,
  value,
  change,
  subtitle,
  positive = true,
  icon: Icon,
  iconBg = 'bg-blue-100 dark:bg-blue-900/30',
  iconColor = 'text-blue-600 dark:text-blue-400',
  onClick,
  loading = false,
}) => {
  if (loading) {
    return (
      <div
        aria-busy="true"
        aria-label="Cargando indicador"
        className="
        bg-white dark:bg-centhrix-card
        rounded-2xl p-5
        shadow-sm border border-gray-100 dark:border-slate-700
        animate-pulse
      "
      >
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="h-4 bg-gray-200 dark:bg-centhrix-surface rounded w-24 mb-2" />
            <div className="h-8 bg-gray-200 dark:bg-centhrix-surface rounded w-32 mb-2" />
            <div className="h-3 bg-gray-200 dark:bg-centhrix-surface rounded w-28" />
          </div>
          <div className="w-12 h-12 bg-gray-200 dark:bg-centhrix-surface rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={onClick}
      className={`
        bg-white dark:bg-centhrix-card
        rounded-2xl p-5
        shadow-sm border border-gray-100 dark:border-slate-700
        hover:shadow-md dark:hover:shadow-lg
        transition-shadow duration-300
        ${onClick ? 'cursor-pointer' : ''}
      `}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">{title}</p>
          <p className="text-3xl font-bold text-slate-800 dark:text-slate-100">{value}</p>
          {subtitle && <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">{subtitle}</p>}
          {change && (
            <p
              className={`
                text-sm mt-2 font-medium
                ${positive ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}
              `}
            >
              {change}
            </p>
          )}
        </div>

        {Icon && (
          <div className={`p-3 rounded-xl ${iconBg}`}>
            <Icon className={`w-6 h-6 ${iconColor}`} />
          </div>
        )}
      </div>
    </div>
  );
};

KpiCard.propTypes = {
  title: PropTypes.string.isRequired,
  value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  change: PropTypes.string,
  subtitle: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  positive: PropTypes.bool,
  icon: PropTypes.elementType,
  iconBg: PropTypes.string,
  iconColor: PropTypes.string,
  onClick: PropTypes.func,
  loading: PropTypes.bool,
};

export default KpiCard;
