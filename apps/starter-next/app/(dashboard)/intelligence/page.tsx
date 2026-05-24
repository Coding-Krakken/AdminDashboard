"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  api,
  type IntelligenceData,
  type AlertPolicy,
  type DispatchSchedule,
  type Delivery,
} from "@/lib/api";
import {
  Brain,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Webhook,
  Clock,
  Send,
} from "lucide-react";
import { toast } from "sonner";
import {
  buildIntelligenceViewSearch,
  buildIntelligenceViewSummary,
  filterOperationEvents,
  getAutoRefreshPauseReason,
  getAutoRefreshRemainingSeconds,
  formatLatencyMs,
  getElapsedMs,
  isTimestampStale,
  normalizeIntelligenceTab,
  normalizeOperationFilterState,
  type IntelligenceTab,
  readIntelligenceTabFromSearchParams,
  readOperationFiltersFromSearchParams,
  type OperationScopeFilter,
  type OperationStatusFilter,
  shouldCancelInlineEditor,
  shouldSubmitInlineEditorSave,
  shouldSubmitInlineEditorShortcutSave,
  writeIntelligenceTabToSearchParams,
  writeOperationFiltersToSearchParams,
} from "@/lib/intelligence-ui";

type OperationStatus = "success" | "error" | "in-progress";

interface OperationMeta {
  status: OperationStatus;
  message: string;
  at: string;
}

interface LatencyMeta {
  label: string;
  elapsedMs: number;
  at: string;
}

interface OperationEvent {
  id: string;
  scope: "policy" | "schedule";
  targetId: string;
  status: OperationStatus;
  message: string;
  at: string;
}

const AUTO_REFRESH_INTERVAL_SECONDS = 30;
const DATA_STALE_AFTER_SECONDS = 90;
const OPERATION_FILTERS_STORAGE_KEY = "intelligence.operationFilters";
const INTELLIGENCE_TAB_STORAGE_KEY = "intelligence.activeTab";

export default function IntelligencePage() {
  const [intelligence, setIntelligence] = useState<IntelligenceData | null>(null);
  const [policies, setPolicies] = useState<AlertPolicy[]>([]);
  const [schedules, setSchedules] = useState<DispatchSchedule[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [dispatchingScheduleId, setDispatchingScheduleId] = useState<string | null>(null);
  const [dispatchingAll, setDispatchingAll] = useState(false);
  const [savingPolicy, setSavingPolicy] = useState(false);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [savingPolicyId, setSavingPolicyId] = useState<string | null>(null);
  const [savingScheduleId, setSavingScheduleId] = useState<string | null>(null);
  const [deletingPolicyId, setDeletingPolicyId] = useState<string | null>(null);
  const [deletingScheduleId, setDeletingScheduleId] = useState<string | null>(null);
  const [editingPolicyId, setEditingPolicyId] = useState<string | null>(null);
  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<IntelligenceTab>("alerts");
  const [policyDraft, setPolicyDraft] = useState({
    name: "",
    webhookUrl: "",
    severities: ["high"] as Array<"low" | "medium" | "high">,
    retryLimit: 3,
    enabled: true,
  });
  const [scheduleDraft, setScheduleDraft] = useState({
    name: "",
    profileId: "generic",
    cadenceMinutes: 60,
    windowDays: 7,
    cooldownMinutes: 15,
    enabled: true,
  });
  const [editingPolicyDraft, setEditingPolicyDraft] = useState({
    name: "",
    webhookUrl: "",
    severities: ["high"] as Array<"low" | "medium" | "high">,
    retryLimit: 3,
    enabled: true,
  });
  const [editingScheduleDraft, setEditingScheduleDraft] = useState({
    name: "",
    profileId: "generic",
    cadenceMinutes: 60,
    windowDays: 7,
    cooldownMinutes: 15,
    enabled: true,
  });
  const [deliveryStatusFilter, setDeliveryStatusFilter] = useState<
    "all" | "delivered" | "failed" | "skipped"
  >("all");
  const [deliveryQuery, setDeliveryQuery] = useState("");
  const [policyOperations, setPolicyOperations] = useState<Record<string, OperationMeta>>({});
  const [scheduleOperations, setScheduleOperations] = useState<Record<string, OperationMeta>>({});
  const [operationTimeline, setOperationTimeline] = useState<OperationEvent[]>([]);
  const [operationScopeFilter, setOperationScopeFilter] = useState<OperationScopeFilter>("all");
  const [operationStatusFilter, setOperationStatusFilter] = useState<OperationStatusFilter>("all");
  const [operationQuery, setOperationQuery] = useState("");
  const [lastFetchLatencyMs, setLastFetchLatencyMs] = useState<number | null>(null);
  const [lastFetchAt, setLastFetchAt] = useState<string | null>(null);
  const [lastActionLatency, setLastActionLatency] = useState<LatencyMeta | null>(null);
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true);
  const [clockTickMs, setClockTickMs] = useState(() => Date.now());
  const editingPolicyNameInputRef = useRef<HTMLInputElement | null>(null);
  const editingScheduleNameInputRef = useRef<HTMLInputElement | null>(null);
  const isFetchingRef = useRef(false);
  const hasInitializedOperationFiltersRef = useRef(false);
  const hasInitializedTabRef = useRef(false);

  const pushOperationEvent = (
    scope: "policy" | "schedule",
    targetId: string,
    status: OperationStatus,
    message: string
  ) => {
    const at = new Date().toISOString();
    setOperationTimeline((current) => [
      {
        id: `${scope}-${targetId}-${at}`,
        scope,
        targetId,
        status,
        message,
        at,
      },
      ...current,
    ].slice(0, 20));
  };

  const setPolicyOperation = (policyId: string, status: OperationStatus, message: string) => {
    pushOperationEvent("policy", policyId, status, message);
    setPolicyOperations((current) => ({
      ...current,
      [policyId]: {
        status,
        message,
        at: new Date().toISOString(),
      },
    }));
  };

  const setScheduleOperation = (
    scheduleId: string,
    status: OperationStatus,
    message: string
  ) => {
    pushOperationEvent("schedule", scheduleId, status, message);
    setScheduleOperations((current) => ({
      ...current,
      [scheduleId]: {
        status,
        message,
        at: new Date().toISOString(),
      },
    }));
  };

  const operationBadgeVariant = (status: OperationStatus) => {
    if (status === "success") {
      return "success" as const;
    }

    if (status === "error") {
      return "destructive" as const;
    }

    return "secondary" as const;
  };

  const captureActionLatency = (label: string, startedAt: number): number => {
    const elapsedMs = getElapsedMs(startedAt, performance.now());
    setLastActionLatency({
      label,
      elapsedMs,
      at: new Date().toISOString(),
    });
    return elapsedMs;
  };

  const reportSuccess = (message: string) => {
    setSuccess(message);
    setError(null);
    toast.success(message);
  };

  const reportError = (message: string) => {
    setError(message);
    setSuccess(null);
    toast.error(message);
  };

  const hasPolicyDraftChanges = (
    policy: AlertPolicy,
    draft = editingPolicyDraft
  ): boolean => {
    const severitiesMatch =
      policy.severities.length === draft.severities.length &&
      policy.severities.every((severity) => draft.severities.includes(severity));

    return (
      policy.name !== draft.name ||
      policy.webhookUrl !== draft.webhookUrl ||
      policy.retryLimit !== draft.retryLimit ||
      policy.enabled !== draft.enabled ||
      !severitiesMatch
    );
  };

  const hasScheduleDraftChanges = (
    schedule: DispatchSchedule,
    draft = editingScheduleDraft
  ): boolean => {
    return (
      schedule.name !== draft.name ||
      schedule.profileId !== draft.profileId ||
      schedule.cadenceMinutes !== draft.cadenceMinutes ||
      schedule.windowDays !== draft.windowDays ||
      schedule.cooldownMinutes !== draft.cooldownMinutes ||
      schedule.enabled !== draft.enabled
    );
  };

  const activeEditingPolicy = useMemo(
    () => (editingPolicyId ? policies.find((policy) => policy.id === editingPolicyId) ?? null : null),
    [editingPolicyId, policies]
  );

  const activeEditingSchedule = useMemo(
    () =>
      editingScheduleId
        ? schedules.find((schedule) => schedule.id === editingScheduleId) ?? null
        : null,
    [editingScheduleId, schedules]
  );

  const hasUnsavedPolicyChanges = activeEditingPolicy
    ? hasPolicyDraftChanges(activeEditingPolicy)
    : false;
  const hasUnsavedScheduleChanges = activeEditingSchedule
    ? hasScheduleDraftChanges(activeEditingSchedule)
    : false;
  const hasUnsavedChanges = hasUnsavedPolicyChanges || hasUnsavedScheduleChanges;
  const autoRefreshPauseReason = getAutoRefreshPauseReason({
    autoRefreshEnabled,
    hasUnsavedChanges,
  });
  const autoRefreshRemainingSeconds = getAutoRefreshRemainingSeconds({
    lastFetchAt,
    nowMs: clockTickMs,
    intervalSeconds: AUTO_REFRESH_INTERVAL_SECONDS,
  });
  const isDataStale = isTimestampStale({
    timestamp: lastFetchAt,
    nowMs: clockTickMs,
    staleAfterSeconds: DATA_STALE_AFTER_SECONDS,
  });

  const filteredOperationTimeline = useMemo(
    () =>
      filterOperationEvents(operationTimeline, {
        scope: operationScopeFilter,
        status: operationStatusFilter,
        query: operationQuery,
      }),
    [operationTimeline, operationScopeFilter, operationStatusFilter, operationQuery]
  );

  const operationViewSummary = buildIntelligenceViewSummary({
    tab: activeTab,
    filters: {
      scope: operationScopeFilter,
      status: operationStatusFilter,
      query: operationQuery,
    },
  });

  const resetOperationFilters = () => {
    setOperationScopeFilter("all");
    setOperationStatusFilter("all");
    setOperationQuery("");
  };

  const fetchAll = async (options?: { silent?: boolean }) => {
    if (isFetchingRef.current) {
      return;
    }

    const silent = options?.silent ?? false;
    const startedAt = performance.now();
    isFetchingRef.current = true;
    if (!silent) {
      setLoading(true);
    }
    setError(null);
    try {
      const [intel, pols, scheds, dels] = await Promise.all([
        api.getIntelligence(),
        api.getPolicies(),
        api.getSchedules(),
        api.getDeliveries(),
      ]);
      setIntelligence(intel);
      setPolicies(pols);
      setSchedules(scheds);
      setDeliveries(dels);
      const elapsedMs = getElapsedMs(startedAt, performance.now());
      setLastFetchLatencyMs(elapsedMs);
      setLastFetchAt(new Date().toISOString());
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown intelligence fetch failure";
      reportError(message);
    } finally {
      isFetchingRef.current = false;
      if (!silent) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    fetchAll();
  }, []);

  useEffect(() => {
    if (!autoRefreshEnabled || hasUnsavedChanges) {
      return;
    }

    const intervalId = globalThis.setInterval(() => {
      void fetchAll({ silent: true });
    }, AUTO_REFRESH_INTERVAL_SECONDS * 1000);

    return () => {
      globalThis.clearInterval(intervalId);
    };
  }, [autoRefreshEnabled, hasUnsavedChanges]);

  useEffect(() => {
    const intervalId = globalThis.setInterval(() => {
      setClockTickMs(Date.now());
    }, 1000);

    return () => {
      globalThis.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    if (hasInitializedOperationFiltersRef.current) {
      return;
    }

    const fromSearch = readOperationFiltersFromSearchParams(globalThis.location.search);
    if (fromSearch.hasAny) {
      setOperationScopeFilter(fromSearch.filters.scope);
      setOperationStatusFilter(fromSearch.filters.status);
      setOperationQuery(fromSearch.filters.query);
      hasInitializedOperationFiltersRef.current = true;
      return;
    }

    try {
      const raw = globalThis.localStorage.getItem(OPERATION_FILTERS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as {
          scope?: string;
          status?: string;
          query?: string;
        };
        const normalized = normalizeOperationFilterState({
          scope: parsed.scope ?? null,
          status: parsed.status ?? null,
          query: parsed.query ?? null,
        });
        setOperationScopeFilter(normalized.scope);
        setOperationStatusFilter(normalized.status);
        setOperationQuery(normalized.query);
      }
    } catch {
      // Ignore malformed local storage values and fall back to defaults.
    } finally {
      hasInitializedOperationFiltersRef.current = true;
    }
  }, []);

  useEffect(() => {
    if (hasInitializedTabRef.current) {
      return;
    }

    const fromSearch = readIntelligenceTabFromSearchParams(globalThis.location.search);
    if (fromSearch.hasAny) {
      setActiveTab(fromSearch.tab);
      hasInitializedTabRef.current = true;
      return;
    }

    try {
      const storedTab = globalThis.localStorage.getItem(INTELLIGENCE_TAB_STORAGE_KEY);
      if (storedTab) {
        setActiveTab(normalizeIntelligenceTab(storedTab));
      }
    } catch {
      // Ignore local storage failures and keep default tab.
    } finally {
      hasInitializedTabRef.current = true;
    }
  }, []);

  useEffect(() => {
    if (!hasInitializedOperationFiltersRef.current) {
      return;
    }

    const normalized = normalizeOperationFilterState({
      scope: operationScopeFilter,
      status: operationStatusFilter,
      query: operationQuery,
    });

    try {
      globalThis.localStorage.setItem(OPERATION_FILTERS_STORAGE_KEY, JSON.stringify(normalized));
    } catch {
      // Ignore local storage failures in private modes.
    }

    const nextSearch = writeOperationFiltersToSearchParams(globalThis.location.search, normalized);
    const nextUrl = `${globalThis.location.pathname}${nextSearch}${globalThis.location.hash}`;
    globalThis.history.replaceState(globalThis.history.state, "", nextUrl);
  }, [operationScopeFilter, operationStatusFilter, operationQuery]);

  useEffect(() => {
    if (!hasInitializedTabRef.current) {
      return;
    }

    try {
      globalThis.localStorage.setItem(INTELLIGENCE_TAB_STORAGE_KEY, activeTab);
    } catch {
      // Ignore local storage failures in private modes.
    }

    const nextSearch = writeIntelligenceTabToSearchParams(globalThis.location.search, activeTab);
    const nextUrl = `${globalThis.location.pathname}${nextSearch}${globalThis.location.hash}`;
    globalThis.history.replaceState(globalThis.history.state, "", nextUrl);
  }, [activeTab]);

  const handleCopyTimeline = async () => {
    const payload = JSON.stringify(filteredOperationTimeline, null, 2);
    try {
      await navigator.clipboard.writeText(payload);
      toast.success(`Copied ${filteredOperationTimeline.length} operation records.`);
    } catch {
      reportError("Unable to copy timeline to clipboard.");
    }
  };

  const handleCopyCurrentViewLink = async () => {
    const search = buildIntelligenceViewSearch({
      search: globalThis.location.search,
      tab: activeTab,
      filters: {
        scope: operationScopeFilter,
        status: operationStatusFilter,
        query: operationQuery,
      },
    });
    const shareUrl = `${globalThis.location.origin}${globalThis.location.pathname}${search}${globalThis.location.hash}`;

    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success("Copied shareable view link.");
    } catch {
      reportError("Unable to copy shareable view link.");
    }
  };

  useEffect(() => {
    if (!editingPolicyId) {
      return;
    }

    editingPolicyNameInputRef.current?.focus();
    editingPolicyNameInputRef.current?.select();
  }, [editingPolicyId]);

  useEffect(() => {
    if (!editingScheduleId) {
      return;
    }

    editingScheduleNameInputRef.current?.focus();
    editingScheduleNameInputRef.current?.select();
  }, [editingScheduleId]);

  useEffect(() => {
    if (!success) {
      return;
    }

    const timeoutId = globalThis.setTimeout(() => {
      setSuccess(null);
    }, 4500);

    return () => {
      globalThis.clearTimeout(timeoutId);
    };
  }, [success]);

  useEffect(() => {
    if (!hasUnsavedChanges) {
      return;
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    globalThis.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      globalThis.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [hasUnsavedChanges]);

  useEffect(() => {
    if (!editingPolicyId && !editingScheduleId) {
      return;
    }

    const handleWindowKeyDown = (event: KeyboardEvent) => {
      if (
        !shouldSubmitInlineEditorShortcutSave({
          key: event.key,
          metaKey: event.metaKey,
          ctrlKey: event.ctrlKey,
        })
      ) {
        return;
      }

      if (editingPolicyId && activeEditingPolicy) {
        event.preventDefault();
        void handleSavePolicy(activeEditingPolicy);
        return;
      }

      if (editingScheduleId && activeEditingSchedule) {
        event.preventDefault();
        void handleSaveSchedule(activeEditingSchedule);
      }
    };

    globalThis.addEventListener("keydown", handleWindowKeyDown);
    return () => {
      globalThis.removeEventListener("keydown", handleWindowKeyDown);
    };
  }, [editingPolicyId, editingScheduleId, activeEditingPolicy, activeEditingSchedule]);

  const handleDispatch = async (schedule: DispatchSchedule) => {
    const startedAt = performance.now();
    setDispatchingScheduleId(schedule.id);
    setError(null);
    setSuccess(null);
    try {
      await api.dispatch({
        profile: schedule.profileId,
        windowDays: schedule.windowDays,
      });
      const elapsedMs = captureActionLatency(`Dispatch ${schedule.name}`, startedAt);
      setScheduleOperation(schedule.id, "success", `Schedule dispatched in ${formatLatencyMs(elapsedMs)}`);
      reportSuccess(`Dispatched schedule ${schedule.name} in ${formatLatencyMs(elapsedMs)}.`);
      await fetchAll({ silent: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown dispatch failure";
      const elapsedMs = captureActionLatency(`Dispatch ${schedule.name}`, startedAt);
      setScheduleOperation(schedule.id, "error", `Dispatch failed in ${formatLatencyMs(elapsedMs)}`);
      reportError(message);
    } finally {
      setDispatchingScheduleId(null);
    }
  };

  const handleDispatchAll = async () => {
    const activeSchedules = schedules.filter((schedule) => schedule.enabled);
    if (activeSchedules.length === 0) {
      reportError("No active schedules available for dispatch.");
      return;
    }

    const startedAt = performance.now();
    setDispatchingAll(true);
    setError(null);
    setSuccess(null);

    try {
      await Promise.all(
        activeSchedules.map((schedule) =>
          api.dispatch({
            profile: schedule.profileId,
            windowDays: schedule.windowDays,
          })
        )
      );
      const elapsedMs = captureActionLatency("Dispatch all active schedules", startedAt);
      reportSuccess(
        `Dispatched ${activeSchedules.length} active schedules in ${formatLatencyMs(elapsedMs)}.`
      );
      await fetchAll({ silent: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown bulk dispatch failure";
      captureActionLatency("Dispatch all active schedules", startedAt);
      reportError(message);
    } finally {
      setDispatchingAll(false);
    }
  };

  const toggleSeverity = (
    severity: "low" | "medium" | "high",
    target: "create" | "edit"
  ) => {
    const updater = (previous: {
      name: string;
      webhookUrl: string;
      severities: Array<"low" | "medium" | "high">;
      retryLimit: number;
      enabled: boolean;
    }) => {
      const hasSeverity = previous.severities.includes(severity);
      if (hasSeverity) {
        const next = previous.severities.filter((item) => item !== severity);
        return {
          ...previous,
          severities: next.length > 0 ? next : previous.severities,
        };
      }

      return {
        ...previous,
        severities: [...previous.severities, severity],
      };
    };

    if (target === "create") {
      setPolicyDraft(updater);
      return;
    }

    setEditingPolicyDraft(updater);
  };

  const beginEditPolicy = (policy: AlertPolicy) => {
    if (editingPolicyId && editingPolicyId !== policy.id) {
      const activePolicy = policies.find((entry) => entry.id === editingPolicyId);
      if (
        activePolicy &&
        hasPolicyDraftChanges(activePolicy) &&
        !globalThis.confirm("Discard unsaved policy changes?")
      ) {
        return;
      }
    }

    setEditingPolicyId(policy.id);
    setEditingPolicyDraft({
      name: policy.name,
      webhookUrl: policy.webhookUrl,
      severities: policy.severities,
      retryLimit: policy.retryLimit,
      enabled: policy.enabled,
    });
  };

  const beginEditSchedule = (schedule: DispatchSchedule) => {
    if (editingScheduleId && editingScheduleId !== schedule.id) {
      const activeSchedule = schedules.find((entry) => entry.id === editingScheduleId);
      if (
        activeSchedule &&
        hasScheduleDraftChanges(activeSchedule) &&
        !globalThis.confirm("Discard unsaved schedule changes?")
      ) {
        return;
      }
    }

    setEditingScheduleId(schedule.id);
    setEditingScheduleDraft({
      name: schedule.name,
      profileId: schedule.profileId,
      cadenceMinutes: schedule.cadenceMinutes,
      windowDays: schedule.windowDays,
      cooldownMinutes: schedule.cooldownMinutes,
      enabled: schedule.enabled,
    });
  };

  const handleSavePolicy = async (policy: AlertPolicy) => {
    if (!editingPolicyDraft.name.trim() || !editingPolicyDraft.webhookUrl.trim()) {
      reportError("Policy name and webhook URL are required.");
      return;
    }

    const startedAt = performance.now();
    setSavingPolicyId(policy.id);
    setError(null);
    setSuccess(null);

    const previousPolicies = policies;
    const optimisticTimestamp = new Date().toISOString();
    const optimisticPolicy: AlertPolicy = {
      ...policy,
      ...editingPolicyDraft,
      version: policy.version + 1,
      updatedAt: optimisticTimestamp,
    };

    setPolicies((current) =>
      current.map((entry) => (entry.id === policy.id ? optimisticPolicy : entry))
    );
    setEditingPolicyId(null);
    setPolicyOperation(policy.id, "in-progress", "Saving policy...");

    try {
      await api.updatePolicy({
        id: policy.id,
        expectedVersion: policy.version,
        ...editingPolicyDraft,
      });
      const elapsedMs = captureActionLatency(`Update policy ${editingPolicyDraft.name}`, startedAt);
      reportSuccess(`Updated policy ${editingPolicyDraft.name} in ${formatLatencyMs(elapsedMs)}.`);
      setPolicyOperation(policy.id, "success", `Policy updated in ${formatLatencyMs(elapsedMs)}`);
      await fetchAll({ silent: true });
    } catch (err) {
      setPolicies(previousPolicies);
      setEditingPolicyId(policy.id);
      const message = err instanceof Error ? err.message : "Unknown policy update failure";
      const elapsedMs = captureActionLatency(`Update policy ${editingPolicyDraft.name}`, startedAt);
      reportError(message);
      setPolicyOperation(policy.id, "error", `Policy update failed in ${formatLatencyMs(elapsedMs)}`);
    } finally {
      setSavingPolicyId(null);
    }
  };

  const handleSaveSchedule = async (schedule: DispatchSchedule) => {
    if (!editingScheduleDraft.name.trim()) {
      reportError("Schedule name is required.");
      return;
    }

    const startedAt = performance.now();
    setSavingScheduleId(schedule.id);
    setError(null);
    setSuccess(null);

    const previousSchedules = schedules;
    const optimisticTimestamp = new Date().toISOString();
    const optimisticSchedule: DispatchSchedule = {
      ...schedule,
      ...editingScheduleDraft,
      version: schedule.version + 1,
      updatedAt: optimisticTimestamp,
    };

    setSchedules((current) =>
      current.map((entry) => (entry.id === schedule.id ? optimisticSchedule : entry))
    );
    setEditingScheduleId(null);
    setScheduleOperation(schedule.id, "in-progress", "Saving schedule...");

    try {
      await api.updateSchedule({
        id: schedule.id,
        expectedVersion: schedule.version,
        ...editingScheduleDraft,
      });
      const elapsedMs = captureActionLatency(`Update schedule ${editingScheduleDraft.name}`, startedAt);
      reportSuccess(`Updated schedule ${editingScheduleDraft.name} in ${formatLatencyMs(elapsedMs)}.`);
      setScheduleOperation(schedule.id, "success", `Schedule updated in ${formatLatencyMs(elapsedMs)}`);
      await fetchAll({ silent: true });
    } catch (err) {
      setSchedules(previousSchedules);
      setEditingScheduleId(schedule.id);
      const message = err instanceof Error ? err.message : "Unknown schedule update failure";
      const elapsedMs = captureActionLatency(`Update schedule ${editingScheduleDraft.name}`, startedAt);
      reportError(message);
      setScheduleOperation(
        schedule.id,
        "error",
        `Schedule update failed in ${formatLatencyMs(elapsedMs)}`
      );
    } finally {
      setSavingScheduleId(null);
    }
  };

  const handleCancelPolicyEdit = (policy: AlertPolicy) => {
    if (
      hasPolicyDraftChanges(policy) &&
      !globalThis.confirm("Discard unsaved policy changes?")
    ) {
      return;
    }

    setEditingPolicyId(null);
  };

  const handleCancelScheduleEdit = (schedule: DispatchSchedule) => {
    if (
      hasScheduleDraftChanges(schedule) &&
      !globalThis.confirm("Discard unsaved schedule changes?")
    ) {
      return;
    }

    setEditingScheduleId(null);
  };

  const handleTogglePolicyEnabled = async (policy: AlertPolicy) => {
    const startedAt = performance.now();
    const previousPolicies = policies;
    setSavingPolicyId(policy.id);
    setError(null);
    setSuccess(null);

    setPolicies((current) =>
      current.map((entry) =>
        entry.id === policy.id ? { ...entry, enabled: !entry.enabled } : entry
      )
    );

    try {
      await api.updatePolicy({
        id: policy.id,
        expectedVersion: policy.version,
        name: policy.name,
        webhookUrl: policy.webhookUrl,
        severities: policy.severities,
        retryLimit: policy.retryLimit,
        enabled: !policy.enabled,
      });
      const elapsedMs = captureActionLatency(
        `${policy.enabled ? "Disable" : "Enable"} policy ${policy.name}`,
        startedAt
      );
      reportSuccess(
        `${policy.enabled ? "Disabled" : "Enabled"} policy ${policy.name} in ${formatLatencyMs(elapsedMs)}.`
      );
      setPolicyOperation(
        policy.id,
        "success",
        `${policy.enabled ? "Policy disabled" : "Policy enabled"} in ${formatLatencyMs(elapsedMs)}`
      );
      await fetchAll({ silent: true });
    } catch (err) {
      setPolicies(previousPolicies);
      const message = err instanceof Error ? err.message : "Unknown policy toggle failure";
      const elapsedMs = captureActionLatency(
        `${policy.enabled ? "Disable" : "Enable"} policy ${policy.name}`,
        startedAt
      );
      reportError(message);
      setPolicyOperation(policy.id, "error", `Policy toggle failed in ${formatLatencyMs(elapsedMs)}`);
    } finally {
      setSavingPolicyId(null);
    }
  };

  const handleToggleScheduleEnabled = async (schedule: DispatchSchedule) => {
    const startedAt = performance.now();
    const previousSchedules = schedules;
    setSavingScheduleId(schedule.id);
    setError(null);
    setSuccess(null);

    setSchedules((current) =>
      current.map((entry) =>
        entry.id === schedule.id ? { ...entry, enabled: !entry.enabled } : entry
      )
    );

    try {
      await api.updateSchedule({
        id: schedule.id,
        expectedVersion: schedule.version,
        name: schedule.name,
        profileId: schedule.profileId,
        cadenceMinutes: schedule.cadenceMinutes,
        windowDays: schedule.windowDays,
        cooldownMinutes: schedule.cooldownMinutes,
        enabled: !schedule.enabled,
      });
      const elapsedMs = captureActionLatency(
        `${schedule.enabled ? "Disable" : "Enable"} schedule ${schedule.name}`,
        startedAt
      );
      reportSuccess(
        `${schedule.enabled ? "Disabled" : "Enabled"} schedule ${schedule.name} in ${formatLatencyMs(elapsedMs)}.`
      );
      setScheduleOperation(
        schedule.id,
        "success",
        `${schedule.enabled ? "Schedule disabled" : "Schedule enabled"} in ${formatLatencyMs(elapsedMs)}`
      );
      await fetchAll({ silent: true });
    } catch (err) {
      setSchedules(previousSchedules);
      const message = err instanceof Error ? err.message : "Unknown schedule toggle failure";
      const elapsedMs = captureActionLatency(
        `${schedule.enabled ? "Disable" : "Enable"} schedule ${schedule.name}`,
        startedAt
      );
      reportError(message);
      setScheduleOperation(schedule.id, "error", `Schedule toggle failed in ${formatLatencyMs(elapsedMs)}`);
    } finally {
      setSavingScheduleId(null);
    }
  };

  const filteredDeliveries = useMemo(() => {
    const query = deliveryQuery.trim().toLowerCase();

    return deliveries.filter((delivery) => {
      const statusMatch =
        deliveryStatusFilter === "all" || delivery.status === deliveryStatusFilter;

      if (!statusMatch) {
        return false;
      }

      if (!query) {
        return true;
      }

      return [delivery.alertId, delivery.policyId, delivery.windowToken, delivery.status]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [deliveries, deliveryQuery, deliveryStatusFilter]);

  const handleCreatePolicy = async () => {
    if (!policyDraft.name.trim() || !policyDraft.webhookUrl.trim()) {
      reportError("Policy name and webhook URL are required.");
      return;
    }

    const startedAt = performance.now();
    setSavingPolicy(true);
    setError(null);
    setSuccess(null);
    try {
      await api.createPolicy(policyDraft);
      setPolicyDraft({
        name: "",
        webhookUrl: "",
        severities: ["high"],
        retryLimit: 3,
        enabled: true,
      });
      const elapsedMs = captureActionLatency(`Create policy ${policyDraft.name}`, startedAt);
      reportSuccess(`Created policy ${policyDraft.name} in ${formatLatencyMs(elapsedMs)}.`);
      await fetchAll({ silent: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown policy creation failure";
      captureActionLatency(`Create policy ${policyDraft.name}`, startedAt);
      reportError(message);
    } finally {
      setSavingPolicy(false);
    }
  };

  const handleDeletePolicy = async (policy: AlertPolicy) => {
    const confirmed = globalThis.confirm(
      `Delete policy \"${policy.name}\"? This action cannot be undone.`
    );

    if (!confirmed) {
      return;
    }

    const previousPolicies = policies;
    const startedAt = performance.now();
    setError(null);
    setSuccess(null);
    setDeletingPolicyId(policy.id);

    setPolicies((current) => current.filter((entry) => entry.id !== policy.id));
    setPolicyOperation(policy.id, "in-progress", "Deleting policy...");

    try {
      await api.deletePolicy(policy.id, policy.version);
      const elapsedMs = captureActionLatency(`Delete policy ${policy.name}`, startedAt);
      reportSuccess(`Deleted policy ${policy.name} in ${formatLatencyMs(elapsedMs)}.`);
      setPolicyOperation(policy.id, "success", `Policy deleted in ${formatLatencyMs(elapsedMs)}`);
      await fetchAll({ silent: true });
    } catch (err) {
      setPolicies(previousPolicies);
      const message = err instanceof Error ? err.message : "Unknown policy deletion failure";
      const elapsedMs = captureActionLatency(`Delete policy ${policy.name}`, startedAt);
      reportError(message);
      setPolicyOperation(policy.id, "error", `Policy delete failed in ${formatLatencyMs(elapsedMs)}`);
    } finally {
      setDeletingPolicyId(null);
    }
  };

  const handleCreateSchedule = async () => {
    if (!scheduleDraft.name.trim()) {
      reportError("Schedule name is required.");
      return;
    }

    const startedAt = performance.now();
    setSavingSchedule(true);
    setError(null);
    setSuccess(null);
    try {
      await api.createSchedule(scheduleDraft);
      setScheduleDraft({
        name: "",
        profileId: "generic",
        cadenceMinutes: 60,
        windowDays: 7,
        cooldownMinutes: 15,
        enabled: true,
      });
      const elapsedMs = captureActionLatency(`Create schedule ${scheduleDraft.name}`, startedAt);
      reportSuccess(`Created schedule ${scheduleDraft.name} in ${formatLatencyMs(elapsedMs)}.`);
      await fetchAll({ silent: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown schedule creation failure";
      captureActionLatency(`Create schedule ${scheduleDraft.name}`, startedAt);
      reportError(message);
    } finally {
      setSavingSchedule(false);
    }
  };

  const handleDeleteSchedule = async (schedule: DispatchSchedule) => {
    const confirmed = globalThis.confirm(
      `Delete schedule \"${schedule.name}\"? This action cannot be undone.`
    );

    if (!confirmed) {
      return;
    }

    const previousSchedules = schedules;
    const startedAt = performance.now();
    setError(null);
    setSuccess(null);
    setDeletingScheduleId(schedule.id);

    setSchedules((current) => current.filter((entry) => entry.id !== schedule.id));
    setScheduleOperation(schedule.id, "in-progress", "Deleting schedule...");

    try {
      await api.deleteSchedule(schedule.id, schedule.version);
      const elapsedMs = captureActionLatency(`Delete schedule ${schedule.name}`, startedAt);
      reportSuccess(`Deleted schedule ${schedule.name} in ${formatLatencyMs(elapsedMs)}.`);
      setScheduleOperation(schedule.id, "success", `Schedule deleted in ${formatLatencyMs(elapsedMs)}`);
      await fetchAll({ silent: true });
    } catch (err) {
      setSchedules(previousSchedules);
      const message = err instanceof Error ? err.message : "Unknown schedule deletion failure";
      const elapsedMs = captureActionLatency(`Delete schedule ${schedule.name}`, startedAt);
      reportError(message);
      setScheduleOperation(
        schedule.id,
        "error",
        `Schedule delete failed in ${formatLatencyMs(elapsedMs)}`
      );
    } finally {
      setDeletingScheduleId(null);
    }
  };

  const handlePolicyEditorKeyDown = (
    event: React.KeyboardEvent<HTMLDivElement>,
    policy: AlertPolicy
  ) => {
    if (shouldCancelInlineEditor({ key: event.key })) {
      event.preventDefault();
      handleCancelPolicyEdit(policy);
      return;
    }

    if (
      shouldSubmitInlineEditorSave({
        key: event.key,
        shiftKey: event.shiftKey,
        targetTagName: (event.target as HTMLElement).tagName,
      })
    ) {
      const target = event.target as HTMLElement;
      if (target.tagName.toUpperCase() === "INPUT") {
        event.preventDefault();
        void handleSavePolicy(policy);
      }
    }
  };

  const handleScheduleEditorKeyDown = (
    event: React.KeyboardEvent<HTMLDivElement>,
    schedule: DispatchSchedule
  ) => {
    if (shouldCancelInlineEditor({ key: event.key })) {
      event.preventDefault();
      handleCancelScheduleEdit(schedule);
      return;
    }

    if (
      shouldSubmitInlineEditorSave({
        key: event.key,
        shiftKey: event.shiftKey,
        targetTagName: (event.target as HTMLElement).tagName,
      })
    ) {
      const target = event.target as HTMLElement;
      if (target.tagName.toUpperCase() === "INPUT") {
        event.preventDefault();
        void handleSaveSchedule(schedule);
      }
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Intelligence</h2>
          <p className="text-muted-foreground">
            Automated alerting, SLO monitoring, and dispatch management
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
            {lastFetchLatencyMs !== null && (
              <Badge variant="outline">Last refresh: {formatLatencyMs(lastFetchLatencyMs)}</Badge>
            )}
            {lastFetchAt && (
              <Badge variant="outline">Fetched: {new Date(lastFetchAt).toLocaleTimeString()}</Badge>
            )}
            {lastActionLatency && (
              <Badge variant="secondary">
                Last action: {lastActionLatency.label} in {formatLatencyMs(lastActionLatency.elapsedMs)}
              </Badge>
            )}
            <Badge variant={autoRefreshEnabled ? "success" : "outline"}>
              Auto-refresh {autoRefreshEnabled ? "on" : "off"}
            </Badge>
            {autoRefreshPauseReason ? (
              <Badge variant="warning">{autoRefreshPauseReason}</Badge>
            ) : (
              <Badge variant="secondary">Next refresh in {autoRefreshRemainingSeconds}s</Badge>
            )}
            {isDataStale && <Badge variant="destructive">Data stale</Badge>}
            {hasUnsavedChanges && <Badge variant="warning">Unsaved edits</Badge>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAutoRefreshEnabled((current) => !current)}
          >
            {autoRefreshEnabled ? "Pause Auto-refresh" : "Resume Auto-refresh"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (
                hasUnsavedChanges &&
                !globalThis.confirm("Refreshing now will discard unsaved edits. Continue?")
              ) {
                return;
              }

              fetchAll();
            }}
          >
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

      {success && (
        <Card className="border-emerald-500/40 bg-emerald-500/10">
          <CardContent className="py-3 text-sm text-emerald-300">{success}</CardContent>
        </Card>
      )}

      {/* KPIs */}
      {intelligence && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Health</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{intelligence.kpis.healthScore.toFixed(1)}%</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Reliability</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{intelligence.kpis.reliabilityScore.toFixed(1)}%</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Velocity</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{intelligence.kpis.velocityScore.toFixed(1)}%</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Security</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{intelligence.kpis.securityScore.toFixed(1)}%</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as IntelligenceTab)} className="space-y-4">
        <TabsList>
          <TabsTrigger value="alerts">Alerts</TabsTrigger>
          <TabsTrigger value="slo">SLO Report</TabsTrigger>
          <TabsTrigger value="policies">Policies</TabsTrigger>
          <TabsTrigger value="schedules">Schedules</TabsTrigger>
          <TabsTrigger value="deliveries">Deliveries</TabsTrigger>
          <TabsTrigger value="operations">Operations</TabsTrigger>
        </TabsList>

        {/* Alerts Tab */}
        <TabsContent value="alerts">
          <Card>
            <CardHeader>
              <CardTitle>Active Alerts</CardTitle>
            </CardHeader>
            <CardContent>
              {intelligence?.alerts && intelligence.alerts.length > 0 ? (
                <div className="space-y-3">
                  {intelligence.alerts.map((alert) => (
                    <div
                      key={alert.id}
                      className={`p-4 rounded-lg border ${
                        alert.severity === "high"
                          ? "border-destructive/50 bg-destructive/5"
                          : alert.severity === "medium"
                            ? "border-amber-500/50 bg-amber-500/5"
                            : "border-border bg-muted/20"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 min-w-0">
                          <AlertTriangle
                            className={`size-4 shrink-0 mt-0.5 ${
                              alert.severity === "high"
                                ? "text-destructive"
                                : alert.severity === "medium"
                                  ? "text-amber-400"
                                  : "text-muted-foreground"
                            }`}
                          />
                          <div className="min-w-0">
                            <p className="font-medium text-sm">{alert.title}</p>
                            <p className="text-xs text-muted-foreground mt-1">
                              {alert.description}
                            </p>
                          </div>
                        </div>
                        <Badge
                          variant={
                            alert.severity === "high"
                              ? "destructive"
                              : alert.severity === "medium"
                                ? "warning"
                                : "secondary"
                          }
                        >
                          {alert.severity}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <CheckCircle2 className="size-8 text-emerald-400 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">No active alerts</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recommendations */}
          {intelligence?.recommendations && intelligence.recommendations.length > 0 && (
            <Card className="mt-4">
              <CardHeader>
                <CardTitle>Recommendations</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {intelligence.recommendations.map((rec) => (
                    <div key={rec.id} className="p-3 rounded-lg border bg-muted/20">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline" className="text-xs">{rec.category}</Badge>
                        <Badge variant="secondary" className="text-xs">{rec.impact}</Badge>
                      </div>
                      <p className="text-sm font-medium">{rec.title}</p>
                      <p className="text-xs text-muted-foreground mt-1">{rec.description}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* SLO Tab */}
        <TabsContent value="slo">
          <Card>
            <CardHeader>
              <CardTitle>SLO Health Report</CardTitle>
            </CardHeader>
            <CardContent>
              {intelligence?.sloReport ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-3 p-4 rounded-lg border">
                    {intelligence.sloReport.releaseReady ? (
                      <CheckCircle2 className="size-6 text-emerald-400" />
                    ) : (
                      <XCircle className="size-6 text-destructive" />
                    )}
                    <div>
                      <p className="font-medium">
                        {intelligence.sloReport.releaseReady
                          ? "Release Ready"
                          : "Not Release Ready"}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {intelligence.sloReport.checks.filter((c) => c.passed).length}/
                        {intelligence.sloReport.checks.length} checks passing
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {intelligence.sloReport.checks.map((check) => (
                      <div
                        key={check.name}
                        className={`p-3 rounded-lg border ${
                          check.passed
                            ? "border-emerald-500/30 bg-emerald-500/5"
                            : "border-destructive/30 bg-destructive/5"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium">{check.name}</span>
                          {check.passed ? (
                            <CheckCircle2 className="size-4 text-emerald-400" />
                          ) : (
                            <XCircle className="size-4 text-destructive" />
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Actual: {check.actual.toFixed(2)} / Threshold: {check.threshold.toFixed(2)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-center py-8">
                  <Brain className="size-8 text-muted-foreground mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">
                    No SLO report available. Configure schedules to generate reports.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Policies Tab */}
        <TabsContent value="policies">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Alert Policies</CardTitle>
                <Badge variant="secondary">{policies.length} configured</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="mb-5 rounded-lg border bg-muted/20 p-4 space-y-3">
                <p className="text-sm font-medium">Create Policy</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <input
                    value={policyDraft.name}
                    onChange={(event) =>
                      setPolicyDraft((previous) => ({ ...previous, name: event.target.value }))
                    }
                    placeholder="Policy name"
                    className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  />
                  <input
                    value={policyDraft.webhookUrl}
                    onChange={(event) =>
                      setPolicyDraft((previous) => ({ ...previous, webhookUrl: event.target.value }))
                    }
                    placeholder="https://your-webhook-endpoint"
                    className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {(["low", "medium", "high"] as const).map((severity) => {
                    const active = policyDraft.severities.includes(severity);
                    return (
                      <Button
                        key={severity}
                        type="button"
                        size="sm"
                        variant={active ? "default" : "outline"}
                        onClick={() => toggleSeverity(severity, "create")}
                      >
                        {severity}
                      </Button>
                    );
                  })}
                  <input
                    type="number"
                    min={1}
                    max={5}
                    value={policyDraft.retryLimit}
                    onChange={(event) =>
                      setPolicyDraft((previous) => ({
                        ...previous,
                        retryLimit: Math.max(1, Math.min(5, Number.parseInt(event.target.value, 10) || 1)),
                      }))
                    }
                    className="h-9 w-24 rounded-md border border-input bg-background px-3 text-sm"
                  />
                  <Button type="button" onClick={handleCreatePolicy} disabled={savingPolicy}>
                    {savingPolicy ? "Saving..." : "Create"}
                  </Button>
                </div>
              </div>

              {policies.length > 0 ? (
                <div className="space-y-3">
                  {policies.map((policy) => (
                    <div key={policy.id} className="p-4 rounded-lg border bg-muted/20">
                      <div className="flex items-center justify-between mb-2 gap-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <Webhook className="size-4 text-muted-foreground shrink-0" />
                          <span className="font-medium text-sm truncate">{policy.name}</span>
                        </div>
                        <Badge variant={policy.enabled ? "success" : "outline"}>
                          {policy.enabled ? "Active" : "Inactive"}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-[11px] text-muted-foreground">
                          Updated {new Date(policy.updatedAt).toLocaleString()}
                        </p>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={savingPolicyId === policy.id}
                            onClick={() => handleTogglePolicyEnabled(policy)}
                          >
                            {policy.enabled ? "Disable" : "Enable"}
                          </Button>
                          {editingPolicyId === policy.id ? (
                            <>
                              <Button
                                size="sm"
                                disabled={savingPolicyId === policy.id}
                                onClick={() => handleSavePolicy(policy)}
                              >
                                {savingPolicyId === policy.id ? "Saving..." : "Save"}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleCancelPolicyEdit(policy)}
                              >
                                Cancel
                              </Button>
                            </>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => beginEditPolicy(policy)}
                            >
                              Edit
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="destructive"
                            disabled={savingPolicyId === policy.id || deletingPolicyId === policy.id}
                            onClick={() => handleDeletePolicy(policy)}
                          >
                            {deletingPolicyId === policy.id ? "Deleting..." : "Delete"}
                          </Button>
                        </div>
                      </div>
                      {policyOperations[policy.id] && (
                        <div className="mb-3 flex items-center gap-2">
                          <Badge variant={operationBadgeVariant(policyOperations[policy.id].status)}>
                            {policyOperations[policy.id].message}
                          </Badge>
                          <span className="text-[11px] text-muted-foreground">
                            {new Date(policyOperations[policy.id].at).toLocaleTimeString()}
                          </span>
                        </div>
                      )}
                      {editingPolicyId === policy.id ? (
                        <div
                          className="space-y-3"
                          onKeyDown={(event) => handlePolicyEditorKeyDown(event, policy)}
                        >
                          <p className="text-[11px] text-muted-foreground">
                            Shortcuts: Enter to save, Esc to cancel, Ctrl/Cmd+S to save from anywhere.
                          </p>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <input
                              ref={editingPolicyNameInputRef}
                              value={editingPolicyDraft.name}
                              onChange={(event) =>
                                setEditingPolicyDraft((previous) => ({
                                  ...previous,
                                  name: event.target.value,
                                }))
                              }
                              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                            />
                            <input
                              value={editingPolicyDraft.webhookUrl}
                              onChange={(event) =>
                                setEditingPolicyDraft((previous) => ({
                                  ...previous,
                                  webhookUrl: event.target.value,
                                }))
                              }
                              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                            />
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            {(["low", "medium", "high"] as const).map((severity) => {
                              const active = editingPolicyDraft.severities.includes(severity);
                              return (
                                <Button
                                  key={severity}
                                  type="button"
                                  size="sm"
                                  variant={active ? "default" : "outline"}
                                  onClick={() => toggleSeverity(severity, "edit")}
                                >
                                  {severity}
                                </Button>
                              );
                            })}
                            <input
                              type="number"
                              min={1}
                              max={5}
                              value={editingPolicyDraft.retryLimit}
                              onChange={(event) =>
                                setEditingPolicyDraft((previous) => ({
                                  ...previous,
                                  retryLimit: Math.max(
                                    1,
                                    Math.min(5, Number.parseInt(event.target.value, 10) || 1)
                                  ),
                                }))
                              }
                              className="h-9 w-24 rounded-md border border-input bg-background px-3 text-sm"
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-4 text-xs text-muted-foreground">
                          <div>
                            <span className="block text-[11px] uppercase tracking-wider mb-0.5">Webhook</span>
                            <code className="bg-muted px-1 py-0.5 rounded truncate block">
                              {policy.webhookUrl}
                            </code>
                          </div>
                          <div>
                            <span className="block text-[11px] uppercase tracking-wider mb-0.5">Severities</span>
                            <div className="flex gap-1">
                              {policy.severities.map((s) => (
                                <Badge key={s} variant="outline" className="text-[10px]">{s}</Badge>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <Webhook className="size-8 text-muted-foreground mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">No alert policies configured</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Schedules Tab */}
        <TabsContent value="schedules">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Dispatch Schedules</CardTitle>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={dispatchingAll || schedules.length === 0}
                    onClick={handleDispatchAll}
                  >
                    {dispatchingAll ? "Dispatching All..." : "Dispatch Active"}
                  </Button>
                  <Badge variant="secondary">{schedules.length} configured</Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="mb-5 rounded-lg border bg-muted/20 p-4 space-y-3">
                <p className="text-sm font-medium">Create Schedule</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <input
                    value={scheduleDraft.name}
                    onChange={(event) =>
                      setScheduleDraft((previous) => ({ ...previous, name: event.target.value }))
                    }
                    placeholder="Schedule name"
                    className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  />
                  <input
                    value={scheduleDraft.profileId}
                    onChange={(event) =>
                      setScheduleDraft((previous) => ({ ...previous, profileId: event.target.value }))
                    }
                    placeholder="Profile ID"
                    className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <input
                    type="number"
                    min={5}
                    max={1440}
                    value={scheduleDraft.cadenceMinutes}
                    onChange={(event) =>
                      setScheduleDraft((previous) => ({
                        ...previous,
                        cadenceMinutes: Math.max(5, Math.min(1440, Number.parseInt(event.target.value, 10) || 60)),
                      }))
                    }
                    className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  />
                  <input
                    type="number"
                    min={3}
                    max={30}
                    value={scheduleDraft.windowDays}
                    onChange={(event) =>
                      setScheduleDraft((previous) => ({
                        ...previous,
                        windowDays: Math.max(3, Math.min(30, Number.parseInt(event.target.value, 10) || 7)),
                      }))
                    }
                    className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  />
                  <input
                    type="number"
                    min={0}
                    max={1440}
                    value={scheduleDraft.cooldownMinutes}
                    onChange={(event) =>
                      setScheduleDraft((previous) => ({
                        ...previous,
                        cooldownMinutes: Math.max(0, Math.min(1440, Number.parseInt(event.target.value, 10) || 0)),
                      }))
                    }
                    className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  />
                </div>
                <div>
                  <Button type="button" onClick={handleCreateSchedule} disabled={savingSchedule}>
                    {savingSchedule ? "Saving..." : "Create"}
                  </Button>
                </div>
              </div>

              {schedules.length > 0 ? (
                <div className="space-y-3">
                  {schedules.map((schedule) => (
                    <div key={schedule.id} className="p-4 rounded-lg border bg-muted/20">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Clock className="size-4 text-muted-foreground" />
                          <span className="font-medium text-sm">{schedule.name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={schedule.enabled ? "success" : "outline"}>
                            {schedule.enabled ? "Active" : "Inactive"}
                          </Badge>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={savingScheduleId === schedule.id}
                            onClick={() => handleToggleScheduleEnabled(schedule)}
                          >
                            {schedule.enabled ? "Disable" : "Enable"}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={dispatchingScheduleId === schedule.id}
                            onClick={() => handleDispatch(schedule)}
                          >
                            {dispatchingScheduleId === schedule.id ? (
                              <RefreshCw className="size-3 mr-1 animate-spin" />
                            ) : (
                              <Send className="size-3 mr-1" />
                            )}
                            {dispatchingScheduleId === schedule.id ? "Dispatching" : "Dispatch"}
                          </Button>
                          {editingScheduleId === schedule.id ? (
                            <>
                              <Button
                                size="sm"
                                disabled={savingScheduleId === schedule.id}
                                onClick={() => handleSaveSchedule(schedule)}
                              >
                                {savingScheduleId === schedule.id ? "Saving..." : "Save"}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleCancelScheduleEdit(schedule)}
                              >
                                Cancel
                              </Button>
                            </>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => beginEditSchedule(schedule)}
                            >
                              Edit
                            </Button>
                          )}
                          <Button
                            variant="destructive"
                            size="sm"
                            disabled={
                              savingScheduleId === schedule.id || deletingScheduleId === schedule.id
                            }
                            onClick={() => handleDeleteSchedule(schedule)}
                          >
                            {deletingScheduleId === schedule.id ? "Deleting..." : "Delete"}
                          </Button>
                        </div>
                      </div>
                      {editingScheduleId === schedule.id ? (
                        <div
                          className="space-y-3"
                          onKeyDown={(event) => handleScheduleEditorKeyDown(event, schedule)}
                        >
                          <p className="text-[11px] text-muted-foreground">
                            Shortcuts: Enter to save, Esc to cancel, Ctrl/Cmd+S to save from anywhere.
                          </p>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <input
                              ref={editingScheduleNameInputRef}
                              value={editingScheduleDraft.name}
                              onChange={(event) =>
                                setEditingScheduleDraft((previous) => ({
                                  ...previous,
                                  name: event.target.value,
                                }))
                              }
                              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                            />
                            <input
                              value={editingScheduleDraft.profileId}
                              onChange={(event) =>
                                setEditingScheduleDraft((previous) => ({
                                  ...previous,
                                  profileId: event.target.value,
                                }))
                              }
                              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                            />
                          </div>
                          <div className="grid grid-cols-3 gap-3">
                            <input
                              type="number"
                              min={5}
                              max={1440}
                              value={editingScheduleDraft.cadenceMinutes}
                              onChange={(event) =>
                                setEditingScheduleDraft((previous) => ({
                                  ...previous,
                                  cadenceMinutes: Math.max(
                                    5,
                                    Math.min(1440, Number.parseInt(event.target.value, 10) || 60)
                                  ),
                                }))
                              }
                              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                            />
                            <input
                              type="number"
                              min={3}
                              max={30}
                              value={editingScheduleDraft.windowDays}
                              onChange={(event) =>
                                setEditingScheduleDraft((previous) => ({
                                  ...previous,
                                  windowDays: Math.max(
                                    3,
                                    Math.min(30, Number.parseInt(event.target.value, 10) || 7)
                                  ),
                                }))
                              }
                              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                            />
                            <input
                              type="number"
                              min={0}
                              max={1440}
                              value={editingScheduleDraft.cooldownMinutes}
                              onChange={(event) =>
                                setEditingScheduleDraft((previous) => ({
                                  ...previous,
                                  cooldownMinutes: Math.max(
                                    0,
                                    Math.min(1440, Number.parseInt(event.target.value, 10) || 0)
                                  ),
                                }))
                              }
                              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-3 gap-4 text-xs text-muted-foreground">
                          <div>
                            <span className="block text-[11px] uppercase tracking-wider mb-0.5">Cadence</span>
                            <span>{schedule.cadenceMinutes} min</span>
                          </div>
                          <div>
                            <span className="block text-[11px] uppercase tracking-wider mb-0.5">Window</span>
                            <span>{schedule.windowDays} days</span>
                          </div>
                          <div>
                            <span className="block text-[11px] uppercase tracking-wider mb-0.5">Cooldown</span>
                            <span>{schedule.cooldownMinutes} min</span>
                          </div>
                        </div>
                      )}
                      <div className="mt-2 text-[11px] text-muted-foreground flex flex-wrap gap-3">
                        <span>Profile: {schedule.profileId}</span>
                        <span>Next: {new Date(schedule.nextRunAt).toLocaleString()}</span>
                        <span>
                          Last: {schedule.lastRunAt ? new Date(schedule.lastRunAt).toLocaleString() : "Never"}
                        </span>
                      </div>
                      {scheduleOperations[schedule.id] && (
                        <div className="mt-2 flex items-center gap-2">
                          <Badge variant={operationBadgeVariant(scheduleOperations[schedule.id].status)}>
                            {scheduleOperations[schedule.id].message}
                          </Badge>
                          <span className="text-[11px] text-muted-foreground">
                            {new Date(scheduleOperations[schedule.id].at).toLocaleTimeString()}
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <Clock className="size-8 text-muted-foreground mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">No schedules configured</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Deliveries Tab */}
        <TabsContent value="deliveries">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <CardTitle>Delivery History</CardTitle>
                <Badge variant="secondary">{filteredDeliveries.length} visible</Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="px-4 py-3 border-b bg-muted/10 flex flex-wrap items-center gap-2">
                <input
                  value={deliveryQuery}
                  onChange={(event) => setDeliveryQuery(event.target.value)}
                  placeholder="Search alert, policy, token..."
                  className="h-9 w-64 rounded-md border border-input bg-background px-3 text-sm"
                />
                <select
                  value={deliveryStatusFilter}
                  onChange={(event) =>
                    setDeliveryStatusFilter(
                      event.target.value as "all" | "delivered" | "failed" | "skipped"
                    )
                  }
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="all">All statuses</option>
                  <option value="delivered">Delivered</option>
                  <option value="failed">Failed</option>
                  <option value="skipped">Skipped</option>
                </select>
              </div>
              {filteredDeliveries.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        <th className="text-left font-medium text-muted-foreground px-4 py-3">Alert</th>
                        <th className="text-left font-medium text-muted-foreground px-4 py-3">Policy</th>
                        <th className="text-left font-medium text-muted-foreground px-4 py-3">Status</th>
                        <th className="text-left font-medium text-muted-foreground px-4 py-3">Attempts</th>
                        <th className="text-left font-medium text-muted-foreground px-4 py-3">Recorded</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredDeliveries.map((d, i) => (
                        <tr key={`${d.idempotencyKey}-${i}`} className="border-b last:border-0 hover:bg-muted/20">
                          <td className="px-4 py-3 font-medium">{d.alertId}</td>
                          <td className="px-4 py-3 text-muted-foreground">{d.policyId}</td>
                          <td className="px-4 py-3">
                            <Badge
                              variant={
                                d.status === "delivered"
                                  ? "success"
                                  : d.status === "failed"
                                    ? "destructive"
                                    : "secondary"
                              }
                            >
                              {d.status}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">{d.attempts}</td>
                          <td className="px-4 py-3 text-muted-foreground text-xs">
                            {new Date(d.at).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-8">
                  <Send className="size-8 text-muted-foreground mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">No deliveries match current filters</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="operations">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <CardTitle>Recent Operations</CardTitle>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="hidden sm:inline-flex">
                    {operationViewSummary}
                  </Badge>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void handleCopyCurrentViewLink()}
                  >
                    Share current view
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={resetOperationFilters}
                  >
                    Reset filters
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={filteredOperationTimeline.length === 0}
                    onClick={() => void handleCopyTimeline()}
                  >
                    Copy JSON
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={operationTimeline.length === 0}
                    onClick={() => setOperationTimeline([])}
                  >
                    Clear
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <input
                  value={operationQuery}
                  onChange={(event) => setOperationQuery(event.target.value)}
                  placeholder="Search message or target..."
                  className="h-9 w-64 rounded-md border border-input bg-background px-3 text-sm"
                />
                <select
                  value={operationScopeFilter}
                  onChange={(event) =>
                    setOperationScopeFilter(event.target.value as OperationScopeFilter)
                  }
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="all">All scopes</option>
                  <option value="policy">Policy</option>
                  <option value="schedule">Schedule</option>
                </select>
                <select
                  value={operationStatusFilter}
                  onChange={(event) =>
                    setOperationStatusFilter(
                      event.target.value as OperationStatusFilter
                    )
                  }
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="all">All statuses</option>
                  <option value="success">Success</option>
                  <option value="error">Error</option>
                  <option value="in-progress">In progress</option>
                </select>
                <Badge variant="secondary">{filteredOperationTimeline.length} visible</Badge>
              </div>
              {filteredOperationTimeline.length === 0 ? (
                <div className="text-sm text-muted-foreground py-8 text-center">
                  No operations match current filters.
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredOperationTimeline.map((event) => (
                    <div
                      key={event.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 bg-muted/20"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{event.message}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {event.scope} • {event.targetId}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={operationBadgeVariant(event.status)}>{event.status}</Badge>
                        <span className="text-[11px] text-muted-foreground">
                          {new Date(event.at).toLocaleTimeString()}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
