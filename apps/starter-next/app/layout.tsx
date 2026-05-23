import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "Universal Admin Starter",
  description: "Modular dashboard starter app"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
