import { useEffect, useState } from 'react';
import { api } from '../../api/client';

const TABS = ['Financial', 'Master', 'Payout', 'Weekly', 'Courier Balance'];

export default function AdminReports() {
  const [tab, setTab] = useState('Financial');
  const [message, setMessage] = useState('');
  const [financial, setFinancial] = useState(null);
  const [master, setMaster] = useState(null);
  const [payouts, setPayouts] = useState([]);
  const [weekly, setWeekly] = useState([]);
  const [courier, setCourier] = useState(null);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [filters, setFilters] = useState({ start: '2026-02-01', end: new Date().toISOString().slice(0, 10), store: '', status: '' });
  const [adSpend, setAdSpend] = useState('');
  const [courierFilters, setCourierFilters] = useState({ store: '', from_date: '', to_date: '' });

  useEffect(() => {
    if (tab === 'Financial') api.getFinancialReport(date).then(setFinancial);
    if (tab === 'Master') api.getMasterReport(filters).then(setMaster);
    if (tab === 'Payout') api.getPayoutReport().then((d) => setPayouts(d.payouts || []));
    if (tab === 'Weekly') api.getWeeklyReport().then((d) => setWeekly(d.reports || []));
    if (tab === 'Courier Balance') api.getCourierBalance(courierFilters).then(setCourier);
  }, [tab, date, filters, courierFilters]);

  async function saveAdSpend() {
    await api.saveAdSpend(date, adSpend);
    setMessage('Ad spend saved');
    api.getFinancialReport(date).then(setFinancial);
  }

  async function generateWeekly() {
    const data = await api.generateWeekly();
    setMessage('Weekly report generated');
    setWeekly([data.report, ...weekly]);
  }

  return (
    <div>
      <h1 className="page-title">Reports</h1>
      <p className="page-subtitle">Sales, payouts, and courier reconciliation.</p>
      {message && <div className="alert alert-success">{message}</div>}

      <div className="tabs" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 24 }}>
        {TABS.map((t) => (
          <button key={t} type="button" className={`btn ${tab === t ? 'btn-primary' : 'btn-secondary'} btn-sm`} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>

      {tab === 'Financial' && (
        <div>
          <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
            <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            <input className="input" type="number" placeholder="Ad spend (Rs)" value={adSpend} onChange={(e) => setAdSpend(e.target.value)} />
            <button type="button" className="btn btn-secondary" onClick={saveAdSpend}>Save Ad Spend</button>
          </div>
          {financial && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16 }}>
              {[
                ['Orders', financial.total_orders],
                ['Delivered', financial.delivered_orders],
                ['Returned', financial.returned_orders],
                ['Revenue', `Rs ${financial.revenue}`],
                ['Product Cost', `Rs ${financial.product_cost_total}`],
                ['Courier Cost', `Rs ${financial.courier_cost_total}`],
                ['Ad Spend', `Rs ${financial.ad_spend}`],
                ['Net Profit', `Rs ${financial.net_profit}`],
              ].map(([label, val]) => (
                <div key={label} className="card" style={{ padding: 16 }}><div style={{ color: '#78716c' }}>{label}</div><div style={{ fontSize: 22, fontWeight: 700 }}>{val}</div></div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'Master' && (
        <div>
          <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
            <input className="input" type="date" value={filters.start} onChange={(e) => setFilters({ ...filters, start: e.target.value })} />
            <input className="input" type="date" value={filters.end} onChange={(e) => setFilters({ ...filters, end: e.target.value })} />
            <select className="select" value={filters.store} onChange={(e) => setFilters({ ...filters, store: e.target.value })}>
              <option value="">All stores</option>
              <option value="LOCAL">LOCAL</option>
              <option value="VOGUE">VOGUE</option>
              <option value="SNS">SNS</option>
            </select>
          </div>
          {master && (
            <>
              <div style={{ marginBottom: 16, color: '#78716c' }}>
                {master.summary.count} orders · Sales Rs {master.summary.total_sale} · Cost Rs {master.summary.total_cost}
              </div>
              <div className="card table-wrap">
                <table>
                  <thead><tr><th>#</th><th>Date</th><th>Order</th><th>Customer</th><th>Status</th><th>Sale</th></tr></thead>
                  <tbody>
                    {master.rows.map((r) => (
                      <tr key={r.order_id}><td>{r.sno}</td><td>{r.date}</td><td>{r.order_id}</td><td>{r.customer}</td><td>{r.status}</td><td>{r.sale}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {tab === 'Payout' && (
        <div className="card table-wrap">
          <table>
            <thead><tr><th>Store</th><th>Paid On</th><th>Payment ID</th><th>RR Amount</th><th>Net Payable</th></tr></thead>
            <tbody>
              {payouts.map((p, i) => (
                <tr key={i}><td>{p.store}</td><td>{p['Paid On']}</td><td>{p['Payment ID']}</td><td>{p['RR Amount']}</td><td>{p['Net Payable']}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'Weekly' && (
        <div>
          <button type="button" className="btn btn-secondary" style={{ marginBottom: 16 }} onClick={generateWeekly}>Generate This Week</button>
          <div className="card table-wrap">
            <table>
              <thead><tr><th>Week</th><th>Orders</th><th>Delivered</th><th>Sales</th><th>Payout</th><th>Balance</th></tr></thead>
              <tbody>
                {weekly.map((r, i) => (
                  <tr key={i}><td>{r.week_start} → {r.week_end}</td><td>{r.total_orders}</td><td>{r.delivered_orders}</td><td>{r.total_sale}</td><td>{r.payout_received}</td><td>{r.balance_with_courier}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'Courier Balance' && (
        <div>
          <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
            <select className="select" value={courierFilters.store} onChange={(e) => setCourierFilters({ ...courierFilters, store: e.target.value })}>
              <option value="">All stores</option>
              <option value="VOGUE">VOGUE</option>
              <option value="SNS">SNS</option>
            </select>
            <input className="input" type="date" value={courierFilters.from_date} onChange={(e) => setCourierFilters({ ...courierFilters, from_date: e.target.value })} />
            <input className="input" type="date" value={courierFilters.to_date} onChange={(e) => setCourierFilters({ ...courierFilters, to_date: e.target.value })} />
          </div>
          {courier && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 20 }}>
                {Object.entries(courier.summary).map(([k, v]) => (
                  <div key={k} className="card" style={{ padding: 12 }}><div style={{ fontSize: 12, color: '#78716c' }}>{k.replace(/_/g, ' ')}</div><div style={{ fontWeight: 700 }}>{v}</div></div>
                ))}
              </div>
              <div className="card table-wrap">
                <table>
                  <thead><tr><th>Store</th><th>Paid On</th><th>COD</th><th>Expected</th><th>Bank Paid</th><th>Diff</th></tr></thead>
                  <tbody>
                    {courier.rows.map((r, i) => (
                      <tr key={i}><td>{r.store}</td><td>{r.paid_on}</td><td>{r.cod_amount}</td><td>{r.expected_net}</td><td>{r.bank_paid}</td><td>{r.difference}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
