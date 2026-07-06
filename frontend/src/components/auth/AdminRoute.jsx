import { Navigate } from 'react-router-dom';
import PropTypes from 'prop-types';
import { useAuth } from '../../context/AuthContext';

export function AdminRoute({ children }) {
  const { isAdmin } = useAuth();
  if (!isAdmin) return <Navigate to="/inicio" replace />;
  return children;
}

AdminRoute.propTypes = { children: PropTypes.node.isRequired };
