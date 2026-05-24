import { headers } from "next/headers";
import {
  resolveTenantFromRequest,
  buildTenantDashboardModel,
  createRequestFromHeaderEntries
} from "@/platform/runtime";
import { shouldReturnNotFoundForMissingTenant } from "@/platform/request-mode";
import Link from "next/link";
import { notFound } from "next/navigation";

export default async function DashboardPage() {
  const incomingHeaders = await headers();
  const headerEntries: Array<[string, string]> = [];
  incomingHeaders.forEach((value, key) => {
    headerEntries.push([key, value]);
  });

  const request = createRequestFromHeaderEntries(headerEntries);
  const tenantCtx = await resolveTenantFromRequest(request);

  if (!tenantCtx) {
    const mode = incomingHeaders.get("x-tenant-mode");
    if (shouldReturnNotFoundForMissingTenant(mode)) {
      notFound();
    }

    return <PlatformLanding />;
  }

  const model = await buildTenantDashboardModel(tenantCtx);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {tenantCtx.theme?.logoUrl && (
            <img
              src={tenantCtx.theme.logoUrl}
              alt={model.tenantName}
              className="h-8 w-auto"
            />
          )}
          <h1 className="text-lg font-semibold">{model.tenantName} Admin</h1>
        </div>
        <div className="text-sm text-muted-foreground">
          {model.user.email} ({model.user.role})
        </div>
      </header>

      <div className="flex">
        <nav className="w-56 border-r border-border min-h-[calc(100vh-65px)] p-4">
          <ul className="space-y-1">
            {model.navigation.map((item) => (
              <li key={item.id}>
                <Link
                  href={item.route}
                  className="block px-3 py-2 rounded-md text-sm hover:bg-accent hover:text-accent-foreground transition-colors"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <main className="flex-1 p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <StatCard label="Modules" value={model.modules.length} />
            <StatCard
              label="Feature Flags"
              value={Object.values(model.enabledFlags).filter(Boolean).length}
            />
            <StatCard label="Profile" value={model.profile.label} />
          </div>

          <div className="rounded-lg border border-border p-6">
            <h2 className="text-lg font-medium mb-4">Active Modules</h2>
            {model.modules.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No modules configured yet. Add modules via the provisioning API.
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {model.modules.map((mod) => (
                  <div
                    key={mod.id}
                    className="p-4 rounded-md border border-border bg-card"
                  >
                    <div className="font-medium text-sm">{mod.title}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {mod.category} &middot; {mod.route}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

function PlatformLanding() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="max-w-md text-center space-y-4">
        <h1 className="text-2xl font-bold text-foreground">
          Universal Admin Platform
        </h1>
        <p className="text-muted-foreground">
          Multi-tenant administration dashboard. Configure your custom domain to
          access your tenant dashboard.
        </p>
        <div className="pt-4 space-y-2">
          <Link
            href="/_platform"
            className="block text-sm text-primary hover:underline"
          >
            Platform Console →
          </Link>
          <Link
            href="/api/platform/health"
            className="block text-sm text-primary hover:underline"
          >
            Platform Health →
          </Link>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold mt-1">{String(value)}</div>
    </div>
  );
}
