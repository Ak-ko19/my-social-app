import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

// Day 30 (AUDIT_REPORT_2 N1): screens that only make sense with an account
// (settings, messages, creating things...) send a logged-out visitor to
// Login instead of showing a form whose every request would be refused.
// The page they wanted travels in router state -- never a URL parameter,
// so nobody can craft a link that bounces through Login to another site
// -- and Login returns there afterwards (see utils/returnPath.js). useAuth() is
// reactive, so a forced logout on one of these screens lands on Login too.
function RequireAuth({ children }) {
  const { token } = useAuth();
  const location = useLocation();
  if (!token) {
    return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />;
  }
  return children;
}

export default RequireAuth;
