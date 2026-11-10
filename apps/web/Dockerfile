# syntax=docker/dockerfile:1

# ---- Build: install from the lockfile, type-check and bundle the SPA ----
FROM node:22.22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
# Shown in the shop footer; required (the build fails without it). Not a secret.
ARG VITE_CONTACT_EMAIL
ENV VITE_CONTACT_EMAIL=${VITE_CONTACT_EMAIL}
RUN npm run build

# ---- Runtime: unprivileged nginx on 8080 serving the SPA and proxying /api to api:3000 ----
FROM nginxinc/nginx-unprivileged:1.28-alpine AS runtime
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
USER 101
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --retries=3 CMD wget -q -O /dev/null http://127.0.0.1:8080/ || exit 1
