import { createContext, useContext, useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'tekhshopify-appearance';

const DEFAULT_WIDGETS = {
  kpis: true,
  salesTrend: true,
  orderStatus: true,
  topProducts: true,
  inventorySummary: true,
  recentOrders: true,
  alerts: true,
  financeOverview: true,
  returnsAnalytics: true,
};

const DEFAULTS = {
  theme: 'light',
  accent: 'cyan',
  widgets: DEFAULT_WIDGETS,
};

function loadSaved() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return {
      theme: raw.theme === 'dark' ? 'dark' : 'light',
      accent: ['cyan', 'blue', 'sky'].includes(raw.accent) ? raw.accent : 'cyan',
      widgets: { ...DEFAULT_WIDGETS, ...(raw.widgets || {}) },
    };
  } catch {
    return { ...DEFAULTS, widgets: { ...DEFAULT_WIDGETS } };
  }
}

const AppearanceContext = createContext(null);

export function AppearanceProvider({ children }) {
  const [prefs, setPrefs] = useState(loadSaved);

  useEffect(() => {
    document.documentElement.dataset.theme = prefs.theme;
    document.documentElement.dataset.accent = prefs.accent;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  }, [prefs]);

  const value = useMemo(() => ({
    ...prefs,
    setTheme: (theme) => setPrefs((prev) => ({ ...prev, theme })),
    setAccent: (accent) => setPrefs((prev) => ({ ...prev, accent })),
    setWidget: (key, on) => setPrefs((prev) => ({
      ...prev,
      widgets: { ...prev.widgets, [key]: on },
    })),
  }), [prefs]);

  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}

export function useAppearance() {
  return useContext(AppearanceContext);
}
