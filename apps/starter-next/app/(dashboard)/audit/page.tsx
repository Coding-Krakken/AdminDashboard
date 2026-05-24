"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  api,
  getAuditEventTimestamp,
  type AuditEvent,
  type AuditSummary,
} from "@/lib/api";
import { AlertTriangle, RefreshCw, ScrollText, Filter } from "lucide-react";

export default function AuditPage() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [summary, setSummary] = useState<AuditSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterDenied, setFilterDenied] = useState(false);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [evts, sum] = await Promise.all([
        api.getAuditEvents({ deniedOnly: filterDenied || undefined, limit: 100 }),
        api.getAuditSummary(),
      ]);
      setEvents(evts);
      setSummary(sum);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown audit fetch failure";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [filterDenied]);

  const filteredEvents = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) {
      return events;
    }

    return events.filter((event) => {
      const timestamp = getAuditEventTimestamp(event) ?? "";
      return [event.action, event.entity, event.entityId, event.actorId, timestamp]
        .join(" ")
        .toLowerCase()
        .includes(term);
    });
  }, [events, query]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Audit Log</h2>
          <p className="text-muted-foreground">
            Security and activity audit trail
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search action, entity, actor..."
            className="h-9 w-56 rounded-md border border-input bg-background px-3 text-sm"
          />
          <Button
            variant={filterDenied ? "default" : "outline"}
            size="sm"
            onClick={() => setFilterDenied(!filterDenied)}
          >
            <Filter className="size-3.5 mr-1.5" />
            Denied Only
          </Button>
          <Button variant="outline" size="sm" onClick={fetchData}>
            <RefreshCw className="size-3.5 mr-1.5" />
            Refresh
          </Button>
        </div>
      </div>

      {error && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="py-3 text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      {/* KPI summary */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Health Score</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary.kpis.healthScore.toFixed(1)}%</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Reliability</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary.kpis.reliabilityScore.toFixed(1)}%</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Events</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary.windowAnalytics.totalEvents}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Denied Events</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-destructive">
                {summary.windowAnalytics.deniedEvents}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Events table */}
      <Card>
        <CardHeader>
          <CardTitle>Events</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : filteredEvents.length === 0 ? (
            <div className="text-center py-12">
              <ScrollText className="size-8 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No audit events found for this filter</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left font-medium text-muted-foreground px-4 py-3">Action</th>
                    <th className="text-left font-medium text-muted-foreground px-4 py-3">Entity</th>
                    <th className="text-left font-medium text-muted-foreground px-4 py-3">Entity ID</th>
                    <th className="text-left font-medium text-muted-foreground px-4 py-3">Actor</th>
                    <th className="text-left font-medium text-muted-foreground px-4 py-3">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEvents.map((event, i) => (
                    <tr
                      key={`${event.action}-${event.entityId}-${i}`}
                      className="border-b last:border-0 hover:bg-muted/20 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {event.action === "authz.denied" ? (
                            <AlertTriangle className="size-3.5 text-destructive shrink-0" />
                          ) : (
                            <ScrollText className="size-3.5 text-muted-foreground shrink-0" />
                          )}
                          <span className="font-medium">{event.action}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="secondary">{event.entity}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                          {event.entityId}
                        </code>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{event.actorId}</td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">
                        {getAuditEventTimestamp(event)
                          ? new Date(getAuditEventTimestamp(event) as string).toLocaleString()
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
