FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --include=dev
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 DATA_DIR=/data
COPY --from=build /app/dist/standalone ./dist/standalone
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/server ./server
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/package.json ./package.json
# Supabase mode stores records and evidence remotely and needs no volume.
# The optional SQLite adapter requires a persistent /data volume.
EXPOSE 3000
CMD ["node", "scripts/start.mjs"]
