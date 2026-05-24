import { headers } from "next/headers";
import {
  buildDashboardModel,
  createRequestFromHeaderEntries,
} from "@/platform/runtime";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { notFound } from "next/navigation";

interface PageProps {
  params: Promise<{ moduleId: string }>;
}

export default async function ModuleDetailPage({ params }: PageProps) {
  const { moduleId } = await params;
  const incomingHeaders = await headers();
  const headerEntries: Array<[string, string]> = [];
  incomingHeaders.forEach((value, key) => {
    headerEntries.push([key, value]);
  });

  const request = createRequestFromHeaderEntries(headerEntries);
  const model = await buildDashboardModel({ request });

  const module = model.modules.find((m) => m.id === moduleId);
  if (!module) {
    notFound();
  }

  const settings = model.settingsSnapshots.find((s) => s.moduleId === moduleId);
  const moduleFlags = Object.entries(model.enabledFlags);

  return (
    <div className="space-y-6">
      {/* Back button + Title */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/modules">
            <ArrowLeft className="size-4" />
          </Link>
        </Button>
        <div>
          <h2 className="text-2xl font-bold tracking-tight">{module.title}</h2>
          <p className="text-muted-foreground">{module.route}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Module Info */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Module Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">ID</p>
                <p className="font-mono text-sm">{module.id}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Category</p>
                <Badge variant="secondary">{module.category ?? "uncategorized"}</Badge>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Route</p>
                <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{module.route}</code>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Status</p>
                <Badge variant="success">Active</Badge>
              </div>
            </div>

            {module.capabilities && module.capabilities.length > 0 && (
              <div>
                <p className="text-sm text-muted-foreground mb-2">Capabilities</p>
                <div className="flex flex-wrap gap-1.5">
                  {module.capabilities.map((cap) => (
                    <Badge key={cap.id} variant="outline" className="text-xs">
                      {cap.label ?? cap.id}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {module.dataSources && module.dataSources.length > 0 && (
              <div>
                <p className="text-sm text-muted-foreground mb-2">Data Sources</p>
                <div className="flex flex-wrap gap-1.5">
                  {module.dataSources.map((ds) => (
                    <Badge key={ds.id} variant="outline" className="text-xs">
                      {ds.entity} ({ds.type})
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Settings</CardTitle>
          </CardHeader>
          <CardContent>
            {settings ? (
              <pre className="text-xs bg-muted p-3 rounded-lg overflow-auto max-h-64">
                {JSON.stringify(settings.values, null, 2)}
              </pre>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">
                No settings configured
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Feature Flags for this module */}
      <Card>
        <CardHeader>
          <CardTitle>Feature Flags</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {moduleFlags.map(([flag, enabled]) => (
              <div
                key={flag}
                className="flex items-center justify-between p-2.5 rounded-lg border bg-muted/20"
              >
                <span className="text-sm truncate mr-2">{flag}</span>
                <Badge variant={enabled ? "success" : "outline"}>
                  {enabled ? "On" : "Off"}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
