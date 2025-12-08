#!/bin/bash

# Deployment Script for Agora CSE Training System
# Builds and runs the application using Podman directly (no compose needed)

set -e

APP_CONTAINER="cse-training-app"
DB_CONTAINER="cse-training-postgres"
NETWORK="cse-training-net"

echo "🚀 Deploying Agora CSE Training System..."

# 1. Check Prerequisites
if ! command -v podman &> /dev/null; then
    echo "❌ Podman is not installed."
    exit 1
fi

# 2. Create Network
if ! podman network exists $NETWORK; then
    echo "🌐 Creating network: $NETWORK"
    podman network create $NETWORK
else
    echo "🌐 Network $NETWORK exists"
fi

# 3. Ensure Database is Running on Network
if ! podman ps --format "{{.Names}}" | grep -q "^${DB_CONTAINER}$"; then
    echo "🐘 Starting Database..."
    # Check if we need to run setup or just start
    if podman ps -a --format "{{.Names}}" | grep -q "^${DB_CONTAINER}$"; then
        podman start $DB_CONTAINER
    else
        ./scripts/setup-postgres.sh
    fi
fi

# Connect DB to network if not already connected
# Note: Podman doesn't support 'network connect' easily for running containers in all versions
# So we might need to restart it attached to network, but for now let's assume setup-postgres.sh 
# might need adjustment or we just link via host networking or restart.
# EASIER APPROACH: Stop and recreate DB container attached to network
echo "🔄 Recreating DB container attached to network..."
podman stop $DB_CONTAINER 2>/dev/null || true
podman rm $DB_CONTAINER 2>/dev/null || true

podman run -d \
  --name $DB_CONTAINER \
  --network $NETWORK \
  --network-alias db \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres123 \
  -e POSTGRES_DB=cse_training \
  -p 5432:5432 \
  -v cse-training-db-data:/var/lib/postgresql/data \
  postgres:16-alpine

echo "⏳ Waiting for database..."
sleep 5

# 4. Build App Image
echo "📦 Building App Image..."
podman build -t cse-training-system:latest .

# 5. Run App Container
echo "🚀 Starting App Container..."
podman stop $APP_CONTAINER 2>/dev/null || true
podman rm $APP_CONTAINER 2>/dev/null || true

podman run -d \
  --name $APP_CONTAINER \
  --network $NETWORK \
  -p 3000:3000 \
  -e DATABASE_URL="postgresql://postgres:postgres123@db:5432/cse_training" \
  -e NEXT_PUBLIC_SUPABASE_URL="https://placeholder-project.supabase.co" \
  -e NEXT_PUBLIC_SUPABASE_ANON_KEY="placeholder-key" \
  -e SUPABASE_SERVICE_ROLE_KEY="placeholder-key" \
  -e JWT_SECRET="local-dev-secret-key-change-in-prod" \
  cse-training-system:latest

# 6. Initialize Database
echo "🌱 Initializing database..."
# Wait a bit for app to start
sleep 5
podman exec -it $APP_CONTAINER npx prisma migrate deploy
podman exec -it $APP_CONTAINER npx prisma db seed

echo "✅ Deployment Complete!"
echo "👉 App is running at: http://localhost:3000"
echo "👉 Login with: user@agora.io / password123"
