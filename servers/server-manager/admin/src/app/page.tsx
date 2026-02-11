"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { api, apiText, setToken, clearToken, API, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Server, Rocket, RotateCcw, GitBranch, Clock, Container,
  RefreshCw, ShieldCheck, Loader2, AlertTriangle, CheckCircle2,
  History, Trash2, Wrench, ArrowDownToLine, LogIn, Key, Terminal,
  Play, Square, RotateCw, ExternalLink, ChevronLeft, Copy,
  Plus, Settings, FileText, Database, Cpu, HardDrive, Monitor,
  X, Eye, EyeOff, Globe, Layers,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

interface InstanceInfo {
  name: string;
  display_name: string;
  subdomain: string;
  url: string;
  api_key: string;
  created_at: string;
  status: string;
  container_status?: string;
  db_status?: string;
}

interface SandboxInfo {
  name: string;
  status: string;
  sandbox_id: string;
  image: string;
  terminal_url?: string;
}

interface TokenInfo {
  id: string;
  label: string;
  role: string;
  created_at: string;
  last_used_at: string | null;
}

interface SystemInfo {
  hostname: string;
  cpus: number;
  memory: { total: string; used: string; free: string; percent: string };
  disk: { total: string; used: string; available: string; percent: string };
  uptime_hours: string;
  docker: string;
  containers: string[];
  node_version?: string;
}

interface BuildInfo {
  current_image: { id: string | null; created: string | null; age: string | null };
  source: { path: string; branch: string; head_commit: string; last_build_commit: string | null };
  has_changes: boolean;
  pending_commits: string[];
  diff_stats: string | null;
  instances: Array<{ name: string; display_name: string; status: string }>;
  available_tags: Array<{ tag: string; id: string; age: string }>;
  last_build: { tag: string; timestamp: string; git_commit: string; duration_ms: number } | null;
}

interface BuildRecord {
  id: string; tag: string; timestamp: string; git_commit: string; git_message: string;
  image_id: string | null; success: boolean; error: string | null; duration_ms: number;
  triggered_by: string; instances_restarted: string[];
}

// ── Login Screen ─────────────────────────────────────────────────────────────

function LoginScreen({ onLogin }: { onLogin: () => void }) {
  const [token, setTokenValue] = useState("");
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    setLoading(true);
    try {
      setToken(token);
      await api(API.SYSTEM);
      onLogin();
    } catch {
      setError(true);
      clearToken();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Card className="w-[420px]">
        <CardHeader className="text-center">
          <CardTitle className="text-xl flex items-center justify-center gap-2">
            <Server className="size-5" /> Matrx Server Manager
          </CardTitle>
          <CardDescription>Enter your token to access the admin dashboard.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && <p className="text-destructive text-sm text-center">Invalid or expired token</p>}
          <input
            type="password"
            value={token}
            onChange={(e) => { setTokenValue(e.target.value); setError(false); }}
            onKeyDown={(e) => e.key === "Enter" && handleLogin()}
            placeholder="Bearer token..."
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-ring"
            autoFocus
          />
          <Button onClick={handleLogin} disabled={loading} className="w-full">
            {loading ? <Loader2 className="size-4 animate-spin" /> : <LogIn className="size-4" />} Sign In
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Main App ─────────────────────────────────────────────────────────────────

type MainTab = "instances" | "sandboxes" | "tokens" | "system" | "builds";

export default function AdminPage() {
  const [authed, setAuthed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<MainTab>("instances");
  const [role, setRole] = useState<string>("viewer");

  // Data
  const [instances, setInstances] = useState<InstanceInfo[]>([]);
  const [sandboxes, setSandboxes] = useState<SandboxInfo[]>([]);
  const [tokens, setTokens] = useState<TokenInfo[]>([]);
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [buildInfo, setBuildInfo] = useState<BuildInfo | null>(null);
  const [buildHistory, setBuildHistory] = useState<BuildRecord[]>([]);

  // UI state
  const [selectedInstance, setSelectedInstance] = useState<string | null>(null);
  const [selectedSandbox, setSelectedSandbox] = useState<string | null>(null);
  const [detailSection, setDetailSection] = useState("overview");
  const [sbxDetailSection, setSbxDetailSection] = useState("sbx-overview");
  const [deploying, setDeploying] = useState(false);
  const [deployingMgr, setDeployingMgr] = useState(false);
  const [rollingBack, setRollingBack] = useState<string | null>(null);

  // Instance detail data
  const [instanceDetail, setInstanceDetail] = useState<Record<string, unknown> | null>(null);
  const [instanceLogs, setInstanceLogs] = useState<string>("");
  const [instanceEnv, setInstanceEnv] = useState<Record<string, string>>({});
  const [instanceCompose, setInstanceCompose] = useState<string>("");
  const [instanceBackups, setInstanceBackups] = useState<Array<{ file: string; size: string; created: string }>>([]);
  const [editingEnv, setEditingEnv] = useState(false);
  const [envDraft, setEnvDraft] = useState<Record<string, string>>({});

  // Sandbox detail data
  const [sandboxDetail, setSandboxDetail] = useState<Record<string, unknown> | null>(null);
  const [sandboxLogs, setSandboxLogs] = useState<string>("");

  // Token create
  const [showCreateToken, setShowCreateToken] = useState(false);
  const [newTokenLabel, setNewTokenLabel] = useState("");
  const [newTokenRole, setNewTokenRole] = useState("viewer");
  const [createdToken, setCreatedToken] = useState<string | null>(null);

  // Create instance
  const [showCreateInstance, setShowCreateInstance] = useState(false);
  const [newInstanceName, setNewInstanceName] = useState("");
  const [newInstanceDisplay, setNewInstanceDisplay] = useState("");

  // ── Data Loading ──────────────────────────────────────────────────────────

  const loadInstances = useCallback(async () => {
    try {
      const data = await api<{ instances: InstanceInfo[] }>(API.INSTANCES);
      setInstances(data.instances || []);
    } catch { /* ignore */ }
  }, []);

  const loadSandboxes = useCallback(async () => {
    try {
      const data = await api<{ sandboxes: SandboxInfo[] }>(API.SANDBOXES);
      setSandboxes(data.sandboxes || []);
    } catch { /* ignore */ }
  }, []);

  const loadTokens = useCallback(async () => {
    try {
      const data = await api<{ tokens: TokenInfo[] }>(API.TOKENS);
      setTokens(data.tokens || []);
    } catch { /* ignore */ }
  }, []);

  const loadSystem = useCallback(async () => {
    try {
      const data = await api<SystemInfo>(API.SYSTEM);
      setSystemInfo(data);
    } catch { /* ignore */ }
  }, []);

  const loadBuildInfo = useCallback(async () => {
    try {
      const data = await api<BuildInfo>(API.BUILD_INFO);
      setBuildInfo(data);
    } catch { /* ignore */ }
  }, []);

  const loadBuildHistory = useCallback(async () => {
    try {
      const data = await api<{ builds: BuildRecord[] }>(`${API.BUILD_HISTORY}?include_failed=true&limit=30`);
      setBuildHistory(data.builds || []);
    } catch { /* ignore */ }
  }, []);

  const loadAll = useCallback(async () => {
    await Promise.all([loadInstances(), loadSandboxes(), loadTokens(), loadSystem(), loadBuildInfo(), loadBuildHistory()]);
  }, [loadInstances, loadSandboxes, loadTokens, loadSystem, loadBuildInfo, loadBuildHistory]);

  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("manager_token") : null;
    if (token) {
      api(API.SYSTEM)
        .then(() => { setAuthed(true); })
        .catch(() => { setLoading(false); });
    } else {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authed) { loadAll().then(() => setLoading(false)); }
  }, [authed, loadAll]);

  // ── Instance Detail ───────────────────────────────────────────────────────

  const loadInstanceDetail = useCallback(async (name: string) => {
    try {
      const data = await api(API.INSTANCE(name));
      setInstanceDetail(data);
      const envData = await api<{ env: Record<string, string> }>(API.INSTANCE_ENV(name));
      setInstanceEnv(envData.env || {});
      setEnvDraft(envData.env || {});
      try {
        const composeData = await apiText(API.INSTANCE_COMPOSE(name));
        setInstanceCompose(composeData);
      } catch { setInstanceCompose("Unable to load compose file"); }
      try {
        const backupsData = await api<{ backups: Array<{ file: string; size: string; created: string }> }>(API.INSTANCE_BACKUPS(name));
        setInstanceBackups(backupsData.backups || []);
      } catch { setInstanceBackups([]); }
    } catch (e) {
      toast.error(`Failed to load instance: ${(e as Error).message}`);
    }
  }, []);

  const openInstance = (name: string) => {
    setSelectedInstance(name);
    setDetailSection("overview");
    setEditingEnv(false);
    setInstanceLogs("");
    loadInstanceDetail(name);
  };

  // ── Sandbox Detail ────────────────────────────────────────────────────────

  const loadSandboxDetail = useCallback(async (name: string) => {
    try {
      const data = await api(API.SANDBOX(name));
      setSandboxDetail(data);
    } catch (e) {
      toast.error(`Failed to load sandbox: ${(e as Error).message}`);
    }
  }, []);

  const openSandbox = (name: string) => {
    setSelectedSandbox(name);
    setSbxDetailSection("sbx-overview");
    setSandboxLogs("");
    loadSandboxDetail(name);
  };

  // ── Actions ───────────────────────────────────────────────────────────────

  async function handleDeploy(name?: string) {
    setDeploying(true);
    const toastId = toast.loading(name ? `Building & deploying ${name}...` : "Building & deploying all instances...", { duration: 300000 });
    try {
      const result = await api<{ success: boolean; error?: string; instances_restarted?: string[] }>(API.REBUILD, {
        method: "POST",
        body: JSON.stringify(name ? { name } : {}),
      });
      if (result.success) {
        toast.success(`Deploy complete — ${result.instances_restarted?.length || 0} instance(s) restarted`, { id: toastId, duration: 5000 });
      } else {
        toast.error(`Deploy failed: ${result.error || "Unknown error"}`, { id: toastId, duration: 10000 });
      }
      loadAll();
    } catch (e) {
      toast.error(`Deploy failed: ${(e as Error).message}`, { id: toastId });
    } finally {
      setDeploying(false);
    }
  }

  async function handleRollback(tag: string) {
    setRollingBack(tag);
    const toastId = toast.loading(`Rolling back to ${tag}...`);
    try {
      const result = await api<{ success: boolean; error?: string; instances_restarted?: string[] }>(API.ROLLBACK, {
        method: "POST",
        body: JSON.stringify({ tag }),
      });
      if (result.success) {
        toast.success(`Rolled back to ${tag}`, { id: toastId });
      } else {
        toast.error(`Rollback failed: ${result.error}`, { id: toastId });
      }
      loadAll();
    } catch (e) {
      toast.error(`Rollback failed: ${(e as Error).message}`, { id: toastId });
    } finally {
      setRollingBack(null);
    }
  }

  async function handleRebuildManager() {
    setDeployingMgr(true);
    const toastId = toast.loading("Rebuilding Server Manager...", { duration: 300000 });
    try {
      await api(API.SELF_REBUILD, { method: "POST" });
      toast.success("Server Manager rebuild triggered. Reconnecting...", { id: toastId });
      // Poll for reconnection
      let attempts = 0;
      const poll = setInterval(async () => {
        attempts++;
        try {
          await api(API.SYSTEM);
          clearInterval(poll);
          toast.success("Server Manager is back online!", { duration: 3000 });
          setDeployingMgr(false);
          loadAll();
        } catch {
          if (attempts > 60) { clearInterval(poll); setDeployingMgr(false); toast.error("Server Manager didn't come back. Check manually.", { id: toastId }); }
        }
      }, 3000);
    } catch {
      toast.info("Server Manager is rebuilding. Will reconnect shortly.", { id: toastId });
      setDeployingMgr(false);
    }
  }

  async function handleInstanceAction(name: string, action: string) {
    const toastId = toast.loading(`${action}ing ${name}...`);
    try {
      await api(API.INSTANCE_ACTION(name, action), { method: "POST" });
      toast.success(`${action} completed for ${name}`, { id: toastId });
      loadInstances();
      if (selectedInstance === name) loadInstanceDetail(name);
    } catch (e) {
      toast.error(`${action} failed: ${(e as Error).message}`, { id: toastId });
    }
  }

  async function handleRemoveInstance(name: string) {
    if (!confirm(`Remove instance "${name}"? This will destroy all data.`)) return;
    const toastId = toast.loading(`Removing ${name}...`);
    try {
      await api(API.INSTANCE(name), { method: "DELETE" });
      toast.success(`Instance ${name} removed`, { id: toastId });
      setSelectedInstance(null);
      loadInstances();
    } catch (e) {
      toast.error(`Remove failed: ${(e as Error).message}`, { id: toastId });
    }
  }

  async function handleCreateInstance() {
    if (!newInstanceName) { toast.error("Name is required"); return; }
    const toastId = toast.loading(`Creating ${newInstanceName}...`);
    try {
      await api(API.INSTANCES, { method: "POST", body: JSON.stringify({ name: newInstanceName, display_name: newInstanceDisplay || newInstanceName }) });
      toast.success(`Instance ${newInstanceName} created`, { id: toastId });
      setShowCreateInstance(false);
      setNewInstanceName("");
      setNewInstanceDisplay("");
      loadInstances();
    } catch (e) {
      toast.error(`Create failed: ${(e as Error).message}`, { id: toastId });
    }
  }

  async function handleLoadLogs(name: string, service: string) {
    try {
      const data = await api<{ app?: { output: string }; db?: { output: string } }>(`${API.INSTANCE_LOGS(name)}?service=${service}`);
      let logs = "";
      if (data.app?.output) logs += `=== APP LOGS ===\n${data.app.output}\n\n`;
      if (data.db?.output) logs += `=== DB LOGS ===\n${data.db.output}\n`;
      if (!logs) logs = "No logs available";
      setInstanceLogs(logs);
    } catch {
      setInstanceLogs("Failed to load logs");
    }
  }

  async function handleSaveEnv() {
    if (!selectedInstance) return;
    const changed: Record<string, string> = {};
    for (const [k, v] of Object.entries(envDraft)) {
      if (instanceEnv[k] !== v) changed[k] = v;
    }
    if (Object.keys(changed).length === 0) { toast.info("No changes to save"); return; }
    const toastId = toast.loading("Saving environment and restarting...");
    try {
      await api(API.INSTANCE_ENV(selectedInstance), { method: "PUT", body: JSON.stringify({ env_vars: changed, restart: true }) });
      toast.success("Environment updated and instance restarted", { id: toastId });
      setEditingEnv(false);
      loadInstanceDetail(selectedInstance);
    } catch (e) {
      toast.error(`Save failed: ${(e as Error).message}`, { id: toastId });
    }
  }

  async function handleCreateBackup() {
    if (!selectedInstance) return;
    const toastId = toast.loading("Creating backup...");
    try {
      await api(API.INSTANCE_BACKUP(selectedInstance), { method: "POST" });
      toast.success("Backup created", { id: toastId });
      loadInstanceDetail(selectedInstance);
    } catch (e) {
      toast.error(`Backup failed: ${(e as Error).message}`, { id: toastId });
    }
  }

  async function handleCreateToken() {
    if (!newTokenLabel) { toast.error("Label is required"); return; }
    const toastId = toast.loading("Creating token...");
    try {
      const data = await api<{ token: string }>(API.TOKENS, { method: "POST", body: JSON.stringify({ label: newTokenLabel, role: newTokenRole }) });
      setCreatedToken(data.token);
      toast.success("Token created", { id: toastId });
      loadTokens();
    } catch (e) {
      toast.error(`Failed: ${(e as Error).message}`, { id: toastId });
    }
  }

  async function handleDeleteToken(id: string) {
    if (!confirm("Delete this token?")) return;
    try {
      await api(API.TOKEN(id), { method: "DELETE" });
      toast.success("Token deleted");
      loadTokens();
    } catch (e) {
      toast.error(`Failed: ${(e as Error).message}`);
    }
  }

  async function handleSandboxAction(name: string, action: string) {
    const toastId = toast.loading(`${action}ing ${name}...`);
    try {
      await api(API.SANDBOX_ACTION(name, action), { method: "POST" });
      toast.success(`${action} completed`, { id: toastId });
      loadSandboxes();
    } catch (e) {
      toast.error(`Failed: ${(e as Error).message}`, { id: toastId });
    }
  }

  async function handleLoadSandboxLogs(name: string) {
    try {
      const data = await api<{ logs: string }>(API.SANDBOX_LOGS(name));
      setSandboxLogs(data.logs || "No logs");
    } catch {
      setSandboxLogs("Failed to load logs");
    }
  }

  async function handleCleanup() {
    const toastId = toast.loading("Running image cleanup...");
    try {
      const result = await api<{ removed: string[]; kept: string[] }>(API.BUILD_CLEANUP, { method: "POST" });
      toast.success(`Cleaned up ${result.removed?.length || 0} image(s)`, { id: toastId });
      loadBuildInfo();
    } catch (e) {
      toast.error(`Cleanup failed: ${(e as Error).message}`, { id: toastId });
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (!authed && !loading) return <LoginScreen onLogin={() => { setAuthed(true); setLoading(true); }} />;
  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="size-8 animate-spin text-muted-foreground" /></div>;

  const tabs: Array<{ id: MainTab; label: string; icon: React.ElementType }> = [
    { id: "instances", label: "Instances", icon: Layers },
    { id: "sandboxes", label: "Sandboxes", icon: Terminal },
    { id: "tokens", label: "Tokens", icon: Key },
    { id: "builds", label: "Builds", icon: History },
    { id: "system", label: "System", icon: Monitor },
  ];

  const currentInst = instances.find((i) => i.name === selectedInstance);
  const currentSandbox = sandboxes.find((s) => s.name === selectedSandbox);

  // ── Instance Detail View ──────────────────────────────────────────────────

  if (selectedInstance && currentInst) {
    const sections = ["overview", "containers", "env", "logs", "backups", "compose", "portal"];
    return (
      <div className="min-h-screen bg-background">
        <header className="border-b bg-card px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Server className="size-5 text-primary" />
            <h1 className="font-semibold text-lg">Matrx Server Manager</h1>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={role === "admin" ? "default" : "secondary"}>{role}</Badge>
            <Button variant="ghost" size="sm" onClick={loadAll}><RefreshCw className="size-4" /></Button>
            <Button variant="ghost" size="sm" onClick={() => { clearToken(); setAuthed(false); }}>Logout</Button>
          </div>
        </header>

        <main className="max-w-6xl mx-auto px-6 py-4 space-y-4">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-sm">
            <button onClick={() => { setSelectedInstance(null); setActiveTab("instances"); }} className="text-primary hover:underline flex items-center gap-1">
              <ChevronLeft className="size-4" /> Instances
            </button>
            <span className="text-muted-foreground">/</span>
            <span>{currentInst.display_name}</span>
          </div>

          {/* Instance header */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold">{currentInst.display_name}</h2>
              <p className="text-sm text-muted-foreground">{currentInst.url}</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => handleDeploy(selectedInstance)} disabled={deploying}>
                {deploying ? <Loader2 className="size-4 animate-spin" /> : <Rocket className="size-4" />} Rebuild & Deploy
              </Button>
              <Button variant="outline" size="sm" onClick={() => handleInstanceAction(selectedInstance, "restart")}><RotateCw className="size-4" /> Restart</Button>
              <Button variant="outline" size="sm" onClick={() => handleInstanceAction(selectedInstance, "stop")}><Square className="size-4" /> Stop</Button>
              <Button variant="outline" size="sm" onClick={() => handleInstanceAction(selectedInstance, "start")}><Play className="size-4" /> Start</Button>
              <Button variant="destructive" size="sm" onClick={() => handleRemoveInstance(selectedInstance)}><Trash2 className="size-4" /> Remove</Button>
            </div>
          </div>

          {/* Section tabs */}
          <div className="border-b">
            <nav className="flex gap-1">
              {sections.map((s) => (
                <button
                  key={s}
                  onClick={() => { setDetailSection(s); if (s === "logs") handleLoadLogs(selectedInstance, "both"); }}
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors capitalize ${detailSection === s ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                >
                  {s}
                </button>
              ))}
            </nav>
          </div>

          {/* Section content */}
          {detailSection === "overview" && instanceDetail && (
            <Card>
              <CardContent className="pt-6">
                <div className="grid grid-cols-2 gap-4 text-sm">
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

          {detailSection === "env" && (
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
                        <Button variant="default" size="sm" onClick={handleSaveEnv}>Save & Restart</Button>
                        <Button variant="outline" size="sm" onClick={() => setEditingEnv(false)}>Cancel</Button>
                      </>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {Object.entries(editingEnv ? envDraft : instanceEnv).map(([k, v]) => (
                    <div key={k} className="flex items-center gap-3 text-sm">
                      <span className="font-mono text-muted-foreground w-52 shrink-0">{k}</span>
                      {editingEnv ? (
                        <input
                          value={v}
                          onChange={(e) => setEnvDraft({ ...envDraft, [k]: e.target.value })}
                          className="flex-1 rounded border border-input bg-background px-2 py-1 font-mono text-sm"
                        />
                      ) : (
                        <span className="font-mono truncate">{v}</span>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {detailSection === "logs" && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Logs</CardTitle>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => handleLoadLogs(selectedInstance, "app")}>App</Button>
                    <Button variant="outline" size="sm" onClick={() => handleLoadLogs(selectedInstance, "db")}>DB</Button>
                    <Button variant="default" size="sm" onClick={() => handleLoadLogs(selectedInstance, "both")}>Both</Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <pre className="bg-muted rounded-md p-4 text-xs font-mono max-h-[500px] overflow-auto whitespace-pre-wrap">{instanceLogs || "Click a button to load logs..."}</pre>
              </CardContent>
            </Card>
          )}

          {detailSection === "backups" && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Database Backups</CardTitle>
                  <Button variant="default" size="sm" onClick={handleCreateBackup}><Database className="size-4" /> Create Backup</Button>
                </div>
              </CardHeader>
              <CardContent>
                {instanceBackups.length === 0 ? (
                  <p className="text-muted-foreground text-sm">No backups yet</p>
                ) : (
                  <div className="space-y-2">
                    {instanceBackups.map((b, i) => (
                      <div key={i} className="flex items-center justify-between py-2 px-3 rounded bg-muted/50 text-sm">
                        <span className="font-mono">{b.file}</span>
                        <span className="text-muted-foreground">{b.size}</span>
                        <span className="text-muted-foreground">{b.created}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {detailSection === "compose" && (
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">docker-compose.yml</CardTitle></CardHeader>
              <CardContent>
                <pre className="bg-muted rounded-md p-4 text-xs font-mono max-h-[600px] overflow-auto whitespace-pre-wrap">{instanceCompose}</pre>
              </CardContent>
            </Card>
          )}

          {detailSection === "portal" && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Admin Portal</CardTitle>
                  <a href={`${currentInst.url}/admin`} target="_blank" rel="noopener" className="text-primary text-sm hover:underline flex items-center gap-1">
                    <ExternalLink className="size-3" /> Open in New Tab
                  </a>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <iframe src={`${currentInst.url}/admin?token=${currentInst.api_key}`} className="w-full h-[600px] border-0 rounded-b-xl" />
              </CardContent>
            </Card>
          )}
        </main>
      </div>
    );
  }

  // ── Sandbox Detail View ───────────────────────────────────────────────────

  if (selectedSandbox && currentSandbox) {
    return (
      <div className="min-h-screen bg-background">
        <header className="border-b bg-card px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Server className="size-5 text-primary" />
            <h1 className="font-semibold text-lg">Matrx Server Manager</h1>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={role === "admin" ? "default" : "secondary"}>{role}</Badge>
            <Button variant="ghost" size="sm" onClick={loadAll}><RefreshCw className="size-4" /></Button>
          </div>
        </header>
        <main className="max-w-6xl mx-auto px-6 py-4 space-y-4">
          <div className="flex items-center gap-2 text-sm">
            <button onClick={() => { setSelectedSandbox(null); setActiveTab("sandboxes"); }} className="text-primary hover:underline flex items-center gap-1">
              <ChevronLeft className="size-4" /> Sandboxes
            </button>
            <span className="text-muted-foreground">/</span>
            <span>{currentSandbox.name}</span>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold">{currentSandbox.name}</h2>
              <Badge variant={currentSandbox.status === "running" ? "success" : "destructive"}>{currentSandbox.status}</Badge>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => handleSandboxAction(selectedSandbox, "restart")}><RotateCw className="size-4" /> Restart</Button>
              <Button variant="outline" size="sm" onClick={() => handleSandboxAction(selectedSandbox, "stop")}><Square className="size-4" /> Stop</Button>
              <Button variant="outline" size="sm" onClick={() => handleSandboxAction(selectedSandbox, "start")}><Play className="size-4" /> Start</Button>
            </div>
          </div>
          <div className="border-b">
            <nav className="flex gap-1">
              {["sbx-overview", "sbx-terminal", "sbx-logs"].map((s) => (
                <button key={s} onClick={() => { setSbxDetailSection(s); if (s === "sbx-logs") handleLoadSandboxLogs(selectedSandbox); }} className={`px-4 py-2 text-sm font-medium border-b-2 capitalize transition-colors ${sbxDetailSection === s ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
                  {s.replace("sbx-", "")}
                </button>
              ))}
            </nav>
          </div>
          {sbxDetailSection === "sbx-overview" && sandboxDetail && (
            <Card><CardContent className="pt-6"><div className="grid grid-cols-2 gap-4 text-sm">{Object.entries(sandboxDetail).map(([k, v]) => (<div key={k}><span className="text-muted-foreground">{k}:</span> <span className="font-mono">{String(v)}</span></div>))}</div></CardContent></Card>
          )}
          {sbxDetailSection === "sbx-terminal" && currentSandbox.terminal_url && (
            <Card><CardContent className="p-0"><iframe src={currentSandbox.terminal_url} className="w-full h-[500px] border-0 rounded-xl bg-black" /></CardContent></Card>
          )}
          {sbxDetailSection === "sbx-logs" && (
            <Card><CardContent className="pt-6"><pre className="bg-muted rounded-md p-4 text-xs font-mono max-h-[500px] overflow-auto whitespace-pre-wrap">{sandboxLogs || "Loading..."}</pre></CardContent></Card>
          )}
        </main>
      </div>
    );
  }

  // ── Main Dashboard ────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Server className="size-5 text-primary" />
          <h1 className="font-semibold text-lg">Matrx Server Manager</h1>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={role === "admin" ? "default" : "secondary"}>{role}</Badge>
          <Button variant="ghost" size="sm" onClick={loadAll}><RefreshCw className="size-4" /></Button>
          <Button variant="ghost" size="sm" onClick={() => { clearToken(); setAuthed(false); }}>Logout</Button>
        </div>
      </header>

      {/* Tabs */}
      <div className="border-b bg-card px-6">
        <nav className="flex gap-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeTab === t.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            >
              <t.icon className="size-4" /> {t.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Content */}
      <main className="max-w-6xl mx-auto px-6 py-6 space-y-6">

        {/* ── Instances Tab ────────────────────────────────────────────── */}
        {activeTab === "instances" && (
          <>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Deployed Instances</h2>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => handleDeploy()} disabled={deploying}>
                  {deploying ? <Loader2 className="size-4 animate-spin" /> : <Rocket className="size-4" />} Deploy Updates
                </Button>
                <Button size="sm" onClick={() => setShowCreateInstance(true)}><Plus className="size-4" /> New Instance</Button>
              </div>
            </div>
            {/* Build Info Summary */}
            {buildInfo && (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card><CardContent className="pt-6"><div className="text-sm text-muted-foreground">Image</div><div className="font-mono font-semibold mt-1">{buildInfo.current_image.id || "none"}</div><div className="text-xs text-muted-foreground">{buildInfo.current_image.age ? `Built ${buildInfo.current_image.age} ago` : ""}</div></CardContent></Card>
                <Card><CardContent className="pt-6"><div className="text-sm text-muted-foreground">Branch</div><div className="flex items-center gap-2 mt-1"><GitBranch className="size-4 text-primary" /><span className="font-mono font-semibold">{buildInfo.source.branch}</span></div><div className="text-xs text-muted-foreground font-mono">{buildInfo.source.head_commit}</div></CardContent></Card>
                <Card><CardContent className="pt-6"><div className="text-sm text-muted-foreground">Changes</div><div className="font-semibold mt-1">{buildInfo.has_changes ? <span className="text-warning">{buildInfo.pending_commits.length} pending</span> : <span className="text-success">Up to date</span>}</div></CardContent></Card>
                <Card><CardContent className="pt-6"><div className="text-sm text-muted-foreground">Instances</div><div className="font-semibold mt-1">{instances.length} total</div><div className="text-xs text-muted-foreground">{instances.filter((i) => i.status === "running").length} running</div></CardContent></Card>
              </div>
            )}
            {/* Pending commits preview */}
            {buildInfo && buildInfo.pending_commits.length > 0 && (
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><GitBranch className="size-4" /> Pending commits since last build</CardTitle></CardHeader>
                <CardContent><div className="font-mono text-xs space-y-0.5 max-h-32 overflow-y-auto text-muted-foreground">{buildInfo.pending_commits.map((c, i) => <div key={i}>{c}</div>)}</div></CardContent>
              </Card>
            )}
            {/* Instance list */}
            <Card>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead><tr className="border-b"><th className="text-left p-3 text-muted-foreground font-medium">Name</th><th className="text-left p-3 text-muted-foreground font-medium">Status</th><th className="text-left p-3 text-muted-foreground font-medium">URL</th><th className="text-left p-3 text-muted-foreground font-medium">Created</th><th className="text-right p-3 text-muted-foreground font-medium">Actions</th></tr></thead>
                  <tbody>
                    {instances.map((inst) => (
                      <tr key={inst.name} className="border-b last:border-0 hover:bg-muted/50 cursor-pointer" onClick={() => openInstance(inst.name)}>
                        <td className="p-3 font-medium">{inst.display_name}<span className="text-muted-foreground ml-2 font-normal text-xs">{inst.name}</span></td>
                        <td className="p-3"><Badge variant={inst.status === "running" ? "success" : "destructive"}>{inst.status}</Badge></td>
                        <td className="p-3"><a href={inst.url} target="_blank" rel="noopener" className="text-primary hover:underline text-xs font-mono" onClick={(e) => e.stopPropagation()}>{inst.url}</a></td>
                        <td className="p-3 text-muted-foreground text-xs">{inst.created_at ? new Date(inst.created_at).toLocaleDateString() : "—"}</td>
                        <td className="p-3 text-right">
                          <div className="flex gap-1 justify-end" onClick={(e) => e.stopPropagation()}>
                            <Button variant="ghost" size="sm" onClick={() => handleInstanceAction(inst.name, "restart")} title="Restart"><RotateCw className="size-3" /></Button>
                            <Button variant="ghost" size="sm" onClick={() => handleDeploy(inst.name)} disabled={deploying} title="Rebuild & Deploy"><Rocket className="size-3" /></Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>

            {/* Create Instance Modal */}
            {showCreateInstance && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowCreateInstance(false)}>
                <Card className="w-[440px]" onClick={(e) => e.stopPropagation()}>
                  <CardHeader><CardTitle>Create New Instance</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                    <div><label className="text-sm text-muted-foreground">Name (slug)</label><input value={newInstanceName} onChange={(e) => setNewInstanceName(e.target.value)} placeholder="my-app" className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono" /></div>
                    <div><label className="text-sm text-muted-foreground">Display Name</label><input value={newInstanceDisplay} onChange={(e) => setNewInstanceDisplay(e.target.value)} placeholder="My App" className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" /></div>
                    <div className="flex gap-2 justify-end"><Button variant="outline" onClick={() => setShowCreateInstance(false)}>Cancel</Button><Button onClick={handleCreateInstance}>Create</Button></div>
                  </CardContent>
                </Card>
              </div>
            )}
          </>
        )}

        {/* ── Sandboxes Tab ───────────────────────────────────────────── */}
        {activeTab === "sandboxes" && (
          <>
            <h2 className="text-lg font-semibold">Sandbox Environments <span className="text-muted-foreground text-sm font-normal ml-2">{sandboxes.length} sandbox(es)</span></h2>
            <Card>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead><tr className="border-b"><th className="text-left p-3 text-muted-foreground font-medium">Name</th><th className="text-left p-3 text-muted-foreground font-medium">Status</th><th className="text-left p-3 text-muted-foreground font-medium">ID</th><th className="text-left p-3 text-muted-foreground font-medium">Image</th><th className="text-right p-3 text-muted-foreground font-medium">Actions</th></tr></thead>
                  <tbody>
                    {sandboxes.map((sbx) => (
                      <tr key={sbx.name} className="border-b last:border-0 hover:bg-muted/50 cursor-pointer" onClick={() => openSandbox(sbx.name)}>
                        <td className="p-3 font-medium">{sbx.name}</td>
                        <td className="p-3"><Badge variant={sbx.status === "running" ? "success" : "destructive"}>{sbx.status}</Badge></td>
                        <td className="p-3 font-mono text-xs text-muted-foreground">{sbx.sandbox_id}</td>
                        <td className="p-3 font-mono text-xs text-muted-foreground">{sbx.image}</td>
                        <td className="p-3 text-right">
                          <div className="flex gap-1 justify-end" onClick={(e) => e.stopPropagation()}>
                            <Button variant="ghost" size="sm" onClick={() => handleSandboxAction(sbx.name, "restart")}><RotateCw className="size-3" /></Button>
                            <Button variant="ghost" size="sm" onClick={() => handleSandboxAction(sbx.name, "stop")}><Square className="size-3" /></Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {sandboxes.length === 0 && <tr><td colSpan={5} className="p-4 text-center text-muted-foreground">No sandboxes</td></tr>}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </>
        )}

        {/* ── Tokens Tab ──────────────────────────────────────────────── */}
        {activeTab === "tokens" && (
          <>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Access Tokens</h2>
              <Button size="sm" onClick={() => { setShowCreateToken(true); setCreatedToken(null); setNewTokenLabel(""); setNewTokenRole("viewer"); }}><Plus className="size-4" /> Create Token</Button>
            </div>

            {createdToken && (
              <Card className="border-success/50 bg-success/5">
                <CardContent className="pt-6 space-y-2">
                  <p className="text-sm font-medium text-success">New token created — copy it now!</p>
                  <div className="flex items-center gap-2">
                    <code className="bg-muted px-3 py-1.5 rounded text-sm font-mono flex-1 break-all">{createdToken}</code>
                    <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(createdToken); toast.success("Copied!"); }}><Copy className="size-4" /></Button>
                  </div>
                  <p className="text-xs text-muted-foreground">This token will not be shown again.</p>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead><tr className="border-b"><th className="text-left p-3 text-muted-foreground font-medium">ID</th><th className="text-left p-3 text-muted-foreground font-medium">Label</th><th className="text-left p-3 text-muted-foreground font-medium">Role</th><th className="text-left p-3 text-muted-foreground font-medium">Created</th><th className="text-left p-3 text-muted-foreground font-medium">Last Used</th><th className="text-right p-3 text-muted-foreground font-medium">Actions</th></tr></thead>
                  <tbody>
                    {tokens.map((t) => (
                      <tr key={t.id} className="border-b last:border-0">
                        <td className="p-3 font-mono text-xs">{t.id}</td>
                        <td className="p-3 font-medium">{t.label}</td>
                        <td className="p-3"><Badge variant={t.role === "admin" ? "default" : "secondary"}>{t.role}</Badge></td>
                        <td className="p-3 text-xs text-muted-foreground">{new Date(t.created_at).toLocaleDateString()}</td>
                        <td className="p-3 text-xs text-muted-foreground">{t.last_used_at ? new Date(t.last_used_at).toLocaleDateString() : "Never"}</td>
                        <td className="p-3 text-right"><Button variant="ghost" size="sm" onClick={() => handleDeleteToken(t.id)}><Trash2 className="size-3" /></Button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>

            {/* Create Token Modal */}
            {showCreateToken && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowCreateToken(false)}>
                <Card className="w-[440px]" onClick={(e) => e.stopPropagation()}>
                  <CardHeader><CardTitle>Create Access Token</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                    <div><label className="text-sm text-muted-foreground">Label</label><input value={newTokenLabel} onChange={(e) => setNewTokenLabel(e.target.value)} placeholder="My token" className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" /></div>
                    <div><label className="text-sm text-muted-foreground">Role</label><select value={newTokenRole} onChange={(e) => setNewTokenRole(e.target.value)} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"><option value="admin">Admin</option><option value="deployer">Deployer</option><option value="viewer">Viewer</option></select></div>
                    <div className="flex gap-2 justify-end"><Button variant="outline" onClick={() => setShowCreateToken(false)}>Cancel</Button><Button onClick={handleCreateToken}>Create</Button></div>
                  </CardContent>
                </Card>
              </div>
            )}
          </>
        )}

        {/* ── Builds Tab ──────────────────────────────────────────────── */}
        {activeTab === "builds" && (
          <>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Build History</h2>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleCleanup}><Trash2 className="size-4" /> Cleanup Images</Button>
                <Button size="sm" onClick={() => handleDeploy()} disabled={deploying}>
                  {deploying ? <Loader2 className="size-4 animate-spin" /> : <Rocket className="size-4" />} New Build
                </Button>
              </div>
            </div>

            {/* Pre-build info */}
            {buildInfo && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card><CardContent className="pt-6"><div className="text-sm text-muted-foreground">Current Image</div><div className="font-mono font-semibold mt-1">{buildInfo.current_image.id || "none"}</div><div className="text-xs text-muted-foreground mt-1">{buildInfo.current_image.age ? `Built ${buildInfo.current_image.age} ago` : ""}</div></CardContent></Card>
                <Card><CardContent className="pt-6"><div className="text-sm text-muted-foreground">Pending Changes</div><div className="font-semibold mt-1">{buildInfo.has_changes ? <span className="text-warning">{buildInfo.pending_commits.length} commit(s)</span> : <span className="text-success">No changes</span>}</div></CardContent></Card>
                <Card><CardContent className="pt-6"><div className="text-sm text-muted-foreground">Last Build</div><div className="text-sm mt-1">{buildInfo.last_build ? `${buildInfo.last_build.tag} — ${Math.round(buildInfo.last_build.duration_ms / 1000)}s` : "Never"}</div></CardContent></Card>
              </div>
            )}

            {/* Available images / rollback */}
            {buildInfo && buildInfo.available_tags.length > 0 && (
              <Card>
                <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><RotateCcw className="size-4" /> Available Images</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {buildInfo.available_tags.map((t) => (
                      <div key={t.tag} className="flex items-center justify-between py-2 px-3 rounded bg-muted/50">
                        <div className="flex items-center gap-3"><span className="font-mono text-sm font-medium">{t.tag}</span><span className="text-xs text-muted-foreground font-mono">{t.id}</span><span className="text-xs text-muted-foreground">{t.age}</span>{t.tag === "latest" && <Badge className="text-[10px]">current</Badge>}</div>
                        {t.tag !== "latest" && t.tag !== "<none>" && <Button variant="outline" size="sm" onClick={() => handleRollback(t.tag)} disabled={rollingBack === t.tag}>{rollingBack === t.tag ? <Loader2 className="size-3 animate-spin" /> : <ArrowDownToLine className="size-3" />} Rollback</Button>}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Build history */}
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">{buildHistory.length} build(s)</CardTitle></CardHeader>
              <CardContent>
                {buildHistory.length === 0 ? <p className="text-muted-foreground text-sm">No builds recorded yet.</p> : (
                  <div className="space-y-3">
                    {buildHistory.map((b) => (
                      <div key={b.id} className="flex items-start justify-between p-3 rounded-lg border bg-card">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">{b.success ? <CheckCircle2 className="size-4 text-success" /> : <AlertTriangle className="size-4 text-destructive" />}<span className="font-mono text-sm font-medium">{b.tag}</span><Badge variant={b.success ? "success" : "destructive"} className="text-[10px]">{b.success ? "success" : "failed"}</Badge></div>
                          <div className="text-xs text-muted-foreground space-x-3"><span><Clock className="inline size-3 mr-1" />{new Date(b.timestamp).toLocaleString()}</span><span>{Math.round(b.duration_ms / 1000)}s</span><span className="font-mono">{b.git_commit}</span><span>by {b.triggered_by}</span></div>
                          {b.git_message && <div className="text-xs text-muted-foreground">{b.git_message}</div>}
                          {b.error && <div className="text-xs text-destructive">{b.error}</div>}
                        </div>
                        {b.success && b.tag && !b.tag.startsWith("rollback") && <Button variant="outline" size="sm" onClick={() => handleRollback(b.tag)} disabled={rollingBack === b.tag}><ArrowDownToLine className="size-3" /> Rollback</Button>}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}

        {/* ── System Tab ──────────────────────────────────────────────── */}
        {activeTab === "system" && systemInfo && (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold">System</h2>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card><CardContent className="pt-6"><div className="flex items-center gap-2 text-sm text-muted-foreground"><Globe className="size-4" /> Hostname</div><div className="font-mono font-semibold mt-1 text-sm">{systemInfo.hostname}</div></CardContent></Card>
              <Card><CardContent className="pt-6"><div className="flex items-center gap-2 text-sm text-muted-foreground"><Cpu className="size-4" /> Memory</div><div className="font-semibold mt-1">{systemInfo.memory.percent}</div><div className="text-xs text-muted-foreground">{systemInfo.memory.used} / {systemInfo.memory.total}</div></CardContent></Card>
              <Card><CardContent className="pt-6"><div className="flex items-center gap-2 text-sm text-muted-foreground"><HardDrive className="size-4" /> Disk</div><div className="font-semibold mt-1">{systemInfo.disk.percent}</div><div className="text-xs text-muted-foreground">{systemInfo.disk.used} / {systemInfo.disk.total}</div></CardContent></Card>
              <Card><CardContent className="pt-6"><div className="flex items-center gap-2 text-sm text-muted-foreground"><Clock className="size-4" /> Uptime</div><div className="font-semibold mt-1">{systemInfo.uptime_hours}h</div><div className="text-xs text-muted-foreground">{systemInfo.cpus} CPUs</div></CardContent></Card>
            </div>

            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div><CardTitle className="text-base flex items-center gap-2"><Container className="size-4" /> Docker Containers</CardTitle><CardDescription className="mt-1">{systemInfo.docker}</CardDescription></div>
                </div>
              </CardHeader>
              <CardContent><div className="space-y-1 font-mono text-sm">{systemInfo.containers.map((c, i) => <div key={i} className="py-0.5 text-muted-foreground">{c}</div>)}</div></CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div><CardTitle className="text-base flex items-center gap-2"><ShieldCheck className="size-4" /> Server Manager</CardTitle><CardDescription>Rebuild the server manager from source</CardDescription></div>
                  <Button variant="outline" onClick={handleRebuildManager} disabled={deployingMgr}>{deployingMgr ? <Loader2 className="size-4 animate-spin" /> : <Wrench className="size-4" />} Rebuild Server Manager</Button>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">This rebuilds <code>/srv/mcp-servers/</code> and restarts the server manager container. The admin UI will briefly disconnect.</p>
                <div className="mt-3">
                  <a href="https://deploy.dev.codematrx.com" target="_blank" rel="noopener" className="text-primary text-sm hover:underline flex items-center gap-1"><ExternalLink className="size-3" /> Open Deploy App (safer for manager rebuilds)</a>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}
