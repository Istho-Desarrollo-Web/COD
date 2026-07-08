import { forwardRef, useId } from 'react';
import { AlertCircle } from 'lucide-react';
import PropTypes from 'prop-types';

const Input = forwardRef(
  ({ label, error, hint, icon: Icon, className = '', containerClassName = '', type = 'text', disabled, id: externalId, ...props }, ref) => {
    const generatedId = useId();
    const id = externalId ?? generatedId;
    const errorId = `${id}-error`;
    const hintId = `${id}-hint`;

    return (
      <div className={`w-full ${containerClassName}`}>
        {label && (
          <label htmlFor={id} className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
            {label}
            {props.required && (
              <span aria-hidden="true" className="text-red-500 ml-0.5">
                *
              </span>
            )}
          </label>
        )}

        {hint && (
          <p className="text-slate-500 dark:text-slate-400 text-xs mt-0.5 mb-1" id={hintId}>
            {hint}
          </p>
        )}

        <div className="relative">
          {Icon && <Icon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" aria-hidden="true" />}

          <input
            ref={ref}
            id={id}
            type={type}
            disabled={disabled}
            aria-invalid={error ? 'true' : undefined}
            aria-describedby={[hint && hintId, error && errorId].filter(Boolean).join(' ') || undefined}
            className={`
            w-full py-2.5 border rounded-xl text-sm transition-colors
            focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500
            ${Icon ? 'pl-10' : 'pl-4'} pr-4
            ${
              error
                ? 'border-red-300 dark:border-red-500/60 bg-red-50 dark:bg-red-900/20 text-red-900 dark:text-red-200 placeholder-red-300 dark:placeholder-red-400/60'
                : 'border-slate-200 dark:border-slate-600 bg-white dark:bg-centhrix-surface text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500'
            }
            ${disabled ? 'bg-slate-50 dark:bg-centhrix-card text-slate-500 dark:text-slate-500 cursor-not-allowed' : ''}
            ${className}
          `}
            {...props}
          />
        </div>

        {error && (
          <p id={errorId} role="alert" className="text-xs text-red-500 mt-1 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" aria-hidden="true" />
            {error}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';

Input.propTypes = {
  label: PropTypes.string,
  error: PropTypes.string,
  hint: PropTypes.string,
  icon: PropTypes.elementType,
  className: PropTypes.string,
  containerClassName: PropTypes.string,
  type: PropTypes.string,
  disabled: PropTypes.bool,
  id: PropTypes.string,
};

export default Input;
