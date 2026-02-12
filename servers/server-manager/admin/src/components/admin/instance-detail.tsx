"use client";

import { useState } from "react";
import {
  ChevronLeft,
  Rocket,
  RotateCw,
  Square,
  Play,
  Trash2,
  Settings,
  Database,
  ExternalLink,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import type { InstanceInfo } from "@/lib/types";

interface InstanceDetailProps {
  instance: InstanceInfo;
  instanceDetail: Record<string, unknown> | null;
  instanceLogs: string;
  instanceEnv: Record<string, string>;
  instanceCompose: string;
  instanceBackups: Array<{ file: string; size: string; created: string }>;
  deploying: boolean;
  onBack: () => void;
  onDeploy: (name: string) => void;
  onAction: (name: string, action: string) => void;
  onRemove: (name: string) => Promise<boolean>;
  onLoadLogs: (name: string, service: string) => void;
  onSaveEnv: (name: string, current: Record<string, string>, draft: Record<string, string>) => Promise<boolean>;
  onCreateBackup: (name: string) => void;
  onLoadDetail: (name: string) => void;
}

export function InstanceDetail({
  instance,
  instanceDetail,
  instanceLogs,
  instanceEnv,
  instanceCompose,
  instanceBackups,
  deploying,
  onBack,
  onDeploy,
  onAction,
  onRemove,
  onLoadLogs,
  onSaveEnv,
  onCreateBackup,
}: InstanceDetailProps) {
  const [editingEnv, setEditingEnv] = useState(false);
  const [envDraft, setEnvDraft] = useState<Record<string, string>>({});

  async function handleRemove() {
    const removed = await onRemove(instance.name);
    if (removed) onBack();
  }

  async function handleSave() {
    const saved = await onSaveEnv(instance.name, instanceEnv, envDraft);
    if (saved) setEditingEnv(false);
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm">
        <button
          onClick={onBack}
          className="text-primary hover:underline flex items-center gap-1"
        >
          <ChevronLeft className="size-4" /> Instances
        </button>
        <span className="text-muted-foreground">/</span>
        <span>{instance.display_name}</span>
      </div>

      {/* Instance header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold">{instance.display_name}</h2>
          <p className="text-sm text-muted-foreground">{instance.url}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => onDeploy(instance.name)} disabled={deploying}>
            {deploying ? <Loader2 className="size-4 animate-spin" /> : <Rocket className="size-4" />} Rebuild
          </Button>
          <Button variant="outline" size="sm" onClick={() => onAction(instance.name, "restart")}><RotateCw className="size-4" /> Restart</Button>
          <Button variant="outline" size="sm" onClick={() => onAction(instance.name, "stop")}><Square className="size-4" /> Stop</Button>
          <Button variant="outline" size="sm" onClick={() => onAction(instance.name, "start")}><Play className="size-4" /> Start</Button>
          <Button variant="destructive" size="sm" onClick={handleRemove}><Trash2 className="size-4" /> Remove</Button>
        </div>
      </div>

      {/* Section tabs */}
      <Tabs defaultValue="overview">
        <TabsList variant="line" className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="env">Env</TabsTrigger>
          <TabsTrigger value="logs" onClick={() => onLoadLogs(instance.name, "both")}>Logs</TabsTrigger>
          <TabsTrigger value="backups">Backups</TabsTrigger>
          <TabsTrigger value="compose">Compose</TabsTrigger>
          <TabsTrigger value="portal">Portal</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          {instanceDetail && (
            <Card>
              <CardContent className="pt-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                  {Object.entries(instanceDetail as Record<string, unknown>).map(([k, v]) => (
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

        <TabsContent value="env">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Environment Variables</CardTitle>
                <div className="flex gap-2">
                  {!editingEnv ? (
                    <Button variant="outline" size="sm" onClick={() => { setEditingEnv(true); setEnvDraft({ ...instanceEnv }); }}>
                      <Settings className="size-4" /> Edit
                    </Button>
                  ) : (
                    <>
                      <Button variant="default" size="sm" onClick={handleSave}>Save & Restart</Button>
                      <Button variant="outline" size="sm" onClick={() => setEditingEnv(false)}>Cancel</Button>
                    </>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {Object.entries(editingEnv ? envDraft : instanceEnv).map(([k, v]) => (
                  <div key={k} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 text-sm">
                    <span className="font-mono text-muted-foreground sm:w-52 shrink-0 truncate">{k}</span>
                    {editingEnv ? (
                      <Input
                        value={v}
                        onChange={(e) => setEnvDraft({ ...envDraft, [k]: e.target.value })}
                        className="font-mono text-sm"
                      />
                    ) : (
                      <span className="font-mono truncate">{v}</span>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="logs">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Logs</CardTitle>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => onLoadLogs(instance.name, "app")}>App</Button>
                  <Button variant="outline" size="sm" onClick={() => onLoadLogs(instance.name, "db")}>DB</Button>
                  <Button variant="default" size="sm" onClick={() => onLoadLogs(instance.name, "both")}>Both</Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <pre className="bg-muted rounded-md p-4 text-xs font-mono max-h-[500px] overflow-auto whitespace-pre-wrap">
                {instanceLogs || "Click a button to load logs..."}
              </pre>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="backups">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Database Backups</CardTitle>
                <Button variant="default" size="sm" onClick={() => onCreateBackup(instance.name)}>
                  <Database className="size-4" /> Create Backup
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {instanceBackups.length === 0 ? (
                <p className="text-muted-foreground text-sm">No backups yet</p>
              ) : (
                <div className="space-y-2">
                  {instanceBackups.map((b, i) => (
                    <div key={i} className="flex flex-col sm:flex-row sm:items-center sm:justify-between py-2 px-3 rounded bg-muted/50 text-sm gap-1 sm:gap-3">
                      <span className="font-mono truncate">{b.file}</span>
                      <span className="text-muted-foreground">{b.size}</span>
                      <span className="text-muted-foreground">{b.created}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="compose">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">docker-compose.yml</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="bg-muted rounded-md p-4 text-xs font-mono max-h-[600px] overflow-auto whitespace-pre-wrap">
                {instanceCompose}
              </pre>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="portal">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Admin Portal</CardTitle>
                <a
                  href={`${instance.url}/admin`}
                  target="_blank"
                  rel="noopener"
                  className="text-primary text-sm hover:underline flex items-center gap-1"
                >
                  <ExternalLink className="size-3" /> Open in New Tab
                </a>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <iframe
                src={`${instance.url}/admin?token=${instance.api_key}`}
                className="w-full h-[600px] border-0 rounded-b-xl"
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
