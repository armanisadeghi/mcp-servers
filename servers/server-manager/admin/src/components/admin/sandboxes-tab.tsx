"use client";

import { RotateCw, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageShell } from "@/components/admin/page-shell";
import type { SandboxInfo } from "@/lib/types";

interface SandboxesTabProps {
  sandboxes: SandboxInfo[];
  onOpenSandbox: (name: string) => void;
  onSandboxAction: (name: string, action: string) => void;
}

export function SandboxesTab({ sandboxes, onOpenSandbox, onSandboxAction }: SandboxesTabProps) {
  return (
    <PageShell
      title="Sandbox Environments"
      description={`${sandboxes.length} sandbox(es)`}
    >
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-3 text-muted-foreground font-medium">Name</th>
                  <th className="text-left p-3 text-muted-foreground font-medium">Status</th>
                  <th className="text-left p-3 text-muted-foreground font-medium hidden sm:table-cell">ID</th>
                  <th className="text-left p-3 text-muted-foreground font-medium hidden md:table-cell">Image</th>
                  <th className="text-right p-3 text-muted-foreground font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sandboxes.map((sbx) => (
                  <tr
                    key={sbx.name}
                    className="border-b last:border-0 hover:bg-muted/50 cursor-pointer transition-colors"
                    onClick={() => onOpenSandbox(sbx.name)}
                  >
                    <td className="p-3 font-medium">{sbx.name}</td>
                    <td className="p-3">
                      <Badge variant={sbx.status === "running" ? "success" : "destructive"}>{sbx.status}</Badge>
                    </td>
                    <td className="p-3 font-mono text-xs text-muted-foreground hidden sm:table-cell">{sbx.sandbox_id}</td>
                    <td className="p-3 font-mono text-xs text-muted-foreground hidden md:table-cell">{sbx.image}</td>
                    <td className="p-3 text-right">
                      <div className="flex gap-1 justify-end" onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="sm" onClick={() => onSandboxAction(sbx.name, "restart")}>
                          <RotateCw className="size-3" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => onSandboxAction(sbx.name, "stop")}>
                          <Square className="size-3" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {sandboxes.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-muted-foreground">No sandboxes</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </PageShell>
  );
}
