"use client";

import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { api, setToken, clearToken, API } from "@/lib/api";
import { useAdminData } from "@/hooks/use-admin-data";
import { useAdminActions } from "@/hooks/use-admin-actions";
import { AdminLayout, type AdminView } from "@/components/admin-layout";
import { LoginScreen } from "@/components/admin/login-screen";
import { InstancesTab } from "@/components/admin/instances-tab";
import { InstanceDetail } from "@/components/admin/instance-detail";
import { SandboxesTab } from "@/components/admin/sandboxes-tab";
import { SandboxDetail } from "@/components/admin/sandbox-detail";
import { TokensTab } from "@/components/admin/tokens-tab";
import { BuildsTab } from "@/components/admin/builds-tab";
import { SystemTab } from "@/components/admin/system-tab";

export default function AdminPage() {
  const [authed, setAuthed] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [activeView, setActiveView] = useState<AdminView>("instances");

  // Detail view state
  const [selectedInstance, setSelectedInstance] = useState<string | null>(null);
  const [selectedSandbox, setSelectedSandbox] = useState<string | null>(null);

  // Data hook
  const data = useAdminData(authed);

  // Actions hook
  const actions = useAdminActions({
    loadInstances: data.loadInstances,
    loadSandboxes: data.loadSandboxes,
    loadTokens: data.loadTokens,
    loadBuildInfo: data.loadBuildInfo,
    loadAll: data.loadAll,
  });

  // Check for existing auth token on mount
  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("manager_token") : null;
    if (token) {
      setToken(token);
      api(API.SYSTEM)
        .then(() => { setAuthed(true); })
        .catch(() => { clearToken(); setInitialLoading(false); });
    } else {
      setInitialLoading(false);
    }
  }, []);

  // When authed + data loading completes, stop initial loading
  useEffect(() => {
    if (authed && !data.loading) {
      setInitialLoading(false);
    }
  }, [authed, data.loading]);

  // Not authed — show login
  if (!authed && !initialLoading) {
    return <LoginScreen onLogin={() => { setAuthed(true); }} />;
  }

  // Initial loading spinner
  if (initialLoading) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-background">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Resolve current detail views
  const currentInstance = instances().find((i) => i.name === selectedInstance);
  const currentSandbox = sandboxes().find((s) => s.name === selectedSandbox);

  function instances() { return data.instances; }
  function sandboxes() { return data.sandboxes; }

  function openInstance(name: string) {
    setSelectedInstance(name);
    actions.loadInstanceDetail(name);
  }

  function openSandbox(name: string) {
    setSelectedSandbox(name);
    actions.loadSandboxDetail(name);
  }

  function handleLogout() {
    clearToken();
    setAuthed(false);
  }

  function clearLogs() {
    actions.setBuildLogs([]);
    actions.setBuildPhase(null);
  }

  // Render content based on active view and detail state
  function renderContent() {
    // Instance detail view
    if (selectedInstance && currentInstance) {
      return (
        <InstanceDetail
          instance={currentInstance}
          instanceDetail={actions.instanceDetail}
          instanceLogs={actions.instanceLogs}
          instanceEnv={actions.instanceEnv}
          instanceCompose={actions.instanceCompose}
          instanceBackups={actions.instanceBackups}
          deploying={actions.deploying}
          onBack={() => { setSelectedInstance(null); setActiveView("instances"); }}
          onDeploy={(name) => actions.handleDeploy(name)}
          onAction={actions.handleInstanceAction}
          onRemove={actions.handleRemoveInstance}
          onLoadLogs={actions.handleLoadLogs}
          onSaveEnv={actions.handleSaveEnv}
          onCreateBackup={actions.handleCreateBackup}
          onLoadDetail={actions.loadInstanceDetail}
        />
      );
    }

    // Sandbox detail view
    if (selectedSandbox && currentSandbox) {
      return (
        <SandboxDetail
          sandbox={currentSandbox}
          sandboxDetail={actions.sandboxDetail}
          sandboxLogs={actions.sandboxLogs}
          onBack={() => { setSelectedSandbox(null); setActiveView("sandboxes"); }}
          onAction={actions.handleSandboxAction}
          onLoadLogs={actions.handleLoadSandboxLogs}
        />
      );
    }

    // Tab views
    switch (activeView) {
      case "instances":
        return (
          <InstancesTab
            instances={data.instances}
            buildInfo={data.buildInfo}
            deploying={actions.deploying}
            onDeploy={(name) => actions.handleDeploy(name)}
            onOpenInstance={openInstance}
            onInstanceAction={actions.handleInstanceAction}
            onCreateInstance={actions.handleCreateInstance}
          />
        );

      case "sandboxes":
        return (
          <SandboxesTab
            sandboxes={data.sandboxes}
            onOpenSandbox={openSandbox}
            onSandboxAction={actions.handleSandboxAction}
          />
        );

      case "tokens":
        return (
          <TokensTab
            tokens={data.tokens}
            onCreateToken={actions.handleCreateToken}
            onDeleteToken={actions.handleDeleteToken}
          />
        );

      case "builds":
        return (
          <BuildsTab
            buildInfo={data.buildInfo}
            buildHistory={data.buildHistory}
            buildLogs={actions.buildLogs}
            buildPhase={actions.buildPhase}
            deploying={actions.deploying}
            deployingMgr={actions.deployingMgr}
            rollingBack={actions.rollingBack}
            onDeploy={() => actions.handleDeploy()}
            onRollback={actions.handleRollback}
            onCleanup={actions.handleCleanup}
            onClearLogs={clearLogs}
          />
        );

      case "system":
        if (!data.systemInfo) return null;
        return (
          <SystemTab
            systemInfo={data.systemInfo}
            deployingMgr={actions.deployingMgr}
            buildLogs={actions.buildLogs}
            buildPhase={actions.buildPhase}
            deploying={actions.deploying}
            onRebuildManager={actions.handleRebuildManager}
            onClearLogs={clearLogs}
          />
        );

      default:
        return null;
    }
  }

  return (
    <AdminLayout
      activeView={selectedInstance ? "instances" : selectedSandbox ? "sandboxes" : activeView}
      onNavigate={(view) => {
        setSelectedInstance(null);
        setSelectedSandbox(null);
        setActiveView(view);
      }}
      role={data.role}
      onRefresh={data.loadAll}
      onLogout={handleLogout}
    >
      {renderContent()}
    </AdminLayout>
  );
}
