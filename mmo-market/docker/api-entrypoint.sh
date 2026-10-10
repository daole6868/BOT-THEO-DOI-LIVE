#!/bin/sh
# Khởi động API: áp dụng migration, seed nếu DB trống, rồi chạy server.
set -e
cd /app/apps/api
echo "→ Áp dụng migration cơ sở dữ liệu..."
npx prisma migrate deploy
if [ "${RUN_SEED:-true}" = "true" ]; then
  echo "→ Kiểm tra / tạo dữ liệu ban đầu..."
  npx tsx prisma/seed.ts
fi
echo "→ Khởi động API trên cổng ${API_PORT:-4000}"
exec node dist/main.js
