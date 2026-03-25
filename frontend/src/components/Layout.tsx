import { Outlet, Link } from "react-router-dom";

export function Layout() {
  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-6">
        <Link to="/" className="text-lg font-bold text-gray-900">
          Etsy-Veeqo Sync
        </Link>
        <Link to="/" className="text-sm text-gray-600 hover:text-gray-900">
          Dashboard
        </Link>
        <Link to="/add" className="text-sm text-gray-600 hover:text-gray-900">
          Add Shop
        </Link>
      </nav>
      <main className="max-w-6xl mx-auto px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
}
