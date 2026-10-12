import { Link, Outlet, useLocation } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { BRAND } from '../brand';

export default function PublicLayout() {
  const { totalQty } = useCart();
  const location = useLocation();

  function navClass(path) {
    const active = path === '/' ? location.pathname === '/' : location.pathname.startsWith(path);
    return `shop-link${active ? ' is-active' : ''}`;
  }

  return (
    <div>
      <header className="shop-header">
        <div className="container shop-header-inner">
          <Link to="/" className="shop-brand">
            <span className="shop-brand-title">{BRAND.name}</span>
            <span className="shop-brand-sub">{BRAND.storeSubtitle}</span>
          </Link>
          <nav className="shop-nav">
            <Link to="/" className={navClass('/')}>Shop</Link>
            <Link to="/track" className={navClass('/track')}>Track order</Link>
            <Link to="/tiktok" className={navClass('/tiktok')}>TikTok</Link>
            <Link to="/cart" className="btn btn-secondary btn-sm">
              Cart {totalQty > 0 ? `(${totalQty})` : ''}
            </Link>
            <Link to="/admin/login" className="btn btn-primary btn-sm">Admin</Link>
          </nav>
        </div>
      </header>
      <main className="shop-main">
        <Outlet />
      </main>
      <footer className="shop-footer">
        <div className="container">© {new Date().getFullYear()} {BRAND.name}</div>
      </footer>
    </div>
  );
}
