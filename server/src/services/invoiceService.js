import { listDocuments, getDocument } from './documentService.js';

/** Posted sales invoices only — delivered orders are not auto-invoiced or treated as paid. */
export function listInvoices() {
  return listDocuments({ type: 'sales_invoice' }).map((row) => ({
    id: row.id,
    invoice_no: row.number,
    order_id: row.order_id,
    date: row.issue_date,
    customer_name: row.customer_name,
    amount: row.totals?.grand_total,
    status: row.payment_status || row.status,
    notes: 'Internal sales invoice. Not an FBR digital invoice.',
  }));
}

export function getInvoice(id) {
  const row = getDocument(id);
  if (!row || row.type !== 'sales_invoice') return null;
  return row;
}
