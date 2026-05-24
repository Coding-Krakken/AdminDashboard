import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PLATFORM_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "admin-dashboard.vercel.app"
]);

const TENANT_ALIAS_PREFIX = "/api/platform/route/";
const PLATFORM_ADMIN_PATHS = ["/api/platform", "/_platform"];

export function middleware(request: NextRequest) {
  const hostname = request.headers.get("host") ?? "localhost";
  const normalizedHost = hostname.toLowerCase().replace(/:\d+$/, "");
  const { pathname } = request.nextUrl;

  if (pathname.startsWith(TENANT_ALIAS_PREFIX)) {
    const suffix = pathname.slice(TENANT_ALIAS_PREFIX.length);
    const [tenantId, ...rest] = suffix.split("/");

    if (!tenantId) {
      return NextResponse.next();
    }

    const headers = new Headers(request.headers);
    headers.set("x-tenant-mode", "tenant");
    headers.set("x-tenant-id", tenantId);

    const rewriteUrl = request.nextUrl.clone();
    const tenantPath = rest.length > 0 ? `/${rest.join("/")}` : "/";
    rewriteUrl.pathname = tenantPath;

    return NextResponse.rewrite(rewriteUrl, {
      request: { headers }
    });
  }

  // Platform admin routes bypass tenant resolution
  if (PLATFORM_ADMIN_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Known platform hosts serve the platform admin/onboarding UI
  if (PLATFORM_HOSTS.has(normalizedHost) || normalizedHost.endsWith(".vercel.app")) {
    const headers = new Headers(request.headers);
    headers.set("x-tenant-mode", "platform");
    return NextResponse.next({ request: { headers } });
  }

  // For custom tenant domains, resolve tenant via edge-compatible lookup
  // The tenant is resolved from hostname and injected as a header
  // Full DB resolution happens in the runtime layer; middleware does lightweight validation
  const headers = new Headers(request.headers);
  headers.set("x-tenant-mode", "tenant");
  headers.set("x-tenant-hostname", normalizedHost);

  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: [
    // Match all paths except static files and Next.js internals
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"
  ]
};
