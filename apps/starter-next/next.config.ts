import type { NextConfig } from "next";

function normalizePublicBasePath(rawValue: string | undefined): string {
  const trimmed = (rawValue ?? "").trim();
  if (!trimmed || trimmed === "/") {
    return "/admin";
  }

  const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  const withoutTrailingSlash = withLeadingSlash.replace(/\/+$/, "");
  return withoutTrailingSlash || "/admin";
}

const publicBasePath = normalizePublicBasePath(process.env.ADMIN_PUBLIC_BASE_PATH);

const nextConfig: NextConfig = {
  reactStrictMode: true,
  assetPrefix: publicBasePath,
  transpilePackages: [
    "@universal-admin/core",
    "@universal-admin/ui",
    "@universal-admin/theming",
    "@universal-admin/adapters"
  ]
};

export default nextConfig;
