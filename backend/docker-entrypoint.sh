#!/bin/sh
set -e

echo "Running migrations..."
npx prisma migrate deploy

echo "Seeding database..."
node dist/prisma/seed.js || echo "Seed skipped (may already exist)"

echo "Starting server..."
exec node dist/src/main
