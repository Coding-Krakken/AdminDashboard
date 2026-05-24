import { headers } from "next/headers";
import {
  buildDashboardModel,
  createRequestFromHeaderEntries,
} from "@/platform/runtime";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default async function FlagsPage() {
  const incomingHeaders = await headers();
  const headerEntries: Array<[string, string]> = [];
  incomingHeaders.forEach((value, key) => {
    headerEntries.push([key, value]);
  });

  const request = createRequestFromHeaderEntries(headerEntries);
  const model = await buildDashboardModel({ request });

  const flags = Object.entries(model.enabledFlags);
  const enabledCount = flags.filter(([, v]) => v).length;
  const disabledCount = flags.length - enabledCount;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Feature Flags</h2>
        <p className="text-muted-foreground">
          {flags.length} flags configured &middot; {enabledCount} enabled &middot; {disabledCount} disabled
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Flags</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{flags.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Enabled</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-400">{enabledCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Disabled</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-400">{disabledCount}</div>
          </CardContent>
        </Card>
      </div>

      {/* Flag list */}
      <Card>
        <CardHeader>
          <CardTitle>All Flags</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {flags.map(([key, enabled]) => (
              <div
                key={key}
                className="flex items-center justify-between p-3 rounded-lg border bg-muted/20 hover:bg-muted/40 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`size-2.5 rounded-full shrink-0 ${
                      enabled ? "bg-emerald-400" : "bg-muted-foreground/40"
                    }`}
                  />
                  <span className="text-sm font-medium truncate">{key}</span>
                </div>
                <Badge variant={enabled ? "success" : "outline"}>
                  {enabled ? "Enabled" : "Disabled"}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
