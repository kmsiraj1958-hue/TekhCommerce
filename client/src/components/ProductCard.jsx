import { Link } from 'react-router-dom';
import { imageUrl } from '../api/client';

export default function ProductCard({ product, onAdd }) {
  return (
    <article className="card" style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <Link to={`/product/${product.code}`}>
        <div style={{ aspectRatio: '1', background: '#f5f5f4', overflow: 'hidden' }}>
          <img
            src={imageUrl(product.image)}
            alt={product.name}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        </div>
      </Link>
      <div style={{ padding: 16, display: 'grid', gap: 10, flex: 1 }}>
        <div style={{ fontSize: 12, color: '#78716c', textTransform: 'uppercase' }}>{product.category}</div>
        <Link to={`/product/${product.code}`} style={{ fontWeight: 700, fontSize: 18, lineHeight: 1.3 }}>
          {product.name}
        </Link>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto' }}>
          <strong style={{ fontSize: 20, color: '#008060' }}>Rs {Number(product.price).toLocaleString()}</strong>
          <span style={{ fontSize: 13, color: '#78716c' }}>Stock: {product.live_stock ?? product.opening_stock ?? 0}</span>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => onAdd(product)}>
          Add to Cart
        </button>
      </div>
    </article>
  );
}
