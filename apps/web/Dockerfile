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
# See apps/api/Dockerfile's identical step for why this has to run first:
# apps/web also has real TS project references to business-logic (e.g.
# dashboard/sell/sell-client.tsx, cart-panel.tsx), and Next.js's typecheck
# expects its dist/*.d.ts to already exist rather than building them itself.
RUN npm run build --workspace=@hardware-pos/business-logic

# Next.js inlines NEXT_PUBLIC_* at build time, not read at runtime - passing
# these only via docker-compose's `environment:` (as it was before) is a
# no-op; they have to be build ARGs threaded through to ENV the build step
# can actually see. Without this, download-buttons.tsx's BASE_URL silently
# falls back to '', breaking every platform's download link, not just
# Android's - and every client-side fetch against NEXT_PUBLIC_API_URL falls
# back to this Dockerfile's own build-time default instead of the real
# public API domain.
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_DOWNLOADS_BASE_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_DOWNLOADS_BASE_URL=$NEXT_PUBLIC_DOWNLOADS_BASE_URL
RUN npm run build --workspace=@hardware-pos/web

FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /repo/apps/web/.next/standalone ./
COPY --from=builder /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /repo/apps/web/public ./apps/web/public
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
