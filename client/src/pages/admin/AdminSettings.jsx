import { useAppearance } from '../../context/AppearanceContext';

const WIDGETS = [
  ['kpis', 'KPI cards'],
  ['salesTrend', 'Orders-by-day chart'],
  ['orderStatus', 'Order status chart'],
  ['topProducts', 'Top products'],
  ['inventorySummary', 'Inventory snapshot'],
  ['recentOrders', 'Recent orders'],
  ['alerts', 'Inventory alerts'],
  ['financeOverview', 'Accounts & finance'],
  ['returnsAnalytics', 'Returns & refunds'],
];

export default function AdminSettings() {
  const appearance = useAppearance();
  if (!appearance) return null;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Appearance</h1>
          <p className="page-subtitle">Stored in this browser only. Does not change orders or stock.</p>
        </div>
      </div>

      <section className="panel">
        <h2 className="panel-title">Theme</h2>
        <div className="choice-row">
          {['light', 'dark'].map((theme) => (
            <button
              key={theme}
              type="button"
              className={`btn ${appearance.theme === theme ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => appearance.setTheme(theme)}
            >
              {theme === 'light' ? 'Light' : 'Dark'}
            </button>
          ))}
        </div>
      </section>

      <section className="panel">
        <h2 className="panel-title">Accent</h2>
        <div className="choice-row">
          {[
            ['cyan', 'Cyan'],
            ['blue', 'Blue'],
            ['sky', 'Sky'],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`btn ${appearance.accent === id ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => appearance.setAccent(id)}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      <section className="panel">
        <h2 className="panel-title">Dashboard widgets</h2>
        <div className="widget-toggles">
          {WIDGETS.map(([key, label]) => (
            <label key={key} className="toggle-row">
              <input
                type="checkbox"
                checked={appearance.widgets[key] !== false}
                onChange={(e) => appearance.setWidget(key, e.target.checked)}
              />
              {label}
            </label>
          ))}
        </div>
      </section>
    </div>
  );
}
