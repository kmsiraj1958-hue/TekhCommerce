function money(value) {
  return `Rs ${Number(value || 0).toLocaleString()}`;
}

export default function DocumentPreview({ document, layout = 'a4' }) {
  if (!document) return null;
  const merchant = document.merchant || {};
  const totals = document.totals || {};
  const lines = document.lines || totals.lines || [];
  const thermal = layout === 'thermal';

  return (
    <article className={thermal ? 'doc-thermal' : 'doc-a4'} data-layout={layout}>
      <header className="doc-head">
        <div>
          <div className="doc-brand">{merchant.wordmark || merchant.legal_name || 'TEKHCOMMERCE'}</div>
          <div className="doc-legal">{merchant.legal_name}</div>
          {merchant.address && <div className="doc-muted">{merchant.address}</div>}
          {merchant.phone && <div className="doc-muted">{merchant.phone}</div>}
        </div>
        <div className="doc-meta">
          <strong>{document.type?.replace(/_/g, ' ')}</strong>
          <div>{document.number}</div>
          <div>Date {document.issue_date}</div>
          {document.due_date && <div>Due {document.due_date}</div>}
          {document.order_id && <div>Order {document.order_id}</div>}
        </div>
      </header>

      <section className="doc-party">
        <div>
          <div className="doc-label">{document.supplier_name ? 'Supplier' : 'Bill to'}</div>
          <div>{document.supplier_name || document.customer_name || '—'}</div>
          {document.customer_phone && <div className="doc-muted">{document.customer_phone}</div>}
          {document.customer_address && <div className="doc-muted">{document.customer_address}</div>}
        </div>
        <div>
          <div className="doc-label">Payment</div>
          <div>{document.payment_method || '—'}</div>
          <div>Status {document.payment_status || document.status}</div>
          {document.type === 'sales_invoice' && <div>Balance {money(document.balance_due)}</div>}
        </div>
      </section>

      <table className="doc-lines">
        <thead>
          <tr>
            {!thermal && <th>SKU</th>}
            <th>Item</th>
            <th>Qty</th>
            <th>Price</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line, index) => (
            <tr key={`${line.sku}-${index}`}>
              {!thermal && <td>{line.sku}</td>}
              <td>{line.description}</td>
              <td>{line.qty}</td>
              <td>{money(line.unit_price)}</td>
              <td>{money(line.line_amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <dl className="doc-totals">
        <div><dt>Subtotal</dt><dd>{money(totals.subtotal)}</dd></div>
        {Number(totals.discount) > 0 && <div><dt>Discount</dt><dd>-{money(totals.discount)}</dd></div>}
        {Number(totals.shipping) > 0 && <div><dt>Shipping</dt><dd>{money(totals.shipping)}</dd></div>}
        <div><dt>Tax {totals.tax_rate || 0}%</dt><dd>{money(totals.tax_amount)}</dd></div>
        <div className="doc-grand"><dt>Total</dt><dd>{money(totals.grand_total)}</dd></div>
      </dl>

      {document.reason && <p className="doc-notes">Reason: {document.reason}</p>}
      {document.notes && <p className="doc-notes">{document.notes}</p>}
      {merchant.terms && <p className="doc-notes">{merchant.terms}</p>}
      <p className="doc-fbr">{merchant.fbr_disclaimer || document.fbr?.note}</p>
    </article>
  );
}
