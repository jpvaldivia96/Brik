// Trigger a dashboard refresh from any component
export function triggerDashboardRefresh() {
    window.dispatchEvent(new CustomEvent('dashboard-refresh'));
}
