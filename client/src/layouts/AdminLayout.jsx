import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const nav = [
  { to: '/admin', label: 'Dashboard', end: true },
  { to: '/admin/orders', label: 'Orders' },
  { to: '/admin/products', label: 'Products' },
  { to: '/admin/inventory', label: 'Inventory' },
  { to: '/admin/reports', label: 'Reports' },
  { to: '/admin/finance', label: 'Finance' },
];

export default function AdminLayout() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/admin/login');
  }

  return (
    <div className="admin-shell" style={{ minHeight: '100vh', display: 'grid', gridTemplateColumns: '260px 1fr' }}>
      <aside className="admin-sidebar admin-sidebar--shopify">
        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 24 }}>TekhShopify Admin</div>
        {nav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            style={({ isActive }) => ({
              padding: '12px 14px',
              borderRadius: 12,
              color: 'white',
              background: isActive ? 'rgba(0, 168, 132, 0.38)' : 'transparent',
              fontWeight: isActive ? 700 : 500,
            })}
          >
            {item.label}
          </NavLink>
        ))}
        <div style={{ marginTop: 'auto', display: 'grid', gap: 8 }}>
          <Link to="/" className="btn btn-secondary btn-sm">View Store</Link>
          <button type="button" className="btn btn-danger btn-sm" onClick={handleLogout}>Logout</button>
        </div>
      </aside>
      <main style={{ padding: 28 }}>
        <Outlet />
      </main>
    </div>
  );
}
