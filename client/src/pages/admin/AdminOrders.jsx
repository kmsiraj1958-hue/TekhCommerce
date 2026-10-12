import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import StatusBadge from '../../components/StatusBadge';

const STATUSES = ['Pending', 'Confirmed', 'Booked', 'Shipped', 'Delivered', 'Returned'];

export default function AdminOrders() {
  const [orders, setOrders] = useState([]);
  const [filters, setFilters] = useState({ status: '', store: '', search: '' });
  const [message, setMessage] = useState('');

  function load() {
    api.getOrders(filters).then((data) => setOrders(data.orders || []));
  }

  useEffect(() => { load(); }, [filters.status, filters.store, filters.search]);

  async function changeStatus(orderId, status) {
    try {
      await api.updateStatus(orderId, status);
      setMessage(`Order ${orderId} updated to ${status}`);
      load();
    } catch (err) {
      setMessage(err.message);
    }
  }

  async function remove(orderId) {
    if (!window.confirm(`Delete order ${orderId}?`)) return;
    await api.deleteOrder(orderId);
    load();
  }

  return (
    <div>
      <h1 className="page-title">Orders</h1>
      <p className="page-subtitle">Update status, track shipments, and manage customer orders.</p>
      {message && <div className="alert alert-success">{message}</div>}

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        <input className="input" style={{ maxWidth: 260 }} placeholder="Search..." value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} />
        <select className="select" style={{ maxWidth: 180 }} value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className="select" style={{ maxWidth: 180 }} value={filters.store} onChange={(e) => setFilters({ ...filters, store: e.target.value })}>
          <option value="">All stores</option>
          <option value="LOCAL">LOCAL</option>
          <option value="VOGUE">VOGUE</option>
          <option value="SNS">SNS</option>
        </select>
      </div>

      <div className="card table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Order</th>
              <th>Customer</th>
              <th>Product</th>
              <th>Store</th>
              <th>Status</th>
              <th>Tracking</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id || o.order_id}>
                <td>
                  <div style={{ fontWeight: 700 }}>{o.order_id}</div>
                  <div style={{ fontSize: 12, color: '#78716c' }}>{o.created_at}</div>
                </td>
                <td>
                  <div>{o.customer_name}</div>
                  <div style={{ fontSize: 12, color: '#78716c' }}>{o.customer_phone}</div>
                </td>
                <td>{o.product_name}</td>
                <td>{o.store}</td>
                <td><StatusBadge status={o.status} /></td>
                <td>{o.tracking_number || '—'}</td>
                <td>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <select className="select" style={{ width: 130, padding: '6px 8px' }} value={o.status} onChange={(e) => changeStatus(o.order_id, e.target.value)}>
                      {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <button type="button" className="btn btn-danger btn-sm" onClick={() => remove(o.order_id)}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!orders.length && <div className="empty">No orders found.</div>}
      </div>
    </div>
  );
}
