export interface InstanceInfo {
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

export interface SandboxInfo {
  name: string;
  status: string;
  sandbox_id: string;
  image: string;
  terminal_url?: string;
}

export interface TokenInfo {
  id: string;
  label: string;
  role: string;
  created_at: string;
  last_used_at: string | null;
}

export interface SystemInfo {
  hostname: string;
  cpus: number;
  memory: { total: string; used: string; free: string; percent: string };
  disk: { total: string; used: string; available: string; percent: string };
  uptime_hours: string;
  docker: string;
  containers: string[];
  node_version?: string;
}

export interface BuildInfo {
  current_image: { id: string | null; created: string | null; age: string | null };
  source: { path: string; branch: string; head_commit: string; last_build_commit: string | null };
  has_changes: boolean;
  pending_commits: string[];
  diff_stats: string | null;
  instances: Array<{ name: string; display_name: string; status: string }>;
  available_tags: Array<{ tag: string; id: string; age: string }>;
  last_build: { tag: string; timestamp: string; git_commit: string; duration_ms: number } | null;
}

export interface BuildRecord {
  id: string;
  tag: string;
  timestamp: string;
  git_commit: string;
  git_message: string;
  image_id: string | null;
  success: boolean;
  error: string | null;
  duration_ms: number;
  triggered_by: string;
  instances_restarted: string[];
}
