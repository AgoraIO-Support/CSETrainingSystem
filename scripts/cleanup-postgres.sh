#!/bin/bash

# Remove PostgreSQL container and volume (WARNING: This deletes all data!)

CONTAINER_NAME="cse-training-postgres"
VOLUME_NAME="cse-training-db-data"

echo "⚠️  WARNING: This will delete all database data!"
read -p "Are you sure? (yes/no): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
    echo "Aborted."
    exit 0
fi

echo "🗑️  Removing PostgreSQL container and volume..."

# Stop and remove container
if podman ps -a --format "{{.Names}}" | grep -q "^${CONTAINER_NAME}$"; then
    podman stop ${CONTAINER_NAME} 2>/dev/null || true
    podman rm ${CONTAINER_NAME}
    echo "✓ Container removed"
fi

# Remove volume
if podman volume exists ${VOLUME_NAME}; then
    podman volume rm ${VOLUME_NAME}
    echo "✓ Volume removed"
fi

echo "✅ Cleanup complete"
