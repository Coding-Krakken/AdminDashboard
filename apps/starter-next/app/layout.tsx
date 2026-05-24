import type { ReactNode } from "react";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

export const metadata = {
  title: "Universal Admin",
  description: "Enterprise administration dashboard"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
