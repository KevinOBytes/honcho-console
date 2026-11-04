# Syntax: dockerfile:1
#
# Honcho Console — local-only memory browser, packaged to run inside the
# Honcho docker-compose stack.
#
# Image binds 0.0.0.0 INSIDE the container because Docker port publishing
# requires it. Local-only safety comes from the compose port mapping, which
# publishes this only on the host's loopback (127.0.0.1:3100). Do not publish
# this image on a non-loopback host interface.
#
# Runtime configuration comes from compose env / env_file:
#   HONCHO_BASE_URL  (e.g. http://api:8000 inside the stack)
#   HONCHO_API_KEY   (workspace-scoped JWT; server-side only)
#   HONCHO_WORKSPACE (defaults to "oasis")
#   HONCHO_ALLOW_REMOTE=true  (required for the internal `api` hostname)

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json next.config.mjs tsconfig.json next-env.d.ts vitest.config.ts vitest.setup.ts ./
COPY src ./src
# Placeholders only: `next build` type-checks the tree and may evaluate config
# modules. The runtime stage never sees these; compose supplies real values.
ENV NEXT_TELEMETRY_DISABLED=1 \
    HONCHO_BASE_URL=http://127.0.0.1:8000 \
    HONCHO_API_KEY=build-placeholder \
    HONCHO_WORKSPACE=oasis
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1
RUN mkdir -p /app/data && chown node:node /app/data
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/next.config.mjs ./next.config.mjs
EXPOSE 3100
USER node
# Override the npm-script 127.0.0.1 bind: the container must listen on its own
# external interface so the compose 127.0.0.1 host mapping can reach it.
CMD ["./node_modules/.bin/next", "start", "--hostname", "0.0.0.0", "--port", "3100"]