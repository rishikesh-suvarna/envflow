import { getStoredToken, setAuthToken } from '@/lib/api';
import { Link, Outlet, useNavigate } from 'react-router-dom';

export default function App() {
  const navigate = useNavigate();
  const token = getStoredToken();

  function logout() {
    setAuthToken(null);
    navigate('/login');
  }

  return (
    <div className="min-h-screen">
      <header className="border-b">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/" className="font-semibold">
            Secrets Manager
          </Link>
          <nav className="flex items-center gap-3">
            <Link to="/">Projects</Link>
            {!token ? (
              <>
                <Link to="/login">Login</Link>
                <Link to="/register">Register</Link>
              </>
            ) : (
              <button className="text-red-600" onClick={logout}>
                Logout
              </button>
            )}
          </nav>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
