import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { BRAND } from '../brand';

const nav = [
  { to: '/admin', label: 'Dashboard', end: true },
  { to: '/admin/orders', label: 'Orders' },
  { to: '/admin/products', label: 'Products' },
  { to: '/admin/inventory', label: 'Inventory' },
  { to: '/admin/manufacturing', label: 'Manufacturing' },
  { to: '/admin/reports', label: 'Reports' },
  { to: '/admin/finance', label: 'Accounts' },
  { to: '/admin/invoices', label: 'Documents' },
  { to: '/admin/courier', label: 'Courier' },
  { to: '/admin/onboarding', label: 'Onboarding' },
  { to: '/admin/settings', label: 'Appearance' },
];

export default function AdminLayout() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/admin/login');
  }

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-brand">
          <div className="admin-brand-title">{BRAND.name}</div>
          <div className="admin-brand-sub">{BRAND.wordmark}</div>
        </div>
        {nav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => `admin-nav-link${isActive ? ' active' : ''}`}
          >
            {item.label}
          </NavLink>
        ))}
        <div className="admin-footer-actions">
          <Link to="/" className="btn btn-secondary btn-sm">View store</Link>
          <button type="button" className="btn btn-danger btn-sm" onClick={handleLogout}>Logout</button>
        </div>
      </aside>
      <main className="admin-main">
        <Outlet />
      </main>
    </div>
  );
}
