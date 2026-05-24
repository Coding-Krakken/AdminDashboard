"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api, type HealthStatus } from "@/lib/api";
import { Activity, CheckCircle2, XCircle, RefreshCw } from "lucide-react";

export default function HealthPage() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastCheck, setLastCheck] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchHealth = async (background = false) => {
    if (!background) {
      setLoading(true);
    }
    setError(null);

    try {
      const data = await api.getHealth();
      setHealth(data);
      setLastCheck(new Date());
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown health fetch failure";
      setError(message);
    } finally {
      if (!background) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(() => {
      fetchHealth(true);
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">System Health</h2>
          <p className="text-muted-foreground">
            Real-time system status and adapter health
            {lastCheck && (
              <span className="ml-2 text-xs">
                Last checked: {lastCheck.toLocaleTimeString()}
              </span>
            )}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => fetchHealth()} disabled={loading}>
          <RefreshCw className={`size-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
          Check Now
        </Button>
      </div>

      {loading && !health ? (
        <div className="flex items-center justify-center h-64">
          <RefreshCw className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : health ? (
        <>
          {/* Status Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Overall Status
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  {health.pluginsReady && health.settingsReady ? (
                    <CheckCircle2 className="size-5 text-emerald-400" />
                  ) : (
                    <XCircle className="size-5 text-destructive" />
                  )}
                  <span className="text-lg font-semibold">
                    {health.pluginsReady && health.settingsReady ? "Healthy" : "Degraded"}
                  </span>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Plugins Ready
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Badge variant={health.pluginsReady ? "success" : "destructive"} className="text-sm">
                  {health.pluginsReady ? "Ready" : "Not Ready"}
                </Badge>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Settings Ready
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Badge variant={health.settingsReady ? "success" : "destructive"} className="text-sm">
                  {health.settingsReady ? "Ready" : "Not Ready"}
                </Badge>
              </CardContent>
            </Card>
          </div>

          {/* Adapter Status */}
          <Card>
            <CardHeader>
              <CardTitle>Adapter Health</CardTitle>
            </CardHeader>
            <CardContent>
              {health.adapters && Object.keys(health.adapters).length > 0 ? (
                <div className="space-y-3">
                  {Object.entries(health.adapters).map(([name, adapter]) => (
                    <div
                      key={name}
                      className="flex items-center justify-between p-4 rounded-lg border bg-muted/20"
                    >
                      <div className="flex items-center gap-3">
                        <Activity className="size-4 text-muted-foreground" />
                        <div>
                          <p className="text-sm font-medium capitalize">{name}</p>
                          <p className="text-xs text-muted-foreground">
                            Latency: {adapter.latencyMs}ms
                          </p>
                        </div>
                      </div>
                      <Badge
                        variant={adapter.status === "healthy" ? "success" : "destructive"}
                      >
                        {adapter.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <Activity className="size-8 text-muted-foreground mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">
                    Adapter health data will appear after first health probe
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <XCircle className="size-8 text-destructive mb-3" />
            <p className="text-sm text-muted-foreground">Failed to load health data</p>
          </CardContent>
        </Card>
      )}
      {error && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="py-3 text-sm text-destructive">{error}</CardContent>
        </Card>
      )}
    </div>
  );
}
