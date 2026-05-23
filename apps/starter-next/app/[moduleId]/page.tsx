import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import {
  createRequestFromHeaderEntries,
  getModuleRuntimeView
} from "@/platform/runtime";
import { withPublicBasePath } from "@/platform/public-path";

interface ModulePageProps {
  params: Promise<{ moduleId: string }>;
}

export default async function ModulePage({ params }: ModulePageProps) {
  const { moduleId } = await params;
  const incomingHeaders = await headers();
  const headerEntries: Array<[string, string]> = [];
  incomingHeaders.forEach((value, key) => {
    headerEntries.push([key, value]);
  });

  const request = createRequestFromHeaderEntries(headerEntries);
  const model = await getModuleRuntimeView(moduleId, { request });

  if (!model.module) {
    notFound();
  }

  return (
    <main>
      <aside className="left-rail">
        <h2>Module Control</h2>
        <ul>
          <li>
            {model.module.title} <span className="badge">{model.module.route}</span>
          </li>
          <li>
            Category: <span className="chip">{model.module.category ?? "custom"}</span>
          </li>
          <li>
            User Role: <strong>{model.user.role}</strong>
          </li>
          <li>
            Feature Flags: <strong>{Object.values(model.enabledFlags).filter(Boolean).length}</strong>
          </li>
        </ul>
        <p>
          <Link href={withPublicBasePath("/")} className="text-link">
            Back To Dashboard
          </Link>
        </p>
      </aside>

      <section className="mega-layout">
        <header className="hero-panel">
          <p className="eyebrow">Module Command Center</p>
          <h1>{model.module.title}</h1>
          <p>
            Dedicated operating surface for module performance, controls, policy,
            and configuration orchestration.
          </p>
        </header>

        <section className="kpi-grid">
          <article className="kpi-card">
            <p className="kpi-label">Availability</p>
            <p className="kpi-value">99.97%</p>
            <p className="kpi-trend">Stable over 30d</p>
          </article>
          <article className="kpi-card">
            <p className="kpi-label">Latency p95</p>
            <p className="kpi-value">214ms</p>
            <p className="kpi-trend">-11ms WoW</p>
          </article>
          <article className="kpi-card">
            <p className="kpi-label">Error Budget</p>
            <p className="kpi-value">82%</p>
            <p className="kpi-trend">Healthy</p>
          </article>
          <article className="kpi-card">
            <p className="kpi-label">Automation Coverage</p>
            <p className="kpi-value">91%</p>
            <p className="kpi-trend">+4% this quarter</p>
          </article>
        </section>

        <section className="grid-two">
          <article className="panel-card">
            <h3>Settings Snapshot</h3>
            <pre className="context-block">
              {JSON.stringify(model.settings?.values ?? {}, null, 2)}
            </pre>
          </article>

          <article className="panel-card">
            <h3>Flag Matrix</h3>
            <ul className="flag-list">
              {Object.entries(model.enabledFlags).map(([key, value]) => (
                <li key={key}>
                  <span>{key}</span>
                  <span className={value ? "status-on" : "status-off"}>
                    {value ? "Enabled" : "Disabled"}
                  </span>
                </li>
              ))}
            </ul>
          </article>
        </section>

        <section className="grid-two">
          <article className="panel-card">
            <h3>Operational Checklist</h3>
            <ul className="bullet-list">
              <li>Policy-gated access and profile-aware exposure validated.</li>
              <li>Settings schema constraints enforced before persistence.</li>
              <li>Changes traceable through admin audit stream.</li>
              <li>Module route remains discoverable via centralized shell model.</li>
            </ul>
          </article>

          <article className="panel-card">
            <h3>Control Endpoints</h3>
            <ul className="bullet-list">
              <li>GET /api/admin/settings/{moduleId}</li>
              <li>POST /api/admin/settings/{moduleId}</li>
              <li>PATCH /api/admin/settings/{moduleId}</li>
              <li>DELETE /api/admin/settings/{moduleId}</li>
            </ul>
          </article>
        </section>
      </section>
    </main>
  );
}
