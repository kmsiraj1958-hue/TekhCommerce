import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api/client';
import StatCard from '../../components/StatCard';

const TABS = ['Accounts', 'Shipments', 'Returns', 'Reconciliation', 'Weekly', 'Alerts', 'Settings'];

function money(value) {
  if (value == null) return 'Unavailable';
  return `Rs ${Number(value).toLocaleString()}`;
}

export default function AdminCourier() {
  const [tab, setTab] = useState('Accounts');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [overview, setOverview] = useState(null);
  const [shipments, setShipments] = useState([]);
  const [shipFilters, setShipFilters] = useState({ search: '', store: '', status: '' });
  const [returns, setReturns] = useState(null);
  const [recon, setRecon] = useState(null);
  const [range, setRange] = useState({ start: '', end: '' });
  const [weekly, setWeekly] = useState(null);
  const [alerts, setAlerts] = useState(null);
  const [settings, setSettings] = useState({ return_overdue_days: 7, stale_tracking_days: 5, settlement_overdue_days: 14 });
  const [receiptForm, setReceiptForm] = useState({ orderId: '', condition: 'ok', qty: 1, notes: '' });
  const [preview, setPreview] = useState(null);

  const fail = (err) => setError(err.message || 'Request failed');

  const loadTab = useCallback(async () => {
    setError('');
    try {
      if (tab === 'Accounts') setOverview(await api.getCourierAccounts());
      if (tab === 'Shipments') {
        const data = await api.getCourierShipments(shipFilters);
        setShipments(data.shipments || []);
      }
      if (tab === 'Returns') setReturns(await api.getCourierReturns());
      if (tab === 'Reconciliation') setRecon(await api.getCourierReconciliation(range));
      if (tab === 'Weekly') setWeekly(await api.getCourierWeekly(range));
      if (tab === 'Alerts') setAlerts(await api.getCourierAlerts());
      if (tab === 'Settings') setSettings(await api.getCourierSettings());
    } catch (err) {
      fail(err);
    }
  }, [tab, shipFilters, range]);

  useEffect(() => { loadTab(); }, [loadTab]);

  async function syncNow() {
    setMessage('');
    try {
      const data = await api.syncCourier();
      setMessage(data.message);
      loadTab();
    } catch (err) { fail(err); }
  }

  async function receiveParcel(e) {
    e.preventDefault();
    setMessage('');
    try {
      await api.receiveCourierReturn(receiptForm.orderId, {
        condition: receiptForm.condition,
        qty: receiptForm.qty,
        notes: receiptForm.notes,
      });
      setMessage(`Warehouse receipt recorded for ${receiptForm.orderId}. Courier RTS was not changed.`);
      setReturns(await api.getCourierReturns());
    } catch (err) { fail(err); }
  }

  async function saveSettings(e) {
    e.preventDefault();
    setMessage('');
    try {
      const data = await api.saveCourierSettings(settings);
      setSettings(data);
      setMessage('Alert rules saved.');
    } catch (err) { fail(err); }
  }

  async function previewDaily(e) {
    e.preventDefault();
    const file = e.target.file.files[0];
    const store = e.target.store.value;
    if (!file) return;
    const body = new FormData();
    body.append('file', file);
    body.append('store', store);
    try {
      setPreview(await api.previewCourierDaily(body));
    } catch (err) { fail(err); }
  }

  async function applyDaily(e) {
    e.preventDefault();
    const file = e.target.file.files[0];
    const store = e.target.store.value;
    if (!file) return;
    const body = new FormData();
    body.append('file', file);
    body.append('store', store);
    try {
      const data = await api.applyCourierDaily(body);
      setMessage(data.message);
      setPreview(null);
    } catch (err) { fail(err); }
  }

  async function downloadCsv() {
    try {
      const blob = await api.getCourierWeeklyCsv(range);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'courier-weekly.csv';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) { fail(err); }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Courier management</h1>
          <p className="page-subtitle">M&amp;P tracking, warehouse returns, and COD settlement. Other couriers are listed only as inactive adapters. Exports are labelled when Demo Mode is on.</p>
        </div>
        <div className="toolbar no-print">
          <button type="button" className="btn btn-primary" onClick={syncNow}>Sync M&amp;P</button>
          <button type="button" className="btn btn-secondary" onClick={() => window.print()}>Print</button>
        </div>
      </div>
      {message && <div className="alert alert-success">{message}</div>}
      {error && <div className="alert alert-error">{error}</div>}

      <div className="tab-bar no-print">
        {TABS.map((name) => (
          <button key={name} type="button" className={`tab-btn${tab === name ? ' active' : ''}`} onClick={() => setTab(name)}>{name}</button>
        ))}
      </div>

      {tab === 'Accounts' && overview && (
        <div>
          <p className="hint">{overview.notes}</p>
          <div className="dashboard-grid">
            {(overview.accounts || []).map((acc) => (
              <section className="panel" key={acc.id}>
                <h2 className="panel-title">{acc.name}</h2>
                <ul className="metric-list">
                  <li><span>Shipments</span><strong>{acc.shipment_count}</strong></li>
                  <li><span>With tracking</span><strong>{acc.with_tracking}</strong></li>
                  <li><span>Live tracking</span><strong>{acc.live_tracking ? 'Yes' : 'No'}</strong></li>
                  <li><span>Status</span><strong>{acc.integration_status}</strong></li>
                </ul>
                <p className="hint">{acc.notes}</p>
              </section>
            ))}
          </div>
        </div>
      )}

      {tab === 'Shipments' && (
        <section className="panel">
          <div className="toolbar" style={{ marginBottom: 16 }}>
            <input className="input" placeholder="Search" value={shipFilters.search} onChange={(e) => setShipFilters({ ...shipFilters, search: e.target.value })} />
            <select className="select" value={shipFilters.store} onChange={(e) => setShipFilters({ ...shipFilters, store: e.target.value })}>
              <option value="">All stores</option>
              <option value="VOGUE">VOGUE</option>
              <option value="SNS">SNS</option>
              <option value="LOCAL">LOCAL</option>
            </select>
            <select className="select" value={shipFilters.status} onChange={(e) => setShipFilters({ ...shipFilters, status: e.target.value })}>
              <option value="">All statuses</option>
              {['Pending', 'Confirmed', 'Booked', 'Shipped', 'Delivered', 'Returned'].map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
          {!shipments.length && <div className="empty empty-sm">No shipment rows match. Tracking numbers are empty until M&amp;P booking/import records them.</div>}
          {!!shipments.length && (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Order</th><th>Courier</th><th>Tracking</th><th>Booked</th><th>COD</th>
                    <th>Order status</th><th>Courier status</th><th>Latest event</th>
                  </tr>
                </thead>
                <tbody>
                  {shipments.map((row) => (
                    <tr key={row.order_id}>
                      <td>{row.order_id}<div className="muted">{row.reference}</div></td>
                      <td>{row.courier_name}</td>
                      <td>{row.tracking || '—'}</td>
                      <td>{row.booked_at || '—'}</td>
                      <td>{row.cod_amount == null ? '—' : money(row.cod_amount)}</td>
                      <td>{row.order_status}</td>
                      <td>{row.courier_status_original || row.courier_status}</td>
                      <td>{row.latest_event || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {tab === 'Returns' && returns && (
        <div>
          <div className="stats-grid compact-stats">
            <StatCard label="Courier RTS / returns" value={returns.returns?.length || 0} />
            <StatCard label="Warehouse received" value={returns.counts?.warehouse_received || 0} />
            <StatCard label="Overdue (not lost)" value={returns.counts?.return_overdue || 0} accent="#d97706" />
            <StatCard label="Disputed / damaged" value={returns.counts?.received_disputed || 0} accent="#dc2626" />
          </div>
          <p className="hint">Courier return-to-origin is not a warehouse receipt and not a cash refund. Overdue means still pending receipt.</p>
          <section className="panel no-print">
            <h2 className="panel-title">Mark physically received</h2>
            <form className="toolbar" onSubmit={receiveParcel}>
              <input className="input" placeholder="Order ID" value={receiptForm.orderId} onChange={(e) => setReceiptForm({ ...receiptForm, orderId: e.target.value })} required />
              <select className="select" value={receiptForm.condition} onChange={(e) => setReceiptForm({ ...receiptForm, condition: e.target.value })}>
                <option value="ok">ok</option>
                <option value="damaged">damaged</option>
                <option value="incomplete">incomplete</option>
                <option value="disputed">disputed</option>
              </select>
              <input className="input" type="number" min="1" value={receiptForm.qty} onChange={(e) => setReceiptForm({ ...receiptForm, qty: e.target.value })} />
              <input className="input" placeholder="Notes" value={receiptForm.notes} onChange={(e) => setReceiptForm({ ...receiptForm, notes: e.target.value })} />
              <button type="submit" className="btn btn-primary">Record receipt</button>
            </form>
          </section>
          <section className="panel">
            {!returns.returns?.length && <div className="empty empty-sm">No courier return states in current orders. Inventory return_in rows without tracking stay on the operations dashboard.</div>}
            {!!returns.returns?.length && (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Order</th><th>Tracking</th><th>Courier</th><th>State</th>
                      <th>Initiated</th><th>Expected</th><th>Received</th><th>Condition</th>
                    </tr>
                  </thead>
                  <tbody>
                    {returns.returns.map((row) => (
                      <tr key={row.order_id}>
                        <td>{row.order_id}</td>
                        <td>{row.tracking || '—'}</td>
                        <td>{row.courier_name}</td>
                        <td>{row.return_label}</td>
                        <td>{row.return_initiated_at || '—'}</td>
                        <td>{row.expected_return_at || '—'}</td>
                        <td>{row.physical_receipt_at || '—'}</td>
                        <td>{row.disposition || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}

      {tab === 'Reconciliation' && (
        <section className="panel print-sheet">
          <div className="toolbar" style={{ marginBottom: 16 }}>
            <input className="input" type="date" value={range.start} onChange={(e) => setRange({ ...range, start: e.target.value })} />
            <input className="input" type="date" value={range.end} onChange={(e) => setRange({ ...range, end: e.target.value })} />
          </div>
          {recon && (
            <>
              <div className="stats-grid compact-stats">
                <StatCard label="Shipment COD expected" value={money(recon.shipment?.expected_cod)} />
                <StatCard label="Courier-reported COD (RR)" value={money(recon.settlement?.courier_reported_cod_rr)} />
                <StatCard label="Remitted (Net Payable)" value={money(recon.settlement?.actual_recorded_settlement)} />
                <StatCard label="Unreconciled difference" value={money(recon.settlement?.unreconciled_difference)} />
              </div>
              <ul className="metric-list">
                <li><span>Delivery charges</span><strong>{money(recon.settlement?.delivery_charges)}</strong></li>
                <li><span>Return charges</span><strong>{money(recon.settlement?.return_charges)}</strong></li>
                <li><span>Tax / other deductions</span><strong>{money(recon.settlement?.other_deductions_tax)}</strong></li>
                <li><span>Collected by courier</span><strong>Unavailable</strong></li>
                <li><span>Shipment outstanding</span><strong>{recon.matching?.shipment_outstanding == null ? 'Unavailable' : money(recon.matching.shipment_outstanding)}</strong></li>
              </ul>
              <p className="hint">{recon.matching?.note}</p>
              <p className="hint">Unavailable: {(recon.unavailable || []).join('; ')}.</p>
              <h3 className="panel-title">Formulas</h3>
              <ul className="hint">{(recon.formulas || []).map((line) => <li key={line}>{line}</li>)}</ul>
              {!recon.rows?.length && <div className="empty empty-sm">No M&amp;P payout rows in this range. Daily import logs may exist without settlement files.</div>}
            </>
          )}
        </section>
      )}

      {tab === 'Weekly' && weekly && (
        <section className="panel print-sheet">
          <div className="toolbar no-print" style={{ marginBottom: 16 }}>
            <input className="input" type="date" value={range.start} onChange={(e) => setRange({ ...range, start: e.target.value })} />
            <input className="input" type="date" value={range.end} onChange={(e) => setRange({ ...range, end: e.target.value })} />
            <button type="button" className="btn btn-secondary" onClick={downloadCsv}>Export CSV</button>
          </div>
          <p className="hint">Week {weekly.range?.start} to {weekly.range?.end}. Opening pending is unavailable (no pipeline snapshot). Expected COD is shipment mnp_cod_amount only.</p>
          <div className="stats-grid compact-stats">
            <StatCard label="New bookings" value={weekly.new_bookings} />
            <StatCard label="Dispatched" value={weekly.dispatched} />
            <StatCard label="Delivered" value={weekly.delivered} />
            <StatCard label="Returns initiated" value={weekly.returns_initiated} />
            <StatCard label="Received at warehouse" value={weekly.returns_received} />
            <StatCard label="Overdue returns" value={weekly.returns_overdue} />
          </div>
          <ul className="metric-list">
            <li><span>Expected COD</span><strong>{money(weekly.expected_cod)}</strong></li>
            <li><span>Actual remittances</span><strong>{money(weekly.actual_remittances)}</strong></li>
            <li><span>Settlement difference</span><strong>{money(weekly.settlement_difference)}</strong></li>
            <li><span>Delivered without COD field</span><strong>{weekly.unmatched?.delivered_without_cod_field ?? 0}</strong></li>
          </ul>
        </section>
      )}

      {tab === 'Alerts' && (
        <section className="panel">
          {!alerts?.alerts?.length && <div className="empty empty-sm">No alerts from current courier records and rules.</div>}
          {!!alerts?.alerts?.length && (
            <ul className="metric-list">
              {alerts.alerts.map((alert, i) => (
                <li key={`${alert.type}-${i}`}><span>{alert.message}</span><strong>{alert.type}</strong></li>
              ))}
            </ul>
          )}
        </section>
      )}

      {tab === 'Settings' && (
        <section className="panel no-print">
          <form onSubmit={saveSettings} className="toolbar" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
            <label className="field">Return overdue days<input className="input" type="number" min="1" value={settings.return_overdue_days} onChange={(e) => setSettings({ ...settings, return_overdue_days: e.target.value })} /></label>
            <label className="field">Stale tracking days<input className="input" type="number" min="1" value={settings.stale_tracking_days} onChange={(e) => setSettings({ ...settings, stale_tracking_days: e.target.value })} /></label>
            <label className="field">Settlement overdue days<input className="input" type="number" min="1" value={settings.settlement_overdue_days} onChange={(e) => setSettings({ ...settings, settlement_overdue_days: e.target.value })} /></label>
            <button type="submit" className="btn btn-primary">Save rules</button>
          </form>
          <h2 className="panel-title" style={{ marginTop: 24 }}>M&amp;P daily import preview</h2>
          <p className="hint">Preview before apply. Existing import still writes only matched tracking numbers on orders.</p>
          <form className="toolbar" onSubmit={previewDaily}>
            <select className="select" name="store"><option>VOGUE</option><option>SNS</option></select>
            <input className="input" type="file" name="file" accept=".xlsx" />
            <button type="submit" className="btn btn-secondary">Preview</button>
          </form>
          <form className="toolbar" onSubmit={applyDaily}>
            <select className="select" name="store"><option>VOGUE</option><option>SNS</option></select>
            <input className="input" type="file" name="file" accept=".xlsx" />
            <button type="submit" className="btn btn-primary">Apply import</button>
          </form>
          {preview && (
            <p className="hint">Matched {preview.matched}, unmatched {preview.unmatched}, duplicates in file {preview.duplicates_in_file}.</p>
          )}
        </section>
      )}
    </div>
  );
}
