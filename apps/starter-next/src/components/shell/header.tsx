"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { User, ChevronDown, Menu } from "lucide-react";

interface Profile {
  id: string;
  label: string;
}

interface HeaderProps {
  profiles: Profile[];
  activeProfileId: string;
  onToggleSidebar?: () => void;
}

const routeTitles: Record<string, string> = {
  "/": "Overview",
  "/modules": "Modules",
  "/flags": "Feature Flags",
  "/plugins": "Plugins",
  "/audit": "Audit Log",
  "/intelligence": "Intelligence",
  "/settings": "Settings",
  "/security": "Security",
  "/health": "System Health",
};

export function AppHeader({
  profiles,
  activeProfileId,
  onToggleSidebar,
}: HeaderProps) {
  const pathname = usePathname();

  const segments = pathname.split("/").filter(Boolean);
  const pageTitle = routeTitles[pathname] ?? segments[segments.length - 1] ?? "Dashboard";

  return (
    <header className="flex items-center justify-between h-14 px-6 border-b border-border bg-background/80 backdrop-blur-sm sticky top-0 z-30">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          onClick={onToggleSidebar}
          aria-label="Open navigation"
        >
          <Menu className="size-4" />
        </Button>
        <h1 className="text-lg font-semibold">{pageTitle}</h1>
      </div>

      <div className="flex items-center gap-3">
        {/* Profile Switcher */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <span className="text-xs">
                {profiles.find((p) => p.id === activeProfileId)?.label ?? "Default"}
              </span>
              <ChevronDown className="size-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Business Profile</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {profiles.map((profile) => (
              <DropdownMenuItem key={profile.id} asChild>
                <Link href={`/?profile=${profile.id}`}>
                  {profile.label}
                </Link>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* User menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="rounded-full">
              <User className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Admin User</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem>Settings</DropdownMenuItem>
            <DropdownMenuItem>Sign out</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
