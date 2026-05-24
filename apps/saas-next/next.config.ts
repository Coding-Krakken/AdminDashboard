import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingIncludes: {
    "/*": [
      "../../node_modules/.prisma/client/**/*",
      "../../node_modules/@prisma/client/**/*"
    ]
  },
  transpilePackages: [
    "@universal-admin/core",
    "@universal-admin/ui",
    "@universal-admin/theming",
    "@universal-admin/adapters"
  ]
};

export default nextConfig;
