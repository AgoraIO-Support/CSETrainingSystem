## Training Ops Seed Data

This directory stores local seed/import source files for training-ops configuration.

### Product domain file

- `training-ops-product-domains.v1.json`

This file is designed as a canonical source file for initializing product domains.

Important:

- Each record in the JSON includes:
  - `name`
  - `slug`
  - `category`
  - `track`
  - `kpiMode`
  - optional SME emails
- These fields are intended for:
  - manual admin setup
  - seed scripts
  - UI import tooling

Recommended interpretation:

- `slug` is the primary upsert key.
- `primarySmeEmail` and `backupSmeEmail` are optional and should resolve to active users if provided.
- `baselinePassRate`, `targetPassRate`, and `challengeThreshold` can be set at import time so SME dashboards start with meaningful KPI rails.

### Product domain import script

Use the local import script to seed product domains from the JSON source file:

```bash
npm run prisma:seed:training-ops:domains
```

This runs in dry-run mode by default.

To actually write rows into `product_domains`:

```bash
npm run prisma:seed:training-ops:domains -- --apply
```

### Learning series file

- `training-ops-learning-series.v1.json`

This file is designed as a canonical source file for initializing learning series.

Important:

- Each record in the JSON includes:
  - `name`
  - `slug`
  - `type`
  - `domainSlug`
  - `domainName`
  - optional `ownerEmail`
- These fields are intended for:
  - manual admin setup
  - seed scripts
  - UI import tooling

Recommended interpretation:

- `domainSlug` is the primary mapping key for the owning product domain.
- `domainName` acts as a fallback if the slug differs across environments.
- `ownerEmail` is optional; if present, it should resolve to an active user.
- `slug`, `name`, `type`, `description`, `cadence`, `isActive`, `badgeEligible`, `countsTowardPerformance`, and `defaultStarValue` can be used directly when creating learning series.

### Learning series import script

Use the local import script to seed learning series from the JSON source file:

```bash
npm run prisma:seed:training-ops:series
```

This runs in dry-run mode by default.

To actually write rows into `learning_series`:

```bash
npm run prisma:seed:training-ops:series -- --apply
```

Optional:

- Use `--input=...` to point to a different JSON seed file.
- `domainSlug` is resolved to `domainId` before upsert.
- `ownerEmail` is resolved to `ownerId` if present.
- Records are upserted by `slug`, so the import is repeatable.

### Badge milestone file

- `training-ops-badge-milestones.v1.json`

This file is designed as a canonical source file for initializing badge milestones.

Important:

- Badge milestones are intended to be scoped by `Product Domain`.
- Each record in the JSON includes:
  - `scope`
  - `domainSlug`
  - `level`
- These fields are intended for:
  - manual admin setup
  - seed scripts
  - future import tooling

Recommended interpretation:

- `scope` should be `DOMAIN`.
- `domainSlug` is the primary mapping key for badge scope and should be resolved to `domainId`.
- `level` captures the standardized badge ladder:
  - `READY`
  - `PRACTITIONER`
  - `TROUBLESHOOTER`
  - `DOMAIN_SPECIALIST`
- `slug`, `name`, `description`, `thresholdStars`, `sortOrder`, and `active` can be used directly when creating badge milestones.

### Import script

Use the local import script to seed badge milestones from the JSON source file:

```bash
npm run prisma:seed:training-ops:badges
```

This runs in dry-run mode by default.

To actually write rows into `badge_milestones`:

```bash
npm run prisma:seed:training-ops:badges -- --apply
```

Optional:

- Use `--input=...` to point to a different JSON seed file.
- `domainSlug` is resolved to `domainId` before upsert.
- Records are upserted by the `(domainSlug, slug)` scope, so the import is repeatable.

### Bootstrap file

- `training-ops-bootstrap.v1.json`

This bundle combines the three dependent configuration layers into one ordered import:

1. product domains
2. learning series
3. badge milestones

Use this when you want a single bootstrap action for a new local or test environment.

### Bootstrap import script

Use the local bootstrap script to seed domains, series, and badges from the bundle source file:

```bash
npm run prisma:seed:training-ops:bootstrap
```

This runs in dry-run mode by default.

To actually write rows into the database:

```bash
npm run prisma:seed:training-ops:bootstrap -- --apply
```

Optional:

- Use `--input=...` to point to a different JSON bootstrap file.
- The bootstrap import always runs sequentially in dependency order:
  - domains
  - series
  - badges
