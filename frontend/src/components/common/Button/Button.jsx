import PropTypes from 'prop-types';

const Button = ({
  children,
  variant = 'primary',
  size = 'md',
  icon: Icon,
  iconPosition = 'left',
  loading = false,
  disabled = false,
  fullWidth = false,
  type = 'button',
  onClick,
  className = '',
  title,
  ariaLabel,
  id,
}) => {
  const baseClasses = `
    inline-flex items-center justify-center gap-2
    font-medium rounded-xl
    transition-all duration-200
    focus:outline-none focus:ring-2 focus:ring-offset-2
    disabled:opacity-50 disabled:cursor-not-allowed
  `;

  const variantClasses = {
    primary: `
      bg-orange-500 text-white
      hover:bg-orange-600
      focus:ring-orange-500
    `,
    secondary: `
      bg-slate-800 text-white
      hover:bg-slate-700
      focus:ring-slate-500
    `,
    outline: `
      bg-white dark:bg-centhrix-card text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-600
      hover:bg-slate-50 dark:hover:bg-centhrix-surface hover:border-slate-300 dark:hover:border-slate-500
      focus:ring-slate-500
    `,
    ghost: `
      bg-transparent text-slate-600 dark:text-slate-300
      hover:bg-slate-100 dark:hover:bg-centhrix-surface hover:text-slate-800 dark:hover:text-slate-100
      focus:ring-slate-500
    `,
    danger: `
      bg-red-500 text-white
      hover:bg-red-600
      focus:ring-red-500
    `,
    success: `
      bg-emerald-500 text-white
      hover:bg-emerald-600
      focus:ring-emerald-500
    `,
  };

  const sizeClasses = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2.5 text-sm',
    lg: 'px-6 py-3 text-base',
  };

  const iconSizes = {
    sm: 'w-4 h-4',
    md: 'w-4 h-4',
    lg: 'w-5 h-5',
  };

  return (
    <button
      id={id}
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      title={title}
      aria-label={loading ? 'Cargando, por favor espere' : (ariaLabel ?? title)}
      aria-busy={loading || undefined}
      aria-live="polite"
      className={`
        ${baseClasses}
        ${variantClasses[variant]}
        ${sizeClasses[size]}
        ${fullWidth ? 'w-full' : ''}
        ${className}
      `}
    >
      {loading ? (
        <>
          <svg
            className={`animate-spin ${iconSizes[size]}`}
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          <span>Cargando...</span>
        </>
      ) : (
        <>
          {Icon && iconPosition === 'left' && <Icon className={iconSizes[size]} />}
          {children}
          {Icon && iconPosition === 'right' && <Icon className={iconSizes[size]} />}
        </>
      )}
    </button>
  );
};

Button.propTypes = {
  children: PropTypes.node,
  variant: PropTypes.oneOf(['primary', 'secondary', 'outline', 'ghost', 'danger', 'success']),
  size: PropTypes.oneOf(['sm', 'md', 'lg']),
  icon: PropTypes.elementType,
  iconPosition: PropTypes.oneOf(['left', 'right']),
  loading: PropTypes.bool,
  disabled: PropTypes.bool,
  fullWidth: PropTypes.bool,
  type: PropTypes.oneOf(['button', 'submit', 'reset']),
  onClick: PropTypes.func,
  className: PropTypes.string,
  title: PropTypes.string,
  ariaLabel: PropTypes.string,
};

export default Button;
