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
  const [form, setForm] = useState({ code: '', qty: '', type: 'purchase', note: '' });
  const [importStore, setImportStore] = useState('VOGUE');
  const [message, setMessage] = useState('');

  function load() {
    api.getInventory().then((data) => setSummary(data.summary || {}));
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
          <div className="field"><label className="label">Quantity</label><input className="input" type="number" min="1" required value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} /></div>
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

      <div className="card table-wrap">
        <table>
          <thead>
            <tr><th>Code</th><th>Name</th><th>Opening</th><th>In</th><th>Dispatch</th><th>Returns</th><th>Balance</th><th>Reorder</th></tr>
          </thead>
          <tbody>
            {rows.map(([code, s]) => (
              <tr key={code} style={s.balance <= s.reorder_level ? { background: '#fff7ed' } : undefined}>
                <td>{code}</td>
                <td>{s.name}</td>
                <td>{s.opening}</td>
                <td>{s.stock_in}</td>
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
    </div>
  );
}
