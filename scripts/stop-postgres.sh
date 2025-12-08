#!/bin/bash

# Stop PostgreSQL container

CONTAINER_NAME="cse-training-postgres"

echo "🛑 Stopping PostgreSQL container..."

if podman ps -a --format "{{.Names}}" | grep -q "^${CONTAINER_NAME}$"; then
    podman stop ${CONTAINER_NAME}
    echo "✅ PostgreSQL container stopped"
else
    echo "⚠️  Container ${CONTAINER_NAME} not found"
fi
