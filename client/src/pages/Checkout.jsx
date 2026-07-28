import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useCart } from '../context/CartContext';

export default function Checkout() {
  const { items, totalPrice, clear } = useCart();
  const [form, setForm] = useState({ name: '', phone: '', address: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!items.length) {
    return (
      <div className="container empty card" style={{ padding: 48 }}>
        <h2>Nothing to checkout</h2>
        <Link to="/" className="btn btn-primary" style={{ marginTop: 16 }}>Back to Shop</Link>
      </div>
    );
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await api.checkout({
        ...form,
        items: items.map((i) => ({ code: i.code, name: i.name, price: i.price, qty: i.qty })),
      });
      clear();
      window.location.href = data.waUrl;
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container" style={{ maxWidth: 720 }}>
      <h1 className="page-title">Checkout</h1>
      <p className="page-subtitle">Fill your details and confirm the order on WhatsApp.</p>

      {error && <div className="alert alert-error">{error}</div>}

      <form className="card" style={{ padding: 24 }} onSubmit={handleSubmit}>
        <div className="field">
          <label className="label">Full Name</label>
          <input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div className="field">
          <label className="label">Phone Number</label>
          <input className="input" required value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="03XXXXXXXXX" />
        </div>
        <div className="field">
          <label className="label">Delivery Address</label>
          <textarea className="textarea" rows="4" required value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
        </div>

        <div style={{ background: '#f5f5f4', borderRadius: 12, padding: 16, marginBottom: 20 }}>
          <div style={{ color: '#78716c' }}>Order total</div>
          <div style={{ fontSize: 24, fontWeight: 700 }}>Rs {totalPrice.toLocaleString()}</div>
        </div>

        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? 'Placing order...' : 'Place Order & Open WhatsApp'}
        </button>
      </form>
    </div>
  );
}
