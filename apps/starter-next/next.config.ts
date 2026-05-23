import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    "@universal-admin/core",
    "@universal-admin/ui",
    "@universal-admin/theming",
    "@universal-admin/adapters"
  ]
};

export default nextConfig;
