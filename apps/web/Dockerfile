# Built with the MONOREPO ROOT as build context - see apps/api/Dockerfile's
# header comment for why (same npm-workspaces dependency reason applies here).
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
RUN npm run build --workspace=@hardware-pos/web

FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /repo/apps/web/.next/standalone ./
COPY --from=builder /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /repo/apps/web/public ./apps/web/public
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
