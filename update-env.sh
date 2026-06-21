#!/usr/bin/env bash
set -euo pipefail

# DEPRECATED: Configuration now comes from environment variables, not a
# bind-mounted .env file. On Coolify, update env vars in the UI and redeploy.
# For local compose, edit .env and re-run `docker compose up`.
# This script remains only for legacy containers that still mount /home/app/.env.
echo "⚠️  update-env.sh is deprecated — manage config via environment variables and redeploy." >&2

# Script to update .env file in the Docker container and restart PM2 apps
# Usage: ./update-env.sh [path-to-new-env-file]

CONTAINER_NAME="web-browsers-app"
ENV_FILE="${1:-.env}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Error: Environment file '$ENV_FILE' not found"
  echo "Usage: $0 [path-to-env-file]"
  exit 1
fi

echo "📦 Checking if container '$CONTAINER_NAME' is running..."
if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
  echo "❌ Container '$CONTAINER_NAME' is not running"
  exit 1
fi

echo "📄 Copying new .env file to container..."
docker cp "$ENV_FILE" "${CONTAINER_NAME}:/home/app/.env"

echo "🔧 Setting proper permissions..."
docker exec "$CONTAINER_NAME" chown app:app /home/app/.env
docker exec "$CONTAINER_NAME" chmod 644 /home/app/.env

echo "🔄 Restarting PM2 applications..."
docker exec "$CONTAINER_NAME" pm2 restart all

echo "✅ Done! Waiting for apps to stabilize..."
sleep 2

echo "📊 PM2 Status:"
docker exec "$CONTAINER_NAME" pm2 status

echo ""
echo "🎉 Environment updated and applications restarted successfully!"
