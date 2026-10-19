# ---- build the portal ----
FROM node:22-alpine AS app-build
WORKDIR /build/app
COPY app/package.json app/package-lock.json ./
RUN npm ci
COPY app/ ./
RUN npm run build

# ---- build the server ----
FROM node:22-alpine AS server-build
WORKDIR /build/server
COPY server/package.json server/package-lock.json ./
RUN npm ci
COPY server/ ./
RUN npm run build

# ---- runtime ----
FROM node:22-alpine AS runtime
WORKDIR /app/server
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=5000 \
    DB_PATH=/data/bulkrepair.db
COPY --from=server-build /build/server/package.json /build/server/package-lock.json ./
RUN npm ci --omit=dev
COPY --from=server-build /build/server/dist ./dist
COPY --from=server-build /build/server/scripts ./scripts
COPY --from=app-build /build/app/dist ./public
VOLUME ["/data"]
EXPOSE 5000
CMD ["node", "dist/index.js"]
