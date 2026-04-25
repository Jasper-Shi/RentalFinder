import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, publicUser, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!session) return <Navigate to="/login" replace />;

  if (!publicUser) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-red-600 text-sm">
          Failed to load your account. Please refresh or sign out and back in.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
