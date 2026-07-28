import { useState } from 'react';
import { api } from '../api/client';
import StatusBadge from '../components/StatusBadge';

export default function TrackOrder() {
  const [orderId, setOrderId] = useState('');
  const [order, setOrder] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSearch(e) {
    e.preventDefault();
    setError('');
    setOrder(null);
    setLoading(true);
    try {
      const data = await api.trackOrder(orderId.trim());
      setOrder(data.order);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container" style={{ maxWidth: 720 }}>
      <h1 className="page-title">Track Your Order</h1>
      <p className="page-subtitle">Enter your order ID (example: ORD-0001)</p>

      <form className="card" style={{ padding: 20, display: 'flex', gap: 12, flexWrap: 'wrap' }} onSubmit={handleSearch}>
        <input
          className="input"
          style={{ flex: 1, minWidth: 220 }}
          placeholder="Order ID"
          value={orderId}
          onChange={(e) => setOrderId(e.target.value)}
          required
        />
        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? 'Searching...' : 'Track'}
        </button>
      </form>

      {error && <div className="alert alert-error" style={{ marginTop: 16 }}>{error}</div>}

      {order && (
        <div className="card" style={{ marginTop: 20, padding: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
            <div>
              <div style={{ color: '#78716c' }}>Order ID</div>
              <div style={{ fontSize: 24, fontWeight: 700 }}>{order.order_id}</div>
            </div>
            <StatusBadge status={order.status} />
          </div>
          <div style={{ display: 'grid', gap: 10 }}>
            <div><strong>Product:</strong> {order.product_name}</div>
            <div><strong>Price:</strong> Rs {order.price}</div>
            <div><strong>Customer:</strong> {order.customer_name}</div>
            <div><strong>Tracking:</strong> {order.tracking_number || 'Not assigned yet'}</div>
            <div><strong>Placed on:</strong> {order.created_at}</div>
          </div>
        </div>
      )}
    </div>
  );
}
