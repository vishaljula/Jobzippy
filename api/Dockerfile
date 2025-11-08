# syntax=docker/dockerfile:1

FROM node:20-alpine AS builder
WORKDIR /app

# Copy workspace manifests
COPY package.json package-lock.json ./
COPY api/package.json api/package.json
COPY api/tsconfig.json api/tsconfig.json
COPY api/tsconfig.build.json api/tsconfig.build.json
COPY api/vitest.config.ts api/vitest.config.ts
COPY api/.eslintrc.json api/.eslintrc.json

# Install dependencies (including dev) for the API workspace
RUN npm ci --workspace=api --include-workspace-root=false

# Copy source code
COPY api/src api/src
COPY api/README.md api/README.md

# Build TypeScript output
RUN npm run build --workspace=api

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Copy manifests & install production dependencies for the API only
COPY package.json package-lock.json ./
COPY api/package.json api/package.json
RUN npm ci --workspace=api --include-workspace-root=false --omit=dev

# Copy compiled artifacts
COPY --from=builder /app/api/dist api/dist

EXPOSE 8080

CMD ["node", "api/dist/index.js"]
