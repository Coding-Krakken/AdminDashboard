import { headers } from "next/headers";
import { DashboardShell } from "@/components/shell/dashboard-shell";
import {
  buildDashboardModel,
  createRequestFromHeaderEntries,
  getProfileCatalog,
} from "@/platform/runtime";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const incomingHeaders = await headers();
  const headerEntries: Array<[string, string]> = [];
  incomingHeaders.forEach((value, key) => {
    headerEntries.push([key, value]);
  });

  const request = createRequestFromHeaderEntries(headerEntries);
  const model = await buildDashboardModel({ request });
  const profiles = getProfileCatalog();

  const navItems = model.navigation.map((item) => ({
    id: item.id,
    label: item.label,
    route: item.route,
    category: item.category,
  }));

  return (
    <DashboardShell
      navItems={navItems}
      profiles={profiles}
      activeProfileId={model.profile.id}
      moduleCount={model.modules.length}
      profileLabel={model.profile.label}
    >
      {children}
    </DashboardShell>
  );
}
