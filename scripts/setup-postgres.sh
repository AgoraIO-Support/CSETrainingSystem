#!/bin/bash

# PostgreSQL Setup Script for Podman
# This script sets up a local PostgreSQL database for the CSE Training System

set -e  # Exit on error

echo "🐘 Setting up PostgreSQL database with Podman..."

# Configuration
POSTGRES_VERSION="16-alpine"
CONTAINER_NAME="cse-training-postgres"
POSTGRES_USER="postgres"
POSTGRES_PASSWORD="postgres123"
POSTGRES_DB="cse_training"
POSTGRES_PORT="5432"
VOLUME_NAME="cse-training-db-data"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if Podman is installed
if ! command -v podman &> /dev/null; then
    echo -e "${RED}❌ Podman is not installed. Please install Podman first.${NC}"
    echo "Visit: https://podman.io/getting-started/installation"
    exit 1
fi

echo -e "${GREEN}✓ Podman is installed${NC}"

# Stop existing container if running
if podman ps -a --format "{{.Names}}" | grep -q "^${CONTAINER_NAME}$"; then
    echo -e "${YELLOW}⚠ Stopping existing container...${NC}"
    podman stop ${CONTAINER_NAME} 2>/dev/null || true
    podman rm ${CONTAINER_NAME} 2>/dev/null || true
fi

# Create volume if it doesn't exist
if ! podman volume exists ${VOLUME_NAME}; then
    echo "📦 Creating volume: ${VOLUME_NAME}"
    podman volume create ${VOLUME_NAME}
fi

echo "🚀 Starting PostgreSQL container..."

# Run PostgreSQL container
podman run -d \
  --name ${CONTAINER_NAME} \
  -e POSTGRES_USER=${POSTGRES_USER} \
  -e POSTGRES_PASSWORD=${POSTGRES_PASSWORD} \
  -e POSTGRES_DB=${POSTGRES_DB} \
  -p ${POSTGRES_PORT}:5432 \
  -v ${VOLUME_NAME}:/var/lib/postgresql/data \
  --health-cmd="pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}" \
  --health-interval=10s \
  --health-timeout=5s \
  --health-retries=5 \
  postgres:${POSTGRES_VERSION}

echo -e "${YELLOW}⏳ Waiting for PostgreSQL to be ready...${NC}"

# Wait for PostgreSQL to be healthy
MAX_RETRIES=30
RETRY_COUNT=0

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if podman exec ${CONTAINER_NAME} pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB} > /dev/null 2>&1; then
        echo -e "${GREEN}✓ PostgreSQL is ready!${NC}"
        break
    fi
    
    RETRY_COUNT=$((RETRY_COUNT + 1))
    echo -n "."
    sleep 1
    
    if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
        echo -e "${RED}❌ PostgreSQL failed to start within timeout${NC}"
        echo "Check logs with: podman logs ${CONTAINER_NAME}"
        exit 1
    fi
done

echo ""
echo -e "${GREEN}✅ PostgreSQL database setup complete!${NC}"
echo ""
echo "Connection details:"
echo "  Host: localhost"
echo "  Port: ${POSTGRES_PORT}"
echo "  Database: ${POSTGRES_DB}"
echo "  User: ${POSTGRES_USER}"
echo "  Password: ${POSTGRES_PASSWORD}"
echo ""
echo "DATABASE_URL=\"postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@localhost:${POSTGRES_PORT}/${POSTGRES_DB}\""
echo ""
echo "Useful commands:"
echo "  - View logs:     podman logs ${CONTAINER_NAME}"
echo "  - Stop:          podman stop ${CONTAINER_NAME}"
echo "  - Start:         podman start ${CONTAINER_NAME}"
echo "  - Remove:        podman rm -f ${CONTAINER_NAME}"
echo "  - Connect (psql): podman exec -it ${CONTAINER_NAME} psql -U ${POSTGRES_USER} -d ${POSTGRES_DB}"
echo ""
echo "Next steps:"
echo "  1. Update .env file with the DATABASE_URL above"
echo "  2. Run: npm run prisma:migrate"
echo "  3. Run: npm run prisma:seed"
