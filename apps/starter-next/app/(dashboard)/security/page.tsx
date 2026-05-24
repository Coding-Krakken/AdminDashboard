import { headers } from "next/headers";
import {
  buildDashboardModel,
  createRequestFromHeaderEntries,
} from "@/platform/runtime";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Shield, Key, List, Lock } from "lucide-react";

export default async function SecurityPage() {
  const incomingHeaders = await headers();
  const headerEntries: Array<[string, string]> = [];
  incomingHeaders.forEach((value, key) => {
    headerEntries.push([key, value]);
  });

  const request = createRequestFromHeaderEntries(headerEntries);
  const model = await buildDashboardModel({ request });

  const security = model.security;
  const deniedEvents = model.auditEvents.filter(
    (e) => e.action === "authz.denied"
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Security</h2>
        <p className="text-muted-foreground">
          Plugin signing, access control, and security posture
        </p>
      </div>

      {/* Security posture cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Lock className="size-3.5" />
              Strict Signatures
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant={security.strictSignatures ? "success" : "warning"} className="text-sm">
              {security.strictSignatures ? "Enabled" : "Relaxed"}
            </Badge>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Key className="size-3.5" />
              Signing Keys
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{security.acceptedSigningKeys}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <List className="size-3.5" />
              Allowlist Entries
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{security.allowlistEntries}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Shield className="size-3.5" />
              Denied Events
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{deniedEvents.length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Plugin signature status */}
      <Card>
        <CardHeader>
          <CardTitle>Plugin Signature Status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {model.pluginCompatibility.map((plugin) => (
              <div
                key={plugin.pluginId}
                className="flex items-center justify-between p-3 rounded-lg border bg-muted/20"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`size-2.5 rounded-full ${
                      plugin.compatible ? "bg-emerald-400" : "bg-destructive"
                    }`}
                  />
                  <span className="text-sm font-medium">{plugin.pluginId}</span>
                  <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                    v{plugin.version}
                  </code>
                </div>
                <Badge variant={plugin.compatible ? "success" : "destructive"}>
                  {plugin.compatible ? "Verified" : "Invalid"}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Recent denied access */}
      {deniedEvents.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recent Denied Access</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left font-medium text-muted-foreground px-4 py-3">Actor</th>
                    <th className="text-left font-medium text-muted-foreground px-4 py-3">Entity</th>
                    <th className="text-left font-medium text-muted-foreground px-4 py-3">Entity ID</th>
                    <th className="text-left font-medium text-muted-foreground px-4 py-3">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {deniedEvents.slice(0, 10).map((event, i) => (
                    <tr key={`${event.entityId}-${i}`} className="border-b last:border-0">
                      <td className="px-4 py-3">{event.actorId}</td>
                      <td className="px-4 py-3">
                        <Badge variant="secondary">{event.entity}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                          {event.entityId}
                        </code>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">
                        {(event.metadata as Record<string, unknown>)?.at
                          ? new Date((event.metadata as Record<string, unknown>).at as string).toLocaleString()
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
