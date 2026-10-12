import { useEffect, useState } from 'react';
import { api } from '../../api/client';

const TYPES = [
  { value: 'purchase', label: 'Purchase / Stock In' },
  { value: 'manual_add', label: 'Manual Add' },
  { value: 'return_in', label: 'Return In' },
  { value: 'damage', label: 'Damage' },
  { value: 'adjustment', label: 'Adjustment' },
];

export default function AdminInventory() {
  const [summary, setSummary] = useState({});
  const [products, setProducts] = useState([]);
  const [filter, setFilter] = useState('ALL');
  const [movements, setMovements] = useState([]);
  const [form, setForm] = useState({ code: '', qty: '', type: 'purchase', note: '' });
  const [importStore, setImportStore] = useState('VOGUE');
  const [message, setMessage] = useState('');

  function load() {
    api.getInventory().then((data) => {
      setSummary(data.summary || {});
      setMovements(data.movements || []);
    });
    api.getProducts().then((data) => setProducts(data.products || []));
  }

  useEffect(() => { load(); }, []);

  async function addMovement(e) {
    e.preventDefault();
    try {
      await api.addMovement(form);
      setMessage('Inventory movement saved');
      setForm({ code: '', qty: '', type: 'purchase', note: '' });
      load();
    } catch (err) {
      setMessage(err.message);
    }
  }

  async function upload(type, file) {
    if (!file) return;
    const fd = new FormData();
    fd.append('store', importStore);
    fd.append('file', file);
    try {
      const data = type === 'daily' ? await api.importDaily(fd) : await api.importPayout(fd);
      setMessage(data.message);
      load();
    } catch (err) {
      setMessage(err.message);
    }
  }

  const rows = Object.entries(summary);

  return (
    <div>
      <h1 className="page-title">Inventory</h1>
      <p className="page-subtitle">Stock levels, movements, and M&P report imports.</p>
      {message && <div className="alert alert-success">{message}</div>}

      <form className="card" style={{ padding: 24, marginBottom: 24 }} onSubmit={addMovement}>
        <h2 style={{ marginTop: 0 }}>Add Stock Movement</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
          <div className="field">
            <label className="label">Product</label>
            <select className="select" required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })}>
              <option value="">Select product</option>
              {products.map((p) => <option key={p.code} value={p.code}>{p.code} — {p.name}</option>)}
            </select>
          </div>
          <div className="field"><label className="label">Quantity</label><input className="input" type="number" min="0.000001" step="0.000001" required value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} /></div>
          <div className="field">
            <label className="label">Type</label>
            <select className="select" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div className="field"><label className="label">Note</label><input className="input" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></div>
        </div>
        <button type="submit" className="btn btn-primary" style={{ marginTop: 8 }}>Save Movement</button>
      </form>

      <div className="card" style={{ padding: 24, marginBottom: 24 }}>
        <h2 style={{ marginTop: 0 }}>M&P Report Import</h2>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'end' }}>
          <div className="field" style={{ margin: 0 }}>
            <label className="label">Store</label>
            <select className="select" value={importStore} onChange={(e) => setImportStore(e.target.value)}>
              <option value="VOGUE">VOGUE</option>
              <option value="SNS">SNS</option>
            </select>
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label className="label">Daily XLSX</label>
            <input className="input" type="file" accept=".xlsx" onChange={(e) => upload('daily', e.target.files?.[0])} />
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label className="label">Payout XLSX</label>
            <input className="input" type="file" accept=".xlsx" onChange={(e) => upload('payout', e.target.files?.[0])} />
          </div>
        </div>
      </div>

      <div className="choice-row" style={{ marginBottom: 16 }}>
        {['ALL', 'RAW_MATERIAL', 'PACKAGING_MATERIAL', 'FINISHED_GOOD'].map((id) => (
          <button key={id} type="button" className={`btn ${filter === id ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setFilter(id)}>{id === 'ALL' ? 'All items' : id.replace('_', ' ')}</button>
        ))}
      </div>

      <div className="card table-wrap">
        <table className="data-table">
          <thead>
            <tr><th>Code</th><th>Name</th><th>Type</th><th>Opening</th><th>In</th><th>Production</th><th>Consumption</th><th>Wastage</th><th>Dispatch</th><th>Returns</th><th>Balance</th><th>Reorder</th></tr>
          </thead>
          <tbody>
            {rows.filter(([, s]) => filter === 'ALL' || (s.item_type || 'FINISHED_GOOD') === filter).map(([code, s]) => (
              <tr key={code} style={s.balance <= s.reorder_level ? { background: '#fff7ed' } : undefined}>
                <td>{code}</td>
                <td>{s.name}</td>
                <td>{s.item_type || 'FINISHED_GOOD'}</td>
                <td>{s.opening}</td>
                <td>{s.stock_in}</td>
                <td>{s.production_in || 0}</td>
                <td>{s.consumption || 0}</td>
                <td>{s.wastage || 0}</td>
                <td>{s.dispatch}</td>
                <td>{s.return_in}</td>
                <td style={{ fontWeight: 700 }}>{s.balance}</td>
                <td>{s.reorder_level}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <div className="empty">No inventory data yet.</div>}
      </div>

      <div className="card table-wrap" style={{ marginTop: 24 }}>
        <h2 style={{ padding: '16px 16px 0' }}>Recent movements</h2>
        <table className="data-table">
          <thead><tr><th>Date</th><th>SKU</th><th>Type</th><th>Qty</th><th>Ref</th><th>Note</th></tr></thead>
          <tbody>
            {movements.map((row) => (
              <tr key={row.id || `${row.date}-${row.code}-${row.note}`}>
                <td>{row.date}</td>
                <td>{row.code}</td>
                <td>{row.type}</td>
                <td>{row.qty}</td>
                <td>{row.ref}</td>
                <td>{row.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
