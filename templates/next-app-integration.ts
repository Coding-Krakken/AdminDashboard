import { createDashboard } from "@universal-admin/core";
import { createEnvAuthAdapter } from "@universal-admin/adapters";

const dashboard = await createDashboard({
  authAdapter: createEnvAuthAdapter(),
  config: "env:ADMIN_DASHBOARD_CONFIG"
});

export async function getAdminDashboardModel() {
  return dashboard.buildModel({ activeRoute: "/admin" });
}

// Example usage in a route or server component:
// const model = await getAdminDashboardModel();
// return <pre>{JSON.stringify(model.shell.groupedNavigation, null, 2)}</pre>;
