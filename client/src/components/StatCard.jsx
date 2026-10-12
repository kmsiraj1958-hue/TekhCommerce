export default function StatCard({ label, value, accent }) {
  return (
    <div className="stat-card" style={accent ? { '--stat-accent': accent } : undefined}>
      <div className="stat-card-label">{label}</div>
      <div className="stat-card-value">{value}</div>
    </div>
  );
}
