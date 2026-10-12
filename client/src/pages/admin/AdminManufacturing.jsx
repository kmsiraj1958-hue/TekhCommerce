import { useEffect, useState } from 'react';
import { api } from '../../api/client';

const emptyActual = [
  { sku: 'RAW-CASHEW-G', role: 'RAW', uom: 'g', consumed_qty: 900, wastage_qty: 25 },
  { sku: 'PKG-POUCH-150', role: 'PACKAGING', uom: 'pcs', consumed_qty: 6, wastage_qty: 0 },
];

export default function AdminManufacturing() {
  const [tab, setTab] = useState('production');
  const [data, setData] = useState(null);
  const [selected, setSelected] = useState(null);
  const [preview, setPreview] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [bomForm, setBomForm] = useState({
    code: '', name: '', finished_sku: 'FG-CASHEW-150', output_qty: 1, output_uom: 'pcs',
    cashew: 150, pouch: 1,
  });
  const [poForm, setPoForm] = useState({ bom_id: '', planned_output_qty: 6 });
  const [actual, setActual] = useState(emptyActual);

  async function load() {
    setLoading(true);
    try {
      const next = await api.getManufacturing();
      setData(next);
      if (!poForm.bom_id && next.boms?.[0]) setPoForm((form) => ({ ...form, bom_id: next.boms[0].id }));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function openOrder(id) {
    setError('');
    const { order } = await api.getProduction(id);
    setSelected(order);
    setActual((order.actual_components || []).map((row) => ({
      sku: row.sku, role: row.role, uom: row.uom, consumed_qty: row.consumed_qty, wastage_qty: row.wastage_qty,
    })));
    const previewData = await api.previewProduction(id).catch(() => null);
    setPreview(previewData);
    setTab('production');
  }

  async function saveActual() {
    if (!selected) return;
    try {
      const { order } = await api.updateProduction(selected.id, { actual_components: actual, actual_output_qty: selected.actual_output_qty, status: 'in_progress' });
      setSelected(order);
      setPreview(await api.previewProduction(order.id));
      setMessage('Actual consumption saved. Stock is unchanged until you post.');
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function post() {
    if (!selected) return;
    if (!window.confirm(`Post ${selected.number}? This will consume materials and add finished goods.`)) return;
    try {
      const result = await api.postProduction(selected.id);
      setSelected(result.order);
      setMessage(result.duplicate ? 'Already posted — no extra consumption.' : 'Production posted.');
      setPreview(null);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  const items = [...(data?.raw || []), ...(data?.packaging || []), ...(data?.finished || [])];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Manufacturing</h1>
          <p className="page-subtitle">Raw materials, packaging, recipes and production posting. Courier returns are not warehouse receipts.</p>
        </div>
      </div>
      {message && <div className="alert alert-success">{message}</div>}
      {error && <div className="alert alert-error">{error}</div>}
      {loading && <div className="empty">Loading manufacturing data…</div>}

      <div className="choice-row no-print" style={{ marginBottom: 16 }}>
        {['items', 'bom', 'production', 'movements'].map((id) => (
          <button key={id} type="button" className={`btn ${tab === id ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab(id)}>
            {id === 'bom' ? 'BOM / Recipes' : id[0].toUpperCase() + id.slice(1)}
          </button>
        ))}
      </div>

      {tab === 'items' && (
        <div className="card table-wrap">
          <table className="data-table">
            <thead>
              <tr><th>SKU</th><th>Name</th><th>Type</th><th>UOM</th><th>On hand</th><th>Reorder</th><th>Value</th></tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.code} style={row.low_stock ? { background: '#fff7ed' } : undefined}>
                  <td>{row.code}</td>
                  <td>{row.name}</td>
                  <td>{row.item_type}</td>
                  <td>{row.base_uom || row.uom}</td>
                  <td>{row.balance ?? row.opening_stock}</td>
                  <td>{row.reorder_level}</td>
                  <td>{row.qty_value ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!items.length && <div className="empty">No CPG items yet.</div>}
        </div>
      )}

      {tab === 'bom' && (
        <>
          <form className="card" style={{ padding: 24, marginBottom: 24 }} onSubmit={async (e) => {
            e.preventDefault();
            try {
              await api.saveBom({
                code: bomForm.code || undefined,
                name: bomForm.name,
                finished_sku: bomForm.finished_sku,
                output_qty: bomForm.output_qty,
                output_uom: bomForm.output_uom,
                components: [
                  { sku: 'RAW-CASHEW-G', qty: bomForm.cashew, uom: 'g', role: 'RAW' },
                  { sku: 'PKG-POUCH-150', qty: bomForm.pouch, uom: 'pcs', role: 'PACKAGING' },
                ],
              });
              setMessage('Recipe saved. Posted history keeps the previous revision.');
              load();
            } catch (err) { setError(err.message); }
          }}>
            <h2 style={{ marginTop: 0 }}>Recipe editor</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16 }}>
              <div className="field"><label className="label">Code</label><input className="input" value={bomForm.code} onChange={(e) => setBomForm({ ...bomForm, code: e.target.value })} /></div>
              <div className="field"><label className="label">Name</label><input className="input" required value={bomForm.name} onChange={(e) => setBomForm({ ...bomForm, name: e.target.value })} /></div>
              <div className="field"><label className="label">Finished SKU</label><input className="input" required value={bomForm.finished_sku} onChange={(e) => setBomForm({ ...bomForm, finished_sku: e.target.value })} /></div>
              <div className="field"><label className="label">Output qty</label><input className="input" type="number" step="0.000001" value={bomForm.output_qty} onChange={(e) => setBomForm({ ...bomForm, output_qty: e.target.value })} /></div>
              <div className="field"><label className="label">Cashews (g / unit)</label><input className="input" type="number" step="0.000001" value={bomForm.cashew} onChange={(e) => setBomForm({ ...bomForm, cashew: e.target.value })} /></div>
              <div className="field"><label className="label">Pouches / unit</label><input className="input" type="number" step="1" value={bomForm.pouch} onChange={(e) => setBomForm({ ...bomForm, pouch: e.target.value })} /></div>
            </div>
            <button type="submit" className="btn btn-primary">Save recipe</button>
          </form>
          <div className="card table-wrap">
            <table className="data-table">
              <thead><tr><th>Code</th><th>Finished</th><th>Rev</th><th>Status</th><th>Components</th></tr></thead>
              <tbody>
                {(data?.boms || []).map((bom) => (
                  <tr key={bom.id}>
                    <td>{bom.code}</td>
                    <td>{bom.finished_sku}</td>
                    <td>{bom.revision}</td>
                    <td>{bom.status}</td>
                    <td>{(bom.components || []).map((c) => `${c.sku} ${c.qty}${c.uom}`).join(', ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'production' && (
        <>
          <form className="card" style={{ padding: 24, marginBottom: 24 }} onSubmit={async (e) => {
            e.preventDefault();
            try {
              const { order } = await api.createProduction(poForm);
              setMessage(`Created ${order.number} as draft. Stock is unchanged.`);
              await openOrder(order.id);
              load();
            } catch (err) { setError(err.message); }
          }}>
            <h2 style={{ marginTop: 0 }}>New production order</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
              <div className="field">
                <label className="label">BOM</label>
                <select className="select" value={poForm.bom_id} onChange={(e) => setPoForm({ ...poForm, bom_id: e.target.value })}>
                  {(data?.boms || []).filter((b) => b.status === 'active').map((bom) => (
                    <option key={bom.id} value={bom.id}>{bom.code} r{bom.revision} — {bom.name}</option>
                  ))}
                </select>
              </div>
              <div className="field"><label className="label">Planned output</label><input className="input" type="number" step="0.000001" value={poForm.planned_output_qty} onChange={(e) => setPoForm({ ...poForm, planned_output_qty: e.target.value })} /></div>
            </div>
            <button type="submit" className="btn btn-primary">Create draft</button>
          </form>

          <div className="card table-wrap" style={{ marginBottom: 24 }}>
            <table className="data-table">
              <thead><tr><th>Number</th><th>Status</th><th>Finished</th><th>Planned</th><th>Actual</th><th></th></tr></thead>
              <tbody>
                {(data?.production_orders || []).map((row) => (
                  <tr key={row.id}>
                    <td>{row.number}</td>
                    <td>{row.status}</td>
                    <td>{row.finished_sku}</td>
                    <td>{row.planned_output_qty}</td>
                    <td>{row.actual_output_qty}</td>
                    <td><button type="button" className="btn btn-secondary btn-sm" onClick={() => openOrder(row.id)}>Open</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!(data?.production_orders || []).length && <div className="empty">No production orders yet.</div>}
          </div>

          {selected && (
            <section className="card" style={{ padding: 24 }}>
              <h2 style={{ marginTop: 0 }}>{selected.number} — {selected.status}</h2>
              <p className="page-subtitle">Planned requirements stay separate from actual consumption. Posting is the only step that moves stock.</p>
              {(selected.availability || []).map((row) => (
                <div key={row.sku} className={row.shortfall > 0 ? 'alert alert-error' : 'alert alert-success'}>
                  {row.sku}: need {row.required_qty} {row.uom}, on hand {row.on_hand}
                  {row.shortfall > 0 ? ` (short ${row.shortfall})` : ''}
                </div>
              ))}
              <div className="field">
                <label className="label">Actual output quantity</label>
                <input className="input" type="number" step="0.000001" disabled={['posted', 'reversed', 'cancelled'].includes(selected.status)} value={selected.actual_output_qty} onChange={(e) => setSelected({ ...selected, actual_output_qty: e.target.value })} />
              </div>
              {(actual).map((row, idx) => (
                <div key={row.sku} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12, marginBottom: 8 }}>
                  <div className="label">{row.sku}</div>
                  <input className="input" type="number" step="0.000001" disabled={['posted', 'reversed', 'cancelled'].includes(selected.status)} value={row.consumed_qty} onChange={(e) => {
                    const next = [...actual]; next[idx] = { ...row, consumed_qty: e.target.value }; setActual(next);
                  }} />
                  <input className="input" type="number" step="0.000001" disabled={['posted', 'reversed', 'cancelled'].includes(selected.status)} value={row.wastage_qty} onChange={(e) => {
                    const next = [...actual]; next[idx] = { ...row, wastage_qty: e.target.value }; setActual(next);
                  }} />
                </div>
              ))}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {!['posted', 'reversed', 'cancelled'].includes(selected.status) && (
                  <>
                    <button type="button" className="btn btn-secondary" onClick={saveActual}>Save actuals</button>
                    <button type="button" className="btn btn-secondary" onClick={async () => setPreview(await api.previewProduction(selected.id))}>Preview movements</button>
                    <button type="button" className="btn btn-primary" onClick={post}>Post production</button>
                    <button type="button" className="btn btn-danger" onClick={async () => {
                      await api.updateProduction(selected.id, { status: 'cancelled' });
                      setMessage('Cancelled before posting. Stock unchanged.');
                      load();
                      setSelected(null);
                    }}>Cancel</button>
                  </>
                )}
                {selected.status === 'posted' && (
                  <button type="button" className="btn btn-danger" onClick={async () => {
                    if (!window.confirm('Reverse with traceable movements?')) return;
                    const { order } = await api.reverseProduction(selected.id);
                    setSelected(order);
                    setMessage('Reversed with reversing movements. Original history kept.');
                    load();
                  }}>Reverse posted order</button>
                )}
              </div>
              {preview?.lines && (
                <div className="table-wrap" style={{ marginTop: 16 }}>
                  <table className="data-table">
                    <thead><tr><th>SKU</th><th>Type</th><th>Qty</th><th>UOM</th></tr></thead>
                    <tbody>
                      {preview.lines.map((line, i) => (
                        <tr key={`${line.code}-${i}`}><td>{line.code}</td><td>{line.type}</td><td>{line.qty}</td><td>{line.uom}</td></tr>
                      ))}
                    </tbody>
                  </table>
                  {preview.costs && <p>Cost {preview.costs.total} ({preview.costs.per_unit} / unit) using {preview.costs.method}.</p>}
                </div>
              )}
              {selected.costs && <p>Posted cost {selected.costs.total}; FG unit cost {selected.costs.per_unit}.</p>}
            </section>
          )}
        </>
      )}

      {tab === 'movements' && selected && (
        <div className="card table-wrap">
          <p className="page-subtitle">Movements for {selected.number}. Original rows stay after a reversal.</p>
        </div>
      )}
    </div>
  );
}
