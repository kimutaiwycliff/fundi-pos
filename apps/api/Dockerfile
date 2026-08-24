# Built with the MONOREPO ROOT as build context (see docker-compose.yml /
# docker-compose.prod.yml: `context: ..`, `dockerfile: apps/api/Dockerfile`) -
# apps/api depends on @hardware-pos/business-logic and @hardware-pos/shared-types
# via npm workspaces, which only resolve when the whole workspace is present.
FROM node:22-slim AS builder
WORKDIR /repo

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/desktop/package.json apps/desktop/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json
COPY packages/business-logic/package.json packages/business-logic/package.json
COPY packages/shared-ui/package.json packages/shared-ui/package.json
RUN npm ci

COPY . .
RUN npm run build --workspace=@hardware-pos/api

# Next.js standalone output already contains a pruned node_modules - the
# runtime image never needs npm or the full monorepo source.
FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /repo/apps/api/.next/standalone ./
COPY --from=builder /repo/apps/api/.next/static ./apps/api/.next/static
EXPOSE 3000
CMD ["node", "apps/api/server.js"]
