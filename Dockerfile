# Build stage
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json* ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci
COPY . .
RUN npm run build

# Runtime stage (slim, non-root)
FROM node:22-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
# só deps de produção do server
COPY package.json package-lock.json* ./
COPY server/package.json server/
RUN npm ci --omit=dev --workspace server && npm cache clean --force
COPY --from=build /app/server/dist server/dist
COPY --from=build /app/web/dist web/dist
COPY config config
RUN useradd -r -u 10001 mda && mkdir -p /app/data && chown -R mda /app/data
USER mda
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8080/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--experimental-sqlite", "server/dist/index.js"]
