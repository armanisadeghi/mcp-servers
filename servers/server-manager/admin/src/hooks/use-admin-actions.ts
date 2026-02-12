"use client";

import { useState, useCallback } from "react";
import { toast } from "sonner";
import { api, apiText, API } from "@/lib/api";

interface UseAdminActionsOpts {
  loadInstances: () => Promise<void>;
  loadSandboxes: () => Promise<void>;
  loadTokens: () => Promise<void>;
  loadBuildInfo: () => Promise<void>;
  loadAll: () => Promise<void>;
}

export function useAdminActions({
  loadInstances,
  loadSandboxes,
  loadTokens,
  loadBuildInfo,
  loadAll,
}: UseAdminActionsOpts) {
  const [deploying, setDeploying] = useState(false);
  const [deployingMgr, setDeployingMgr] = useState(false);
  const [rollingBack, setRollingBack] = useState<string | null>(null);
  const [buildLogs, setBuildLogs] = useState<string[]>([]);
  const [buildPhase, setBuildPhase] = useState<string | null>(null);

  // Instance detail state
  const [instanceDetail, setInstanceDetail] = useState<Record<string, unknown> | null>(null);
  const [instanceLogs, setInstanceLogs] = useState<string>("");
  const [instanceEnv, setInstanceEnv] = useState<Record<string, string>>({});
  const [instanceCompose, setInstanceCompose] = useState<string>("");
  const [instanceBackups, setInstanceBackups] = useState<Array<{ file: string; size: string; created: string }>>([]);

  // Sandbox detail state
  const [sandboxDetail, setSandboxDetail] = useState<Record<string, unknown> | null>(null);
  const [sandboxLogs, setSandboxLogs] = useState<string>("");

  const loadInstanceDetail = useCallback(async (name: string) => {
    try {
      const data = await api(API.INSTANCE(name));
      setInstanceDetail(data);
      const envData = await api<{ env: Record<string, string> }>(API.INSTANCE_ENV(name));
      setInstanceEnv(envData.env || {});
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

  const loadSandboxDetail = useCallback(async (name: string) => {
    try {
      const data = await api(API.SANDBOX(name));
      setSandboxDetail(data);
    } catch (e) {
      toast.error(`Failed to load sandbox: ${(e as Error).message}`);
    }
  }, []);

  async function handleDeploy(name?: string) {
    setDeploying(true);
    setBuildLogs([]);
    setBuildPhase("starting");

    const token = typeof window !== "undefined" ? localStorage.getItem("manager_token") || "" : "";

    try {
      const response = await fetch(API.REBUILD_STREAM, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(name ? { name } : {}),
      });

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      if (!reader) throw new Error("No response stream");

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        let eventType = "";
        for (const line of lines) {
          if (line.startsWith("event: ")) {
            eventType = line.slice(7);
          } else if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              if (eventType === "log") {
                setBuildLogs((prev) => [...prev, data.message]);
              } else if (eventType === "phase") {
                setBuildPhase(data.phase);
                setBuildLogs((prev) => [...prev, `── ${data.message} ──`]);
              } else if (eventType === "done") {
                toast.success(`Deploy complete — ${data.instances_restarted?.length || 0} instance(s) restarted in ${Math.round((data.duration_ms || 0) / 1000)}s`);
                setBuildPhase("done");
              } else if (eventType === "error") {
                toast.error(`Deploy failed: ${data.error}`);
                setBuildPhase("error");
              }
            } catch { /* skip malformed JSON */ }
          }
        }
      }
      loadAll();
    } catch (e) {
      toast.error(`Deploy failed: ${(e as Error).message}`);
      setBuildPhase("error");
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
    setBuildLogs([]);
    setBuildPhase("self-rebuild");

    const token = typeof window !== "undefined" ? localStorage.getItem("manager_token") || "" : "";

    try {
      const response = await fetch(API.SELF_REBUILD_STREAM, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      });

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          let eventType = "";
          for (const line of lines) {
            if (line.startsWith("event: ")) eventType = line.slice(7);
            else if (line.startsWith("data: ")) {
              try {
                const data = JSON.parse(line.slice(6));
                if (eventType === "log") setBuildLogs((prev) => [...prev, data.message]);
                else if (eventType === "phase") { setBuildPhase(data.phase); setBuildLogs((prev) => [...prev, `── ${data.message} ──`]); }
                else if (eventType === "done") { toast.success("Server Manager rebuild complete. Container restarting..."); setBuildPhase("done"); }
                else if (eventType === "error") { toast.error(`Rebuild failed: ${data.error}`); setBuildPhase("error"); }
              } catch { /* skip */ }
            }
          }
        }
      }

      let attempts = 0;
      const poll = setInterval(async () => {
        attempts++;
        try {
          await api(API.SYSTEM);
          clearInterval(poll);
          toast.success("Server Manager is back online!");
          setDeployingMgr(false);
          loadAll();
        } catch {
          if (attempts > 60) { clearInterval(poll); setDeployingMgr(false); toast.error("Server Manager didn't come back. Check manually."); }
        }
      }, 3000);
    } catch {
      toast.info("Server Manager is rebuilding. Connection may drop as it restarts.");
      setBuildPhase("done");
      setDeployingMgr(false);
    }
  }

  async function handleInstanceAction(name: string, action: string) {
    const toastId = toast.loading(`${action}ing ${name}...`);
    try {
      await api(API.INSTANCE_ACTION(name, action), { method: "POST" });
      toast.success(`${action} completed for ${name}`, { id: toastId });
      loadInstances();
    } catch (e) {
      toast.error(`${action} failed: ${(e as Error).message}`, { id: toastId });
    }
  }

  async function handleRemoveInstance(name: string): Promise<boolean> {
    if (!confirm(`Remove instance "${name}"? This will destroy all data.`)) return false;
    const toastId = toast.loading(`Removing ${name}...`);
    try {
      await api(API.INSTANCE(name), { method: "DELETE" });
      toast.success(`Instance ${name} removed`, { id: toastId });
      loadInstances();
      return true;
    } catch (e) {
      toast.error(`Remove failed: ${(e as Error).message}`, { id: toastId });
      return false;
    }
  }

  async function handleCreateInstance(name: string, displayName: string) {
    if (!name) { toast.error("Name is required"); return false; }
    const toastId = toast.loading(`Creating ${name}...`);
    try {
      await api(API.INSTANCES, { method: "POST", body: JSON.stringify({ name, display_name: displayName || name }) });
      toast.success(`Instance ${name} created`, { id: toastId });
      loadInstances();
      return true;
    } catch (e) {
      toast.error(`Create failed: ${(e as Error).message}`, { id: toastId });
      return false;
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

  async function handleSaveEnv(name: string, currentEnv: Record<string, string>, draft: Record<string, string>) {
    const changed: Record<string, string> = {};
    for (const [k, v] of Object.entries(draft)) {
      if (currentEnv[k] !== v) changed[k] = v;
    }
    if (Object.keys(changed).length === 0) { toast.info("No changes to save"); return false; }
    const toastId = toast.loading("Saving environment and restarting...");
    try {
      await api(API.INSTANCE_ENV(name), { method: "PUT", body: JSON.stringify({ env_vars: changed, restart: true }) });
      toast.success("Environment updated and instance restarted", { id: toastId });
      loadInstanceDetail(name);
      return true;
    } catch (e) {
      toast.error(`Save failed: ${(e as Error).message}`, { id: toastId });
      return false;
    }
  }

  async function handleCreateBackup(name: string) {
    const toastId = toast.loading("Creating backup...");
    try {
      await api(API.INSTANCE_BACKUP(name), { method: "POST" });
      toast.success("Backup created", { id: toastId });
      loadInstanceDetail(name);
    } catch (e) {
      toast.error(`Backup failed: ${(e as Error).message}`, { id: toastId });
    }
  }

  async function handleCreateToken(label: string, tokenRole: string) {
    if (!label) { toast.error("Label is required"); return null; }
    const toastId = toast.loading("Creating token...");
    try {
      const data = await api<{ token: string }>(API.TOKENS, { method: "POST", body: JSON.stringify({ label, role: tokenRole }) });
      toast.success("Token created", { id: toastId });
      loadTokens();
      return data.token;
    } catch (e) {
      toast.error(`Failed: ${(e as Error).message}`, { id: toastId });
      return null;
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

  return {
    // Deploy state
    deploying,
    deployingMgr,
    rollingBack,
    buildLogs,
    setBuildLogs,
    buildPhase,
    setBuildPhase,

    // Instance detail state
    instanceDetail,
    instanceLogs,
    instanceEnv,
    instanceCompose,
    instanceBackups,
    loadInstanceDetail,

    // Sandbox detail state
    sandboxDetail,
    sandboxLogs,
    loadSandboxDetail,

    // Actions
    handleDeploy,
    handleRollback,
    handleRebuildManager,
    handleInstanceAction,
    handleRemoveInstance,
    handleCreateInstance,
    handleLoadLogs,
    handleSaveEnv,
    handleCreateBackup,
    handleCreateToken,
    handleDeleteToken,
    handleSandboxAction,
    handleLoadSandboxLogs,
    handleCleanup,
  };
}
