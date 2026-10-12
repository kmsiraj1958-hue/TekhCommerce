import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import StatCard from '../../components/StatCard';
import StatusBadge from '../../components/StatusBadge';
import { BarChart, DonutChart, HBarChart } from '../../components/charts/SimpleCharts';
import { useAppearance } from '../../context/AppearanceContext';
import { BRAND } from '../../brand';

const STATUS_COLORS = {
  Pending: '#d97706',
  Confirmed: '#2563eb',
  Booked: '#4f46e5',
  Shipped: '#0891b2',
  Delivered: '#16a34a',
  Returned: '#dc2626',
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default function Dashboard() {
  const { widgets } = useAppearance() || { widgets: {} };
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState(todayIso());

  const load = useCallback(async (range = {}) => {
    setLoading(true);
    setError('');
    try {
      const from = range.start ?? start;
      const to = range.end ?? end;
      const data = await api.getDashboard({ start: from, end: to });
      setStats(data);
      if (!from && data.range?.start) setStart(data.range.start);
      if (!to && data.range?.end) setEnd(data.range.end);
    } catch (err) {
      setError(err.message || 'Could not load dashboard');
      setStats(null);
    } finally {
      setLoading(false);
    }
  }, [start, end]);

  useEffect(() => {
    load({ start: '', end: todayIso() });
  }, []);

  async function runSync() {
    setMessage('');
    try {
      const data = await api.syncMnp();
      setMessage(data.message);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  const trendLabels = (stats?.sales_trend || []).map((r) => r.date);
  const trendOrders = (stats?.sales_trend || []).map((r) => r.orders);
  const trendSales = (stats?.sales_trend || []).map((r) => r.delivered_sales);
  const statusSlices = Object.entries(stats?.status_counts || {}).map(([label, value]) => ({
    label, value, color: STATUS_COLORS[label] || '#64748b',
  }));

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">{BRAND.name} dashboard</h1>
          <p className="page-subtitle">Live JSON orders and inventory. Sales figures use delivered orders only.</p>
        </div>
        <div className="toolbar">
          <label className="field" style={{ margin: 0 }}>
            <span className="label">From</span>
            <input className="input" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </label>
          <label className="field" style={{ margin: 0 }}>
            <span className="label">To</span>
            <input className="input" type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
          </label>
          <button type="button" className="btn btn-primary" onClick={() => load()} disabled={loading}>
            {loading ? 'Loading…' : 'Apply range'}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => load()} disabled={loading}>Refresh</button>
          <button type="button" className="btn btn-secondary" onClick={runSync}>Sync M&P</button>
        </div>
      </div>

      {message && <div className="alert alert-success">{message}</div>}
      {error && <div className="alert alert-error">{error}</div>}
      {loading && !stats && <div className="empty">Loading dashboard…</div>}

      {stats && widgets.kpis !== false && (
        <div className="stats-grid">
          <StatCard label="Delivered sales (PKR)" value={`Rs ${Number(stats.total_sale || 0).toLocaleString()}`} />
          <StatCard label="Orders in range" value={stats.total_orders ?? 0} />
          <StatCard label="Avg delivered order" value={`Rs ${Number(stats.average_order_value || 0).toLocaleString()}`} />
          <StatCard label="Pending" value={stats.pending_orders ?? 0} accent="#d97706" />
          <StatCard label="Catalog products" value={stats.total_products ?? '—'} />
          <StatCard label="Low-stock SKUs" value={stats.inventory_summary?.low_stock_count ?? 0} accent="#dc2626" />
        </div>
      )}

      {stats && (
        <p className="hint">{stats.notes?.sales} {stats.notes?.inventory} Unavailable in this dataset: {(stats.notes?.unavailable || []).join(', ')}.</p>
      )}

      {stats && (
        <div className="dashboard-grid">
          {widgets.salesTrend !== false && (
            <section className="panel">
              <h2 className="panel-title">Orders by day</h2>
              <BarChart labels={trendLabels} values={trendOrders} />
              <p className="hint">
                Each bar is a calendar day from order created_at in the selected range. Empty days are omitted.
                {trendSales.some((v) => v > 0)
                  ? ` Delivered sales on those days: Rs ${trendSales.reduce((s, v) => s + v, 0).toLocaleString()}.`
                  : ' No delivered sales on those days.'}
              </p>
            </section>
          )}
          {widgets.orderStatus !== false && (
            <section className="panel">
              <h2 className="panel-title">Order status</h2>
              <DonutChart slices={statusSlices} />
            </section>
          )}
          {widgets.topProducts !== false && (
            <section className="panel">
              <h2 className="panel-title">Top products (delivered qty)</h2>
              <HBarChart rows={(stats.top_products || []).map((p) => ({ label: `${p.name} (${p.sku})`, value: p.qty }))} />
            </section>
          )}
          {widgets.inventorySummary !== false && (
            <section className="panel">
              <h2 className="panel-title">Inventory snapshot</h2>
              <ul className="metric-list">
                <li><span>SKUs with stock records</span><strong>{stats.inventory_summary?.sku_count ?? 0}</strong></li>
                <li><span>Units on hand</span><strong>{stats.inventory_summary?.units_on_hand ?? 0}</strong></li>
                <li><span>At or below reorder</span><strong>{stats.inventory_summary?.low_stock_count ?? 0}</strong></li>
              </ul>
            </section>
          )}
        </div>
      )}

      {stats && widgets.alerts !== false && (
        <section className="panel">
          <h2 className="panel-title">Inventory alerts</h2>
          {!stats.low_stock?.length && <div className="empty empty-sm">No SKUs are at or below reorder level.</div>}
          {!!stats.low_stock?.length && (
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>SKU</th><th>Name</th><th>On hand</th><th>Reorder</th></tr></thead>
                <tbody>
                  {stats.low_stock.map((row) => (
                    <tr key={row.sku}>
                      <td>{row.sku}</td>
                      <td>{row.name}</td>
                      <td>{row.balance}</td>
                      <td>{row.reorder_level}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {stats && widgets.recentOrders !== false && (
        <section className="panel">
          <h2 className="panel-title">Recent orders</h2>
          {!stats.recent_orders?.length && <div className="empty empty-sm">No orders in this date range.</div>}
          {!!stats.recent_orders?.length && (
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>Order</th><th>When</th><th>Store</th><th>Status</th><th>Amount</th></tr></thead>
                <tbody>
                  {stats.recent_orders.map((order) => (
                    <tr key={order.order_id}>
                      <td>{order.order_id}<div className="muted">{order.product_name}</div></td>
                      <td>{order.created_at}</td>
                      <td>{order.store || '—'}</td>
                      <td><StatusBadge status={order.status} /></td>
                      <td>Rs {Number(order.price || 0).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {stats && (
        <div className="dashboard-grid">
          {widgets.financeOverview !== false && (
            <section className="panel">
              <h2 className="panel-title">Accounts &amp; finance</h2>
              <p className="hint">{stats.finance?.notes?.nature} {stats.finance?.notes?.sales_vs_cash} {stats.finance?.notes?.tekhaccounts}</p>
              <div className="stats-grid compact-stats">
                <StatCard label="Recorded receipts" value={`Rs ${Number(stats.finance?.recorded_receipts || 0).toLocaleString()}`} />
                <StatCard label="Recorded expenses" value={`Rs ${Number(stats.finance?.recorded_expenses || 0).toLocaleString()}`} />
                <StatCard label="Net cash movement" value={`Rs ${Number(stats.finance?.net_cash_movement || 0).toLocaleString()}`} />
                <StatCard label="Recorded refunds" value={`Rs ${Number(stats.finance?.recorded_refunds || 0).toLocaleString()}`} />
              </div>
              <ul className="metric-list">
                <li><span>Cashbook entries in range</span><strong>{stats.finance?.entry_count ?? 0}</strong></li>
                <li><span>Outstanding receivables</span><strong>Not in this cashbook</strong></li>
                <li><span>Payment reconciliation</span><strong>Unavailable</strong></li>
              </ul>
              {!stats.finance?.recent_entries?.length && (
                <div className="empty empty-sm">No cashbook receipts or expenses in this date range.</div>
              )}
              {!!stats.finance?.recent_entries?.length && (
                <div className="table-wrap">
                  <table className="data-table">
                    <thead><tr><th>Date</th><th>Type</th><th>Description</th><th>Amount</th></tr></thead>
                    <tbody>
                      {stats.finance.recent_entries.map((entry) => (
                        <tr key={entry.id}>
                          <td>{entry.date}</td>
                          <td>{entry.type}</td>
                          <td>{entry.description}</td>
                          <td>Rs {Number(entry.amount || 0).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="hint">Unavailable: {(stats.finance?.unavailable || []).join(', ')}.</p>
              <div className="toolbar">
                <Link to="/admin/finance" className="btn btn-primary btn-sm">Open cashbook</Link>
                <Link to="/admin/reports" className="btn btn-secondary btn-sm">Reports</Link>
              </div>
            </section>
          )}
          {widgets.returnsAnalytics !== false && (
            <section className="panel">
              <h2 className="panel-title">Returns &amp; refunds</h2>
              <p className="hint">{stats.returns?.notes?.inventory_vs_money} {stats.returns?.notes?.shopify_refunds}</p>
              <div className="stats-grid compact-stats">
                <StatCard label="Returned orders" value={stats.returns?.returned_orders ?? 0} />
                <StatCard label="Returned qty (orders)" value={stats.returns?.returned_qty ?? 0} />
                <StatCard label="Linked stock returns" value={stats.returns?.linked_stock_return_qty ?? 0} />
                <StatCard label="Recorded refunds" value={`Rs ${Number(stats.returns?.recorded_refund_amount || 0).toLocaleString()}`} />
              </div>
              <BarChart
                labels={(stats.returns?.trend || []).map((row) => row.date)}
                values={(stats.returns?.trend || []).map((row) => row.linked_qty)}
                unit="units"
                emptyLabel="No confirmed order-linked stock returns in this range."
              />
              <DonutChart
                emptyLabel="No return events to break down."
                slices={[
                  { label: 'Returned orders', value: stats.returns?.breakdown?.returned_orders || 0, color: '#dc2626' },
                  { label: 'Linked stock', value: stats.returns?.breakdown?.linked_stock_returns || 0, color: '#16a34a' },
                  { label: 'Unreconciled stock', value: stats.returns?.breakdown?.unreconciled_stock_returns || 0, color: '#d97706' },
                  { label: 'Orphan stock', value: stats.returns?.breakdown?.orphan_stock_returns || 0, color: '#64748b' },
                ]}
              />
              {!!stats.returns?.flagged?.length && (
                <div className="table-wrap">
                  <table className="data-table">
                    <thead><tr><th>Date</th><th>SKU</th><th>Qty</th><th>Flag</th><th>Reason</th></tr></thead>
                    <tbody>
                      {stats.returns.flagged.map((row, i) => (
                        <tr key={`${row.sku}-${row.date}-${i}`}>
                          <td>{row.date}</td>
                          <td>{row.sku}</td>
                          <td>{row.qty}</td>
                          <td>{row.classification}</td>
                          <td>{row.reason}{row.order_id ? ` (${row.order_id})` : ''}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="hint">{stats.returns?.notes?.flagged}</p>
              <div className="toolbar">
                <Link to="/admin/orders" className="btn btn-secondary btn-sm">Orders</Link>
                <Link to="/admin/inventory" className="btn btn-secondary btn-sm">Inventory</Link>
              </div>
            </section>
          )}
        </div>
      )}

      <div className="toolbar" style={{ marginTop: 8 }}>
        <Link to="/admin/orders" className="btn btn-primary">Orders</Link>
        <Link to="/admin/products" className="btn btn-secondary">Products</Link>
        <Link to="/admin/reports" className="btn btn-secondary">Reports</Link>
        <Link to="/admin/finance" className="btn btn-secondary">Accounts</Link>
        <Link to="/admin/settings" className="btn btn-secondary">Appearance</Link>
      </div>
    </div>
  );
}
