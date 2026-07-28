const map = {
  Pending: 'badge-pending',
  Confirmed: 'badge-confirmed',
  Booked: 'badge-booked',
  Shipped: 'badge-shipped',
  Delivered: 'badge-delivered',
  Returned: 'badge-returned',
};

export default function StatusBadge({ status }) {
  const cls = map[status] || 'badge-pending';
  return <span className={`badge ${cls}`}>{status || 'Pending'}</span>;
}
