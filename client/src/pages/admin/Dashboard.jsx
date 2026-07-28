import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import StatCard from '../../components/StatCard';

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    api.getDashboard().then(setStats).catch(() => setStats({}));
  }, []);

  async function runSync() {
    try {
      const data = await api.syncMnp();
      setMessage(data.message);
    } catch (err) {
      setMessage(err.message);
    }
  }

  if (!stats) return <div className="empty">Loading dashboard...</div>;

  return (
    <div>
      <h1 className="page-title">TekhShopify Dashboard</h1>
      <p className="page-subtitle">Overview of your store, orders, and sales.</p>

      {message && <div className="alert alert-success">{message}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 28 }}>
        <StatCard label="Products" value={stats.total_products ?? '—'} />
        <StatCard label="Total Orders" value={stats.total_orders ?? 0} />
        <StatCard label="Pending" value={stats.pending_orders ?? 0} accent="#d97706" />
        <StatCard label="Shipped" value={stats.shipped_orders ?? 0} accent="#0891b2" />
        <StatCard label="Delivered" value={stats.delivered_orders ?? 0} accent="#16a34a" />
        <StatCard label="Returned" value={stats.returned_orders ?? 0} accent="#dc2626" />
        <StatCard label="Total Sales" value={`Rs ${Number(stats.total_sale || 0).toLocaleString()}`} />
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <Link to="/admin/orders" className="btn btn-primary">Manage Orders</Link>
        <Link to="/admin/products" className="btn btn-secondary">Manage Products</Link>
        <Link to="/admin/reports" className="btn btn-secondary">View Reports</Link>
        <button type="button" className="btn btn-secondary" onClick={runSync}>Sync M&P Status</button>
      </div>
    </div>
  );
}
