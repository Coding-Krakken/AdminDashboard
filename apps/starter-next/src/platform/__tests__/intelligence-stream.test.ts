import { describe, expect, it } from "vitest";
import {
  INTELLIGENCE_STREAM_HEARTBEAT_MS,
  INTELLIGENCE_STREAM_RETRY_MS,
  INTELLIGENCE_STREAM_TIMEOUT_MS,
  buildIntelligenceSseHeaders,
  encodeSseEvent,
  encodeSseRetry
} from "../intelligence-stream";

describe("intelligence stream framing", () => {
  it("encodes named SSE events with JSON payloads", () => {
    const encoded = encodeSseEvent("pulse", {
      generatedAt: "2026-05-22T12:00:00.000Z",
      status: "ok"
    });

    expect(encoded.startsWith("event: pulse\n")).toBe(true);
    expect(encoded.includes('data: {"generatedAt":"2026-05-22T12:00:00.000Z","status":"ok"}\n')).toBe(true);
    expect(encoded.endsWith("\n\n")).toBe(true);
  });

  it("normalizes SSE retry frame values", () => {
    expect(encodeSseRetry(10000)).toBe("retry: 10000\n\n");
    expect(encodeSseRetry(-15)).toBe("retry: 0\n\n");
    expect(encodeSseRetry(Number.NaN)).toBe("retry: 0\n\n");
  });

  it("exposes stable heartbeat constants and SSE headers", () => {
    expect(INTELLIGENCE_STREAM_RETRY_MS).toBe(10000);
    expect(INTELLIGENCE_STREAM_HEARTBEAT_MS).toBe(10000);
    expect(INTELLIGENCE_STREAM_TIMEOUT_MS).toBe(55000);

    const headers = buildIntelligenceSseHeaders();
    expect(headers["content-type"]).toBe("text/event-stream; charset=utf-8");
    expect(headers["cache-control"]).toBe("no-cache, no-transform");
    expect(headers.connection).toBe("keep-alive");
  });
});
