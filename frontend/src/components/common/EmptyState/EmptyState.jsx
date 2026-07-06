import PropTypes from 'prop-types';

const EmptyState = ({ icon: Icon, title, description, action }) => {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center bg-gray-50 dark:bg-centhrix-card/50 border border-gray-100 dark:border-slate-700 rounded-xl border-dashed">
      <div className="w-12 h-12 bg-white dark:bg-centhrix-surface rounded-full flex items-center justify-center shadow-sm mb-4">
        {Icon && <Icon className="w-6 h-6 text-slate-400 dark:text-slate-500" />}
      </div>

      <h3 className="text-lg font-medium text-slate-800 dark:text-slate-100 mb-1">{title}</h3>

      {description && <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm mb-6">{description}</p>}

      {action && <div>{action}</div>}
    </div>
  );
};

EmptyState.propTypes = {
  icon: PropTypes.elementType,
  title: PropTypes.string.isRequired,
  description: PropTypes.string,
  action: PropTypes.node,
};

export default EmptyState;
