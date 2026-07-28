import { Link } from 'react-router-dom';
import { imageUrl } from '../api/client';
import { useCart } from '../context/CartContext';

export default function CartPage() {
  const { items, totalQty, totalPrice, updateQty, removeItem, clear } = useCart();

  if (!items.length) {
    return (
      <div className="container empty card" style={{ padding: 48 }}>
        <h2>Your cart is empty</h2>
        <p>Add products from the shop to get started.</p>
        <Link to="/" className="btn btn-primary" style={{ marginTop: 16 }}>Browse Products</Link>
      </div>
    );
  }

  return (
    <div className="container">
      <h1 className="page-title">Your Cart</h1>
      <p className="page-subtitle">{totalQty} item(s) in cart</p>

      <div style={{ display: 'grid', gap: 16 }}>
        {items.map((item) => (
          <div key={item.code} className="card" style={{ padding: 16, display: 'grid', gridTemplateColumns: '96px 1fr auto', gap: 16, alignItems: 'center' }}>
            <img src={imageUrl(item.image)} alt={item.name} style={{ width: 96, height: 96, objectFit: 'cover', borderRadius: 12 }} />
            <div>
              <div style={{ fontWeight: 700 }}>{item.name}</div>
              <div style={{ color: '#78716c' }}>{item.code}</div>
              <div style={{ marginTop: 8 }}>Rs {Number(item.price).toLocaleString()}</div>
              <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center' }}>
                <label className="label" style={{ margin: 0 }}>Qty</label>
                <input
                  className="input"
                  style={{ width: 80 }}
                  type="number"
                  min="1"
                  value={item.qty}
                  onChange={(e) => updateQty(item.code, Number(e.target.value) || 1)}
                />
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => removeItem(item.code)}>Remove</button>
              </div>
            </div>
            <strong>Rs {(item.qty * item.price).toLocaleString()}</strong>
          </div>
        ))}
      </div>

      <div className="card" style={{ marginTop: 24, padding: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ color: '#78716c' }}>Total</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>Rs {totalPrice.toLocaleString()}</div>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <button type="button" className="btn btn-secondary" onClick={clear}>Clear Cart</button>
          <Link to="/checkout" className="btn btn-primary">Checkout</Link>
        </div>
      </div>
    </div>
  );
}
