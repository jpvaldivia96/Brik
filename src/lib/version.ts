// ─── BRIK Version System ────────────────────────────────────────────────────
//
// Versioning: MAJOR.MINOR.PATCH
//   MAJOR → Cambio grande de producto (rediseño, nueva plataforma)
//   MINOR → Features nuevos (alertas, telegram, favoritos per-user, etc.)
//   PATCH → Bug fixes y mejoras menores
//
// Build number: auto-incrementa con cada deploy para tracking interno.
//
// Historial:
//   v1.0 → MVP: entradas/salidas, dashboard, favoritos
//   v1.1 → Alertas básicas, email
//   v1.2 → Telegram, notificaciones push
//   v1.3 → Reportes, estadísticas, import/export
//   v1.4 → Control de obra, inspección, roles
//   v1.5 → Suscripciones, PWA, Android APK
//   v2.0 → Alertas avanzadas (22 tipos), preferencias per-user
//   v2.1 → Favoritos per-user, auditoría de alertas, version tracking
//   v2.2 → Brix fullscreen mobile, wave alerts, Telegram AI fix
// ────────────────────────────────────────────────────────────────────────────

export const VERSION = {
  major: 2,
  minor: 2,
  patch: 4,
  build: 20260615,
  
  /** Display string: "2.1.0" */
  get display(): string {
    return `${this.major}.${this.minor}.${this.patch}`;
  },
  
  /** Full string with build: "2.1.0 (20260606)" */
  get full(): string {
    return `${this.display} (${this.build})`;
  },
  
  /** Short tracking string sent with alerts */
  get tracking(): string {
    return `${this.display}+${this.build}`;
  },
};

// Keep APP_VERSION for backwards compat with alertTriggers
export const APP_VERSION = VERSION.tracking;
