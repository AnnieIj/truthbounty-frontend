/**
 * Centralized user-facing copy for offline and low-bandwidth read resilience
 * (V2-FE-129). Keep strings here so localization can be introduced later
 * without hunting through components.
 */
export const NETWORK_COPY = {
  offlineBanner:
    "You're offline — showing previously loaded data. Changes will not be submitted until you reconnect.",
  dataSaverBanner: 'Data saver is on — refreshing less often to reduce bandwidth use.',
  slowConnectionBanner:
    'Slow connection detected — refreshing less often to reduce bandwidth use.',
  dashboardOfflineTitle: "You're offline",
  dashboardOfflineEmpty:
    'No cached claims are available yet. Reconnect to load protocol reads — nothing will be fabricated while offline.',
  dashboardErrorTitle: "Couldn't load claims",
  dashboardErrorBody:
    'The read failed. Nothing is fabricated — retry when the network is available.',
  dashboardStaleTitle: 'Showing last loaded data',
  dashboardStaleBody:
    'This data may be out of date because the latest refresh failed.',
} as const;
