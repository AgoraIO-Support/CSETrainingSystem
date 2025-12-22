# Local Development Guide

This guide explains how to run the Agora CSE Training System locally for development and testing.

## Prerequisites

- **Node.js** (v18+)
- **Podman** (for local database)
- **Git**

## 🚀 Quick Start

### 1. Start the Database
The application requires a PostgreSQL database. We use Podman to run it locally.

```bash
# Start the database container
./scripts/setup-postgres.sh
```

*This will start a PostgreSQL container on port 5432.*

### 2. Start the Application
Run the Next.js development server. This serves both the Frontend (UI) and the Backend (API Routes).

```bash
npm run dev
```

*The application will be available at [http://localhost:3000](http://localhost:3000).*

## 🔍 Verification

### Verify Backend (API)
Since the Frontend is currently using **mock data** (see below), you should verify the Backend APIs directly using the provided test script.

```bash
# Run the automated API test script
./scripts/test-api.sh
```

This script will:
1.  **Log in** as a test user (`user@agora.io`)
2.  **Get User Profile** from the database
3.  **List Courses** from the database

### Verify Frontend (UI)
Open [http://localhost:3000](http://localhost:3000) in your browser.

> **⚠️ Note:** The current Frontend UI is running in **Mock Mode**. It displays hardcoded data and does NOT yet connect to the real backend database. You can browse the UI to see the design, but changes in the database will not be reflected here yet.

## 🛠️ Common Tasks

### Database Management

| Task | Command |
|------|---------|
| **Start DB** | `./scripts/setup-postgres.sh` |
| **Stop DB** | `./scripts/stop-postgres.sh` |
| **Reset DB** | `npm run prisma:migrate reset` |
| **View Data** | `npx prisma studio` (opens UI at http://localhost:5555) |

### Testing

| Task | Command |
|------|---------|
| **Test APIs** | `./scripts/test-api.sh` |
| **Verify JWT** | `npx tsx scripts/verify-jwt.ts` |

## 🔑 Test Credentials

Use these credentials for API testing:

- **User**: `user@agora.io` / `password123`
- **Admin**: `admin@agora.io` / `password123`
- **Instructor**: `john.smith@agora.io` / `password123`

## 📁 Project Structure

- **Frontend**: `app/` (Pages), `components/` (UI)
- **Backend**: `app/api/` (API Routes), `lib/services/` (Business Logic)
- **Database**: `prisma/` (Schema & Seeds)
- **Scripts**: `scripts/` (Helper scripts)
