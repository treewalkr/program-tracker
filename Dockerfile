FROM oven/bun:1

WORKDIR /app

# Dependency layer — manifests only so source edits don't bust the install cache.
COPY package.json bun.lock ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
RUN bun install --frozen-lockfile

COPY . .
