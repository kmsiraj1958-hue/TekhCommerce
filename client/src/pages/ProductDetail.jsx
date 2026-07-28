import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, imageUrl } from '../api/client';
import { useCart } from '../context/CartContext';

export default function ProductDetail() {
  const { code } = useParams();
  const [product, setProduct] = useState(null);
  const [qty, setQty] = useState(1);
  const { addItem } = useCart();

  useEffect(() => {
    api.getProduct(code).then((data) => setProduct(data.product));
  }, [code]);

  if (!product) return <div className="container empty">Loading product...</div>;

  return (
    <div className="container">
      <Link to="/" style={{ color: '#78716c', display: 'inline-block', marginBottom: 16 }}>← Back to shop</Link>
      <div className="card" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 24, padding: 24 }}>
        <div style={{ background: '#f5f5f4', borderRadius: 16, overflow: 'hidden' }}>
          <img src={imageUrl(product.image)} alt={product.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>
        <div>
          <div style={{ color: '#78716c', marginBottom: 8 }}>{product.category} · {product.code}</div>
          <h1 className="page-title">{product.name}</h1>
          <p style={{ fontSize: 28, fontWeight: 700, color: '#008060' }}>Rs {Number(product.price).toLocaleString()}</p>
          <p style={{ color: '#78716c' }}>Available stock: {product.live_stock ?? product.opening_stock ?? 0}</p>

          <div className="field" style={{ maxWidth: 120 }}>
            <label className="label">Quantity</label>
            <input className="input" type="number" min="1" value={qty} onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))} />
          </div>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-primary" onClick={() => {
              for (let i = 0; i < qty; i += 1) addItem(product);
            }}>
              Add to Cart
            </button>
            <Link to="/checkout" className="btn btn-secondary">Go to Checkout</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
