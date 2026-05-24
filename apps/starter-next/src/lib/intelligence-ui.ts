export function formatLatencyMs(elapsedMs: number): string {
  return elapsedMs >= 1000
    ? `${(elapsedMs / 1000).toFixed(2)}s`
    : `${elapsedMs}ms`;
}

export function getElapsedMs(startedAt: number, now: number): number {
  return Math.max(1, Math.round(now - startedAt));
}

export function shouldSubmitInlineEditorSave(options: {
  key: string;
  shiftKey: boolean;
  targetTagName: string | null;
}): boolean {
  return (
    options.key === "Enter" &&
    !options.shiftKey &&
    (options.targetTagName ?? "").toUpperCase() === "INPUT"
  );
}

export function shouldCancelInlineEditor(options: { key: string }): boolean {
  return options.key === "Escape";
}

export function shouldSubmitInlineEditorShortcutSave(options: {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
}): boolean {
  return options.key.toLowerCase() === "s" && (options.metaKey || options.ctrlKey);
}

export function getAutoRefreshRemainingSeconds(options: {
  lastFetchAt: string | null;
  nowMs: number;
  intervalSeconds: number;
}): number {
  if (!options.lastFetchAt) {
    return options.intervalSeconds;
  }

  const lastFetchMs = Date.parse(options.lastFetchAt);
  if (Number.isNaN(lastFetchMs)) {
    return options.intervalSeconds;
  }

  const elapsedSeconds = Math.max(0, Math.floor((options.nowMs - lastFetchMs) / 1000));
  return Math.max(0, options.intervalSeconds - elapsedSeconds);
}

export function getAutoRefreshPauseReason(options: {
  autoRefreshEnabled: boolean;
  hasUnsavedChanges: boolean;
}): string | null {
  if (!options.autoRefreshEnabled) {
    return "Manually paused";
  }

  if (options.hasUnsavedChanges) {
    return "Paused for unsaved edits";
  }

  return null;
}

export function isTimestampStale(options: {
  timestamp: string | null;
  nowMs: number;
  staleAfterSeconds: number;
}): boolean {
  if (!options.timestamp) {
    return false;
  }

  const timestampMs = Date.parse(options.timestamp);
  if (Number.isNaN(timestampMs)) {
    return false;
  }

  return options.nowMs - timestampMs >= options.staleAfterSeconds * 1000;
}

export interface OperationEventShape {
  scope: string;
  status: string;
  targetId: string;
  message: string;
}

export type OperationScopeFilter = "all" | "policy" | "schedule";
export type OperationStatusFilter = "all" | "success" | "error" | "in-progress";

export interface OperationFilterState {
  scope: OperationScopeFilter;
  status: OperationStatusFilter;
  query: string;
}

export type IntelligenceTab =
  | "alerts"
  | "slo"
  | "policies"
  | "schedules"
  | "deliveries"
  | "operations";

const DEFAULT_OPERATION_FILTER_STATE: OperationFilterState = {
  scope: "all",
  status: "all",
  query: "",
};

const DEFAULT_INTELLIGENCE_TAB: IntelligenceTab = "alerts";

function normalizeOperationScopeFilter(scope: string | null): OperationScopeFilter {
  if (scope === "policy" || scope === "schedule") {
    return scope;
  }

  return "all";
}

function normalizeOperationStatusFilter(status: string | null): OperationStatusFilter {
  if (status === "success" || status === "error" || status === "in-progress") {
    return status;
  }

  return "all";
}

export function normalizeOperationFilterState(
  input?: Partial<{ scope: string | null; status: string | null; query: string | null }>
): OperationFilterState {
  return {
    scope: normalizeOperationScopeFilter(input?.scope ?? null),
    status: normalizeOperationStatusFilter(input?.status ?? null),
    query: (input?.query ?? "").trim(),
  };
}

export function readOperationFiltersFromSearchParams(search: string): {
  filters: OperationFilterState;
  hasAny: boolean;
} {
  const params = new URLSearchParams(search);
  const hasAny =
    params.has("opScope") || params.has("opStatus") || params.has("opQuery");

  return {
    filters: normalizeOperationFilterState({
      scope: params.get("opScope"),
      status: params.get("opStatus"),
      query: params.get("opQuery"),
    }),
    hasAny,
  };
}

export function writeOperationFiltersToSearchParams(
  search: string,
  filters: OperationFilterState
): string {
  const params = new URLSearchParams(search);

  if (filters.scope === DEFAULT_OPERATION_FILTER_STATE.scope) {
    params.delete("opScope");
  } else {
    params.set("opScope", filters.scope);
  }

  if (filters.status === DEFAULT_OPERATION_FILTER_STATE.status) {
    params.delete("opStatus");
  } else {
    params.set("opStatus", filters.status);
  }

  if (!filters.query) {
    params.delete("opQuery");
  } else {
    params.set("opQuery", filters.query);
  }

  const nextSearch = params.toString();
  return nextSearch ? `?${nextSearch}` : "";
}

export function normalizeIntelligenceTab(value: string | null): IntelligenceTab {
  if (
    value === "alerts" ||
    value === "slo" ||
    value === "policies" ||
    value === "schedules" ||
    value === "deliveries" ||
    value === "operations"
  ) {
    return value;
  }

  return DEFAULT_INTELLIGENCE_TAB;
}

export function readIntelligenceTabFromSearchParams(search: string): {
  tab: IntelligenceTab;
  hasAny: boolean;
} {
  const params = new URLSearchParams(search);
  const hasAny = params.has("tab");

  return {
    tab: normalizeIntelligenceTab(params.get("tab")),
    hasAny,
  };
}

export function writeIntelligenceTabToSearchParams(
  search: string,
  tab: IntelligenceTab
): string {
  const params = new URLSearchParams(search);

  if (tab === DEFAULT_INTELLIGENCE_TAB) {
    params.delete("tab");
  } else {
    params.set("tab", tab);
  }

  const nextSearch = params.toString();
  return nextSearch ? `?${nextSearch}` : "";
}

export function buildIntelligenceViewSearch(options: {
  search: string;
  tab: IntelligenceTab;
  filters: OperationFilterState;
}): string {
  const withFilters = writeOperationFiltersToSearchParams(options.search, options.filters);
  return writeIntelligenceTabToSearchParams(withFilters, options.tab);
}

export function countNonDefaultOperationFilters(filters: OperationFilterState): number {
  let count = 0;
  if (filters.scope !== DEFAULT_OPERATION_FILTER_STATE.scope) {
    count += 1;
  }
  if (filters.status !== DEFAULT_OPERATION_FILTER_STATE.status) {
    count += 1;
  }
  if (filters.query.trim() !== DEFAULT_OPERATION_FILTER_STATE.query) {
    count += 1;
  }

  return count;
}

export function buildIntelligenceViewSummary(options: {
  tab: IntelligenceTab;
  filters: OperationFilterState;
}): string {
  const nonDefaultFilters = countNonDefaultOperationFilters(options.filters);
  if (nonDefaultFilters === 0) {
    return `View: ${options.tab} • default filters`;
  }

  return `View: ${options.tab} • ${nonDefaultFilters} custom filter${
    nonDefaultFilters === 1 ? "" : "s"
  }`;
}

export function filterOperationEvents<T extends OperationEventShape>(
  events: T[],
  filters: {
    scope: "all" | "policy" | "schedule";
    status: "all" | "success" | "error" | "in-progress";
    query: string;
  }
): T[] {
  const normalizedQuery = filters.query.trim().toLowerCase();

  return events.filter((event) => {
    if (filters.scope !== "all" && event.scope !== filters.scope) {
      return false;
    }

    if (filters.status !== "all" && event.status !== filters.status) {
      return false;
    }

    if (!normalizedQuery) {
      return true;
    }

    return [event.message, event.targetId, event.scope, event.status]
      .join(" ")
      .toLowerCase()
      .includes(normalizedQuery);
  });
}