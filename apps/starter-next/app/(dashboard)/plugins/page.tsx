import { headers } from "next/headers";
import {
  buildDashboardModel,
  createRequestFromHeaderEntries,
} from "@/platform/runtime";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default async function PluginsPage() {
  const incomingHeaders = await headers();
  const headerEntries: Array<[string, string]> = [];
  incomingHeaders.forEach((value, key) => {
    headerEntries.push([key, value]);
  });

  const request = createRequestFromHeaderEntries(headerEntries);
  const model = await buildDashboardModel({ request });

  const plugins = model.pluginCompatibility;
  const rollout = model.pluginRolloutSummary;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Plugins</h2>
        <p className="text-muted-foreground">
          {model.pluginCounts.static} static &middot; {model.pluginCounts.runtime} runtime plugins
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Plugins</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {model.pluginCounts.static + model.pluginCounts.runtime}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Rollout Enabled</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-400">{rollout.enabled}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Canary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-400">{rollout.canary.enabled}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Disabled</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-muted-foreground">{rollout.disabled}</div>
          </CardContent>
        </Card>
      </div>

      {/* Plugin table */}
      <Card>
        <CardHeader>
          <CardTitle>Plugin Registry</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left font-medium text-muted-foreground px-4 py-3">Plugin ID</th>
                  <th className="text-left font-medium text-muted-foreground px-4 py-3">Version</th>
                  <th className="text-left font-medium text-muted-foreground px-4 py-3">Rollout Stage</th>
                  <th className="text-left font-medium text-muted-foreground px-4 py-3">Signature</th>
                  <th className="text-left font-medium text-muted-foreground px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {plugins.map((plugin) => (
                  <tr
                    key={plugin.pluginId}
                    className="border-b last:border-0 hover:bg-muted/20 transition-colors"
                  >
                    <td className="px-4 py-3 font-medium">{plugin.pluginId}</td>
                    <td className="px-4 py-3">
                      <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                        {plugin.version}
                      </code>
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        variant={
                          plugin.rolloutStage === "enabled"
                            ? "success"
                            : plugin.rolloutStage === "canary"
                              ? "warning"
                              : "secondary"
                        }
                      >
                        {plugin.rolloutStage}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={plugin.compatible ? "success" : "destructive"}>
                        {plugin.compatible ? "Valid" : "Invalid"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        variant={
                          plugin.rolloutEnabled !== false ? "success" : "outline"
                        }
                      >
                        {plugin.rolloutEnabled !== false ? "Enabled" : "Disabled"}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
