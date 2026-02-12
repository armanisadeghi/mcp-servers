"use client";

import { ChevronLeft, RotateCw, Square, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import type { SandboxInfo } from "@/lib/types";

interface SandboxDetailProps {
  sandbox: SandboxInfo;
  sandboxDetail: Record<string, unknown> | null;
  sandboxLogs: string;
  onBack: () => void;
  onAction: (name: string, action: string) => void;
  onLoadLogs: (name: string) => void;
}

export function SandboxDetail({
  sandbox,
  sandboxDetail,
  sandboxLogs,
  onBack,
  onAction,
  onLoadLogs,
}: SandboxDetailProps) {
  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm">
        <button onClick={onBack} className="text-primary hover:underline flex items-center gap-1">
          <ChevronLeft className="size-4" /> Sandboxes
        </button>
        <span className="text-muted-foreground">/</span>
        <span>{sandbox.name}</span>
      </div>

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold">{sandbox.name}</h2>
          <Badge variant={sandbox.status === "running" ? "success" : "destructive"}>{sandbox.status}</Badge>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => onAction(sandbox.name, "restart")}><RotateCw className="size-4" /> Restart</Button>
          <Button variant="outline" size="sm" onClick={() => onAction(sandbox.name, "stop")}><Square className="size-4" /> Stop</Button>
          <Button variant="outline" size="sm" onClick={() => onAction(sandbox.name, "start")}><Play className="size-4" /> Start</Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <TabsList variant="line" className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="terminal">Terminal</TabsTrigger>
          <TabsTrigger value="logs" onClick={() => onLoadLogs(sandbox.name)}>Logs</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          {sandboxDetail && (
            <Card>
              <CardContent className="pt-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                  {Object.entries(sandboxDetail).map(([k, v]) => (
                    <div key={k}>
                      <span className="text-muted-foreground">{k}:</span>{" "}
                      <span className="font-mono">{String(v)}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="terminal">
          {sandbox.terminal_url && (
            <Card>
              <CardContent className="p-0">
                <iframe src={sandbox.terminal_url} className="w-full h-[500px] border-0 rounded-xl bg-black" />
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="logs">
          <Card>
            <CardContent className="pt-6">
              <pre className="bg-muted rounded-md p-4 text-xs font-mono max-h-[500px] overflow-auto whitespace-pre-wrap">
                {sandboxLogs || "Loading..."}
              </pre>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
