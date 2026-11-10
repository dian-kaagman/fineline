# Fineline API: multi-stage build, non-root runtime without dev dependencies (SR-021).
# The container applies the database migrations, then starts the API.
# Admin password hash without a host Node install:
#   docker compose run --rm api node dist/scripts/hash-password.js

FROM node:22.22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:22.22-slim AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    STORAGE_DIR=/data/storage
WORKDIR /app
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
# The storage volume is mounted here; owned by the unprivileged `node` user of the base image.
RUN mkdir -p /data/storage && chown node:node /data/storage && chmod 700 /data/storage
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/v1/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["sh", "-c", "node dist/scripts/migrate.js && exec node dist/server.js"]
