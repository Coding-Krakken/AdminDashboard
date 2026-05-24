"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  LayoutDashboard,
  Boxes,
  Flag,
  Plug,
  ScrollText,
  Brain,
  Settings,
  Shield,
  Activity,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";

interface NavItem {
  id: string;
  label: string;
  route: string;
  category?: string;
}

interface SidebarProps {
  navItems: NavItem[];
  moduleCount: number;
  profileLabel: string;
  className?: string;
  onNavigate?: () => void;
}

const iconMap: Record<string, React.ReactNode> = {
  "/": <LayoutDashboard className="size-4" />,
  "/modules": <Boxes className="size-4" />,
  "/flags": <Flag className="size-4" />,
  "/plugins": <Plug className="size-4" />,
  "/audit": <ScrollText className="size-4" />,
  "/intelligence": <Brain className="size-4" />,
  "/settings": <Settings className="size-4" />,
  "/security": <Shield className="size-4" />,
  "/health": <Activity className="size-4" />,
};

const primaryNav = [
  { id: "overview", label: "Overview", route: "/" },
  { id: "modules", label: "Modules", route: "/modules" },
  { id: "flags", label: "Feature Flags", route: "/flags" },
  { id: "plugins", label: "Plugins", route: "/plugins" },
  { id: "audit", label: "Audit Log", route: "/audit" },
  { id: "intelligence", label: "Intelligence", route: "/intelligence" },
  { id: "settings", label: "Settings", route: "/settings" },
  { id: "security", label: "Security", route: "/security" },
  { id: "health", label: "Health", route: "/health" },
];

export function AppSidebar({
  navItems,
  moduleCount,
  profileLabel,
  className,
  onNavigate,
}: SidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const routes = navItems.length > 0 ? navItems : primaryNav;

  return (
    <aside
      className={cn(
        "flex flex-col h-screen bg-sidebar border-r border-sidebar-border transition-all duration-200",
        collapsed ? "w-16" : "w-64",
        className
      )}
    >
      {/* Brand */}
      <div className="flex items-center gap-3 px-4 h-14 border-b border-sidebar-border shrink-0">
        <div className="flex items-center justify-center size-8 rounded-lg bg-sidebar-primary text-sidebar-primary-foreground font-bold text-sm">
          UA
        </div>
        {!collapsed && (
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-semibold truncate">Universal Admin</span>
            <span className="text-[11px] text-muted-foreground truncate">{profileLabel}</span>
          </div>
        )}
      </div>

      {/* Navigation */}
      <ScrollArea className="flex-1 py-3">
        <nav className="px-2 space-y-1">
          {routes.map((item) => {
            const isActive = item.route === "/"
              ? pathname === "/"
              : pathname.startsWith(item.route);
            return (
              <Link
                key={item.id}
                href={item.route}
                onClick={onNavigate}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                )}
              >
                {iconMap[item.route] ?? <Boxes className="size-4" />}
                {!collapsed && <span>{item.label}</span>}
              </Link>
            );
          })}
        </nav>
      </ScrollArea>

      {/* Footer stats */}
      {!collapsed && (
        <div className="px-4 py-3 border-t border-sidebar-border space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Modules</span>
            <Badge variant="secondary">{moduleCount}</Badge>
          </div>
        </div>
      )}

      {/* Collapse toggle */}
      <div className="px-2 py-2 border-t border-sidebar-border">
        <Button
          variant="ghost"
          size="icon"
          className="w-full h-8"
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? <ChevronRight className="size-4" /> : <ChevronLeft className="size-4" />}
        </Button>
      </div>
    </aside>
  );
}
