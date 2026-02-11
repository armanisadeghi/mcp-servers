FROM node:22-slim AS base

# Install system tools + prerequisites for Docker CLI + git
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    gnupg \
    procps \
    iproute2 \
    dnsutils \
    net-tools \
    git \
    && rm -rf /var/lib/apt/lists/*

# Install Docker CLI (not the daemon — just the client to talk to the host's Docker socket)
RUN install -m 0755 -d /etc/apt/keyrings \
    && curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg \
    && chmod a+r /etc/apt/keyrings/docker.gpg \
    && echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian bookworm stable" \
    > /etc/apt/sources.list.d/docker.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends docker-ce-cli docker-compose-plugin \
    && rm -rf /var/lib/apt/lists/*

# Install AWS CLI v2
RUN curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "/tmp/awscliv2.zip" \
    && apt-get update && apt-get install -y --no-install-recommends unzip \
    && unzip /tmp/awscliv2.zip -d /tmp \
    && /tmp/aws/install \
    && rm -rf /tmp/awscliv2.zip /tmp/aws /var/lib/apt/lists/*

# ── Stage 1: Build the React admin UI ────────────────────────────────────────
FROM base AS admin-builder
RUN corepack enable && corepack prepare pnpm@10.28.2 --activate
WORKDIR /admin
COPY admin/package.json admin/pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile 2>/dev/null || pnpm install
COPY admin/ ./
RUN pnpm build

# ── Stage 2: Final server image ──────────────────────────────────────────────
FROM base AS runner
WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY src/ ./src/
# Copy legacy public dir first (favicons, manifest, etc.)
COPY public/ ./public/
# Overlay the React static export — replaces index.html with the new React SPA
COPY --from=admin-builder /admin/out/ ./public/

EXPOSE 3000

# Run as root to access Docker socket and host paths
CMD ["node", "src/index.js"]
