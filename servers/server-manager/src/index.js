import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import { z } from "zod";
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync, mkdirSync, unlinkSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { cpus, totalmem, freemem, uptime as osUptime, hostname } from "node:os";
import { randomBytes, createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const PORT = process.env.PORT || 3000;
const __dirname = dirname(fileURLToPath(import.meta.url));

// Host paths mounted into the container
const HOST_SRV = "/host-srv";     // /srv on host
const HOST_DATA = "/host-data";   // /data on host

// App deployment paths
const APPS_DIR = join(HOST_SRV, "apps");
const DEPLOYMENTS_FILE = join(APPS_DIR, "deployments.json");
const BACKUPS_DIR = join(APPS_DIR, "backups");
const TOKENS_FILE = join(APPS_DIR, "tokens.json");
const DOMAIN_SUFFIX = "dev.codematrx.com";
const BUILD_HISTORY_FILE = join(APPS_DIR, "build-history.json");

// ╔════════════════════════════════════════════════════════════════════════════╗
// ║  TOKEN STORE                                                              ║
// ╚════════════════════════════════════════════════════════════════════════════╝

function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

function loadTokens() {
  try {
    return JSON.parse(readFileSync(TOKENS_FILE, "utf-8"));
  } catch {
    return { tokens: [] };
  }
}

function saveTokens(store) {
  mkdirSync(dirname(TOKENS_FILE), { recursive: true });
  writeFileSync(TOKENS_FILE, JSON.stringify(store, null, 2) + "\n", "utf-8");
  try { execSync(`chmod 600 ${TOKENS_FILE}`, { stdio: "ignore" }); } catch { /* ok */ }
}

function verifyToken(bearerToken) {
  if (!bearerToken) return null;
  const hash = hashToken(bearerToken);
  const store = loadTokens();
  const entry = store.tokens.find((t) => t.token_hash === hash);
  if (!entry) return null;
  // Update last_used_at
  entry.last_used_at = new Date().toISOString();
  saveTokens(store);
  return entry;
}

// Auto-migrate: import MCP_BEARER_TOKEN as admin token on first boot
function initTokenStore() {
  const envToken = process.env.MCP_BEARER_TOKEN;
  if (!envToken) {
    console.log("WARNING: No MCP_BEARER_TOKEN set — auth is disabled");
    return;
  }

  let store = loadTokens();
  const envHash = hashToken(envToken);

  // Check if already imported
  if (store.tokens.some((t) => t.token_hash === envHash)) {
    console.log(`Token store: ${store.tokens.length} token(s) loaded`);
    return;
  }

  // Import env token as first admin
  store.tokens.push({
    id: `tok_${randomBytes(6).toString("hex")}`,
    token_hash: envHash,
    label: "Admin (auto-imported from MCP_BEARER_TOKEN)",
    role: "admin",
    created_at: new Date().toISOString(),
    last_used_at: null,
  });
  saveTokens(store);
  console.log(`Token store: imported MCP_BEARER_TOKEN as admin, ${store.tokens.length} token(s) total`);
}

// ╔════════════════════════════════════════════════════════════════════════════╗
// ║  AUTH MIDDLEWARE                                                           ║
// ╚════════════════════════════════════════════════════════════════════════════╝

function authMiddleware(req, res, next) {
  const envToken = process.env.MCP_BEARER_TOKEN;
  if (!envToken) return next(); // No token configured = open

  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized — Bearer token required" });
  }

  const token = auth.replace("Bearer ", "");
  const entry = verifyToken(token);
  if (!entry) {
    return res.status(401).json({ error: "Unauthorized — invalid token" });
  }

  req.tokenEntry = entry;
  req.tokenRole = entry.role;
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.tokenRole) return next(); // Auth disabled
    if (roles.includes(req.tokenRole)) return next();
    return res.status(403).json({ error: `Forbidden — requires role: ${roles.join(" or ")}` });
  };
}

// ╔════════════════════════════════════════════════════════════════════════════╗
// ║  HELPERS                                                                  ║
// ╚════════════════════════════════════════════════════════════════════════════╝

function exec(cmd, { timeout = 30000, cwd } = {}) {
  try {
    const result = execSync(cmd, {
      encoding: "utf-8",
      timeout,
      maxBuffer: 10 * 1024 * 1024,
      cwd,
      env: { ...process.env, PATH: process.env.PATH },
    });
    return { success: true, output: result.trim() };
  } catch (error) {
    return {
      success: false,
      output: error.stdout?.trim() || "",
      error: error.stderr?.trim() || error.message,
      exitCode: error.status,
    };
  }
}

function formatBytes(bytes) {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let val = bytes;
  while (val >= 1024 && i < units.length - 1) { val /= 1024; i++; }
  return `${val.toFixed(1)} ${units[i]}`;
}

function textResult(data) {
  return {
    content: [{
      type: "text",
      text: typeof data === "string" ? data : JSON.stringify(data, null, 2),
    }],
  };
}

function resolveHostPath(userPath) {
  const normalized = resolve("/", userPath);
  if (normalized.startsWith("/srv/") || normalized === "/srv") {
    return normalized.replace(/^\/srv/, HOST_SRV);
  }
  if (normalized.startsWith("/data/") || normalized === "/data") {
    return normalized.replace(/^\/data/, HOST_DATA);
  }
  return normalized;
}

function randomHex(bytes) {
  return randomBytes(bytes).toString("hex");
}

// ╔════════════════════════════════════════════════════════════════════════════╗
// ║  DEPLOYMENT HELPERS (shared by MCP tools + REST API)                      ║
// ╚════════════════════════════════════════════════════════════════════════════╝

function loadDeployments() {
  try {
    return JSON.parse(readFileSync(DEPLOYMENTS_FILE, "utf-8"));
  } catch {
    return { defaults: { image: "matrx-ship:latest", source: "/srv/projects/matrx-ship", domain_suffix: DOMAIN_SUFFIX, postgres_image: "postgres:17-alpine" }, instances: {} };
  }
}

function saveDeployments(config) {
  writeFileSync(DEPLOYMENTS_FILE, JSON.stringify(config, null, 2) + "\n", "utf-8");
}

function generateCompose(name, config) {
  const pgImage = config.defaults?.postgres_image || "postgres:17-alpine";
  return `# Auto-generated for ship instance: ${name}
# Do not edit manually — managed by MCP server-manager
services:
  app:
    image: matrx-ship:latest
    container_name: ship-${name}
    restart: unless-stopped
    environment:
      DATABASE_URL: postgresql://ship:\${POSTGRES_PASSWORD}@db:5432/ship
      MATRX_SHIP_API_KEY: \${MATRX_SHIP_API_KEY:-}
      MATRX_SHIP_ADMIN_SECRET: \${MATRX_SHIP_ADMIN_SECRET:-}
      PROJECT_NAME: \${PROJECT_NAME}
      VERCEL_ACCESS_TOKEN: \${VERCEL_ACCESS_TOKEN:-}
      VERCEL_PROJECT_ID: \${VERCEL_PROJECT_ID:-}
      VERCEL_TEAM_ID: \${VERCEL_TEAM_ID:-}
      VERCEL_WEBHOOK_SECRET: \${VERCEL_WEBHOOK_SECRET:-}
      GITHUB_WEBHOOK_SECRET: \${GITHUB_WEBHOOK_SECRET:-}
    depends_on:
      db:
        condition: service_healthy
    networks:
      - internal
      - proxy
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.ship-${name}.rule=Host(\`ship-${name}.${DOMAIN_SUFFIX}\`)"
      - "traefik.http.routers.ship-${name}.entrypoints=websecure"
      - "traefik.http.routers.ship-${name}.tls.certresolver=letsencrypt"
      - "traefik.http.services.ship-${name}.loadbalancer.server.port=3000"

  db:
    image: ${pgImage}
    container_name: db-${name}
    restart: unless-stopped
    volumes:
      - pgdata:/var/lib/postgresql/data
    environment:
      POSTGRES_DB: ship
      POSTGRES_USER: ship
      POSTGRES_PASSWORD: \${POSTGRES_PASSWORD}
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ship"]
      interval: 5s
      timeout: 5s
      retries: 5
    networks:
      - internal

volumes:
  pgdata:

networks:
  internal:
    driver: bridge
  proxy:
    external: true
`;
}

function generateEnv(name, displayName, dbPassword, apiKey) {
  return `# Instance: ${name}
# Generated: ${new Date().toISOString()}

POSTGRES_PASSWORD=${dbPassword}
PROJECT_NAME=${displayName}
MATRX_SHIP_API_KEY=${apiKey}
MATRX_SHIP_ADMIN_SECRET=

# Vercel integration (optional)
VERCEL_ACCESS_TOKEN=
VERCEL_PROJECT_ID=
VERCEL_TEAM_ID=
VERCEL_WEBHOOK_SECRET=

# GitHub integration (optional)
GITHUB_WEBHOOK_SECRET=
`;
}

function createInstance(name, display_name, api_key, postgres_image) {
  const config = loadDeployments();

  if (config.instances[name]) {
    return { error: `Instance '${name}' already exists.` };
  }
  const nameCheck = exec(`docker ps -a --format '{{.Names}}' | grep -E '^(ship-${name}|db-${name})$'`);
  if (nameCheck.success && nameCheck.output) {
    return { error: `Container ship-${name} or db-${name} already exists.` };
  }

  const dbPassword = randomHex(16);
  const finalApiKey = api_key || `sk_ship_${randomHex(16)}`;

  const instanceDir = join(APPS_DIR, name);
  mkdirSync(instanceDir, { recursive: true });

  const composeOverride = postgres_image
    ? { ...config, defaults: { ...config.defaults, postgres_image } }
    : config;
  writeFileSync(join(instanceDir, "docker-compose.yml"), generateCompose(name, composeOverride), "utf-8");
  writeFileSync(join(instanceDir, ".env"), generateEnv(name, display_name, dbPassword, finalApiKey), "utf-8");
  exec(`chmod 600 ${join(instanceDir, ".env")}`);

  config.instances[name] = {
    display_name,
    subdomain: `ship-${name}`,
    url: `https://ship-${name}.${DOMAIN_SUFFIX}`,
    api_key: finalApiKey,
    db_password: dbPassword,
    postgres_image: postgres_image || config.defaults?.postgres_image || "postgres:17-alpine",
    created_at: new Date().toISOString(),
    status: "created",
  };
  saveDeployments(config);

  const startResult = exec("docker compose up -d", { cwd: instanceDir, timeout: 120000 });
  if (startResult.success) {
    config.instances[name].status = "running";
    saveDeployments(config);
  }

  return {
    success: startResult.success,
    instance: name,
    url: `https://ship-${name}.${DOMAIN_SUFFIX}`,
    admin_url: `https://ship-${name}.${DOMAIN_SUFFIX}/admin`,
    api_key: finalApiKey,
    containers: { app: `ship-${name}`, db: `db-${name}` },
    directory: `/srv/apps/${name}/`,
    compose_output: startResult.output || startResult.error,
    note: "First boot takes ~30s for migrations and seeding.",
  };
}

function listInstances() {
  const config = loadDeployments();
  const instances = [];
  for (const [name, info] of Object.entries(config.instances)) {
    const appStatus = exec(`docker inspect ship-${name} --format '{{.State.Status}}' 2>/dev/null`);
    const dbStatus = exec(`docker inspect db-${name} --format '{{.State.Status}}' 2>/dev/null`);
    instances.push({
      name,
      display_name: info.display_name,
      url: info.url,
      admin_url: `${info.url}/admin`,
      api_key: info.api_key,
      app_container: appStatus.success ? appStatus.output : "not found",
      db_container: dbStatus.success ? dbStatus.output : "not found",
      created_at: info.created_at,
      directory: `/srv/apps/${name}/`,
    });
  }
  return { instances, count: instances.length, image: config.defaults?.image || "matrx-ship:latest" };
}

function removeInstance(name, delete_data) {
  const config = loadDeployments();
  if (!config.instances[name]) return { error: `Instance '${name}' not found` };

  const instanceDir = join(APPS_DIR, name);
  const results = {};

  if (existsSync(join(instanceDir, "docker-compose.yml"))) {
    const downFlags = delete_data ? "down -v --remove-orphans" : "down --remove-orphans";
    results.compose_down = exec(`docker compose ${downFlags}`, { cwd: instanceDir, timeout: 60000 });
  } else {
    exec(`docker rm -f ship-${name} db-${name} 2>/dev/null`);
    results.compose_down = { success: true, output: "Containers removed directly" };
  }

  if (delete_data) {
    results.directory_deleted = exec(`rm -rf ${instanceDir}`);
  }

  delete config.instances[name];
  saveDeployments(config);
  return { success: true, removed: name, data_deleted: delete_data || false, results };
}

// ╔════════════════════════════════════════════════════════════════════════════╗
// ║  BUILD HISTORY                                                            ║
// ╚════════════════════════════════════════════════════════════════════════════╝

function loadBuildHistory() {
  try {
    return JSON.parse(readFileSync(BUILD_HISTORY_FILE, "utf-8"));
  } catch {
    return { builds: [] };
  }
}

function saveBuildHistory(history) {
  mkdirSync(dirname(BUILD_HISTORY_FILE), { recursive: true });
  writeFileSync(BUILD_HISTORY_FILE, JSON.stringify(history, null, 2) + "\n", "utf-8");
}

function recordBuild(entry) {
  const history = loadBuildHistory();
  history.builds.unshift(entry); // newest first
  saveBuildHistory(history);
}

function generateBuildTag() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

// ╔════════════════════════════════════════════════════════════════════════════╗
// ║  REBUILD HELPERS (shared by MCP tools + REST API)                         ║
// ╚════════════════════════════════════════════════════════════════════════════╝

function rebuildInstances({ name, skip_build, triggered_by } = {}) {
  const config = loadDeployments();
  const results = {};
  const started_at = new Date().toISOString();
  const buildTag = generateBuildTag();
  const src = resolveHostPath(config.defaults?.source || "/srv/projects/matrx-ship");

  // Capture git info from source
  const gitCommit = exec(`git -C ${src} rev-parse --short HEAD`);
  const gitLog = exec(`git -C ${src} log -1 --pretty=format:"%s"`);

  // Step 1: Build the Docker image (unless skipped)
  let imageId = null;
  if (!skip_build) {
    // Tag the current latest as :rollback before building (safety net)
    exec("docker tag matrx-ship:latest matrx-ship:rollback 2>/dev/null");

    // Build with both :latest and :timestamp tags
    results.build = exec(`docker build -t matrx-ship:latest -t matrx-ship:${buildTag} ${src}`, { timeout: 300000 });
    if (!results.build.success) {
      // Record failed build
      recordBuild({
        id: `bld_${randomHex(6)}`,
        tag: buildTag,
        timestamp: started_at,
        git_commit: gitCommit.output || "unknown",
        git_message: gitLog.output || "unknown",
        image_id: null,
        success: false,
        error: results.build.error,
        duration_ms: Date.now() - new Date(started_at).getTime(),
        triggered_by: triggered_by || "unknown",
        instances_restarted: [],
      });
      return { success: false, step: "build", error: results.build.error, started_at, finished_at: new Date().toISOString() };
    }

    // Get the image ID
    const imgInspect = exec("docker inspect matrx-ship:latest --format '{{.Id}}'");
    imageId = imgInspect.output?.replace("sha256:", "").substring(0, 12) || null;
  }

  // Step 2: Restart target instances
  const targets = name ? [name] : Object.keys(config.instances);
  results.restarts = {};
  for (const t of targets) {
    if (!config.instances[t]) { results.restarts[t] = { error: "not found" }; continue; }
    results.restarts[t] = exec("docker compose up -d --force-recreate app", { cwd: join(APPS_DIR, t), timeout: 60000 });
  }

  const finished_at = new Date().toISOString();

  // Record successful build
  if (!skip_build) {
    recordBuild({
      id: `bld_${randomHex(6)}`,
      tag: buildTag,
      timestamp: started_at,
      git_commit: gitCommit.output || "unknown",
      git_message: gitLog.output || "unknown",
      image_id: imageId,
      success: true,
      error: null,
      duration_ms: Date.now() - new Date(started_at).getTime(),
      triggered_by: triggered_by || "unknown",
      instances_restarted: targets,
    });

    // Run retention cleanup in background
    try { cleanupBuildImages(); } catch { /* non-fatal */ }
  }

  return {
    success: true,
    image_rebuilt: !skip_build,
    build_tag: skip_build ? null : buildTag,
    image_id: imageId,
    instances_restarted: targets,
    started_at,
    finished_at,
    results,
  };
}

function selfRebuild() {
  const started_at = new Date().toISOString();
  const mcpDir = join(HOST_SRV, "mcp-servers");

  if (!existsSync(join(mcpDir, "docker-compose.yml"))) {
    return { success: false, error: "docker-compose.yml not found in /srv/mcp-servers/", started_at };
  }

  // Rebuild and restart only the server-manager service
  const result = exec("docker compose up -d --build server-manager", { cwd: mcpDir, timeout: 300000 });

  return {
    success: result.success,
    started_at,
    finished_at: new Date().toISOString(),
    output: result.output || result.error,
    note: result.success
      ? "Server manager is rebuilding. This container will restart — you may lose connection briefly."
      : "Self-rebuild failed. Check the output for details.",
  };
}

// ╔════════════════════════════════════════════════════════════════════════════╗
// ║  BUILD INFO / HISTORY / ROLLBACK / CLEANUP                                ║
// ╚════════════════════════════════════════════════════════════════════════════╝

function getBuildInfo() {
  const config = loadDeployments();
  const src = resolveHostPath(config.defaults?.source || "/srv/projects/matrx-ship");

  // Current image info
  const imgInspect = exec("docker inspect matrx-ship:latest --format '{{.Id}} {{.Created}}' 2>/dev/null");
  let currentImage = { id: null, created: null, age: null };
  if (imgInspect.success && imgInspect.output) {
    const parts = imgInspect.output.split(" ");
    const id = parts[0]?.replace("sha256:", "").substring(0, 12);
    const created = parts.slice(1).join(" ");
    const ageMs = created ? Date.now() - new Date(created).getTime() : 0;
    const ageHours = Math.floor(ageMs / 3600000);
    currentImage = { id, created, age: ageHours < 24 ? `${ageHours}h` : `${Math.floor(ageHours / 24)}d ${ageHours % 24}h` };
  }

  // Git info from source
  const gitCommit = exec(`git -C ${src} rev-parse --short HEAD`);
  const gitBranch = exec(`git -C ${src} rev-parse --abbrev-ref HEAD`);

  // Find what commit the current image was built from (from build history)
  const history = loadBuildHistory();
  const lastSuccessful = history.builds.find((b) => b.success);
  const lastBuildCommit = lastSuccessful?.git_commit || null;

  // Pending changes since last build
  let pendingCommits = [];
  let diffStats = null;
  if (lastBuildCommit && gitCommit.output && lastBuildCommit !== gitCommit.output) {
    const logResult = exec(`git -C ${src} log --oneline ${lastBuildCommit}..HEAD 2>/dev/null`);
    if (logResult.success && logResult.output) {
      pendingCommits = logResult.output.split("\n").filter(Boolean);
    }
    const statResult = exec(`git -C ${src} diff --stat ${lastBuildCommit}..HEAD 2>/dev/null`);
    if (statResult.success) diffStats = statResult.output;
  } else if (!lastBuildCommit) {
    // No previous build — show recent commits
    const logResult = exec(`git -C ${src} log --oneline -10 2>/dev/null`);
    if (logResult.success && logResult.output) {
      pendingCommits = logResult.output.split("\n").filter(Boolean);
    }
  }

  // Instances info
  const instances = Object.entries(config.instances).map(([n, info]) => {
    const status = exec(`docker inspect ship-${n} --format '{{.State.Status}}' 2>/dev/null`);
    return { name: n, display_name: info.display_name, status: status.output || "not found" };
  });

  // Available image tags
  const tagsResult = exec("docker images matrx-ship --format '{{.Tag}} {{.ID}} {{.CreatedSince}}' 2>/dev/null");
  const availableTags = [];
  if (tagsResult.success && tagsResult.output) {
    for (const line of tagsResult.output.split("\n").filter(Boolean)) {
      const parts = line.split(/\s+/);
      const tag = parts[0];
      if (tag && tag !== "<none>") availableTags.push({ tag, id: parts[1], age: parts.slice(2).join(" ") });
    }
  }

  return {
    current_image: currentImage,
    source: {
      path: config.defaults?.source || "/srv/projects/matrx-ship",
      branch: gitBranch.output || "unknown",
      head_commit: gitCommit.output || "unknown",
      last_build_commit: lastBuildCommit,
    },
    has_changes: pendingCommits.length > 0,
    pending_commits: pendingCommits,
    diff_stats: diffStats,
    instances,
    available_tags: availableTags,
    last_build: lastSuccessful || null,
  };
}

function getBuildHistory({ limit, include_failed } = {}) {
  const history = loadBuildHistory();
  let builds = history.builds;
  if (!include_failed) builds = builds.filter((b) => b.success);
  if (limit) builds = builds.slice(0, limit);
  return { builds, total: history.builds.length };
}

function rollbackBuild(tag) {
  if (!tag) return { success: false, error: "tag is required" };

  // Check the tag exists
  const check = exec(`docker inspect matrx-ship:${tag} --format '{{.Id}}' 2>/dev/null`);
  if (!check.success) return { success: false, error: `Image tag matrx-ship:${tag} not found` };

  // Tag current latest as :pre-rollback for safety
  exec("docker tag matrx-ship:latest matrx-ship:pre-rollback 2>/dev/null");

  // Re-tag the target as :latest
  const retag = exec(`docker tag matrx-ship:${tag} matrx-ship:latest`);
  if (!retag.success) return { success: false, error: `Failed to retag: ${retag.error}` };

  // Restart all instances
  const config = loadDeployments();
  const targets = Object.keys(config.instances);
  const restarts = {};
  for (const t of targets) {
    restarts[t] = exec("docker compose up -d --force-recreate app", { cwd: join(APPS_DIR, t), timeout: 60000 });
  }

  // Record rollback in build history
  recordBuild({
    id: `bld_${randomHex(6)}`,
    tag: `rollback-to-${tag}`,
    timestamp: new Date().toISOString(),
    git_commit: "rollback",
    git_message: `Rollback to image tag: ${tag}`,
    image_id: check.output?.replace("sha256:", "").substring(0, 12) || null,
    success: true,
    error: null,
    duration_ms: 0,
    triggered_by: "rollback",
    instances_restarted: targets,
  });

  return {
    success: true,
    rolled_back_to: tag,
    image_id: check.output?.replace("sha256:", "").substring(0, 12) || null,
    instances_restarted: targets,
    restarts,
    note: "Previous latest saved as matrx-ship:pre-rollback",
  };
}

function cleanupBuildImages() {
  const history = loadBuildHistory();
  const successfulBuilds = history.builds.filter((b) => b.success && b.tag && !b.tag.startsWith("rollback"));

  // Retention policy:
  // - Keep the last 3 builds always
  // - Keep 1 per week for last 4 weeks
  // - Keep 1 per month for last 3 months
  // - Remove everything else

  const now = Date.now();
  const ONE_WEEK = 7 * 24 * 60 * 60 * 1000;
  const ONE_MONTH = 30 * 24 * 60 * 60 * 1000;
  const tagsToKeep = new Set(["latest", "rollback", "pre-rollback"]);

  // Always keep last 3
  for (const b of successfulBuilds.slice(0, 3)) {
    tagsToKeep.add(b.tag);
  }

  // Keep 1 per week for last 4 weeks
  for (let w = 0; w < 4; w++) {
    const weekStart = now - (w + 1) * ONE_WEEK;
    const weekEnd = now - w * ONE_WEEK;
    const weekBuild = successfulBuilds.find((b) => {
      const t = new Date(b.timestamp).getTime();
      return t >= weekStart && t < weekEnd;
    });
    if (weekBuild) tagsToKeep.add(weekBuild.tag);
  }

  // Keep 1 per month for last 3 months
  for (let m = 0; m < 3; m++) {
    const monthStart = now - (m + 1) * ONE_MONTH;
    const monthEnd = now - m * ONE_MONTH;
    const monthBuild = successfulBuilds.find((b) => {
      const t = new Date(b.timestamp).getTime();
      return t >= monthStart && t < monthEnd;
    });
    if (monthBuild) tagsToKeep.add(monthBuild.tag);
  }

  // Get all existing image tags
  const allTagsResult = exec("docker images matrx-ship --format '{{.Tag}}' 2>/dev/null");
  const allTags = allTagsResult.success ? allTagsResult.output.split("\n").filter(Boolean) : [];

  // Remove tags not in keep set
  const removed = [];
  for (const tag of allTags) {
    if (tag === "<none>" || tagsToKeep.has(tag)) continue;
    const rm = exec(`docker rmi matrx-ship:${tag} 2>/dev/null`);
    if (rm.success) removed.push(tag);
  }

  return {
    kept: [...tagsToKeep].filter((t) => allTags.includes(t)),
    removed,
    total_tags_before: allTags.length,
    total_tags_after: allTags.length - removed.length,
  };
}

// ╔════════════════════════════════════════════════════════════════════════════╗
// ║  AWS S3 INTEGRATION (requires AWS_ACCESS_KEY_ID + S3_BACKUP_BUCKET env)   ║
// ╚════════════════════════════════════════════════════════════════════════════╝

function isS3Configured() {
  return !!(process.env.AWS_ACCESS_KEY_ID && process.env.S3_BACKUP_BUCKET);
}

function s3Upload(localPath, s3Key) {
  if (!isS3Configured()) return { success: false, error: "AWS S3 not configured. Set AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_DEFAULT_REGION, and S3_BACKUP_BUCKET." };
  const bucket = process.env.S3_BACKUP_BUCKET;
  const result = exec(`aws s3 cp "${localPath}" "s3://${bucket}/${s3Key}"`, { timeout: 600000 });
  return { success: result.success, key: `s3://${bucket}/${s3Key}`, output: result.output || result.error };
}

function s3UploadImageTag(tag) {
  if (!isS3Configured()) return { success: false, error: "AWS S3 not configured" };
  const bucket = process.env.S3_BACKUP_BUCKET;
  const result = exec(`docker save matrx-ship:${tag} | gzip | aws s3 cp - "s3://${bucket}/images/${tag}.tar.gz"`, { timeout: 600000 });
  return { success: result.success, key: `s3://${bucket}/images/${tag}.tar.gz`, output: result.output || result.error };
}

function s3UploadBackup(instanceName, backupFile) {
  if (!isS3Configured()) return { success: false, error: "AWS S3 not configured" };
  const localPath = join(APPS_DIR, "backups", instanceName, backupFile);
  if (!existsSync(localPath)) return { success: false, error: `Backup file not found: ${localPath}` };
  return s3Upload(localPath, `db-backups/${instanceName}/${backupFile}`);
}

function s3ListBackups() {
  if (!isS3Configured()) return { success: false, error: "AWS S3 not configured" };
  const bucket = process.env.S3_BACKUP_BUCKET;
  const result = exec(`aws s3 ls "s3://${bucket}/" --recursive --human-readable`, { timeout: 30000 });
  return { success: result.success, files: result.output || "", error: result.error };
}

function getSystemInfo() {
  const disk = exec("df -h / | tail -1 | awk '{print $2, $3, $4, $5}'");
  const diskParts = disk.output?.split(" ") || [];
  const dockerInfo = exec("docker info --format '{{.ContainersRunning}} running, {{.ContainersPaused}} paused, {{.ContainersStopped}} stopped, {{.Images}} images'");
  const load = exec("cat /proc/loadavg 2>/dev/null || uptime");
  return {
    hostname: hostname(),
    cpus: cpus().length,
    cpu_model: cpus()[0]?.model || "unknown",
    memory: {
      total: formatBytes(totalmem()),
      free: formatBytes(freemem()),
      used: formatBytes(totalmem() - freemem()),
      percent: ((1 - freemem() / totalmem()) * 100).toFixed(1) + "%",
    },
    disk: { total: diskParts[0] || "?", used: diskParts[1] || "?", available: diskParts[2] || "?", percent: diskParts[3] || "?" },
    uptime_hours: (osUptime() / 3600).toFixed(1),
    load_average: load.output,
    docker: dockerInfo.output,
  };
}

// ╔════════════════════════════════════════════════════════════════════════════╗
// ║  MCP SERVER (tools + resources)                                           ║
// ╚════════════════════════════════════════════════════════════════════════════╝

function createServer() {
  const server = new McpServer(
    { name: "matrx-server-manager", version: "2.0.0" },
    { capabilities: { logging: {} } }
  );

  // ── SHELL TOOLS ─────────────────────────────────────────────────────────
  server.tool("shell_exec",
    "Execute a shell command on the server. Has access to Docker CLI, host /srv and /data directories.",
    { command: z.string(), working_directory: z.string().optional(), timeout_ms: z.number().optional() },
    async ({ command, working_directory, timeout_ms }) => {
      const timeout = Math.min(timeout_ms || 30000, 120000);
      const cwd = working_directory ? resolveHostPath(working_directory) : HOST_SRV;
      return textResult(exec(command, { timeout, cwd }));
    }
  );

  // ── DOCKER TOOLS ────────────────────────────────────────────────────────
  server.tool("docker_ps", "List Docker containers.", { all: z.boolean().optional() },
    async ({ all }) => {
      const flag = all ? "-a" : "";
      const result = exec(`docker ps ${flag} --format '{"name":"{{.Names}}","image":"{{.Image}}","status":"{{.Status}}","ports":"{{.Ports}}","id":"{{.ID}}"}'`);
      if (!result.success) return textResult(result);
      try {
        const containers = result.output.split("\n").filter(Boolean).map((l) => JSON.parse(l));
        return textResult({ containers, count: containers.length });
      } catch { return textResult(result.output); }
    }
  );

  server.tool("docker_logs", "Get logs from a Docker container.",
    { container: z.string(), tail: z.number().optional(), since: z.string().optional() },
    async ({ container, tail, since }) => {
      let cmd = `docker logs ${container} --tail ${tail || 100}`;
      if (since) cmd += ` --since ${since}`;
      return textResult(exec(cmd + " 2>&1"));
    }
  );

  server.tool("docker_inspect", "Inspect a Docker container, image, network, or volume.",
    { target: z.string(), type: z.enum(["container", "image", "network", "volume"]).optional() },
    async ({ target, type }) => {
      const cmd = type === "network" ? `docker network inspect ${target}` : type === "image" ? `docker image inspect ${target}` : type === "volume" ? `docker volume inspect ${target}` : `docker inspect ${target}`;
      const result = exec(cmd);
      if (!result.success) return textResult(result);
      try { return textResult(JSON.parse(result.output)); } catch { return textResult(result.output); }
    }
  );

  server.tool("docker_manage", "Start, stop, restart, or remove a Docker container.",
    { container: z.string(), action: z.enum(["start", "stop", "restart", "remove"]), force: z.boolean().optional() },
    async ({ container, action, force }) => {
      const cmds = { start: `docker start ${container}`, stop: `docker stop ${container}`, restart: `docker restart ${container}`, remove: `docker rm ${force ? "-f" : ""} ${container}` };
      return textResult(exec(cmds[action]));
    }
  );

  server.tool("docker_exec", "Execute a command inside a running Docker container.",
    { container: z.string(), command: z.string(), user: z.string().optional(), working_dir: z.string().optional() },
    async ({ container, command, user, working_dir }) => {
      let cmd = `docker exec`;
      if (user) cmd += ` -u ${user}`;
      if (working_dir) cmd += ` -w ${working_dir}`;
      cmd += ` ${container} sh -c '${command.replace(/'/g, "'\\''")}'`;
      return textResult(exec(cmd, { timeout: 60000 }));
    }
  );

  server.tool("docker_compose", "Run docker compose commands for a stack.",
    { stack: z.string(), action: z.enum(["up", "down", "restart", "pull", "build", "ps", "logs", "config"]), services: z.array(z.string()).optional(), profile: z.string().optional(), flags: z.string().optional() },
    async ({ stack, action, services, profile, flags }) => {
      const stackDir = join(HOST_SRV, stack);
      if (!existsSync(join(stackDir, "docker-compose.yml"))) return textResult({ error: `No docker-compose.yml in /srv/${stack}/` });
      let cmd = "docker compose";
      if (profile) cmd += ` --profile ${profile}`;
      cmd += ` ${action}`;
      if (action === "up") cmd += " -d";
      if (action === "logs") cmd += " --tail 50";
      if (flags) cmd += ` ${flags}`;
      if (services?.length) cmd += ` ${services.join(" ")}`;
      return textResult(exec(cmd, { cwd: stackDir, timeout: 120000 }));
    }
  );

  server.tool("docker_networks", "List Docker networks with connected containers.", {},
    async () => textResult(exec(`docker network ls --format '{{.Name}}\t{{.Driver}}\t{{.Scope}}' && echo "---" && docker network ls -q | xargs -I{} sh -c 'echo "NET:$(docker network inspect {} --format "{{.Name}}")"; docker network inspect {} --format "{{range .Containers}}  {{.Name}}{{end}}"'`))
  );

  server.tool("docker_images", "List Docker images.", { filter: z.string().optional() },
    async ({ filter }) => {
      let cmd = `docker images --format '{"repository":"{{.Repository}}","tag":"{{.Tag}}","size":"{{.Size}}","created":"{{.CreatedSince}}","id":"{{.ID}}"}'`;
      if (filter) cmd += ` "${filter}"`;
      const result = exec(cmd);
      if (!result.success) return textResult(result);
      try { return textResult({ images: result.output.split("\n").filter(Boolean).map((l) => JSON.parse(l)) }); } catch { return textResult(result.output); }
    }
  );

  // ── FILE TOOLS ──────────────────────────────────────────────────────────
  server.tool("file_read", "Read a file from the server.",
    { path: z.string(), offset: z.number().optional(), limit: z.number().optional() },
    async ({ path, offset, limit }) => {
      try {
        const realPath = resolveHostPath(path);
        let content = readFileSync(realPath, "utf-8");
        if (offset || limit) { const lines = content.split("\n"); content = lines.slice((offset || 1) - 1, limit ? (offset || 1) - 1 + limit : lines.length).join("\n"); }
        return textResult({ path, content, size: statSync(realPath).size });
      } catch (e) { return textResult({ error: e.message, path }); }
    }
  );

  server.tool("file_write", "Write content to a file on the server.",
    { path: z.string(), content: z.string(), append: z.boolean().optional(), create_parents: z.boolean().optional() },
    async ({ path, content, append, create_parents }) => {
      try {
        const realPath = resolveHostPath(path);
        if (create_parents !== false) mkdirSync(dirname(realPath), { recursive: true });
        if (append) { const existing = existsSync(realPath) ? readFileSync(realPath, "utf-8") : ""; writeFileSync(realPath, existing + content, "utf-8"); }
        else writeFileSync(realPath, content, "utf-8");
        return textResult({ success: true, path, bytes: Buffer.byteLength(content) });
      } catch (e) { return textResult({ error: e.message, path }); }
    }
  );

  server.tool("file_list", "List files and directories.",
    { path: z.string(), recursive: z.boolean().optional() },
    async ({ path, recursive }) => {
      try {
        const realPath = resolveHostPath(path);
        function listDir(dirPath, depth = 0) {
          return readdirSync(dirPath, { withFileTypes: true }).map((entry) => {
            const full = join(dirPath, entry.name);
            const info = { name: entry.name, type: entry.isDirectory() ? "directory" : "file" };
            if (entry.isFile()) try { info.size = statSync(full).size; } catch {}
            if (recursive && entry.isDirectory() && depth < 3) try { info.children = listDir(full, depth + 1); } catch {}
            return info;
          });
        }
        return textResult({ path, entries: listDir(realPath) });
      } catch (e) { return textResult({ error: e.message, path }); }
    }
  );

  server.tool("file_delete", "Delete a file.", { path: z.string() },
    async ({ path }) => { try { unlinkSync(resolveHostPath(path)); return textResult({ success: true, path }); } catch (e) { return textResult({ error: e.message, path }); } }
  );

  // ── SYSTEM TOOLS ────────────────────────────────────────────────────────
  server.tool("system_info", "Get system information.", {}, async () => textResult(getSystemInfo()));

  server.tool("system_processes", "List top processes.",
    { sort_by: z.enum(["cpu", "memory"]).optional(), count: z.number().optional() },
    async ({ sort_by, count }) => textResult(exec(`ps aux ${sort_by === "memory" ? "--sort=-%mem" : "--sort=-%cpu"} | head -${(count || 15) + 1}`))
  );

  server.tool("system_network", "Show listening ports.", {},
    async () => textResult({ listening_ports: exec("ss -tlnp").output, active_connections: exec("ss -tnp | head -30").output })
  );

  server.tool("system_firewall", "Check UFW status.", {},
    async () => textResult(exec("ufw status verbose 2>/dev/null || echo 'UFW not available in container'"))
  );

  // ── TRAEFIK TOOLS ───────────────────────────────────────────────────────
  server.tool("traefik_routes", "List Traefik HTTP routers.", {},
    async () => {
      const result = exec(`docker ps --format '{{.Names}}' | xargs -I{} sh -c 'echo "=== {} ===" && docker inspect {} --format "{{json .Config.Labels}}"' 2>/dev/null`);
      if (!result.success) return textResult(result);
      const routes = [];
      for (const block of result.output.split("=== ").filter(Boolean)) {
        const lines = block.split("\n"); const name = lines[0]?.replace(" ===", "").trim();
        try {
          const labels = JSON.parse(lines.slice(1).join(""));
          const routerEntries = Object.entries(labels).filter(([k]) => k.startsWith("traefik.http.routers."));
          if (routerEntries.length > 0) {
            const r = { container: name };
            for (const [k, v] of routerEntries) r[k.replace("traefik.http.routers.", "")] = v;
            for (const [k, v] of Object.entries(labels).filter(([k]) => k.startsWith("traefik.http.services."))) r[k.replace("traefik.http.services.", "")] = v;
            routes.push(r);
          }
        } catch {}
      }
      return textResult({ routes, count: routes.length });
    }
  );

  // ── DATABASE TOOLS ──────────────────────────────────────────────────────
  server.tool("postgres_query", "Execute a read-only SQL query.",
    { query: z.string(), database: z.string().optional() },
    async ({ query, database }) => {
      const trimmed = query.trim().toUpperCase();
      if (!["SELECT", "SHOW", "EXPLAIN", "\\D"].some((p) => trimmed.startsWith(p)))
        return textResult({ error: "Only read-only queries allowed." });
      return textResult(exec(`docker exec postgres psql -U matrx -d ${database || "matrx"} -c '${query.replace(/'/g, "'\\''")}'`, { timeout: 15000 }));
    }
  );

  // ── APP DEPLOYMENT TOOLS ────────────────────────────────────────────────
  server.tool("app_create",
    "Create a fully isolated matrx-ship instance with its own PostgreSQL and Traefik subdomain.",
    { name: z.string().regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/), display_name: z.string(), api_key: z.string().optional(), postgres_image: z.string().optional() },
    async ({ name, display_name, api_key, postgres_image }) => textResult(createInstance(name, display_name, api_key, postgres_image))
  );

  server.tool("app_list", "List all deployed instances.", {},
    async () => textResult(listInstances())
  );

  server.tool("app_remove", "Remove a matrx-ship instance.",
    { name: z.string(), delete_data: z.boolean().optional() },
    async ({ name, delete_data }) => textResult(removeInstance(name, delete_data))
  );

  server.tool("app_backup", "Backup an instance's PostgreSQL database.",
    { name: z.string() },
    async ({ name }) => {
      const config = loadDeployments();
      if (!config.instances[name]) return textResult({ error: `Instance '${name}' not found` });
      mkdirSync(join(BACKUPS_DIR, name), { recursive: true });
      const ts = new Date().toISOString().replace(/[:.]/g, "-");
      const file = `${name}_${ts}.sql`;
      const path = join(BACKUPS_DIR, name, file);
      const result = exec(`docker exec db-${name} pg_dump -U ship ship > ${path}`, { timeout: 60000 });
      if (result.success) return textResult({ success: true, instance: name, backup_file: `/srv/apps/backups/${name}/${file}`, size: formatBytes(statSync(path).size) });
      return textResult({ success: false, error: result.error });
    }
  );

  server.tool("app_rebuild", "Rebuild the matrx-ship Docker image and restart instances. Omit name to restart all.",
    { name: z.string().optional(), skip_build: z.boolean().optional() },
    async ({ name, skip_build }) => textResult(rebuildInstances({ name, skip_build, triggered_by: "mcp" }))
  );

  server.tool("self_rebuild", "Rebuild and restart the server manager itself. Warning: connection will drop briefly.",
    {},
    async () => textResult(selfRebuild())
  );

  // ── BUILD INFO / HISTORY / ROLLBACK / CLEANUP ──────────────────────────

  server.tool("build_info", "Get pre-build preview: current image age, pending source changes, git diff stats, instances affected.",
    {},
    async () => textResult(getBuildInfo())
  );

  server.tool("build_history", "List past builds with tags, git commits, timestamps, and status.",
    { limit: z.number().optional(), include_failed: z.boolean().optional() },
    async ({ limit, include_failed }) => textResult(getBuildHistory({ limit, include_failed }))
  );

  server.tool("build_rollback", "Rollback to a previous image tag. Retags the specified image as :latest and restarts all instances.",
    { tag: z.string().describe("The image tag to rollback to, e.g. '20260211-204100'") },
    async ({ tag }) => textResult(rollbackBuild(tag))
  );

  server.tool("build_cleanup", "Run retention cleanup on Docker image tags. Keeps last 3, 1/week for 4 weeks, 1/month for 3 months.",
    {},
    async () => textResult(cleanupBuildImages())
  );

  // ── S3 BACKUP / ARCHIVE TOOLS ─────────────────────────────────────────

  server.tool("s3_status", "Check if AWS S3 is configured for backups/archival.",
    {},
    async () => textResult({ configured: isS3Configured(), bucket: process.env.S3_BACKUP_BUCKET || null, region: process.env.AWS_DEFAULT_REGION || null })
  );

  server.tool("s3_upload_image", "Upload a Docker image tag to S3 as a gzipped tarball.",
    { tag: z.string().describe("Image tag to upload, e.g. '20260211-204100'") },
    async ({ tag }) => textResult(s3UploadImageTag(tag))
  );

  server.tool("s3_upload_backup", "Upload a database backup to S3.",
    { instance_name: z.string(), backup_file: z.string() },
    async ({ instance_name, backup_file }) => textResult(s3UploadBackup(instance_name, backup_file))
  );

  server.tool("s3_list", "List all files in the S3 backup bucket.",
    {},
    async () => textResult(s3ListBackups())
  );

  server.tool("app_logs", "Get logs from a matrx-ship instance.",
    { name: z.string(), service: z.enum(["app", "db", "both"]).optional(), tail: z.number().optional() },
    async ({ name, service, tail }) => {
      const n = tail || 80; const svc = service || "app"; const r = {};
      if (svc === "app" || svc === "both") r.app = exec(`docker logs ship-${name} --tail ${n} 2>&1`);
      if (svc === "db" || svc === "both") r.db = exec(`docker logs db-${name} --tail ${n} 2>&1`);
      return textResult(r);
    }
  );

  server.tool("app_env_update", "Update environment variables for an instance.",
    { name: z.string(), env_vars: z.record(z.string()), restart: z.boolean().optional() },
    async ({ name, env_vars, restart }) => {
      const config = loadDeployments();
      if (!config.instances[name]) return textResult({ error: `Instance '${name}' not found` });
      const envPath = join(APPS_DIR, name, ".env");
      let content = readFileSync(envPath, "utf-8");
      for (const [k, v] of Object.entries(env_vars)) {
        const re = new RegExp(`^${k}=.*$`, "m");
        content = re.test(content) ? content.replace(re, `${k}=${v}`) : content + `\n${k}=${v}`;
      }
      writeFileSync(envPath, content, "utf-8");
      let rr = null;
      if (restart !== false) rr = exec("docker compose up -d --force-recreate app", { cwd: join(APPS_DIR, name), timeout: 60000 });
      return textResult({ success: true, instance: name, updated_vars: Object.keys(env_vars), restarted: restart !== false, restart_output: rr?.output });
    }
  );

  // ── RESOURCES ───────────────────────────────────────────────────────────
  server.resource("server-info", "info://server", async () => ({
    contents: [{ uri: "info://server", text: JSON.stringify({ name: "matrx-server-manager", version: "2.0.0", hostname: "srv504398.hstgr.cloud", ip: "77.37.62.64", domain: "*.dev.codematrx.com" }, null, 2) }],
  }));

  server.resource("server-runbook", "docs://runbook", async () => {
    try { return { contents: [{ uri: "docs://runbook", text: readFileSync(join(HOST_SRV, "SERVER-RUNBOOK.md"), "utf-8") }] }; }
    catch { return { contents: [{ uri: "docs://runbook", text: "Runbook not found" }] }; }
  });

  server.resource("app-deployments", "info://app-deployments", async () => {
    try { return { contents: [{ uri: "info://app-deployments", text: JSON.stringify(loadDeployments(), null, 2) }] }; }
    catch { return { contents: [{ uri: "info://app-deployments", text: "No deployments" }] }; }
  });

  server.resource("directory-structure", "info://directory-structure", async () => {
    const r = exec(`find ${HOST_SRV} -maxdepth 3 -type f | sed 's|${HOST_SRV}|/srv|g' | sort`);
    return { contents: [{ uri: "info://directory-structure", text: r.output || "Could not list" }] };
  });

  return server;
}

// ╔════════════════════════════════════════════════════════════════════════════╗
// ║  EXPRESS APP + REST API                                                   ║
// ╚════════════════════════════════════════════════════════════════════════════╝

const app = express();
app.use(express.json());

// Serve admin dashboard (static files, no auth — login handled client-side)
app.use("/admin", express.static(join(__dirname, "..", "public")));

// Serve favicon at root level so browsers find it
app.get("/favicon.ico", (_req, res) => res.sendFile(join(__dirname, "..", "public", "icon.svg")));
app.get("/icon.svg", (_req, res) => res.sendFile(join(__dirname, "..", "public", "icon.svg")));

// Redirect bare / to /admin
app.get("/", (_req, res) => res.redirect("/admin"));

// Health (no auth)
app.get("/health", (_req, res) => {
  res.json({ status: "ok", server: "matrx-server-manager", timestamp: new Date().toISOString(), uptime: Math.floor(process.uptime()) });
});

// ── REST API (auth required) ──────────────────────────────────────────────

// Instances
app.get("/api/instances", authMiddleware, async (_req, res) => {
  res.json(listInstances());
});

app.get("/api/instances/:name", authMiddleware, async (req, res) => {
  const name = req.params.name;
  const config = loadDeployments();
  const info = config.instances[name];
  if (!info) return res.status(404).json({ error: "Instance not found" });

  // Container details
  const appInspect = exec(`docker inspect ship-${name} 2>/dev/null`);
  const dbInspect = exec(`docker inspect db-${name} 2>/dev/null`);

  let appDetails = null, dbDetails = null;
  try {
    const raw = JSON.parse(appInspect.output);
    const c = raw[0];
    appDetails = {
      status: c.State?.Status,
      running: c.State?.Running,
      started_at: c.State?.StartedAt,
      created: c.Created,
      image: c.Config?.Image,
      restart_count: c.RestartCount,
      ports: c.NetworkSettings?.Ports,
      networks: Object.keys(c.NetworkSettings?.Networks || {}),
      health: c.State?.Health?.Status || null,
    };
  } catch {}
  try {
    const raw = JSON.parse(dbInspect.output);
    const c = raw[0];
    dbDetails = {
      status: c.State?.Status,
      running: c.State?.Running,
      started_at: c.State?.StartedAt,
      created: c.Created,
      image: c.Config?.Image,
      restart_count: c.RestartCount,
      health: c.State?.Health?.Status || null,
    };
  } catch {}

  // Container stats (CPU + memory) — one-shot, no stream
  const appStats = exec(`docker stats ship-${name} --no-stream --format '{"cpu":"{{.CPUPerc}}","mem":"{{.MemUsage}}","mem_pct":"{{.MemPerc}}","net":"{{.NetIO}}","block":"{{.BlockIO}}","pids":"{{.PIDs}}"}' 2>/dev/null`);
  const dbStats = exec(`docker stats db-${name} --no-stream --format '{"cpu":"{{.CPUPerc}}","mem":"{{.MemUsage}}","mem_pct":"{{.MemPerc}}","net":"{{.NetIO}}","block":"{{.BlockIO}}","pids":"{{.PIDs}}"}' 2>/dev/null`);

  let appStatsData = null, dbStatsData = null;
  try { appStatsData = JSON.parse(appStats.output); } catch {}
  try { dbStatsData = JSON.parse(dbStats.output); } catch {}

  // Environment variables (from .env file, mask sensitive values)
  let envVars = [];
  try {
    const envContent = readFileSync(join(APPS_DIR, name, ".env"), "utf-8");
    envVars = envContent.split("\n")
      .filter((l) => l.trim() && !l.startsWith("#"))
      .map((l) => {
        const eq = l.indexOf("=");
        if (eq === -1) return null;
        const key = l.substring(0, eq).trim();
        const value = l.substring(eq + 1).trim();
        return { key, value, sensitive: /PASSWORD|SECRET|TOKEN|KEY/.test(key) };
      })
      .filter(Boolean);
  } catch {}

  // Backups list
  let backups = [];
  try {
    const backupDir = join(BACKUPS_DIR, name);
    if (existsSync(backupDir)) {
      backups = readdirSync(backupDir)
        .filter((f) => f.endsWith(".sql"))
        .map((f) => {
          const st = statSync(join(backupDir, f));
          return { file: f, size: formatBytes(st.size), created: st.mtime.toISOString() };
        })
        .sort((a, b) => b.created.localeCompare(a.created));
    }
  } catch {}

  // Docker compose file
  let composeFile = null;
  try { composeFile = readFileSync(join(APPS_DIR, name, "docker-compose.yml"), "utf-8"); } catch {}

  res.json({
    name,
    display_name: info.display_name,
    url: info.url,
    admin_url: `${info.url}/admin`,
    api_key: info.api_key,
    db_password: info.db_password,
    postgres_image: info.postgres_image,
    created_at: info.created_at,
    status: info.status,
    directory: `/srv/apps/${name}/`,
    containers: {
      app: { name: `ship-${name}`, ...appDetails, stats: appStatsData },
      db: { name: `db-${name}`, ...dbDetails, stats: dbStatsData },
    },
    env_vars: envVars,
    backups,
    compose_file: composeFile,
  });
});

// Dedicated sub-resource endpoints for instance detail views
app.get("/api/instances/:name/env", authMiddleware, async (req, res) => {
  const name = req.params.name;
  const config = loadDeployments();
  if (!config.instances[name]) return res.status(404).json({ error: "Instance not found" });
  const env = {};
  try {
    const content = readFileSync(join(APPS_DIR, name, ".env"), "utf-8");
    for (const line of content.split("\n")) {
      if (!line.trim() || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq > 0) env[line.substring(0, eq).trim()] = line.substring(eq + 1).trim();
    }
  } catch {}
  res.json({ env });
});

app.get("/api/instances/:name/compose", authMiddleware, async (req, res) => {
  const name = req.params.name;
  const config = loadDeployments();
  if (!config.instances[name]) return res.status(404).json({ error: "Instance not found" });
  try {
    const content = readFileSync(join(APPS_DIR, name, "docker-compose.yml"), "utf-8");
    res.type("text/plain").send(content);
  } catch {
    res.status(404).json({ error: "Compose file not found" });
  }
});

app.get("/api/instances/:name/backups", authMiddleware, async (req, res) => {
  const name = req.params.name;
  const config = loadDeployments();
  if (!config.instances[name]) return res.status(404).json({ error: "Instance not found" });
  const backups = [];
  try {
    const backupDir = join(BACKUPS_DIR, name);
    if (existsSync(backupDir)) {
      for (const f of readdirSync(backupDir).filter((x) => x.endsWith(".sql"))) {
        const st = statSync(join(backupDir, f));
        backups.push({ file: f, size: formatBytes(st.size), created: st.mtime.toISOString() });
      }
      backups.sort((a, b) => b.created.localeCompare(a.created));
    }
  } catch {}
  res.json({ backups });
});

app.post("/api/instances", authMiddleware, requireRole("admin", "deployer"), async (req, res) => {
  const { name, display_name, api_key, postgres_image } = req.body;
  if (!name || !display_name) return res.status(400).json({ error: "name and display_name required" });
  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(name)) return res.status(400).json({ error: "Invalid name format" });
  const result = createInstance(name, display_name, api_key, postgres_image);
  res.status(result.error ? 409 : 201).json(result);
});

app.delete("/api/instances/:name", authMiddleware, requireRole("admin"), async (req, res) => {
  const deleteData = req.query.delete_data === "true";
  res.json(removeInstance(req.params.name, deleteData));
});

app.post("/api/instances/:name/restart", authMiddleware, requireRole("admin", "deployer"), async (req, res) => {
  const name = req.params.name;
  const instanceDir = join(APPS_DIR, name);
  if (!existsSync(join(instanceDir, "docker-compose.yml"))) return res.status(404).json({ error: "Instance not found" });
  res.json(exec("docker compose restart", { cwd: instanceDir, timeout: 60000 }));
});

app.post("/api/instances/:name/stop", authMiddleware, requireRole("admin"), async (req, res) => {
  const instanceDir = join(APPS_DIR, req.params.name);
  if (!existsSync(join(instanceDir, "docker-compose.yml"))) return res.status(404).json({ error: "Instance not found" });
  res.json(exec("docker compose stop", { cwd: instanceDir, timeout: 60000 }));
});

app.post("/api/instances/:name/start", authMiddleware, requireRole("admin", "deployer"), async (req, res) => {
  const instanceDir = join(APPS_DIR, req.params.name);
  if (!existsSync(join(instanceDir, "docker-compose.yml"))) return res.status(404).json({ error: "Instance not found" });
  res.json(exec("docker compose up -d", { cwd: instanceDir, timeout: 60000 }));
});

app.post("/api/instances/:name/backup", authMiddleware, requireRole("admin", "deployer"), async (req, res) => {
  const name = req.params.name;
  const config = loadDeployments();
  if (!config.instances[name]) return res.status(404).json({ error: "Instance not found" });
  mkdirSync(join(BACKUPS_DIR, name), { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const file = `${name}_${ts}.sql`;
  const path = join(BACKUPS_DIR, name, file);
  const result = exec(`docker exec db-${name} pg_dump -U ship ship > ${path}`, { timeout: 60000 });
  if (result.success) res.json({ success: true, backup_file: `/srv/apps/backups/${name}/${file}`, size: formatBytes(statSync(path).size) });
  else res.status(500).json({ success: false, error: result.error });
});

app.put("/api/instances/:name/env", authMiddleware, requireRole("admin", "deployer"), async (req, res) => {
  const name = req.params.name;
  const config = loadDeployments();
  if (!config.instances[name]) return res.status(404).json({ error: "Instance not found" });
  const { env_vars, restart } = req.body;
  if (!env_vars || typeof env_vars !== "object") return res.status(400).json({ error: "env_vars object required" });
  const envPath = join(APPS_DIR, name, ".env");
  let content = readFileSync(envPath, "utf-8");
  for (const [k, v] of Object.entries(env_vars)) {
    const re = new RegExp(`^${k}=.*$`, "m");
    content = re.test(content) ? content.replace(re, `${k}=${v}`) : content + `\n${k}=${v}`;
  }
  writeFileSync(envPath, content, "utf-8");
  let rr = null;
  if (restart !== false) rr = exec("docker compose up -d --force-recreate app", { cwd: join(APPS_DIR, name), timeout: 60000 });
  res.json({ success: true, updated: Object.keys(env_vars), restarted: restart !== false, output: rr?.output });
});

// ── Rebuild / Deploy ────────────────────────────────────────────────────────

app.post("/api/rebuild", authMiddleware, requireRole("admin", "deployer"), async (req, res) => {
  const name = req.query.name || req.body?.name || undefined;
  const skip_build = req.query.skip_build === "true" || req.body?.skip_build === true;
  const triggered_by = req.tokenEntry?.label || "api";
  const result = rebuildInstances({ name, skip_build, triggered_by });
  res.status(result.success ? 200 : 500).json(result);
});

app.post("/api/self-rebuild", authMiddleware, requireRole("admin"), async (_req, res) => {
  const result = selfRebuild();
  res.status(result.success ? 200 : 500).json(result);
});

// ── Build Info / History / Rollback / Cleanup ─────────────────────────────

app.get("/api/build-info", authMiddleware, async (_req, res) => {
  res.json(getBuildInfo());
});

app.get("/api/build-history", authMiddleware, async (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  const include_failed = req.query.include_failed === "true";
  res.json(getBuildHistory({ limit, include_failed }));
});

app.post("/api/rollback", authMiddleware, requireRole("admin"), async (req, res) => {
  const tag = req.body?.tag || req.query.tag;
  if (!tag) return res.status(400).json({ error: "tag is required" });
  const result = rollbackBuild(tag);
  res.status(result.success ? 200 : 400).json(result);
});

app.post("/api/build-cleanup", authMiddleware, requireRole("admin"), async (_req, res) => {
  const result = cleanupBuildImages();
  res.json(result);
});

// ── S3 Backup / Archive ──────────────────────────────────────────────────

app.get("/api/s3/status", authMiddleware, async (_req, res) => {
  res.json({ configured: isS3Configured(), bucket: process.env.S3_BACKUP_BUCKET || null, region: process.env.AWS_DEFAULT_REGION || null });
});

app.post("/api/s3/upload-image", authMiddleware, requireRole("admin"), async (req, res) => {
  const tag = req.body?.tag;
  if (!tag) return res.status(400).json({ error: "tag is required" });
  const result = s3UploadImageTag(tag);
  res.status(result.success ? 200 : 400).json(result);
});

app.post("/api/s3/upload-backup", authMiddleware, requireRole("admin"), async (req, res) => {
  const { instance_name, backup_file } = req.body || {};
  if (!instance_name || !backup_file) return res.status(400).json({ error: "instance_name and backup_file are required" });
  const result = s3UploadBackup(instance_name, backup_file);
  res.status(result.success ? 200 : 400).json(result);
});

app.get("/api/s3/list", authMiddleware, async (_req, res) => {
  const result = s3ListBackups();
  res.status(result.success ? 200 : 400).json(result);
});

app.get("/api/instances/:name/logs", authMiddleware, async (req, res) => {
  const name = req.params.name;
  const svc = req.query.service || "app";
  const n = parseInt(req.query.tail) || 80;
  const r = {};
  if (svc === "app" || svc === "both") r.app = exec(`docker logs ship-${name} --tail ${n} 2>&1`);
  if (svc === "db" || svc === "both") r.db = exec(`docker logs db-${name} --tail ${n} 2>&1`);
  res.json(r);
});

// ── Sandboxes ──────────────────────────────────────────────────────────────
function listSandboxes() {
  try {
    const raw = execSync(
      `docker ps -a --filter "name=sandbox-" --format '{{json .}}'`,
      { encoding: "utf-8", timeout: 10000 }
    ).trim();
    if (!raw) return [];
    return raw.split("\n").filter(Boolean).map((line) => {
      const c = JSON.parse(line);
      // Only include actual sandbox instances (sandbox-1, sandbox-2, etc.)
      if (!/^sandbox-\d+$/.test(c.Names)) return null;
      const name = c.Names;
      const num = name.replace("sandbox-", "");
      return {
        name,
        id: c.ID,
        status: c.Status,
        state: c.State,  // running, exited, etc
        image: c.Image,
        created: c.CreatedAt,
        url: `https://${name}.${DOMAIN_SUFFIX}`,
        ports: c.Ports,
      };
    }).filter(Boolean);
  } catch { return []; }
}

function getSandboxDetail(name) {
  try {
    const raw = execSync(
      `docker inspect ${name} --format '{{json .}}'`,
      { encoding: "utf-8", timeout: 10000 }
    );
    const c = JSON.parse(raw);
    const env = {};
    (c.Config?.Env || []).forEach((e) => {
      const [k, ...v] = e.split("=");
      env[k] = v.join("=");
    });
    // Get stats
    let stats = null;
    try {
      const s = execSync(
        `docker stats ${name} --no-stream --format '{{json .}}'`,
        { encoding: "utf-8", timeout: 5000 }
      );
      stats = JSON.parse(s);
    } catch {}

    // Get logs
    let logs = "";
    try {
      logs = execSync(`docker logs ${name} --tail 100 2>&1`, { encoding: "utf-8", timeout: 5000 });
    } catch {}

    return {
      name,
      url: `https://${name}.${DOMAIN_SUFFIX}`,
      state: c.State?.Status || "unknown",
      started_at: c.State?.StartedAt,
      created: c.Created,
      image: c.Config?.Image,
      sandbox_id: env.SANDBOX_ID || "",
      sandbox_mode: env.SANDBOX_MODE || "",
      env,
      stats: stats ? {
        cpu: stats.CPUPerc,
        mem: stats.MemUsage,
        mem_pct: stats.MemPerc,
        net: stats.NetIO,
        block: stats.BlockIO,
        pids: stats.PIDs,
      } : null,
      health: c.State?.Health?.Status || null,
      restart_count: c.RestartCount,
      logs,
    };
  } catch (e) {
    return { error: e.message };
  }
}

app.get("/api/sandboxes", authMiddleware, async (_req, res) => {
  const sandboxes = listSandboxes();
  res.json({ sandboxes, count: sandboxes.length });
});

app.get("/api/sandboxes/:name", authMiddleware, async (req, res) => {
  const name = req.params.name;
  if (!/^sandbox-\d+$/.test(name)) return res.status(400).json({ error: "Invalid sandbox name" });
  const detail = getSandboxDetail(name);
  if (detail.error) return res.status(404).json(detail);
  res.json(detail);
});

app.get("/api/sandboxes/:name/logs", authMiddleware, async (req, res) => {
  const name = req.params.name;
  if (!/^sandbox-\d+$/.test(name)) return res.status(400).json({ error: "Invalid sandbox name" });
  const tail = req.query.tail || 200;
  try {
    const output = execSync(`docker logs ${name} --tail ${tail} 2>&1`, { encoding: "utf-8", timeout: 10000 });
    res.json({ output });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/sandboxes/:name/restart", authMiddleware, requireRole("admin", "deployer"), async (req, res) => {
  const name = req.params.name;
  if (!/^sandbox-\d+$/.test(name)) return res.status(400).json({ error: "Invalid sandbox name" });
  try {
    execSync(`docker restart ${name}`, { timeout: 30000 });
    res.json({ success: true, message: `Restarted ${name}` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/sandboxes/:name/stop", authMiddleware, requireRole("admin"), async (req, res) => {
  const name = req.params.name;
  if (!/^sandbox-\d+$/.test(name)) return res.status(400).json({ error: "Invalid sandbox name" });
  try {
    execSync(`docker stop ${name}`, { timeout: 30000 });
    res.json({ success: true, message: `Stopped ${name}` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/sandboxes/:name/start", authMiddleware, requireRole("admin", "deployer"), async (req, res) => {
  const name = req.params.name;
  if (!/^sandbox-\d+$/.test(name)) return res.status(400).json({ error: "Invalid sandbox name" });
  try {
    execSync(`docker start ${name}`, { timeout: 30000 });
    res.json({ success: true, message: `Started ${name}` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/sandboxes/:name/exec", authMiddleware, requireRole("admin", "deployer"), async (req, res) => {
  const name = req.params.name;
  const { command } = req.body;
  if (!/^sandbox-\d+$/.test(name)) return res.status(400).json({ error: "Invalid sandbox name" });
  if (!command) return res.status(400).json({ error: "command required" });
  try {
    const output = execSync(`docker exec -u agent ${name} bash -c "${command.replace(/"/g, '\\"')}"`, {
      encoding: "utf-8", timeout: 30000
    });
    res.json({ output });
  } catch (e) { res.status(500).json({ output: e.stdout || "", error: e.stderr || e.message }); }
});

// System
app.get("/api/system", authMiddleware, async (_req, res) => {
  res.json(getSystemInfo());
});

// Tokens (admin only)
app.get("/api/tokens", authMiddleware, requireRole("admin"), async (_req, res) => {
  const store = loadTokens();
  // Return tokens without the hashes
  const safe = store.tokens.map(({ token_hash, ...rest }) => rest);
  res.json({ tokens: safe, count: safe.length });
});

app.post("/api/tokens", authMiddleware, requireRole("admin"), async (req, res) => {
  const { label, role } = req.body;
  if (!label) return res.status(400).json({ error: "label required" });
  if (!["admin", "deployer", "viewer"].includes(role)) return res.status(400).json({ error: "role must be admin, deployer, or viewer" });

  const rawToken = randomHex(32);
  const store = loadTokens();
  const entry = {
    id: `tok_${randomHex(6)}`,
    token_hash: hashToken(rawToken),
    label,
    role,
    created_at: new Date().toISOString(),
    last_used_at: null,
  };
  store.tokens.push(entry);
  saveTokens(store);

  // Return the raw token ONCE — it's never stored or retrievable again
  res.status(201).json({
    id: entry.id,
    token: rawToken,
    label,
    role,
    created_at: entry.created_at,
    note: "Save this token now — it cannot be retrieved again.",
  });
});

app.delete("/api/tokens/:id", authMiddleware, requireRole("admin"), async (req, res) => {
  const store = loadTokens();
  const idx = store.tokens.findIndex((t) => t.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Token not found" });
  if (store.tokens.length === 1) return res.status(400).json({ error: "Cannot delete the last token" });
  const removed = store.tokens.splice(idx, 1)[0];
  saveTokens(store);
  res.json({ success: true, removed: { id: removed.id, label: removed.label } });
});

// MCP endpoint
app.post("/mcp", authMiddleware, async (req, res) => {
  const server = createServer();
  try {
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
    res.on("close", () => { transport.close(); server.close(); });
  } catch (error) {
    console.error("MCP error:", error);
    if (!res.headersSent) res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal server error" }, id: null });
  }
});

app.get("/mcp", (_req, res) => res.status(405).json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed" }, id: null }));
app.delete("/mcp", (_req, res) => res.status(405).json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed" }, id: null }));

// ── Start ────────────────────────────────────────────────────────────────────
initTokenStore();

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server Manager MCP v2.0 listening on port ${PORT}`);
  console.log(`Dashboard: http://0.0.0.0:${PORT}/admin`);
  console.log(`Auth: ${process.env.MCP_BEARER_TOKEN ? "enabled (token store)" : "DISABLED"}`);
});

process.on("SIGINT", () => process.exit(0));
process.on("SIGTERM", () => process.exit(0));
