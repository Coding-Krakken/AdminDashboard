import { NextResponse } from "next/server";
import { authorizeAdminApiRequest } from "@/platform/admin-api-policy";
import { buildIntelligenceAutomationPulse } from "@/platform/intelligence-runtime";
import {
  INTELLIGENCE_STREAM_HEARTBEAT_MS,
  INTELLIGENCE_STREAM_RETRY_MS,
  INTELLIGENCE_STREAM_TIMEOUT_MS,
  buildIntelligenceSseHeaders,
  encodeSseEvent,
  encodeSseRetry
} from "@/platform/intelligence-stream";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const authz = await authorizeAdminApiRequest({
    request,
    action: "intelligence:read"
  });
  if (!authz.ok) {
    return authz.response;
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;

      const close = () => {
        if (closed) {
          return;
        }

        closed = true;
        try {
          controller.close();
        } catch {
          // no-op
        }
      };

      const pushPulse = async () => {
        if (closed) {
          return;
        }

        try {
          const pulse = await buildIntelligenceAutomationPulse({
            request,
            deliveryLimit: 20
          });
          controller.enqueue(encoder.encode(encodeSseEvent("pulse", pulse)));
        } catch (error) {
          controller.enqueue(
            encoder.encode(
              encodeSseEvent("error", {
                error:
                  error instanceof Error
                    ? error.message
                    : "Unknown intelligence stream pulse error."
              })
            )
          );
        }
      };

      controller.enqueue(encoder.encode(encodeSseRetry(INTELLIGENCE_STREAM_RETRY_MS)));
      void pushPulse();

      const interval = setInterval(() => {
        void pushPulse();
      }, INTELLIGENCE_STREAM_HEARTBEAT_MS);

      const timeout = setTimeout(() => {
        clearInterval(interval);
        close();
      }, INTELLIGENCE_STREAM_TIMEOUT_MS);

      request.signal.addEventListener("abort", () => {
        clearInterval(interval);
        clearTimeout(timeout);
        close();
      });
    }
  });

  return new NextResponse(stream, {
    headers: buildIntelligenceSseHeaders()
  });
}
