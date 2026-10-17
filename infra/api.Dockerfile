# syntax=docker/dockerfile:1
# Build context: repository root.  The same image runs the API (default) and the worker
# (override the command with `npm run start:worker -w @erplms/api`).

FROM node:22-alpine AS base
# Prisma's query engine needs OpenSSL on Alpine.
RUN apk add --no-cache openssl
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/api/prisma apps/api/prisma

FROM base AS dev
ENV NODE_ENV=development
RUN npm ci -w @erplms/api --include-workspace-root
COPY apps/api apps/api
EXPOSE 4000
CMD ["npm", "run", "dev", "-w", "@erplms/api"]

FROM base AS prod
ENV NODE_ENV=production
RUN npm ci -w @erplms/api --omit=dev && npm cache clean --force
COPY apps/api/src apps/api/src
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4000/api/v1/health/live || exit 1
CMD ["node", "apps/api/src/server.js"]
