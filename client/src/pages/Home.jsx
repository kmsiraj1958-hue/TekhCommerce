import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import ProductCard from '../components/ProductCard';
import { useCart } from '../context/CartContext';

export default function Home() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const { addItem } = useCart();

  useEffect(() => {
    api.getProducts()
      .then((data) => {
        setProducts(data.products || []);
        setCategories(['All', ...(data.categories || [])]);
      })
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    return products.filter((p) => {
      const matchCategory = category === 'All' || p.category === category;
      const q = search.toLowerCase();
      const matchSearch = !q || p.name?.toLowerCase().includes(q) || p.code?.toLowerCase().includes(q);
      return matchCategory && matchSearch;
    });
  }, [products, search, category]);

  function handleAdd(product) {
    addItem(product);
    setMessage(`${product.name} added to cart`);
    setTimeout(() => setMessage(''), 2000);
  }

  return (
    <div className="container">
      <section style={{
        background: 'linear-gradient(135deg, #008060, #004c3f)',
        color: 'white',
        borderRadius: 24,
        padding: '40px 28px',
        marginBottom: 28,
      }}>
        <h1 className="page-title" style={{ color: 'white' }}>TekhShopify Store</h1>
        <p className="page-subtitle" style={{ color: 'rgba(255,255,255,0.85)', marginBottom: 0 }}>
          Fashion, lifestyle &amp; more — order online and confirm on WhatsApp.
        </p>
      </section>

      {message && <div className="alert alert-success">{message}</div>}

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 24 }}>
        <input
          className="input"
          style={{ maxWidth: 320, flex: 1 }}
          placeholder="Search by name or code..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="select" style={{ maxWidth: 220 }} value={category} onChange={(e) => setCategory(e.target.value)}>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {loading ? <div className="empty">Loading products...</div> : null}
      {!loading && filtered.length === 0 ? <div className="empty">No products found.</div> : null}

      <div className="grid-products">
        {filtered.map((product) => (
          <ProductCard key={product.code} product={product} onAdd={handleAdd} />
        ))}
      </div>
    </div>
  );
}
