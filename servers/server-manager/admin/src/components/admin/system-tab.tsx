"use client";

import {
  Globe,
  Cpu,
  HardDrive,
  Clock,
  Container,
  ShieldCheck,
  Wrench,
  Loader2,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { BuildLogViewer } from "@/components/admin/build-log-viewer";
import { PageShell } from "@/components/admin/page-shell";
import type { SystemInfo } from "@/lib/types";

interface SystemTabProps {
  systemInfo: SystemInfo;
  deployingMgr: boolean;
  buildLogs: string[];
  buildPhase: string | null;
  deploying: boolean;
  onRebuildManager: () => void;
  onClearLogs: () => void;
}

export function SystemTab({
  systemInfo,
  deployingMgr,
  buildLogs,
  buildPhase,
  deploying,
  onRebuildManager,
  onClearLogs,
}: SystemTabProps) {
  return (
    <PageShell title="System">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Globe className="size-4" /> Hostname
            </div>
            <div className="font-mono font-semibold mt-1 text-sm truncate">{systemInfo.hostname}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Cpu className="size-4" /> Memory
            </div>
            <div className="font-semibold mt-1">{systemInfo.memory.percent}</div>
            <div className="text-xs text-muted-foreground">{systemInfo.memory.used} / {systemInfo.memory.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <HardDrive className="size-4" /> Disk
            </div>
            <div className="font-semibold mt-1">{systemInfo.disk.percent}</div>
            <div className="text-xs text-muted-foreground">{systemInfo.disk.used} / {systemInfo.disk.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="size-4" /> Uptime
            </div>
            <div className="font-semibold mt-1">{systemInfo.uptime_hours}h</div>
            <div className="text-xs text-muted-foreground">{systemInfo.cpus} CPUs</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Container className="size-4" /> Docker Containers
              </CardTitle>
              <CardDescription className="mt-1">{systemInfo.docker}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-1 font-mono text-sm">
            {(systemInfo.containers ?? []).map((c, i) => (
              <div key={i} className="py-0.5 text-muted-foreground break-all">{c}</div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <ShieldCheck className="size-4" /> Server Manager
              </CardTitle>
              <CardDescription>Rebuild the server manager from source</CardDescription>
            </div>
            <Button variant="outline" onClick={onRebuildManager} disabled={deployingMgr}>
              {deployingMgr ? <Loader2 className="size-4 animate-spin" /> : <Wrench className="size-4" />} Rebuild Server Manager
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            This rebuilds <code className="bg-muted px-1 py-0.5 rounded text-xs">/srv/mcp-servers/</code> and restarts the server manager container. The admin UI will briefly disconnect.
          </p>
          <div className="mt-3">
            <a
              href="https://deploy.dev.codematrx.com"
              target="_blank"
              rel="noopener"
              className="text-primary text-sm hover:underline flex items-center gap-1"
            >
              <ExternalLink className="size-3" /> Open Deploy App (safer for manager rebuilds)
            </a>
          </div>
        </CardContent>
      </Card>

      {/* Build logs (visible when rebuilding manager) */}
      <BuildLogViewer
        buildLogs={buildLogs}
        buildPhase={buildPhase}
        deploying={deploying}
        deployingMgr={deployingMgr}
        onClear={onClearLogs}
      />
    </PageShell>
  );
}
