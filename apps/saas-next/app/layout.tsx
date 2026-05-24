import type { ReactNode } from "react";
import { headers } from "next/headers";
import { resolveTenantFromRequest, buildTenantThemeCss, createRequestFromHeaderEntries } from "@/platform/runtime";
import "./globals.css";

export const metadata = {
  title: "Admin Dashboard",
  description: "Multi-tenant administration dashboard"
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const incomingHeaders = await headers();
  const headerEntries: Array<[string, string]> = [];
  incomingHeaders.forEach((value, key) => {
    headerEntries.push([key, value]);
  });

  const request = createRequestFromHeaderEntries(headerEntries);
  const tenantCtx = await resolveTenantFromRequest(request);

  const themeCss = tenantCtx ? buildTenantThemeCss(tenantCtx.theme) : "";
  const darkMode = tenantCtx?.theme?.darkMode !== false;

  return (
    <html lang="en" className={darkMode ? "dark" : ""}>
      <head>
        {themeCss && (
          <style
            dangerouslySetInnerHTML={{ __html: `:root { ${themeCss} }` }}
          />
        )}
        {tenantCtx?.theme?.faviconUrl && (
          <link rel="icon" href={tenantCtx.theme.faviconUrl} />
        )}
      </head>
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
