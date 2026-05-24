import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export function isPlatformAuthorized(request: NextRequest): boolean {
  const platformSecret = process.env.PLATFORM_ADMIN_SECRET;
  if (!platformSecret) {
    return false;
  }

  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return false;
  }

  return authHeader.slice(7) === platformSecret;
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

function getClientIp(request: NextRequest): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() ?? "unknown";
  }

  return request.headers.get("x-real-ip") ?? "unknown";
}

function getRateLimitConfig() {
  const maxRequests = Number.parseInt(
    process.env.PLATFORM_API_RATE_LIMIT_MAX ?? "120",
    10
  );
  const windowMs = Number.parseInt(
    process.env.PLATFORM_API_RATE_LIMIT_WINDOW_MS ?? "60000",
    10
  );

  return {
    maxRequests: Number.isFinite(maxRequests) ? Math.max(1, maxRequests) : 120,
    windowMs: Number.isFinite(windowMs) ? Math.max(1000, windowMs) : 60000
  };
}

export function checkPlatformRateLimit(
  request: NextRequest,
  scope: string
): { allowed: true; remaining: number; resetAt: number } | { allowed: false; response: NextResponse } {
  const { maxRequests, windowMs } = getRateLimitConfig();
  const now = Date.now();
  const clientKey = `${getClientIp(request)}:${scope}`;
  const existing = rateLimitStore.get(clientKey);

  if (!existing || now >= existing.resetAt) {
    rateLimitStore.set(clientKey, {
      count: 1,
      resetAt: now + windowMs
    });

    return {
      allowed: true,
      remaining: maxRequests - 1,
      resetAt: now + windowMs
    };
  }

  if (existing.count >= maxRequests) {
    return {
      allowed: false,
      response: NextResponse.json(
        {
          error: "Too Many Requests",
          retryAfterMs: Math.max(0, existing.resetAt - now)
        },
        {
          status: 429,
          headers: {
            "Retry-After": `${Math.ceil((existing.resetAt - now) / 1000)}`
          }
        }
      )
    };
  }

  existing.count += 1;
  rateLimitStore.set(clientKey, existing);

  return {
    allowed: true,
    remaining: Math.max(0, maxRequests - existing.count),
    resetAt: existing.resetAt
  };
}

export function enforcePlatformAccess(
  request: NextRequest,
  scope: string
): NextResponse | null {
  if (!isPlatformAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limit = checkPlatformRateLimit(request, scope);
  if (!limit.allowed) {
    return limit.response;
  }

  return null;
}
