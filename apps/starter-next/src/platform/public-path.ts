function normalizePublicBasePath(rawValue: string | undefined): string {
  const trimmed = (rawValue ?? "").trim();
  if (!trimmed || trimmed === "/") {
    return "/admin";
  }

  const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  const withoutTrailingSlash = withLeadingSlash.replace(/\/+$/, "");
  return withoutTrailingSlash || "/admin";
}

export function getPublicBasePath(): string {
  return normalizePublicBasePath(process.env.ADMIN_PUBLIC_BASE_PATH);
}

export function withPublicBasePath(route: string): string {
  const normalizedRoute = route.startsWith("/") ? route : `/${route}`;
  const basePath = getPublicBasePath();
  if (normalizedRoute === "/") {
    return basePath;
  }

  return `${basePath}${normalizedRoute}`.replace(/\/+/g, "/");
}
