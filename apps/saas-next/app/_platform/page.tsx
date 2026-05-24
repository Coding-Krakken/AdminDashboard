import Link from "next/link";

export default function PlatformHomePage() {
  return (
    <main className="min-h-screen bg-background text-foreground px-6 py-10">
      <div className="mx-auto max-w-3xl space-y-6">
        <h1 className="text-3xl font-semibold tracking-tight">Universal Admin Platform</h1>
        <p className="text-muted-foreground">
          Manage tenant provisioning, domain onboarding, and per-tenant configuration.
        </p>

        <div className="rounded-lg border border-border p-5 bg-card">
          <h2 className="text-lg font-medium">Quick Actions</h2>
          <div className="mt-4 flex gap-3">
            <Link
              href="/_platform/onboard"
              className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium"
            >
              Start Onboarding
            </Link>
            <Link
              href="/api/platform/health"
              className="rounded-md border border-border px-4 py-2 text-sm font-medium"
            >
              Platform Health
            </Link>
            <Link
              href="/api/platform/openapi"
              className="rounded-md border border-border px-4 py-2 text-sm font-medium"
            >
              OpenAPI Spec
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
