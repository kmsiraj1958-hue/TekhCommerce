import { useEffect, useState } from 'react';
import { api } from '../../api/client';

const FALLBACK = [
  { id: 'sales_summary', category: 'Sales & Invoicing', title: 'Sales summary' },
  { id: 'sales_register', category: 'Sales & Invoicing', title: 'Sales register' },
  { id: 'invoice_register', category: 'Sales & Invoicing', title: 'Invoice register' },
  { id: 'returns_refunds', category: 'Sales & Invoicing', title: 'Returns, refunds and credit notes' },
  { id: 'stock_on_hand', category: 'Inventory & Purchasing', title: 'Stock on hand and low stock' },
  { id: 'stock_movements', category: 'Inventory & Purchasing', title: 'Stock movements and valuation' },
  { id: 'purchases', category: 'Inventory & Purchasing', title: 'Purchases and supplier balances' },
  { id: 'courier_weekly', category: 'Courier Accounts', title: 'Weekly courier performance' },
  { id: 'cod_settlement', category: 'Courier Accounts', title: 'COD settlement and reconciliation' },
  { id: 'cashbook_register', category: 'Finance & Compliance', title: 'Cashbook and payment register' },
  { id: 'tax_fbr', category: 'Finance & Compliance', title: 'Tax and FBR invoice register' },
  { id: 'financial_statements', category: 'Finance & Compliance', title: 'Financial statements' },
  { id: 'rm_stock', category: 'Manufacturing', title: 'Raw-material stock on hand' },
  { id: 'pkg_stock', category: 'Manufacturing', title: 'Packaging stock on hand' },
  { id: 'fg_stock', category: 'Manufacturing', title: 'Finished-goods stock' },
  { id: 'production_register', category: 'Manufacturing', title: 'Production-order register' },
  { id: 'mfg_cost_per_unit', category: 'Manufacturing', title: 'Manufacturing cost per unit' },
];

export default function AdminReports() {
  const [families, setFamilies] = useState(FALLBACK);
  const [family, setFamily] = useState('sales_summary');
  const [start, setStart] = useState('2026-08-12');
  const [end, setEnd] = useState('2026-10-11');
  const [q, setQ] = useState('');
  const [store, setStore] = useState('');
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.getReportFamilies().then((data) => {
      if (data.families?.length) setFamilies(data.families);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    setError('');
    api.getReportCentre({ family, start, end, q, store })
      .then(setReport)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [family, start, end, q, store]);

  async function exportCsv() {
    const blob = await api.getReportCentreCsv({ family, start, end, q, store });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${family}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const groups = [...new Set(families.map((row) => row.category))];
  const rows = report?.rows || [];
  const headers = rows[0] ? Object.keys(rows[0]) : [];
  const current = families.find((row) => row.id === family);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Reports centre</h1>
          <p className="page-subtitle">Filters run on the server. Financial statements stay unavailable until TekhAccounts is connected. FBR is not live.</p>
        </div>
        <div className="no-print" style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn btn-secondary" onClick={exportCsv}>Export CSV</button>
          <button type="button" className="btn btn-primary" onClick={() => window.print()}>Print</button>
        </div>
      </div>
      {error && <div className="alert alert-error no-print">{error}</div>}

      <div className="dashboard-grid">
        <section className="panel no-print">
          {groups.map((group) => (
            <div key={group} style={{ marginBottom: 16 }}>
              <h2 className="panel-title">{group}</h2>
              <div className="choice-row">
                {families.filter((row) => row.category === group).map((row) => (
                  <button key={row.id} type="button" className={`btn btn-sm ${family === row.id ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setFamily(row.id)}>{row.title}</button>
                ))}
              </div>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input className="input" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
            <input className="input" type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
            <input className="input" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} />
            <select className="select" value={store} onChange={(e) => setStore(e.target.value)}>
              <option value="">All stores</option>
              <option value="LOCAL">LOCAL</option>
              <option value="VOGUE">VOGUE</option>
              <option value="SNS">SNS</option>
            </select>
          </div>
        </section>

        <section className="panel print-sheet">
          <h2 className="panel-title">{current?.title || family}</h2>
          {loading && <div className="empty">Loading…</div>}
          {report && !report.available && (
            <div className="alert alert-error">{report.reason}</div>
          )}
          {report?.source && <p className="hint">{report.source}</p>}
          {report?.notes?.map((note) => <p key={note} className="hint">{note}</p>)}
          {report?.totals && (
            <ul className="metric-list">
              {Object.entries(report.totals).map(([key, value]) => (
                <li key={key}><span>{key.replace(/_/g, ' ')}</span><strong>{String(value)}</strong></li>
              ))}
            </ul>
          )}
          {report?.available && !rows.length && <div className="empty empty-sm">No rows for this period.</div>}
          {!!rows.length && (
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr>{headers.map((h) => <th key={h}>{h.replace(/_/g, ' ')}</th>)}</tr></thead>
                <tbody>
                  {rows.slice(0, 200).map((row, index) => (
                    <tr key={row.number || row.order_id || row.id || index}>
                      {headers.map((h) => <td key={h}>{String(row[h] ?? '')}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
