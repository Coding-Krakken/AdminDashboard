import { headers } from "next/headers";
import {
  buildDashboardModel,
  createRequestFromHeaderEntries,
} from "@/platform/runtime";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";

export default async function ModulesPage() {
  const incomingHeaders = await headers();
  const headerEntries: Array<[string, string]> = [];
  incomingHeaders.forEach((value, key) => {
    headerEntries.push([key, value]);
  });

  const request = createRequestFromHeaderEntries(headerEntries);
  const model = await buildDashboardModel({ request });

  const categories = Array.from(
    new Set(model.modules.map((m) => m.category ?? "uncategorized"))
  ).sort();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Modules</h2>
          <p className="text-muted-foreground">
            {model.modules.length} modules registered across {categories.length} categories
          </p>
        </div>
      </div>

      {/* Module Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left font-medium text-muted-foreground px-4 py-3">Module</th>
                  <th className="text-left font-medium text-muted-foreground px-4 py-3">Category</th>
                  <th className="text-left font-medium text-muted-foreground px-4 py-3">Route</th>
                  <th className="text-left font-medium text-muted-foreground px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {model.modules.map((module) => (
                  <tr
                    key={module.id}
                    className="border-b last:border-0 hover:bg-muted/20 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/modules/${module.id}`}
                        className="font-medium text-foreground hover:text-primary transition-colors"
                      >
                        {module.title}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="secondary">{module.category ?? "uncategorized"}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                        {module.route}
                      </code>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="success">Active</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Category breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {categories.map((category) => {
          const catModules = model.modules.filter(
            (m) => (m.category ?? "uncategorized") === category
          );
          return (
            <Card key={category}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium capitalize">
                  {category}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{catModules.length}</div>
                <div className="mt-2 space-y-1">
                  {catModules.slice(0, 4).map((m) => (
                    <p key={m.id} className="text-xs text-muted-foreground truncate">
                      {m.title}
                    </p>
                  ))}
                  {catModules.length > 4 && (
                    <p className="text-xs text-muted-foreground">
                      +{catModules.length - 4} more
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
