export default function StatCard({ label, value, accent = '#0f766e' }) {
  return (
    <div className="card" style={{ padding: 20 }}>
      <div style={{ color: '#78716c', fontSize: 14, marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 32, fontWeight: 700, color: accent }}>{value}</div>
    </div>
  );
}
