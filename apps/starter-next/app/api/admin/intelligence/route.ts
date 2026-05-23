import { hasPermission } from "@universal-admin/core";
import { NextResponse } from "next/server";
import {
  authorizeAdminApiRequest,
  getAdminApiPolicy
} from "@/platform/admin-api-policy";
import {
  buildDailyAuditBreakdown,
  buildAuditWindowAnalytics,
  compareAuditWindows,
  deriveIntelligenceAlerts,
  deriveIntelligenceRecommendations,
  deriveIntelligenceKpis
} from "@/platform/intelligence";
import { buildIntelligenceAutomationPulse } from "@/platform/intelligence-runtime";
import {
  buildDashboardModel,
  getCurrentUserContext,
  getProfileCatalog,
  getRuntimeHealth,
  listAuditEvents,
  listIntelligenceAlertPolicies,
  listIntelligenceDispatchSchedules
} from "@/platform/runtime";

function normalizeWindowDays(value: string | null): number {
  if (!value) {
    return 7;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return 7;
  }

  return Math.max(3, Math.min(parsed, 30));
}

export async function GET(request: Request) {
  const authz = await authorizeAdminApiRequest({
    request,
    action: "intelligence:read"
  });
  if (!authz.ok) {
    return authz.response;
  }

  try {
    const url = new URL(request.url);
    const profile = url.searchParams.get("profile") ?? undefined;
    const windowDays = normalizeWindowDays(url.searchParams.get("windowDays"));
    const windowStartIso = new Date(
      Date.now() - windowDays * 24 * 60 * 60 * 1000
    ).toISOString();
    const previousWindowStartIso = new Date(
      Date.now() - windowDays * 2 * 24 * 60 * 60 * 1000
    ).toISOString();

    const [runtime, health, profiles, policyContext, alertPolicies, schedules, automationPulse] = await Promise.all([
      buildDashboardModel({
        profileOverride: profile,
        request
      }),
      getRuntimeHealth({ request }),
      Promise.resolve(getProfileCatalog()),
      getCurrentUserContext(request),
      listIntelligenceAlertPolicies({ request }),
      listIntelligenceDispatchSchedules({ request }),
      buildIntelligenceAutomationPulse({ request, deliveryLimit: 250 })
    ]);

    const canReadAudit = hasPermission(policyContext.policy, "audit:read");
    const [auditEvents, previousAuditEvents] = canReadAudit
      ? await Promise.all([
          listAuditEvents({
            limit: 0,
            since: windowStartIso,
            request
          }),
          listAuditEvents({
            limit: 0,
            since: previousWindowStartIso,
            until: windowStartIso,
            request
          })
        ])
      : [[], []];

    const auditAnalytics = canReadAudit
      ? buildAuditWindowAnalytics(auditEvents, { windowDays })
      : null;
    const previousAuditAnalytics = canReadAudit
      ? buildAuditWindowAnalytics(previousAuditEvents, { windowDays })
      : null;

    const moduleCount = runtime.modules.length;
    const runtimePluginCount = runtime.pluginCounts.runtime;
    const staticPluginCount = runtime.pluginCounts.static;
    const enabledFlagCount = Object.values(runtime.enabledFlags).filter(Boolean).length;

    const kpis = deriveIntelligenceKpis({
      moduleCount,
      pluginCount: runtimePluginCount + staticPluginCount,
      enabledFlagCount,
      strictSignatures: runtime.security.strictSignatures,
      acceptedSigningKeys: runtime.security.acceptedSigningKeys,
      auditAnalytics
    });

    const categoryMix = runtime.modules.reduce<Record<string, number>>((acc, module) => {
      const key = module.category ?? "uncategorized";
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});

    const trendSeries = auditAnalytics
      ? {
          weeklyThroughput: auditAnalytics.trendSeries.throughput,
          reliability: auditAnalytics.trendSeries.reliability,
          riskLoad: auditAnalytics.trendSeries.riskLoad
        }
      : {
          weeklyThroughput: Array.from({ length: windowDays }, () => 0),
          reliability: Array.from({ length: windowDays }, () =>
            health.status === "healthy" ? 98 : 85
          ),
          riskLoad: Array.from({ length: windowDays }, () =>
            health.status === "healthy" ? 4 : 18
          )
        };

    const comparison = auditAnalytics
      ? compareAuditWindows(auditAnalytics, previousAuditAnalytics)
      : {
          throughputDeltaPct: 0,
          reliabilityDelta: 0,
          riskDeltaPct: 0
        };

    const alerts = auditAnalytics
      ? deriveIntelligenceAlerts({
          current: auditAnalytics,
          comparison,
          kpis
        })
      : [];

    const recommendations = auditAnalytics
      ? deriveIntelligenceRecommendations({
          windowDays,
          profileId: runtime.profile.id,
          current: auditAnalytics,
          comparison,
          alerts
        })
      : [];

    const dailyBreakdown = auditAnalytics
      ? buildDailyAuditBreakdown(auditEvents, { windowDays })
      : [];

    const topActors = auditAnalytics
      ? Object.entries(auditAnalytics.byActor)
          .map(([actorId, count]) => ({ actorId, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 5)
      : [];

    return NextResponse.json({
      profile: runtime.profile,
      user: {
        id: runtime.user.id,
        role: runtime.user.role,
        tenantId: runtime.user.tenantId ?? null
      },
      health,
      profiles,
      policy: getAdminApiPolicy(),
      runtime: {
        moduleIds: runtime.modules.map((module) => module.id),
        modulesByCategory: categoryMix,
        enabledFlags: runtime.enabledFlags,
        pluginCounts: runtime.pluginCounts,
        security: runtime.security
      },
      audit: {
        available: canReadAudit,
        summary: auditAnalytics
          ? {
              total: auditAnalytics.total,
              byAction: auditAnalytics.byAction,
              byEntity: auditAnalytics.byEntity,
              byActor: auditAnalytics.byActor
            }
          : null
      },
      kpis,
      trendSeries,
      insights: {
        windowDays,
        comparison,
        alerts,
        recommendations,
        topActors,
        dailyBreakdown,
        topActions: auditAnalytics?.topActions ?? [],
        topEntities: auditAnalytics?.topEntities ?? []
      },
      automation: {
        policyCount: alertPolicies.length,
        enabledPolicyCount: alertPolicies.filter((policy) => policy.enabled).length,
        scheduleCount: schedules.length,
        enabledScheduleCount: schedules.filter((schedule) => schedule.enabled).length,
        readiness: automationPulse.readiness,
        slo: automationPulse.slo,
        policies: alertPolicies.map((policy) => ({
          id: policy.id,
          name: policy.name,
          enabled: policy.enabled,
          severities: policy.severities,
          retryLimit: policy.retryLimit
        }))
      },
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unknown intelligence summary error."
      },
      { status: 500 }
    );
  }
}
