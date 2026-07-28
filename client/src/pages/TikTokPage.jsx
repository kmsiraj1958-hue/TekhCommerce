import { useEffect, useState } from 'react';
import { api } from '../api/client';
import ProductCard from '../components/ProductCard';

export default function TikTokPage() {
  const [products, setProducts] = useState([]);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({ customer_name: '', phone: '', address: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.getProducts().then((data) => setProducts(data.products || []));
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!selected) return;
    setError('');
    setLoading(true);
    try {
      const data = await api.tiktokOrder({ code: selected.code, ...form });
      window.location.href = data.waUrl;
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container">
      <h1 className="page-title">TikTok Orders</h1>
      <p className="page-subtitle">Quick order flow for TikTok customers.</p>

      <div className="grid-products" style={{ marginBottom: 28 }}>
        {products.map((product) => (
          <div key={product.code} onClick={() => setSelected(product)} style={{ cursor: 'pointer', outline: selected?.code === product.code ? '3px solid #0f766e' : 'none', borderRadius: 18 }}>
            <ProductCard product={product} onAdd={() => setSelected(product)} />
          </div>
        ))}
      </div>

      {selected && (
        <form className="card" style={{ padding: 24, maxWidth: 640 }} onSubmit={handleSubmit}>
          <h2 style={{ marginTop: 0 }}>Order: {selected.name}</h2>
          {error && <div className="alert alert-error">{error}</div>}
          <div className="field">
            <label className="label">Customer Name</label>
            <input className="input" required value={form.customer_name} onChange={(e) => setForm({ ...form, customer_name: e.target.value })} />
          </div>
          <div className="field">
            <label className="label">Phone</label>
            <input className="input" required value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div className="field">
            <label className="label">Address</label>
            <textarea className="textarea" rows="3" required value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </div>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Submitting...' : 'Submit TikTok Order'}
          </button>
        </form>
      )}
    </div>
  );
}
