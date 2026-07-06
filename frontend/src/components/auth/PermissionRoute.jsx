import { Navigate } from 'react-router-dom';
import PropTypes from 'prop-types';
import { useAuth } from '../../context/AuthContext';

export function PermissionRoute({ modulo, accion, children }) {
  const { tienePermiso } = useAuth();
  if (!tienePermiso(modulo, accion)) return <Navigate to="/inicio" replace />;
  return children;
}

PermissionRoute.propTypes = {
  modulo: PropTypes.string.isRequired,
  accion: PropTypes.string.isRequired,
  children: PropTypes.node.isRequired,
};
