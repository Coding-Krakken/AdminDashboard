import { headers } from "next/headers";
import {
  buildDashboardModel,
  createRequestFromHeaderEntries,
} from "@/platform/runtime";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default async function SettingsPage() {
  const incomingHeaders = await headers();
  const headerEntries: Array<[string, string]> = [];
  incomingHeaders.forEach((value, key) => {
    headerEntries.push([key, value]);
  });

  const request = createRequestFromHeaderEntries(headerEntries);
  const model = await buildDashboardModel({ request });

  const settings = model.settingsSnapshots;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Settings</h2>
        <p className="text-muted-foreground">
          Module-level configuration management
        </p>
      </div>

      {settings.length > 0 ? (
        <Tabs defaultValue={settings[0].moduleId} className="space-y-4">
          <TabsList className="flex-wrap h-auto gap-1 p-1">
            {settings.map((s) => (
              <TabsTrigger key={s.moduleId} value={s.moduleId} className="capitalize">
                {s.moduleId}
              </TabsTrigger>
            ))}
          </TabsList>

          {settings.map((snapshot) => (
            <TabsContent key={snapshot.moduleId} value={snapshot.moduleId}>
              <Card>
                <CardHeader>
                  <CardTitle className="capitalize">{snapshot.moduleId} Settings</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {snapshot.values && typeof snapshot.values === "object" ? (
                      Object.entries(snapshot.values as Record<string, unknown>).map(
                        ([key, value]) => (
                          <div
                            key={key}
                            className="flex items-start justify-between p-3 rounded-lg border bg-muted/20"
                          >
                            <div className="min-w-0">
                              <p className="text-sm font-medium">{key}</p>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                Type: {typeof value}
                              </p>
                            </div>
                            <code className="text-xs bg-muted px-2 py-1 rounded max-w-[200px] truncate">
                              {JSON.stringify(value)}
                            </code>
                          </div>
                        )
                      )
                    ) : (
                      <pre className="text-xs bg-muted p-4 rounded-lg overflow-auto">
                        {JSON.stringify(snapshot.values, null, 2)}
                      </pre>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          ))}
        </Tabs>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <p className="text-sm text-muted-foreground">No settings configured</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
