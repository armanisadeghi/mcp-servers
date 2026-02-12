"use client";

import { useState } from "react";
import {
  Server,
  Layers,
  Terminal,
  Key,
  History,
  Monitor,
  RefreshCw,
  LogOut,
  Menu,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { ThemeToggle } from "@/components/theme-toggle";

export type AdminView =
  | "instances"
  | "sandboxes"
  | "tokens"
  | "builds"
  | "system";

interface NavItem {
  id: AdminView;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    label: "Main",
    items: [
      { id: "instances", label: "Instances", icon: Layers },
      { id: "sandboxes", label: "Sandboxes", icon: Terminal },
    ],
  },
  {
    label: "Operations",
    items: [
      { id: "builds", label: "Builds", icon: History },
      { id: "tokens", label: "Tokens", icon: Key },
    ],
  },
  {
    label: "Monitoring",
    items: [
      { id: "system", label: "System", icon: Monitor },
    ],
  },
];

interface AdminLayoutProps {
  activeView: AdminView;
  onNavigate: (view: AdminView) => void;
  role: string;
  onRefresh: () => void;
  onLogout: () => void;
  children: React.ReactNode;
}

function SidebarContent({
  activeView,
  onNavigate,
  role,
  onRefresh,
  onLogout,
  onClose,
}: Omit<AdminLayoutProps, "children"> & { onClose?: () => void }) {
  return (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div className="px-6 py-5 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-gradient-to-br from-ship-500 to-ship-700 rounded-xl flex items-center justify-center">
            <Server className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-sidebar-foreground leading-tight">
              Server Manager
            </h1>
            <p className="text-xs text-muted-foreground leading-tight">
              Matrx Infrastructure
            </p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <ScrollArea className="flex-1">
        <nav className="px-3 py-4 space-y-6">
          {navGroups.map((group) => (
            <div key={group.label}>
              <p className="px-3 mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {group.label}
              </p>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const isActive = activeView === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        onNavigate(item.id);
                        onClose?.();
                      }}
                      className={cn(
                        "flex w-full items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                        isActive
                          ? "bg-sidebar-accent text-sidebar-accent-foreground"
                          : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                      )}
                    >
                      <item.icon
                        className={cn(
                          "w-4.5 h-4.5 shrink-0",
                          isActive
                            ? "text-sidebar-primary"
                            : "text-muted-foreground",
                        )}
                      />
                      <span className="flex-1 text-left">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </ScrollArea>

      {/* Footer */}
      <div className="px-4 py-4 border-t border-sidebar-border space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-muted-foreground" />
            <Badge variant={role === "admin" ? "default" : "secondary"} className="text-xs">
              {role}
            </Badge>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={onRefresh}
              className="h-7 w-7 p-0"
              title="Refresh"
            >
              <RefreshCw className="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onLogout}
              className="h-7 w-7 p-0"
              title="Logout"
            >
              <LogOut className="size-3.5" />
            </Button>
          </div>
        </div>
        <ThemeToggle />
        <p className="text-xs text-muted-foreground">Server Manager v0.1.0</p>
      </div>
    </div>
  );
}

export function AdminLayout({
  activeView,
  onNavigate,
  role,
  onRefresh,
  onLogout,
  children,
}: AdminLayoutProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-dvh flex">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-64 bg-sidebar border-r border-sidebar-border flex-col shrink-0">
        <SidebarContent
          activeView={activeView}
          onNavigate={onNavigate}
          role={role}
          onRefresh={onRefresh}
          onLogout={onLogout}
        />
      </aside>

      {/* Mobile top bar + sheet */}
      <div className="flex flex-1 flex-col md:hidden">
        <header className="flex items-center justify-between border-b bg-sidebar px-4 py-3">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => setMobileOpen(true)}
            >
              <Menu className="size-5" />
            </Button>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 bg-gradient-to-br from-ship-500 to-ship-700 rounded-lg flex items-center justify-center">
                <Server className="w-4 h-4 text-primary-foreground" />
              </div>
              <span className="font-semibold text-sm">Server Manager</span>
            </div>
          </div>
          <Badge variant={role === "admin" ? "default" : "secondary"} className="text-xs">
            {role}
          </Badge>
        </header>

        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent side="left" className="w-64 p-0" showCloseButton={false}>
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <SidebarContent
              activeView={activeView}
              onNavigate={onNavigate}
              role={role}
              onRefresh={onRefresh}
              onLogout={onLogout}
              onClose={() => setMobileOpen(false)}
            />
          </SheetContent>
        </Sheet>

        {/* Mobile main content */}
        <main className="flex-1 overflow-auto bg-background">
          <div className="max-w-6xl mx-auto px-4 py-6">{children}</div>
        </main>
      </div>

      {/* Desktop main content */}
      <main className="hidden md:block flex-1 overflow-auto bg-background">
        <div className="max-w-6xl mx-auto px-6 py-8">{children}</div>
      </main>
    </div>
  );
}
