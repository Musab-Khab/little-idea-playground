# MFAHH application image (app server + migration/backup scripts).
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM node:22-bookworm-slim
# pg_dump / pg_restore matching the Postgres 17 server, for in-app and nightly backups.
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates gnupg \
  && install -d /usr/share/postgresql-common/pgdg \
  && curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc \
  && echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" > /etc/apt/sources.list.d/pgdg.list \
  && apt-get update && apt-get install -y --no-install-recommends postgresql-client-17 \
  && apt-get purge -y gnupg && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production PORT=3000 PG_BIN_DIR=/usr/lib/postgresql/17/bin
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.output ./.output
COPY --from=build /app/package.json /app/tsconfig.json ./
COPY --from=build /app/migrations ./migrations
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/src ./src
RUN useradd --system --uid 1001 mfahh && mkdir -p /app/storage /app/backups && chown -R mfahh /app/storage /app/backups
USER mfahh
EXPOSE 3000
CMD ["sh", "-c", "npx tsx scripts/migrate.ts && node .output/server/index.mjs"]
