// ── API Route Constants ─────────────────────────────────────────────────────
// Single source of truth for all API paths used by this admin UI.
// If a backend route changes, update it here and the whole UI follows.
export const API = {
  HEALTH: "/health",
  SYSTEM: "/api/system",
  INSTANCES: "/api/instances",
  INSTANCE: (name: string) => `/api/instances/${name}`,
  INSTANCE_ENV: (name: string) => `/api/instances/${name}/env`,
  INSTANCE_COMPOSE: (name: string) => `/api/instances/${name}/compose`,
  INSTANCE_BACKUPS: (name: string) => `/api/instances/${name}/backups`,
  INSTANCE_LOGS: (name: string) => `/api/instances/${name}/logs`,
  INSTANCE_BACKUP: (name: string) => `/api/instances/${name}/backup`,
  INSTANCE_ACTION: (name: string, action: string) => `/api/instances/${name}/${action}`,
  SANDBOXES: "/api/sandboxes",
  SANDBOX: (name: string) => `/api/sandboxes/${name}`,
  SANDBOX_LOGS: (name: string) => `/api/sandboxes/${name}/logs`,
  SANDBOX_ACTION: (name: string, action: string) => `/api/sandboxes/${name}/${action}`,
  TOKENS: "/api/tokens",
  TOKEN: (id: string) => `/api/tokens/${id}`,
  BUILD_INFO: "/api/build-info",
  BUILD_HISTORY: "/api/build-history",
  REBUILD: "/api/rebuild",
  REBUILD_STREAM: "/api/rebuild/stream",
  ROLLBACK: "/api/rollback",
  SELF_REBUILD: "/api/self-rebuild",
  SELF_REBUILD_STREAM: "/api/self-rebuild/stream",
  BUILD_CLEANUP: "/api/build-cleanup",
} as const;

// ── Token Management ────────────────────────────────────────────────────────

function getToken(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("manager_token") || "";
}

export function setToken(token: string) {
  localStorage.setItem("manager_token", token);
}

export function clearToken() {
  localStorage.removeItem("manager_token");
}

// ── API Client ──────────────────────────────────────────────────────────────

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function api<T = Record<string, unknown>>(path: string, opts: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(path, {
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...opts.headers,
    },
    body: opts.body ? (typeof opts.body === "string" ? opts.body : JSON.stringify(opts.body)) : undefined,
  });

  if (res.status === 401) throw new ApiError("Unauthorized", 401);

  // Treat 404 as a clear "not found" error, not an auth failure
  if (res.status === 404) {
    const text = await res.text();
    throw new ApiError(text.includes("Cannot") ? `Route not found: ${path}` : text, 404);
  }

  const data = await res.json();
  if (!res.ok && data.error) throw new ApiError(data.error, res.status);
  return data as T;
}

export async function apiText(path: string, opts: RequestInit = {}): Promise<string> {
  const token = getToken();
  const res = await fetch(path, {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, ...opts.headers },
  });
  if (res.status === 401) throw new ApiError("Unauthorized", 401);
  if (res.status === 404) throw new ApiError(`Route not found: ${path}`, 404);
  return res.text();
}
