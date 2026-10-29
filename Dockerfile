# Provider-neutral image of the CrewCheck service (web shell + API in one Node 22 process).
# The build stage installs from the lockfile and runs the canonical preparation and web build
# (`npm run build`); the runtime stage keeps the prepared sources, dist/ and production
# dependencies only, and starts `node server.mjs` (which loads the notification runtime itself).
# No secret is read at build time; configuration is runtime environment only.
#   docker build --build-arg SOURCE_VERSION=$(git rev-parse HEAD) -t crewcheck .
FROM node:22.13.0-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
ARG SOURCE_VERSION=local
ENV SOURCE_VERSION=$SOURCE_VERSION
RUN npm run build && npm prune --omit=dev --no-audit --no-fund

FROM node:22.13.0-bookworm-slim
WORKDIR /app
ARG SOURCE_VERSION=local
# /api/health and /api/release report this commit (outside Render there is no RENDER_GIT_COMMIT).
ENV NODE_ENV=production PORT=10000 SOURCE_VERSION=$SOURCE_VERSION
COPY --from=build --chown=node:node /app /app
# The service writes small runtime files next to server.mjs (Telegram links/rosters cache, Google
# OAuth store, runtime patch). They are ephemeral, as on the current host (no persistent disk).
RUN chown node:node /app
USER node
EXPOSE 10000
CMD ["node", "server.mjs"]
