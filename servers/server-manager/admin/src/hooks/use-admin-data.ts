"use client";

import { useState, useCallback, useEffect } from "react";
import { api, API } from "@/lib/api";
import type {
  InstanceInfo,
  SandboxInfo,
  TokenInfo,
  SystemInfo,
  BuildInfo,
  BuildRecord,
} from "@/lib/types";

export function useAdminData(authed: boolean) {
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<string>("viewer");

  const [instances, setInstances] = useState<InstanceInfo[]>([]);
  const [sandboxes, setSandboxes] = useState<SandboxInfo[]>([]);
  const [tokens, setTokens] = useState<TokenInfo[]>([]);
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [buildInfo, setBuildInfo] = useState<BuildInfo | null>(null);
  const [buildHistory, setBuildHistory] = useState<BuildRecord[]>([]);

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
    await Promise.all([
      loadInstances(),
      loadSandboxes(),
      loadTokens(),
      loadSystem(),
      loadBuildInfo(),
      loadBuildHistory(),
    ]);
  }, [loadInstances, loadSandboxes, loadTokens, loadSystem, loadBuildInfo, loadBuildHistory]);

  useEffect(() => {
    if (authed) {
      loadAll().then(() => setLoading(false));
    }
  }, [authed, loadAll]);

  return {
    loading,
    setLoading,
    role,
    setRole,
    instances,
    sandboxes,
    tokens,
    systemInfo,
    buildInfo,
    buildHistory,
    loadInstances,
    loadSandboxes,
    loadTokens,
    loadSystem,
    loadBuildInfo,
    loadBuildHistory,
    loadAll,
  };
}
