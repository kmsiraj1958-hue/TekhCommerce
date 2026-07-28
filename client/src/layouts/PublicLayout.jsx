import { Link, Outlet, useLocation } from 'react-router-dom';
import { useCart } from '../context/CartContext';

export default function PublicLayout() {
  const { totalQty } = useCart();
  const location = useLocation();

  const linkStyle = (path) => ({
    fontWeight: location.pathname.startsWith(path) ? 700 : 500,
    color: location.pathname.startsWith(path) ? '#008060' : '#44403c',
  });

  return (
    <div>
      <header style={{
        background: 'white',
        borderBottom: '1px solid #e7e5e4',
        position: 'sticky',
        top: 0,
        zIndex: 10,
      }}>
        <div className="container" style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 0',
          gap: 16,
          flexWrap: 'wrap',
        }}>
          <Link to="/" style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1 }}>
            <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', color: '#008060' }}>TekhShopify</span>
            <span style={{ fontSize: 11, color: '#78716c', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Online Store</span>
          </Link>
          <nav style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
            <Link to="/" style={linkStyle('/')}>Shop</Link>
            <Link to="/track" style={linkStyle('/track')}>Track Order</Link>
            <Link to="/tiktok" style={linkStyle('/tiktok')}>TikTok</Link>
            <Link to="/cart" className="btn btn-secondary btn-sm">
              Cart {totalQty > 0 ? `(${totalQty})` : ''}
            </Link>
            <Link to="/admin/login" className="btn btn-primary btn-sm">Admin</Link>
          </nav>
        </div>
      </header>
      <main style={{ padding: '32px 0 64px' }}>
        <Outlet />
      </main>
      <footer style={{ borderTop: '1px solid #e7e5e4', padding: '24px 0', color: '#78716c', textAlign: 'center' }}>
        <div className="container">© {new Date().getFullYear()} TekhShopify</div>
      </footer>
    </div>
  );
}
