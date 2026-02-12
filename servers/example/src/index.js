import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import { z } from "zod";

const BEARER_TOKEN = process.env.MCP_BEARER_TOKEN;
const PORT = process.env.PORT || 3000;

// ── Auth middleware ──────────────────────────────────────────────────────────
function authMiddleware(req, res, next) {
  if (!BEARER_TOKEN) return next();

  const auth = req.headers.authorization;
  if (!auth || auth !== `Bearer ${BEARER_TOKEN}`) {
    return res.status(401).json({
      jsonrpc: "2.0",
      error: { code: -32001, message: "Unauthorized" },
      id: null,
    });
  }
  next();
}

// ── Build MCP server per request (stateless) ────────────────────────────────
function createServer() {
  const server = new McpServer(
    { name: "matrx-example-mcp", version: "1.0.0" },
    { capabilities: { logging: {} } }
  );

  // Tool: echo
  server.tool("echo", "Echo back the input with server metadata", {
    message: z.string().describe("Message to echo"),
  }, async ({ message }) => ({
    content: [
      {
        type: "text",
        text: JSON.stringify({
          echo: message,
          server: "matrx-example-mcp",
          timestamp: new Date().toISOString(),
          host: process.env.HOSTNAME || "unknown",
        }, null, 2),
      },
    ],
  }));

  // Tool: health
  server.tool("health", "Check server health and resource usage", {}, async () => {
    const mem = process.memoryUsage();
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            status: "healthy",
            uptime: Math.floor(process.uptime()),
            memory: {
              rss: `${Math.round(mem.rss / 1024 / 1024)}MB`,
              heapUsed: `${Math.round(mem.heapUsed / 1024 / 1024)}MB`,
            },
            nodeVersion: process.version,
          }, null, 2),
        },
      ],
    };
  });

  // Resource: server info
  server.resource("server-info", "info://server", async () => ({
    contents: [
      {
        uri: "info://server",
        text: JSON.stringify({
          name: "matrx-example-mcp",
          version: "1.0.0",
          transport: "streamable-http",
          capabilities: ["tools", "resources"],
        }),
      },
    ],
  }));

  return server;
}

// ── Express app ─────────────────────────────────────────────────────────────
const app = express();
app.use(express.json());

// Info page (no auth) — so browsers don't see "Cannot GET /"
app.get("/", (_req, res) => {
  res.json({
    name: "matrx-example-mcp",
    version: "1.0.0",
    description: "Example MCP server demonstrating Streamable HTTP transport",
    transport: "streamable-http",
    endpoints: {
      mcp: "POST /mcp — MCP protocol endpoint (requires Bearer token)",
      health: "GET /health — Health check (no auth)",
    },
    tools: ["echo", "health"],
    resources: ["server-info"],
    docs: "https://github.com/armanisadeghi/mcp-servers",
  });
});

// Health endpoint (no auth)
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// MCP endpoint — stateless
app.post("/mcp", authMiddleware, async (req, res) => {
  const server = createServer();
  try {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
    res.on("close", () => {
      transport.close();
      server.close();
    });
  } catch (error) {
    console.error("Error handling MCP request:", error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      });
    }
  }
});

app.get("/mcp", (_req, res) => {
  res.status(405).json({
    jsonrpc: "2.0",
    error: { code: -32000, message: "Method not allowed (stateless server)" },
    id: null,
  });
});

app.delete("/mcp", (_req, res) => {
  res.status(405).json({
    jsonrpc: "2.0",
    error: { code: -32000, message: "Method not allowed (stateless server)" },
    id: null,
  });
});

// ── Start ───────────────────────────────────────────────────────────────────
app.listen(PORT, "0.0.0.0", () => {
  console.log(`MCP Example Server listening on port ${PORT}`);
  console.log(`Auth: ${BEARER_TOKEN ? "enabled" : "DISABLED (no token set)"}`);
});

process.on("SIGINT", () => process.exit(0));
process.on("SIGTERM", () => process.exit(0));
