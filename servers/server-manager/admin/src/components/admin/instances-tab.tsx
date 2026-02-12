"use client";

import { useState } from "react";
import {
  Rocket,
  GitBranch,
  Loader2,
  Plus,
  RotateCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { PageShell } from "@/components/admin/page-shell";
import type { InstanceInfo, BuildInfo } from "@/lib/types";

interface InstancesTabProps {
  instances: InstanceInfo[];
  buildInfo: BuildInfo | null;
  deploying: boolean;
  onDeploy: (name?: string) => void;
  onOpenInstance: (name: string) => void;
  onInstanceAction: (name: string, action: string) => void;
  onCreateInstance: (name: string, displayName: string) => Promise<boolean>;
}

export function InstancesTab({
  instances,
  buildInfo,
  deploying,
  onDeploy,
  onOpenInstance,
  onInstanceAction,
  onCreateInstance,
}: InstancesTabProps) {
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDisplay, setNewDisplay] = useState("");

  async function handleCreate() {
    const ok = await onCreateInstance(newName, newDisplay);
    if (ok) {
      setShowCreate(false);
      setNewName("");
      setNewDisplay("");
    }
  }

  return (
    <PageShell
      title="Deployed Instances"
      actions={
        <>
          <Button variant="outline" size="sm" onClick={() => onDeploy()} disabled={deploying}>
            {deploying ? <Loader2 className="size-4 animate-spin" /> : <Rocket className="size-4" />} Deploy Updates
          </Button>
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="size-4" /> New Instance
          </Button>
        </>
      }
    >
      {/* Build Info Summary */}
      {buildInfo && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-sm text-muted-foreground">Image</div>
              <div className="font-mono font-semibold mt-1 text-sm truncate">{buildInfo.current_image.id || "none"}</div>
              <div className="text-xs text-muted-foreground">{buildInfo.current_image.age ? `Built ${buildInfo.current_image.age} ago` : ""}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-sm text-muted-foreground">Branch</div>
              <div className="flex items-center gap-2 mt-1">
                <GitBranch className="size-4 text-primary" />
                <span className="font-mono font-semibold text-sm">{buildInfo.source.branch}</span>
              </div>
              <div className="text-xs text-muted-foreground font-mono truncate">{buildInfo.source.head_commit}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-sm text-muted-foreground">Changes</div>
              <div className="font-semibold mt-1">
                {buildInfo.has_changes
                  ? <span className="text-warning">{buildInfo.pending_commits.length} pending</span>
                  : <span className="text-success">Up to date</span>
                }
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-sm text-muted-foreground">Instances</div>
              <div className="font-semibold mt-1">{instances.length} total</div>
              <div className="text-xs text-muted-foreground">{instances.filter((i) => i.status === "running").length} running</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Pending commits preview */}
      {buildInfo && buildInfo.pending_commits.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <GitBranch className="size-4" /> Pending commits since last build
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="font-mono text-xs space-y-0.5 max-h-32 overflow-y-auto text-muted-foreground">
              {buildInfo.pending_commits.map((c, i) => <div key={i}>{c}</div>)}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Instance list */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-3 text-muted-foreground font-medium">Name</th>
                  <th className="text-left p-3 text-muted-foreground font-medium">Status</th>
                  <th className="text-left p-3 text-muted-foreground font-medium hidden sm:table-cell">URL</th>
                  <th className="text-left p-3 text-muted-foreground font-medium hidden md:table-cell">Created</th>
                  <th className="text-right p-3 text-muted-foreground font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {instances.map((inst) => (
                  <tr
                    key={inst.name}
                    className="border-b last:border-0 hover:bg-muted/50 cursor-pointer transition-colors"
                    onClick={() => onOpenInstance(inst.name)}
                  >
                    <td className="p-3 font-medium">
                      {inst.display_name}
                      <span className="text-muted-foreground ml-2 font-normal text-xs">{inst.name}</span>
                    </td>
                    <td className="p-3">
                      <Badge variant={inst.status === "running" ? "success" : "destructive"}>{inst.status}</Badge>
                    </td>
                    <td className="p-3 hidden sm:table-cell">
                      <a
                        href={inst.url}
                        target="_blank"
                        rel="noopener"
                        className="text-primary hover:underline text-xs font-mono"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {inst.url}
                      </a>
                    </td>
                    <td className="p-3 text-muted-foreground text-xs hidden md:table-cell">
                      {inst.created_at ? new Date(inst.created_at).toLocaleDateString() : "—"}
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex gap-1 justify-end" onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="sm" onClick={() => onInstanceAction(inst.name, "restart")} title="Restart">
                          <RotateCw className="size-3" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => onDeploy(inst.name)} disabled={deploying} title="Rebuild & Deploy">
                          <Rocket className="size-3" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {instances.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-muted-foreground">No instances deployed yet</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Create Instance Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Instance</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Name (slug)</Label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="my-app"
                className="font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label>Display Name</Label>
              <Input
                value={newDisplay}
                onChange={(e) => setNewDisplay(e.target.value)}
                placeholder="My App"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreate}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
