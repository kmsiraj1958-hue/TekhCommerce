import { useState } from 'react';
import { api } from '../../api/client';

const REQUIRED = ['sku', 'name', 'item_type', 'base_uom', 'opening_qty'];
const OPTIONAL = ['cost', 'price', 'category', 'reorder_level', 'supplier_name'];

export default function AdminOnboarding() {
  const [file, setFile] = useState(null);
  const [sheet, setSheet] = useState('');
  const [sheets, setSheets] = useState([]);
  const [mapping, setMapping] = useState({});
  const [preview, setPreview] = useState(null);
  const [previewId, setPreviewId] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function runPreview(e) {
    e.preventDefault();
    setError('');
    setMessage('');
    if (!file) {
      setError('Choose a workbook first. Columns will not be guessed.');
      return;
    }
    const fd = new FormData();
    fd.append('file', file);
    fd.append('sheet', sheet);
    fd.append('mapping', JSON.stringify(mapping));
    try {
      const data = await api.previewOnboarding(fd);
      setSheets(data.sheets || []);
      setPreview(data.preview);
      setPreviewId(data.previewId);
      if (!sheet && data.sheets?.[0]) setSheet(data.sheets[0].name);
    } catch (err) {
      setError(err.message);
    }
  }

  async function apply() {
    if (!window.confirm('Write this catalog only to server/data/onboarding? Live JSON and demo data will not be changed.')) return;
    try {
      const result = await api.applyOnboarding({ previewId, confirm: true });
      setMessage(`Saved ${result.count} rows to ${result.file}`);
    } catch (err) {
      setError(err.message);
    }
  }

  const columns = sheets.find((row) => row.name === sheet)?.columns || preview?.columns || [];

  return (
    <div>
      <h1 className="page-title">Client onboarding</h1>
      <p className="page-subtitle">Import a CPG workbook into an isolated onboarding folder. VOGUE/SNS live JSON is never overwritten. Map every required column yourself.</p>
      {error && <div className="alert alert-error">{error}</div>}
      {message && <div className="alert alert-success">{message}</div>}

      <form className="card" style={{ padding: 24, marginBottom: 24 }} onSubmit={runPreview}>
        <div className="field">
          <label className="label">Workbook (XLSX/CSV)</label>
          <input className="input" type="file" accept=".xlsx,.csv" onChange={(e) => setFile(e.target.files?.[0] || null)} />
        </div>
        {sheets.length > 0 && (
          <div className="field">
            <label className="label">Worksheet</label>
            <select className="select" value={sheet} onChange={(e) => setSheet(e.target.value)}>
              {sheets.map((row) => <option key={row.name} value={row.name}>{row.name} ({row.rowCount} rows)</option>)}
            </select>
          </div>
        )}
        <h2>Column map</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
          {[...REQUIRED, ...OPTIONAL].map((field) => (
            <div className="field" key={field}>
              <label className="label">{field}{REQUIRED.includes(field) ? ' *' : ''}</label>
              <select className="select" value={mapping[field] || ''} onChange={(e) => setMapping({ ...mapping, [field]: e.target.value })}>
                <option value="">Select column</option>
                {columns.map((col) => <option key={col} value={col}>{col}</option>)}
              </select>
            </div>
          ))}
        </div>
        <button type="submit" className="btn btn-primary">Preview and validate</button>
      </form>

      {preview && (
        <div className="card table-wrap">
          <p>{preview.ok ? 'Preview is valid.' : `${preview.blocking} row(s) have errors. Apply is blocked.`}</p>
          <table className="data-table">
            <thead>
              <tr><th>SKU</th><th>Name</th><th>Type</th><th>UOM</th><th>Opening</th><th>Cost</th><th>Price</th><th>Errors</th></tr>
            </thead>
            <tbody>
              {(preview.rows || []).map((row) => (
                <tr key={row.sku || row.name}>
                  <td>{row.sku}</td>
                  <td>{row.name}</td>
                  <td>{row.item_type}</td>
                  <td>{row.base_uom}</td>
                  <td>{row.opening_qty ?? '—'}</td>
                  <td>{row.cost ?? '—'}</td>
                  <td>{row.price ?? '—'}</td>
                  <td>{row.errors.join('; ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {preview.ok && <button type="button" className="btn btn-primary" style={{ margin: 16 }} onClick={apply}>Apply to onboarding folder</button>}
        </div>
      )}
    </div>
  );
}
