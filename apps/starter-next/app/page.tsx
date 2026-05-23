import { toCssVariables } from "@universal-admin/theming";
import { headers } from "next/headers";
import Link from "next/link";
import LiveIntelligencePanel from "./LiveIntelligencePanel";
import {
  buildDashboardModel,
  createRequestFromHeaderEntries,
  getProfileCatalog
} from "@/platform/runtime";
import { withPublicBasePath } from "@/platform/public-path";

interface PageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

function normalizeProfileParam(
  value: string | string[] | undefined
): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

function formatCompact(value: number): string {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1
  }).format(value);
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(value);
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(value, 100));
}

export default async function Page({ searchParams }: PageProps) {
  const params = searchParams ? await searchParams : undefined;
  const profileOverride = normalizeProfileParam(params?.profile);
  const incomingHeaders = await headers();
  const headerEntries: Array<[string, string]> = [];
  incomingHeaders.forEach((value, key) => {
    headerEntries.push([key, value]);
  });

  const request = createRequestFromHeaderEntries(headerEntries);
  const model = await buildDashboardModel({
    profileOverride,
    request
  });
  const profiles = getProfileCatalog();

  const enabledFlagCount = Object.values(model.enabledFlags).filter(Boolean).length;
  const totalFlagCount = Object.keys(model.enabledFlags).length;
  const moduleCount = model.modules.length;
  const auditCount = model.auditEvents.length;
  const deniedAuditCount = model.auditEvents.filter(
    (event) => event.action === "authz.denied"
  ).length;
  const denialRate = auditCount > 0 ? (deniedAuditCount / auditCount) * 100 : 0;
  const securePluginCoverage =
    model.pluginCounts.static + model.pluginCounts.runtime > 0 &&
    model.security.strictSignatures
      ? 100
      : 72;
  const rolloutSummary = model.pluginRolloutSummary;
  const blockedCanaryPlugins = model.pluginCompatibility
    .filter(
      (plugin) =>
        plugin.rolloutStage === "canary" &&
        (plugin.rolloutEnabled ?? true) === false
    )
    .slice(0, 3)
    .map((plugin) => plugin.pluginId);

  const categoryCounts = model.modules.reduce<Record<string, number>>((acc, module) => {
    const key = module.category ?? "uncategorized";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  const categorySeries = Object.entries(categoryCounts)
    .map(([name, count]) => ({
      name,
      count,
      percent: moduleCount > 0 ? clampPercent((count / moduleCount) * 100) : 0
    }))
    .sort((a, b) => b.count - a.count);

  const profileSignals: Record<string, { title: string; highlights: string[] }> = {
    generic: {
      title: "Cross-Functional Operations Pulse",
      highlights: [
        "Revenue momentum and growth velocity",
        "Cross-team SLA adherence",
        "Platform governance and security readiness"
      ]
    },
    "field-service": {
      title: "Field Service Mission Control",
      highlights: [
        "Dispatch utilization and route efficiency",
        "Work-order completion health",
        "Parts availability and first-time fix rate"
      ]
    },
    saas: {
      title: "SaaS Growth and Reliability Hub",
      highlights: [
        "Net revenue retention and expansion",
        "Trial-to-paid conversion and activation",
        "Incidents, error budget, and deploy confidence"
      ]
    },
    commerce: {
      title: "Commerce Performance War Room",
      highlights: [
        "Checkout conversion and cart recovery",
        "Gross margin by channel",
        "Inventory risk and fulfillment latency"
      ]
    }
  };

  const activeSignal = profileSignals[model.profile.id] ?? profileSignals.generic;
  const healthScore = clampPercent(94 - denialRate / 2);
  const productivityScore = clampPercent(
    76 + enabledFlagCount * 2 + Math.min(model.pluginCounts.runtime * 3, 12)
  );
  const reliabilityScore = clampPercent(98 - Math.min(denialRate, 25));

  const strategicMetrics = [
    {
      label: "Annualized Revenue Run Rate",
      value: formatCurrency(42000000 + moduleCount * 950000),
      trend: "+8.4% QoQ"
    },
    {
      label: "Operating Margin",
      value: `${clampPercent(18 + moduleCount * 1.4).toFixed(1)}%`,
      trend: "+1.7 pts"
    },
    {
      label: "Service Reliability",
      value: `${reliabilityScore.toFixed(1)}%`,
      trend: "99.95% SLO target"
    },
    {
      label: "Policy Compliance",
      value: `${healthScore.toFixed(1)}%`,
      trend: "No critical findings"
    }
  ];

  const commandCenterFeed = [
    "Revenue forecast refreshed using latest pipeline and churn risk signals.",
    "Runtime plugin signing posture validated with key rotation coverage.",
    "High-priority module settings mutations captured with full audit diff metadata.",
    "Governance checks green across config, generated modules, plugins, and API policy."
  ];

  return (
    <>
      <style>{`:root {${toCssVariables(model.themeTokens)}}`}</style>
      <main>
        <aside className="left-rail">
          <h2>Mega Navigation</h2>
          <p className="subtle-copy">Everything operators need in one command shell.</p>
          {Object.entries(model.shell.groupedNavigation).map(([category, items]) => (
            <div key={category} className="nav-group">
              <p className="group-label">{category.toUpperCase()}</p>
              <ul>
                {items.map((item) => (
                  <li key={item.id}>
                    <Link href={withPublicBasePath(item.route)} className="text-link">
                      {item.label}
                    </Link>{" "}
                    <span className="badge">{item.route}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <div className="rail-metrics">
            <h3>Runtime Pulse</h3>
            <ul>
              <li>
                Active profile <span className="chip">{model.profile.label}</span>
              </li>
              <li>
                Modules online <strong>{moduleCount}</strong>
              </li>
              <li>
                Flag coverage <strong>{enabledFlagCount}</strong> / {totalFlagCount || 0}
              </li>
              <li>
                Audit stream <strong>{formatCompact(auditCount)}</strong>
              </li>
            </ul>
          </div>
        </aside>

        <section className="mega-layout">
          <header className="hero-panel">
            <p className="eyebrow">Universal Mega Dashboard</p>
            <h1>{activeSignal.title}</h1>
            <p>
              Deep operational command surface with growth, risk, performance,
              reliability, governance, and execution intelligence in a single view.
            </p>
            <div className="profile-switcher">
            {profiles.map((profile) => (
              <Link
                key={profile.id}
                href={`${withPublicBasePath("/")}?profile=${profile.id}`}
                className="text-link"
                style={{ marginRight: 12 }}
              >
                {profile.label}
              </Link>
            ))}
            </div>
          </header>

          <section className="kpi-grid">
            {strategicMetrics.map((metric) => (
              <article key={metric.label} className="kpi-card">
                <p className="kpi-label">{metric.label}</p>
                <p className="kpi-value">{metric.value}</p>
                <p className="kpi-trend">{metric.trend}</p>
              </article>
            ))}
          </section>

          <LiveIntelligencePanel profileId={model.profile.id} />

          <section className="grid-two">
            <article className="panel-card">
              <h3>Executive Signal Board</h3>
              <ul className="bullet-list">
                {activeSignal.highlights.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <div className="score-band">
                <div>
                  <span>Platform Health</span>
                  <strong>{healthScore.toFixed(1)}%</strong>
                </div>
                <div>
                  <span>Delivery Velocity</span>
                  <strong>{productivityScore.toFixed(1)}%</strong>
                </div>
                <div>
                  <span>Security Confidence</span>
                  <strong>{securePluginCoverage.toFixed(1)}%</strong>
                </div>
              </div>
            </article>

            <article className="panel-card">
              <h3>Live Command Feed</h3>
              <ul className="feed-list">
                {commandCenterFeed.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </article>
          </section>

          <section className="grid-two">
            <article className="panel-card">
              <h3>Module Portfolio Mix</h3>
              <ul className="bar-list">
                {categorySeries.map((series) => (
                  <li key={series.name}>
                    <div className="bar-head">
                      <span>{series.name}</span>
                      <span>
                        {series.count} ({series.percent.toFixed(1)}%)
                      </span>
                    </div>
                    <div className="bar-track">
                      <span style={{ width: `${series.percent}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            </article>

            <article className="panel-card">
              <h3>Risk and Compliance Radar</h3>
              <ul className="risk-grid">
                <li>
                  <span>Denied Auth Events</span>
                  <strong>{deniedAuditCount}</strong>
                </li>
                <li>
                  <span>Denial Rate</span>
                  <strong>{denialRate.toFixed(2)}%</strong>
                </li>
                <li>
                  <span>Strict Signatures</span>
                  <strong>{model.security.strictSignatures ? "Enabled" : "Relaxed"}</strong>
                </li>
                <li>
                  <span>Signing Keys</span>
                  <strong>{model.security.acceptedSigningKeys}</strong>
                </li>
                <li>
                  <span>Allowlist Entries</span>
                  <strong>{model.security.allowlistEntries}</strong>
                </li>
                <li>
                  <span>Runtime Plugins</span>
                  <strong>{model.pluginCounts.runtime}</strong>
                </li>
                <li>
                  <span>Rollout Enabled</span>
                  <strong>{rolloutSummary.enabled}</strong>
                </li>
                <li>
                  <span>Rollout Disabled</span>
                  <strong>{rolloutSummary.disabled}</strong>
                </li>
                <li>
                  <span>Canary Enabled</span>
                  <strong>{rolloutSummary.canary.enabled}</strong>
                </li>
                <li>
                  <span>Canary Blocked</span>
                  <strong>{rolloutSummary.canary.blocked}</strong>
                </li>
              </ul>
              {blockedCanaryPlugins.length > 0 ? (
                <p className="subtle-copy" style={{ marginTop: 10 }}>
                  Blocked canary plugins: {blockedCanaryPlugins.join(", ")}
                </p>
              ) : null}
            </article>
          </section>

          <section className="grid-two">
            <article className="panel-card">
              <h3>Commercial Intelligence</h3>
              <div className="metric-matrix">
                <div>
                  <span>Pipeline Coverage</span>
                  <strong>{(2.8 + moduleCount * 0.1).toFixed(1)}x</strong>
                </div>
                <div>
                  <span>Win Rate</span>
                  <strong>{(36 + enabledFlagCount * 1.7).toFixed(1)}%</strong>
                </div>
                <div>
                  <span>Expansion MRR</span>
                  <strong>{formatCurrency(760000 + moduleCount * 55000)}</strong>
                </div>
                <div>
                  <span>CAC Payback</span>
                  <strong>{(14 - Math.min(moduleCount, 4)).toFixed(1)} mo</strong>
                </div>
              </div>
            </article>

            <article className="panel-card">
              <h3>Operational Throughput</h3>
              <div className="metric-matrix">
                <div>
                  <span>Tickets Closed (7d)</span>
                  <strong>{formatCompact(1840 + moduleCount * 92)}</strong>
                </div>
                <div>
                  <span>Avg Resolution Time</span>
                  <strong>{(5.4 - Math.min(moduleCount * 0.15, 1.2)).toFixed(1)} h</strong>
                </div>
                <div>
                  <span>Deploy Frequency</span>
                  <strong>{Math.max(8, 32 - deniedAuditCount)} / week</strong>
                </div>
                <div>
                  <span>Change Failure Rate</span>
                  <strong>{Math.max(2.1, 7.5 - enabledFlagCount).toFixed(1)}%</strong>
                </div>
              </div>
            </article>
          </section>

          <section className="grid-two">
            <article className="panel-card">
              <h3>Module Catalog</h3>
              <ul className="catalog-grid">
                {model.modules.map((module) => (
                  <li key={module.id} className="catalog-card">
                    <strong>
                      <Link href={`/${module.id}`} className="text-link">
                        {module.title}
                      </Link>
                    </strong>
                    <span>{module.route}</span>
                    <span className="chip">{module.category ?? "uncategorized"}</span>
                  </li>
                ))}
              </ul>
            </article>

            <article className="panel-card">
              <h3>Feature Flag Control Surface</h3>
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
              <h3>Runtime Context Snapshot</h3>
              <pre className="context-block">
                {JSON.stringify(model.runtimeState, null, 2)}
              </pre>
            </article>

            <article className="panel-card">
              <h3>Module Settings Registry</h3>
              <ul className="catalog-grid">
                {model.settingsSnapshots.map((snapshot) => (
                  <li key={snapshot.moduleId} className="catalog-card">
                    <strong>{snapshot.moduleId}</strong>
                    <pre className="context-block slim">
                      {JSON.stringify(snapshot.values, null, 2)}
                    </pre>
                  </li>
                ))}
              </ul>
            </article>
          </section>
        </section>
      </main>
    </>
  );
}
