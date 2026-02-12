"use client";

import {
  Rocket,
  Loader2,
  Trash2,
  RotateCcw,
  ArrowDownToLine,
  CheckCircle2,
  AlertTriangle,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BuildLogViewer } from "@/components/admin/build-log-viewer";
import { PageShell } from "@/components/admin/page-shell";
import type { BuildInfo, BuildRecord } from "@/lib/types";

interface BuildsTabProps {
  buildInfo: BuildInfo | null;
  buildHistory: BuildRecord[];
  buildLogs: string[];
  buildPhase: string | null;
  deploying: boolean;
  deployingMgr: boolean;
  rollingBack: string | null;
  onDeploy: () => void;
  onRollback: (tag: string) => void;
  onCleanup: () => void;
  onClearLogs: () => void;
}

export function BuildsTab({
  buildInfo,
  buildHistory,
  buildLogs,
  buildPhase,
  deploying,
  deployingMgr,
  rollingBack,
  onDeploy,
  onRollback,
  onCleanup,
  onClearLogs,
}: BuildsTabProps) {
  return (
    <PageShell
      title="Build History"
      actions={
        <>
          <Button variant="outline" size="sm" onClick={onCleanup}>
            <Trash2 className="size-4" /> Cleanup Images
          </Button>
          <Button size="sm" onClick={onDeploy} disabled={deploying}>
            {deploying ? <Loader2 className="size-4 animate-spin" /> : <Rocket className="size-4" />} New Build
          </Button>
        </>
      }
    >
      {/* Pre-build info */}
      {buildInfo && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-sm text-muted-foreground">Current Image</div>
              <div className="font-mono font-semibold mt-1 text-sm truncate">{buildInfo.current_image.id || "none"}</div>
              <div className="text-xs text-muted-foreground mt-1">{buildInfo.current_image.age ? `Built ${buildInfo.current_image.age} ago` : ""}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-sm text-muted-foreground">Pending Changes</div>
              <div className="font-semibold mt-1">
                {buildInfo.has_changes
                  ? <span className="text-warning">{buildInfo.pending_commits.length} commit(s)</span>
                  : <span className="text-success">No changes</span>
                }
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-sm text-muted-foreground">Last Build</div>
              <div className="text-sm mt-1">
                {buildInfo.last_build
                  ? `${buildInfo.last_build.tag} — ${Math.round(buildInfo.last_build.duration_ms / 1000)}s`
                  : "Never"
                }
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Live Build Logs */}
      <BuildLogViewer
        buildLogs={buildLogs}
        buildPhase={buildPhase}
        deploying={deploying}
        deployingMgr={deployingMgr}
        onClear={onClearLogs}
      />

      {/* Available images / rollback */}
      {buildInfo && buildInfo.available_tags.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <RotateCcw className="size-4" /> Available Images
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {buildInfo.available_tags.map((t) => (
                <div key={t.tag} className="flex flex-col sm:flex-row sm:items-center sm:justify-between py-2 px-3 rounded bg-muted/50 gap-2">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="font-mono text-sm font-medium">{t.tag}</span>
                    <span className="text-xs text-muted-foreground font-mono">{t.id}</span>
                    <span className="text-xs text-muted-foreground">{t.age}</span>
                    {t.tag === "latest" && <Badge className="text-[10px]">current</Badge>}
                  </div>
                  {t.tag !== "latest" && t.tag !== "<none>" && (
                    <Button variant="outline" size="sm" onClick={() => onRollback(t.tag)} disabled={rollingBack === t.tag}>
                      {rollingBack === t.tag ? <Loader2 className="size-3 animate-spin" /> : <ArrowDownToLine className="size-3" />} Rollback
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Build history */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{buildHistory.length} build(s)</CardTitle>
        </CardHeader>
        <CardContent>
          {buildHistory.length === 0 ? (
            <p className="text-muted-foreground text-sm">No builds recorded yet.</p>
          ) : (
            <div className="space-y-3">
              {buildHistory.map((b) => (
                <div key={b.id} className="flex flex-col sm:flex-row sm:items-start sm:justify-between p-3 rounded-lg border bg-card gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      {b.success ? <CheckCircle2 className="size-4 text-success" /> : <AlertTriangle className="size-4 text-destructive" />}
                      <span className="font-mono text-sm font-medium">{b.tag}</span>
                      <Badge variant={b.success ? "success" : "destructive"} className="text-[10px]">
                        {b.success ? "success" : "failed"}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground space-x-3 flex flex-wrap gap-y-1">
                      <span><Clock className="inline size-3 mr-1" />{new Date(b.timestamp).toLocaleString()}</span>
                      <span>{Math.round(b.duration_ms / 1000)}s</span>
                      <span className="font-mono">{b.git_commit}</span>
                      <span>by {b.triggered_by}</span>
                    </div>
                    {b.git_message && <div className="text-xs text-muted-foreground">{b.git_message}</div>}
                    {b.error && <div className="text-xs text-destructive">{b.error}</div>}
                  </div>
                  {b.success && b.tag && !b.tag.startsWith("rollback") && (
                    <Button variant="outline" size="sm" onClick={() => onRollback(b.tag)} disabled={rollingBack === b.tag} className="shrink-0">
                      <ArrowDownToLine className="size-3" /> Rollback
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </PageShell>
  );
}
