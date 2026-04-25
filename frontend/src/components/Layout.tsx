import { Outlet, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function Layout() {
  const { publicUser, signOut } = useAuth();

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <Link to="/" className="text-lg font-bold text-blue-600">
            RentalFinder
          </Link>
          {publicUser && (
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-600">{publicUser.name ?? publicUser.email}</span>
              <button
                onClick={signOut}
                className="text-sm text-gray-500 hover:text-gray-800 transition"
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </nav>
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
}
