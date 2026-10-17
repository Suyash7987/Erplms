# syntax=docker/dockerfile:1
# Build context: repository root.

FROM node:22-alpine AS base
WORKDIR /repo
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/

FROM base AS dev
ENV NODE_ENV=development
RUN npm ci -w @erplms/web --include-workspace-root
COPY apps/web apps/web
EXPOSE 3000
CMD ["npm", "run", "dev", "-w", "@erplms/web"]

FROM base AS build
# Next.js bakes rewrites in at build time, so the API address must be known here.
ARG API_INTERNAL_URL=http://api:4000
ENV API_INTERNAL_URL=${API_INTERNAL_URL}
RUN npm ci -w @erplms/web
COPY apps/web apps/web
RUN npm run build -w @erplms/web

FROM node:22-alpine AS prod
WORKDIR /repo
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /repo/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
