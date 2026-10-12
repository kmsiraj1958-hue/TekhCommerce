import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api/client';
import DocumentPreview from '../../components/DocumentPreview';

const TYPES = [
  { id: '', label: 'All' },
  { id: 'sales_invoice', label: 'Sales invoices' },
  { id: 'quotation', label: 'Quotations' },
  { id: 'credit_note', label: 'Credit notes' },
  { id: 'debit_note', label: 'Debit notes' },
  { id: 'purchase_bill', label: 'Purchase bills' },
  { id: 'payment_receipt', label: 'Receipts' },
  { id: 'payment_voucher', label: 'Vouchers' },
  { id: 'delivery_challan', label: 'Challans' },
];

export default function AdminInvoices() {
  const [documents, setDocuments] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [selected, setSelected] = useState(null);
  const [layout, setLayout] = useState('a4');
  const [type, setType] = useState('');
  const [q, setQ] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState([]);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.getDocuments({ type, q }),
      api.getDocumentCandidates(),
      api.getFinanceEntries().catch(() => ({ entries: [] })),
    ])
      .then(([docs, cand, finance]) => {
        setDocuments(docs.documents || []);
        setCandidates(cand.candidates || []);
        const financeRows = Array.isArray(finance) ? finance : finance?.entries;
        setEntries(Array.isArray(financeRows) ? financeRows : []);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [type, q]);

  useEffect(() => { load(); }, [load]);

  async function openDoc(row) {
    const data = await api.getDocument(row.id);
    setSelected(data.document);
  }

  async function issueFromOrder(orderId, docType) {
    setError('');
    try {
      const result = await api.issueDocument({
        type: docType,
        order_id: orderId,
        idempotency_key: `${docType}-${orderId}`,
      });
      setMessage(result.duplicate ? `Already exists: ${result.document.number}` : `Issued ${result.document.number}`);
      setSelected((await api.getDocument(result.document.id)).document);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function issueCredit(invoice) {
    const reason = window.prompt('Credit note reason');
    if (!reason) return;
    try {
      const result = await api.issueDocument({
        type: 'credit_note',
        original_document_id: invoice.id,
        reason,
        amount: invoice.balance_due || invoice.totals?.grand_total,
        idempotency_key: `cn-${invoice.id}-${reason}`,
      });
      setMessage(`Credit note ${result.document.number}`);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function issueReceipt(invoice, entryId) {
    try {
      const result = await api.issueDocument({
        type: 'payment_receipt',
        original_document_id: invoice.id,
        finance_entry_id: entryId,
        idempotency_key: `pr-${entryId}`,
      });
      setMessage(`Receipt ${result.document.number}`);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function issuePurchase() {
    const supplier_name = window.prompt('Supplier name (required — do not invent)');
    if (!supplier_name) return;
    const description = window.prompt('Item description') || 'Purchase';
    const qty = Number(window.prompt('Quantity', '1')) || 1;
    const unit_price = Number(window.prompt('Unit price')) || 0;
    try {
      const result = await api.issueDocument({
        type: 'purchase_bill',
        supplier_name,
        lines: [{ description, qty, unit_price }],
        idempotency_key: `pb-${supplier_name}-${description}-${qty}-${unit_price}`,
      });
      setMessage(`Purchase bill ${result.document.number}`);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  const incomeEntries = (Array.isArray(entries) ? entries : []).filter((row) => row.type === 'income');

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Documents</h1>
          <p className="page-subtitle">Internal sales documents, receipts and challans. Not FBR-submitted invoices. Changing A4/thermal does not alter saved totals.</p>
        </div>
        <div className="no-print" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-secondary" onClick={issuePurchase}>New purchase bill</button>
          {selected && <button type="button" className="btn btn-primary" onClick={() => window.print()}>Print {layout === 'thermal' ? '80mm' : 'A4'}</button>}
        </div>
      </div>
      {error && <div className="alert alert-error no-print">{error}</div>}
      {message && <div className="alert alert-success no-print">{message}</div>}

      <div className="dashboard-grid">
        <section className="panel no-print">
          <div className="choice-row" style={{ marginBottom: 12 }}>
            {TYPES.map((row) => (
              <button key={row.id || 'all'} type="button" className={`btn btn-sm ${type === row.id ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setType(row.id)}>{row.label}</button>
            ))}
          </div>
          <input className="input" placeholder="Search number, customer, order" value={q} onChange={(e) => setQ(e.target.value)} />
          {loading && <div className="empty empty-sm">Loading…</div>}
          {!loading && !documents.length && <div className="empty empty-sm">No posted documents in this filter. Issue from an order below — delivery is not an invoice.</div>}
          {!!documents.length && (
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>Number</th><th>Type</th><th>Date</th><th>Party</th><th>Total</th><th>Payment</th></tr></thead>
                <tbody>
                  {documents.map((row) => (
                    <tr key={row.id}>
                      <td><button type="button" className="btn btn-secondary btn-sm" onClick={() => openDoc(row)}>{row.number}</button></td>
                      <td>{row.type.replace(/_/g, ' ')}</td>
                      <td>{row.issue_date}</td>
                      <td>{row.customer_name || row.supplier_name}</td>
                      <td>Rs {Number(row.totals?.grand_total || 0).toLocaleString()}</td>
                      <td>{row.payment_status || row.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <h2 className="panel-title" style={{ marginTop: 24 }}>Unissued orders</h2>
          <p className="hint">Confirmed through Delivered orders without a sales invoice. Not treated as paid.</p>
          {!candidates.length && <div className="empty empty-sm">Every eligible order already has a sales invoice, or none are in fulfilment.</div>}
          {candidates.map((row) => (
            <div key={row.order_id} className="choice-row" style={{ marginBottom: 8, alignItems: 'center' }}>
              <strong>{row.order_id}</strong>
              <span>{row.customer_name}</span>
              <span>{row.status}</span>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => issueFromOrder(row.order_id, 'sales_invoice')}>Issue invoice</button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => issueFromOrder(row.order_id, 'quotation')}>Quotation</button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => issueFromOrder(row.order_id, 'delivery_challan')}>Challan</button>
            </div>
          ))}
        </section>

        {selected && (
          <section className="panel print-sheet">
            <div className="no-print choice-row" style={{ marginBottom: 12 }}>
              <button type="button" className={`btn btn-sm ${layout === 'a4' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setLayout('a4')}>A4 invoice</button>
              <button type="button" className={`btn btn-sm ${layout === 'thermal' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setLayout('thermal')}>80mm receipt</button>
              {selected.type === 'sales_invoice' && selected.status !== 'void' && (
                <>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => issueCredit(selected)}>Credit note</button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={async () => {
                      const reason = window.prompt('Debit note reason');
                      if (!reason) return;
                      try {
                        const result = await api.issueDocument({
                          type: 'debit_note',
                          original_document_id: selected.id,
                          reason,
                          amount: Number(window.prompt('Amount', '0')) || 0,
                          idempotency_key: `dn-${selected.id}-${reason}`,
                        });
                        setMessage(`Debit note ${result.document.number}`);
                        load();
                      } catch (err) {
                        setError(err.message);
                      }
                    }}
                  >
                    Debit note
                  </button>
                  {incomeEntries.slice(0, 5).map((entry) => (
                    <button key={entry.id} type="button" className="btn btn-secondary btn-sm" onClick={() => issueReceipt(selected, entry.id)}>
                      Receipt from {entry.description || entry.id}
                    </button>
                  ))}
                </>
              )}
            </div>
            <DocumentPreview document={selected} layout={layout} />
          </section>
        )}
      </div>
    </div>
  );
}
