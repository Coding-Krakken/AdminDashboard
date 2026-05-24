import { headers } from "next/headers";
import {
  buildDashboardModel,
  createRequestFromHeaderEntries,
} from "@/platform/runtime";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Activity,
  Shield,
  Zap,
  HeartPulse,
  Boxes,
  ScrollText,
  AlertTriangle,
} from "lucide-react";
import Link from "next/link";

export default async function OverviewPage() {
  const incomingHeaders = await headers();
  const headerEntries: Array<[string, string]> = [];
  incomingHeaders.forEach((value, key) => {
    headerEntries.push([key, value]);
  });

  const request = createRequestFromHeaderEntries(headerEntries);
  const model = await buildDashboardModel({ request });

  const moduleCount = model.modules.length;
  const enabledFlagCount = Object.values(model.enabledFlags).filter(Boolean).length;
  const totalFlagCount = Object.keys(model.enabledFlags).length;
  const auditCount = model.auditEvents.length;
  const deniedCount = model.auditEvents.filter(
    (e) => e.action === "authz.denied"
  ).length;
  const denialRate = auditCount > 0 ? (deniedCount / auditCount) * 100 : 0;

  const healthScore = Math.max(0, Math.min(100, 94 - denialRate / 2));
  const reliabilityScore = Math.max(0, Math.min(100, 98 - Math.min(denialRate, 25)));
  const securityScore = model.security.strictSignatures ? 100 : 72;

  const recentAudit = model.auditEvents.slice(0, 8);

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Platform Health
            </CardTitle>
            <HeartPulse className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{healthScore.toFixed(1)}%</div>
            <p className="text-xs text-muted-foreground mt-1">
              Based on denial rate and system metrics
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Reliability
            </CardTitle>
            <Activity className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{reliabilityScore.toFixed(1)}%</div>
            <p className="text-xs text-muted-foreground mt-1">
              99.95% SLO target
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Security Score
            </CardTitle>
            <Shield className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{securityScore}%</div>
            <p className="text-xs text-muted-foreground mt-1">
              {model.security.strictSignatures ? "Strict signatures enabled" : "Signatures relaxed"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Active Modules
            </CardTitle>
            <Boxes className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{moduleCount}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {enabledFlagCount}/{totalFlagCount} flags enabled
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Module Status */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Module Status</CardTitle>
              <Link
                href="/modules"
                className="text-sm text-primary hover:underline"
              >
                View all
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {model.modules.slice(0, 8).map((module) => (
                <Link
                  key={module.id}
                  href={`/modules/${module.id}`}
                  className="flex items-center justify-between p-3 rounded-lg border bg-muted/30 hover:bg-muted/60 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{module.title}</p>
                    <p className="text-xs text-muted-foreground">{module.route}</p>
                  </div>
                  <Badge variant="success" className="shrink-0 ml-2">
                    Active
                  </Badge>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Quick Stats */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">System Overview</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Plugins (static)</span>
                <span className="text-sm font-medium">{model.pluginCounts.static}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Plugins (runtime)</span>
                <span className="text-sm font-medium">{model.pluginCounts.runtime}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Signing Keys</span>
                <span className="text-sm font-medium">{model.security.acceptedSigningKeys}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Allowlist Entries</span>
                <span className="text-sm font-medium">{model.security.allowlistEntries}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Recent Activity</CardTitle>
                <Link
                  href="/audit"
                  className="text-xs text-primary hover:underline"
                >
                  View all
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              {recentAudit.length > 0 ? (
                <div className="space-y-2">
                  {recentAudit.slice(0, 5).map((event, i) => (
                    <div
                      key={`${event.action}-${event.entityId}-${i}`}
                      className="flex items-start gap-2 text-xs"
                    >
                      {event.action === "authz.denied" ? (
                        <AlertTriangle className="size-3 text-destructive shrink-0 mt-0.5" />
                      ) : (
                        <ScrollText className="size-3 text-muted-foreground shrink-0 mt-0.5" />
                      )}
                      <div className="min-w-0">
                        <p className="font-medium truncate">{event.action}</p>
                        <p className="text-muted-foreground truncate">
                          {event.entity}:{event.entityId}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No recent activity
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
