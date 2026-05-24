"use client";

import { AppSidebar } from "./sidebar";
import { AppHeader } from "./header";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useState } from "react";

interface ShellProps {
  children: React.ReactNode;
  navItems: Array<{ id: string; label: string; route: string; category?: string }>;
  profiles: Array<{ id: string; label: string }>;
  activeProfileId: string;
  moduleCount: number;
  profileLabel: string;
}

export function DashboardShell({
  children,
  navItems,
  profiles,
  activeProfileId,
  moduleCount,
  profileLabel,
}: ShellProps) {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  return (
    <TooltipProvider>
      <div className="flex h-screen overflow-hidden">
        <AppSidebar
          className="hidden md:flex"
          navItems={navItems}
          moduleCount={moduleCount}
          profileLabel={profileLabel}
        />

        <div
          className={cn(
            "fixed inset-y-0 left-0 z-50 md:hidden transition-transform duration-200",
            mobileSidebarOpen ? "translate-x-0" : "-translate-x-full"
          )}
        >
          <AppSidebar
            navItems={navItems}
            moduleCount={moduleCount}
            profileLabel={profileLabel}
            onNavigate={() => setMobileSidebarOpen(false)}
          />
        </div>

        {mobileSidebarOpen && (
          <button
            type="button"
            className="fixed inset-0 z-40 bg-black/60 md:hidden"
            onClick={() => setMobileSidebarOpen(false)}
            aria-label="Close navigation"
          />
        )}

        <div className="flex flex-col flex-1 overflow-hidden">
          <AppHeader
            profiles={profiles}
            activeProfileId={activeProfileId}
            onToggleSidebar={() => setMobileSidebarOpen((open) => !open)}
          />
          <main className="flex-1 overflow-y-auto p-6">
            {children}
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}
