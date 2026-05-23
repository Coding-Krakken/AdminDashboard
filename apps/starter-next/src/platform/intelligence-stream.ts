export const INTELLIGENCE_STREAM_RETRY_MS = 10000;
export const INTELLIGENCE_STREAM_HEARTBEAT_MS = 10000;
export const INTELLIGENCE_STREAM_TIMEOUT_MS = 55000;

export function encodeSseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export function encodeSseRetry(retryMs: number): string {
  const normalized = Number.isFinite(retryMs) ? Math.max(0, Math.trunc(retryMs)) : 0;
  return `retry: ${normalized}\n\n`;
}

export function buildIntelligenceSseHeaders() {
  return {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive"
  };
}