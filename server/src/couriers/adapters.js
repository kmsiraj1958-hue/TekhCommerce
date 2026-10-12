/** Reusable courier adapters. Only M&P has a verified live tracking/sync path. */

export const PROVIDERS = [
  {
    id: 'mnp',
    name: 'M&P Courier',
    stores: ['VOGUE', 'SNS'],
    liveTracking: true,
    notes: 'Final-status tracking and XLSX daily/payout import are implemented for VOGUE and SNS.',
  },
  {
    id: 'tcs',
    name: 'TCS',
    stores: [],
    liveTracking: false,
    notes: 'Adapter placeholder only. No TCS API or import is implemented.',
  },
  {
    id: 'leopard',
    name: 'Leopard Courier',
    stores: [],
    liveTracking: false,
    notes: 'Adapter placeholder only. No Leopard API or import is implemented.',
  },
  {
    id: 'unassigned',
    name: 'Unassigned / local',
    stores: ['LOCAL'],
    liveTracking: false,
    notes: 'Website and TikTok orders until a courier and consignment are recorded.',
  },
];

export function providerForStore(store) {
  const code = String(store || '').toUpperCase();
  return PROVIDERS.find((p) => p.stores.includes(code)) || PROVIDERS.find((p) => p.id === 'unassigned');
}

export function mnpCredentialStatus({ vogueUser, voguePass, snsUser, snsPass }) {
  return {
    VOGUE: Boolean(vogueUser && voguePass),
    SNS: Boolean(snsUser && snsPass),
  };
}
