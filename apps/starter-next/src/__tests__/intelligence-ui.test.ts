import { describe, expect, it } from "vitest";
import {
  buildIntelligenceViewSearch,
  buildIntelligenceViewSummary,
  countNonDefaultOperationFilters,
  filterOperationEvents,
  formatLatencyMs,
  getAutoRefreshPauseReason,
  getAutoRefreshRemainingSeconds,
  getElapsedMs,
  isTimestampStale,
  normalizeIntelligenceTab,
  normalizeOperationFilterState,
  readIntelligenceTabFromSearchParams,
  readOperationFiltersFromSearchParams,
  shouldCancelInlineEditor,
  shouldSubmitInlineEditorSave,
  shouldSubmitInlineEditorShortcutSave,
  writeIntelligenceTabToSearchParams,
  writeOperationFiltersToSearchParams,
} from "@/lib/intelligence-ui";

describe("intelligence-ui helpers", () => {
  it("formats millisecond latency values", () => {
    expect(formatLatencyMs(125)).toBe("125ms");
  });

  it("formats second latency values", () => {
    expect(formatLatencyMs(1248)).toBe("1.25s");
  });

  it("calculates elapsed latency rounded to nearest ms", () => {
    expect(getElapsedMs(100, 163.4)).toBe(63);
  });

  it("clamps elapsed latency to at least 1ms", () => {
    expect(getElapsedMs(100, 100)).toBe(1);
    expect(getElapsedMs(100, 95)).toBe(1);
  });

  it("submits inline save only for enter on input without shift", () => {
    expect(
      shouldSubmitInlineEditorSave({
        key: "Enter",
        shiftKey: false,
        targetTagName: "input",
      })
    ).toBe(true);

    expect(
      shouldSubmitInlineEditorSave({
        key: "Enter",
        shiftKey: true,
        targetTagName: "input",
      })
    ).toBe(false);

    expect(
      shouldSubmitInlineEditorSave({
        key: "Enter",
        shiftKey: false,
        targetTagName: "textarea",
      })
    ).toBe(false);
  });

  it("cancels inline editor on escape", () => {
    expect(shouldCancelInlineEditor({ key: "Escape" })).toBe(true);
    expect(shouldCancelInlineEditor({ key: "Enter" })).toBe(false);
  });

  it("submits inline save on ctrl/cmd+s", () => {
    expect(
      shouldSubmitInlineEditorShortcutSave({
        key: "s",
        metaKey: true,
        ctrlKey: false,
      })
    ).toBe(true);

    expect(
      shouldSubmitInlineEditorShortcutSave({
        key: "S",
        metaKey: false,
        ctrlKey: true,
      })
    ).toBe(true);

    expect(
      shouldSubmitInlineEditorShortcutSave({
        key: "s",
        metaKey: false,
        ctrlKey: false,
      })
    ).toBe(false);
  });

  it("calculates auto-refresh remaining seconds from last fetch", () => {
    expect(
      getAutoRefreshRemainingSeconds({
        lastFetchAt: "2026-05-23T19:00:00.000Z",
        nowMs: Date.parse("2026-05-23T19:00:10.000Z"),
        intervalSeconds: 30,
      })
    ).toBe(20);
  });

  it("returns full interval when last fetch timestamp is missing or invalid", () => {
    expect(
      getAutoRefreshRemainingSeconds({
        lastFetchAt: null,
        nowMs: Date.parse("2026-05-23T19:00:10.000Z"),
        intervalSeconds: 30,
      })
    ).toBe(30);

    expect(
      getAutoRefreshRemainingSeconds({
        lastFetchAt: "not-a-date",
        nowMs: Date.parse("2026-05-23T19:00:10.000Z"),
        intervalSeconds: 30,
      })
    ).toBe(30);
  });

  it("reports auto-refresh pause reasons", () => {
    expect(
      getAutoRefreshPauseReason({
        autoRefreshEnabled: false,
        hasUnsavedChanges: false,
      })
    ).toBe("Manually paused");

    expect(
      getAutoRefreshPauseReason({
        autoRefreshEnabled: true,
        hasUnsavedChanges: true,
      })
    ).toBe("Paused for unsaved edits");

    expect(
      getAutoRefreshPauseReason({
        autoRefreshEnabled: true,
        hasUnsavedChanges: false,
      })
    ).toBeNull();
  });

  it("marks data as stale when threshold is exceeded", () => {
    expect(
      isTimestampStale({
        timestamp: "2026-05-23T19:00:00.000Z",
        nowMs: Date.parse("2026-05-23T19:02:00.000Z"),
        staleAfterSeconds: 90,
      })
    ).toBe(true);

    expect(
      isTimestampStale({
        timestamp: "2026-05-23T19:01:00.000Z",
        nowMs: Date.parse("2026-05-23T19:02:00.000Z"),
        staleAfterSeconds: 90,
      })
    ).toBe(false);
  });

  it("filters operation events by scope, status, and query", () => {
    const events = [
      {
        scope: "policy",
        status: "success",
        message: "Policy updated in 20ms",
        targetId: "pol-1",
      },
      {
        scope: "schedule",
        status: "error",
        message: "Schedule delete failed in 40ms",
        targetId: "sch-2",
      },
    ];

    expect(
      filterOperationEvents(events, {
        scope: "policy",
        status: "all",
        query: "",
      })
    ).toHaveLength(1);

    expect(
      filterOperationEvents(events, {
        scope: "all",
        status: "error",
        query: "",
      })
    ).toHaveLength(1);

    expect(
      filterOperationEvents(events, {
        scope: "all",
        status: "all",
        query: "delete failed",
      })
    ).toHaveLength(1);
  });

  it("normalizes invalid operation filters to defaults", () => {
    expect(
      normalizeOperationFilterState({
        scope: "invalid",
        status: "bad-status",
        query: "  text  ",
      })
    ).toEqual({
      scope: "all",
      status: "all",
      query: "text",
    });
  });

  it("reads operation filters from search params", () => {
    expect(readOperationFiltersFromSearchParams("?opScope=policy&opStatus=error&opQuery=abc")).toEqual({
      hasAny: true,
      filters: {
        scope: "policy",
        status: "error",
        query: "abc",
      },
    });
  });

  it("writes operation filters to search params and removes defaults", () => {
    expect(
      writeOperationFiltersToSearchParams("?tab=operations", {
        scope: "policy",
        status: "error",
        query: "abc",
      })
    ).toBe("?tab=operations&opScope=policy&opStatus=error&opQuery=abc");

    expect(
      writeOperationFiltersToSearchParams("?tab=operations&opScope=policy&opStatus=error&opQuery=abc", {
        scope: "all",
        status: "all",
        query: "",
      })
    ).toBe("?tab=operations");
  });

  it("normalizes intelligence tab values", () => {
    expect(normalizeIntelligenceTab("operations")).toBe("operations");
    expect(normalizeIntelligenceTab("invalid-tab")).toBe("alerts");
    expect(normalizeIntelligenceTab(null)).toBe("alerts");
  });

  it("reads and writes intelligence tab in search params", () => {
    expect(readIntelligenceTabFromSearchParams("?tab=operations")).toEqual({
      hasAny: true,
      tab: "operations",
    });

    expect(writeIntelligenceTabToSearchParams("?opScope=policy", "operations")).toBe(
      "?opScope=policy&tab=operations"
    );

    expect(writeIntelligenceTabToSearchParams("?tab=operations&opScope=policy", "alerts")).toBe(
      "?opScope=policy"
    );
  });

  it("builds shareable intelligence view search state", () => {
    expect(
      buildIntelligenceViewSearch({
        search: "?foo=bar",
        tab: "operations",
        filters: {
          scope: "policy",
          status: "error",
          query: "failed",
        },
      })
    ).toBe("?foo=bar&opScope=policy&opStatus=error&opQuery=failed&tab=operations");

    expect(
      buildIntelligenceViewSearch({
        search: "?foo=bar&opScope=policy&opStatus=error&opQuery=failed&tab=operations",
        tab: "alerts",
        filters: {
          scope: "all",
          status: "all",
          query: "",
        },
      })
    ).toBe("?foo=bar");
  });

  it("counts non-default operation filters", () => {
    expect(
      countNonDefaultOperationFilters({
        scope: "all",
        status: "all",
        query: "",
      })
    ).toBe(0);

    expect(
      countNonDefaultOperationFilters({
        scope: "policy",
        status: "error",
        query: "failed",
      })
    ).toBe(3);
  });

  it("builds compact intelligence view summary", () => {
    expect(
      buildIntelligenceViewSummary({
        tab: "operations",
        filters: {
          scope: "all",
          status: "all",
          query: "",
        },
      })
    ).toBe("View: operations • default filters");

    expect(
      buildIntelligenceViewSummary({
        tab: "operations",
        filters: {
          scope: "policy",
          status: "all",
          query: "error",
        },
      })
    ).toBe("View: operations • 2 custom filters");
  });
});