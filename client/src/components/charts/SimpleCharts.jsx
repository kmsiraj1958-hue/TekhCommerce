function maxVal(values) {
  return Math.max(1, ...values.map((v) => Number(v) || 0));
}

export function LineChart({ labels = [], values = [], valueLabel = '' }) {
  const w = 560;
  const h = 180;
  const pad = 28;
  const nums = values.map((v) => Number(v) || 0);
  const peak = maxVal(nums);
  const n = Math.max(nums.length, 1);
  const points = nums.map((v, i) => {
    const x = pad + (i * (w - pad * 2)) / Math.max(n - 1, 1);
    const y = h - pad - (v / peak) * (h - pad * 2);
    return `${x},${y}`;
  });
  if (!labels.length) {
    return <div className="empty empty-sm">No points in this range.</div>;
  }
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="chart-svg" role="img" aria-label={valueLabel}>
      <polyline fill="none" stroke="var(--accent)" strokeWidth="2.5" points={points.join(' ')} />
      {nums.map((v, i) => {
        const [x, y] = points[i].split(',');
        return <circle key={labels[i]} cx={x} cy={y} r="3.5" fill="var(--accent)" />;
      })}
    </svg>
  );
}

export function BarChart({ labels = [], values = [], emptyLabel = 'No orders in this date range.', unit = 'orders' }) {
  const nums = values.map((v) => Number(v) || 0);
  const peak = maxVal(nums);
  if (!labels.length) {
    return <div className="empty empty-sm">{emptyLabel}</div>;
  }
  const sparse = labels.length <= 8;
  return (
    <div className={`bar-chart${sparse ? ' bar-chart-sparse' : ''}`}>
      {labels.map((label, i) => (
        <div key={`${label}-${i}`} className="bar-chart-col" title={`${label}: ${nums[i]} ${unit}`}>
          <div className="bar-chart-val">{nums[i]}</div>
          <div className="bar-chart-fill" style={{ height: `${Math.max(8, (nums[i] / peak) * 100)}%` }} />
          <span className="bar-chart-label">{label}</span>
        </div>
      ))}
    </div>
  );
}

export function DonutChart({ slices = [], emptyLabel = 'No orders in this range.' }) {
  const total = slices.reduce((sum, s) => sum + (Number(s.value) || 0), 0);
  if (!total) return <div className="empty empty-sm">{emptyLabel}</div>;
  let acc = 0;
  const parts = slices.filter((s) => s.value > 0).map((s) => {
    const start = acc / total;
    acc += s.value;
    return { ...s, start, end: acc / total };
  });
  const gradient = parts.map((p) => `${p.color} ${p.start * 360}deg ${p.end * 360}deg`).join(', ');
  return (
    <div className="donut-wrap">
      <div className="donut" style={{ background: `conic-gradient(${gradient})` }} />
      <ul className="donut-legend">
        {slices.map((s) => (
          <li key={s.label}><span style={{ background: s.color }} />{s.label} ({s.value})</li>
        ))}
      </ul>
    </div>
  );
}

export function HBarChart({ rows = [] }) {
  const peak = maxVal(rows.map((r) => r.value));
  if (!rows.length) return <div className="empty empty-sm">No delivered product sales in this range.</div>;
  return (
    <div className="hbar-list">
      {rows.map((row) => (
        <div key={row.label} className="hbar-row">
          <div className="hbar-name">{row.label}</div>
          <div className="hbar-track">
            <div className="hbar-fill" style={{ width: `${(row.value / peak) * 100}%` }} />
          </div>
          <div className="hbar-val">{row.value}</div>
        </div>
      ))}
    </div>
  );
}
