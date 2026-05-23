import { buildDashboardModel as buildPlatformDashboardModel } from "./platform/runtime";

export async function buildDashboardModel() {
  return buildPlatformDashboardModel();
}
