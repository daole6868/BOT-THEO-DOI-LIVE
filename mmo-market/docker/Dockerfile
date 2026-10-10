# syntax=docker/dockerfile:1
# Một Dockerfile, ba image: api | web | admin  (chọn bằng --target)

# Ảnh đầy đủ đã có sẵn OpenSSL (Prisma cần) và công cụ build – không cần apt-get
FROM node:22-bookworm AS base
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

# Ảnh gọn cho web/admin (Next.js standalone không cần OpenSSL hệ thống)
FROM node:22-bookworm-slim AS slim
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

# ---- Cài thư viện (tận dụng cache khi chỉ đổi mã nguồn) ----
FROM base AS deps
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/admin/package.json apps/admin/
COPY packages/ui/package.json packages/ui/
COPY apps/api/prisma apps/api/prisma
RUN npm ci --no-audit --no-fund

# ---- Build toàn bộ ----
FROM deps AS build
# Địa chỉ web/admin gọi API bên trong mạng Docker, và địa chỉ trình duyệt kết nối realtime.
# Next.js nhúng các giá trị này lúc build.
ARG API_INTERNAL_URL=http://api:4000
ARG NEXT_PUBLIC_WS_URL=http://localhost:4000
ARG WEB_ORIGIN=http://localhost:3000
ARG NEXT_PUBLIC_DEV_TOOLS=true
ENV API_INTERNAL_URL=$API_INTERNAL_URL \
    NEXT_PUBLIC_WS_URL=$NEXT_PUBLIC_WS_URL \
    WEB_ORIGIN=$WEB_ORIGIN \
    NEXT_PUBLIC_DEV_TOOLS=$NEXT_PUBLIC_DEV_TOOLS
COPY . .
RUN npm run build -w @mmo/api && npm run build -w @mmo/web && npm run build -w @mmo/admin

# ---- API (NestJS) ----
FROM base AS api
ENV NODE_ENV=production
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/apps/api ./apps/api
COPY docker/api-entrypoint.sh /usr/local/bin/api-entrypoint.sh
RUN chmod +x /usr/local/bin/api-entrypoint.sh && mkdir -p /app/apps/api/storage && chown -R node:node /app/apps/api/storage
USER node
WORKDIR /app/apps/api
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=5s --start-period=90s --retries=5 CMD node -e "fetch('http://127.0.0.1:4000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["api-entrypoint.sh"]

# ---- Web người mua / người bán (Next.js standalone) ----
FROM slim AS web
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /app/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]

# ---- Trang quản trị (Next.js standalone) ----
FROM slim AS admin
ENV NODE_ENV=production PORT=3001 HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app/apps/admin/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/admin/.next/static ./apps/admin/.next/static
COPY --from=build --chown=node:node /app/apps/admin/public ./apps/admin/public
USER node
EXPOSE 3001
CMD ["node", "apps/admin/server.js"]
