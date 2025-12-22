# Local PostgreSQL Database Setup with Podman

This guide explains how to set up a local PostgreSQL database using Podman for the CSE Training System.

## Quick Start

### 1. Run the Setup Script

```bash
chmod +x scripts/setup-postgres.sh
./scripts/setup-postgres.sh
```

This script will:
- ✅ Create a PostgreSQL 16 container
- ✅ Set up a persistent volume for data
- ✅ Configure health checks
- ✅ Wait for the database to be ready
- ✅ Display connection information

### 2. Update Environment Variables

The script will output a `DATABASE_URL`. Copy it to your `.env` file:

```bash
DATABASE_URL="postgresql://postgres:postgres123@localhost:5432/cse_training"
```

Or manually update the `.env` file with these values:

```env
# Remove or comment out Supabase settings (not needed for local)
# NEXT_PUBLIC_SUPABASE_URL=
# NEXT_PUBLIC_SUPABASE_ANON_KEY=
# SUPABASE_SERVICE_ROLE_KEY=

# Add local PostgreSQL connection
DATABASE_URL="postgresql://postgres:postgres123@localhost:5432/cse_training"
```

### 3. Run Database Migrations

```bash
npm run prisma:migrate
```

### 4. Seed Sample Data

```bash
npm run prisma:seed
```

### 5. Verify Setup

```bash
# Connect to database using psql
podman exec -it cse-training-postgres psql -U postgres -d cse_training

# Run a test query
\dt  # List tables
SELECT COUNT(*) FROM users;
\q   # Quit
```

## Container Management

### View Container Status

```bash
podman ps -a | grep postgres
```

### View Logs

```bash
podman logs cse-training-postgres

# Follow logs in real-time
podman logs -f cse-training-postgres
```

### Start Container (if stopped)

```bash
podman start cse-training-postgres
```

### Stop Container

```bash
./scripts/stop-postgres.sh
# or manually:
podman stop cse-training-postgres
```

### Restart Container

```bash
podman restart cse-training-postgres
```

### Connect to Database

```bash
# Using psql inside container
podman exec -it cse-training-postgres psql -U postgres -d cse_training

# Using external psql (if installed)
psql postgresql://postgres:postgres123@localhost:5432/cse_training
```

## Database Configuration

| Setting | Value |
|---------|-------|
| Host | `localhost` |
| Port | `5432` |
| Database | `cse_training` |
| Username | `postgres` |
| Password | `postgres123` |
| Container Name | `cse-training-postgres` |
| Volume Name | `cse-training-db-data` |

## Data Persistence

Your database data is stored in a Podman volume named `cse-training-db-data`. This means:

- ✅ Data persists when container is stopped/restarted
- ✅ Data survives container removal (unless volume is deleted)
- ⚠️ Data is lost if volume is deleted

### Backup Database

```bash
# Backup to file
podman exec cse-training-postgres pg_dump -U postgres cse_training > backup_$(date +%Y%m%d).sql

# Restore from backup
cat backup_20231203.sql | podman exec -i cse-training-postgres psql -U postgres -d cse_training
```

### View Volume Information

```bash
podman volume inspect cse-training-db-data
```

## Cleanup

⚠️ **WARNING**: This will delete all database data!

```bash
chmod +x scripts/cleanup-postgres.sh
./scripts/cleanup-postgres.sh
```

Or manually:

```bash
podman stop cse-training-postgres
podman rm cse-training-postgres
podman volume rm cse-training-db-data
```

## Troubleshooting

### Container Won't Start

```bash
# Check logs
podman logs cse-training-postgres

# Check if port 5432 is already in use
lsof -i :5432
# or on Linux:
netstat -tuln | grep 5432
```

### Connection Refused

1. Check if container is running:
   ```bash
   podman ps | grep postgres
   ```

2. Check health status:
   ```bash
   podman inspect cse-training-postgres --format='{{.State.Health.Status}}'
   ```

3. Verify port mapping:
   ```bash
   podman port cse-training-postgres
   ```

### Permission Denied

```bash
# Run with sudo if needed
sudo podman ...

# Or configure rootless Podman
podman system migrate
```

### Database Connection Error in Application

1. Verify `DATABASE_URL` in `.env` is correct
2. Ensure container is running: `podman ps`
3. Test connection manually:
   ```bash
   podman exec cse-training-postgres pg_isready -U postgres -d cse_training
   ```

### Prisma Migration Fails

```bash
# Reset database (WARNING: deletes all data)
npm run prisma:migrate reset

# Or manually recreate database
podman exec -it cse-training-postgres psql -U postgres -c "DROP DATABASE IF EXISTS cse_training;"
podman exec -it cse-training-postgres psql -U postgres -c "CREATE DATABASE cse_training;"
npm run prisma:migrate
```

## Advanced Configuration

### Change PostgreSQL Version

Edit `scripts/setup-postgres.sh` and modify:

```bash
POSTGRES_VERSION="15-alpine"  # or "14-alpine", etc.
```

### Change Database Credentials

Edit the configuration section in `scripts/setup-postgres.sh`:

```bash
POSTGRES_USER="myuser"
POSTGRES_PASSWORD="mypassword"
POSTGRES_DB="mydatabase"
```

Then update your `.env` file accordingly.

### Custom Port

To use a different port (e.g., 5433):

```bash
# In setup-postgres.sh, change:
POSTGRES_PORT="5433"

# And update DATABASE_URL:
DATABASE_URL="postgresql://postgres:postgres123@localhost:5433/cse_training"
```

### Enable PostgreSQL Extensions

```bash
podman exec -it cse-training-postgres psql -U postgres -d cse_training -c "CREATE EXTENSION IF NOT EXISTS pgcrypto;"
```

### Performance Tuning

For development, the default settings are fine. For production-like testing:

```bash
podman run -d \
  --name cse-training-postgres \
  # ... other options ...
  -e POSTGRES_SHARED_BUFFERS=256MB \
  -e POSTGRES_MAX_CONNECTIONS=100 \
  postgres:16-alpine \
  -c shared_buffers=256MB \
  -c max_connections=100
```

## Integration with Development Workflow

### Auto-start on System Boot

Create a systemd service (Linux):

```bash
podman generate systemd --new --name cse-training-postgres > ~/.config/systemd/user/cse-training-postgres.service
systemctl --user enable cse-training-postgres
systemctl --user start cse-training-postgres
```

### VS Code Tasks

Add to `.vscode/tasks.json`:

```json
{
  "label": "Start PostgreSQL",
  "type": "shell",
  "command": "podman start cse-training-postgres",
  "problemMatcher": []
}
```

### npm Scripts

Already added to `package.json`:

```json
{
  "scripts": {
    "db:up": "podman start cse-training-postgres",
    "db:down": "podman stop cse-training-postgres",
    "db:reset": "npm run prisma:migrate reset"
  }
}
```

## Monitoring

### Check Database Size

```bash
podman exec cse-training-postgres psql -U postgres -d cse_training -c "SELECT pg_size_pretty(pg_database_size('cse_training'));"
```

### Active Connections

```bash
podman exec cse-training-postgres psql -U postgres -d cse_training -c "SELECT count(*) FROM pg_stat_activity;"
```

### Table Sizes

```bash
podman exec cse-training-postgres psql -U postgres -d cse_training -c "SELECT schemaname,tablename,pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size FROM pg_tables WHERE schemaname='public' ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;"
```

## Next Steps

After setting up the database:

1. ✅ Run migrations: `npm run prisma:migrate`
2. ✅ Seed data: `npm run prisma:seed`
3. ✅ Start development server: `npm run dev`
4. ✅ Test APIs using the guide in `Docs/api-testing.md`
5. ✅ View database in Prisma Studio: `npm run prisma:studio`

## Resources

- [Podman Documentation](https://docs.podman.io/)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [Prisma Documentation](https://www.prisma.io/docs)
