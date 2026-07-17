# Training Ops Reward Domain Backfill

本文档用于在生产环境中修复历史 Training Ops 奖励数据。Codex 不执行本文档中的生产数据库操作；生产管理员需要在维护窗口内单独执行。

## 修复目标

修复分为两部分：

1. 为 `star_awards.domainId IS NULL` 的历史记录补齐可以被唯一确定的 Product Domain。
2. 根据每个用户在每个 Domain 的累计 stars，幂等补发已经达到阈值但缺失的 `badge_awards`。

修复脚本不会：

- 修改无法唯一确定 Domain 的 Star Award；
- 覆盖已有的非空 `domainId`；
- 重复创建同一用户的同一 Badge；
- 删除或撤销任何已发 Badge；
- 修改 Exam 分数、Certificate 或 Enrollment。

## 代码修复口径

新奖励按照以下优先级解析 Domain：

1. `exam.productDomainId`
2. Star Award 关联 Event 的 `domainId`
3. Exam 关联 Event 的 `domainId`
4. Exam 关联 Series 的 `domainId`
5. Event 关联 Series 的 `domainId`

历史数据修复更保守：只有所有可用来源都指向同一个 Domain 时才自动补齐。如果来源之间存在冲突，脚本只报告，不修改。

## 上线顺序

1. 先完成生产数据库快照或备份。
2. 部署包含本修复的应用代码。
3. 运行 dry-run 并保存输出。
4. 人工检查冲突记录和预计补发数量。
5. 显式执行 apply。
6. 再次运行 dry-run 和校验 SQL。

不要跳过 dry-run，也不要直接手写批量 `UPDATE` 或 `INSERT`。

## 运行环境

以下示例假设：

- 生产代码仓库位于 `$APP_ROOT`；
- 生产环境变量文件位于 `$ENV_FILE`；
- PostgreSQL 与一次性工具容器位于同一个 Podman network；
- `cselearning-migrator:latest` 与生产 Prisma schema 一致。

先设置实际路径：

```bash
export APP_ROOT=/path/to/CSETrainingSystem
export ENV_FILE=/path/to/cselearning.env
export CSE_NETWORK=cselearning
cd "$APP_ROOT"
```

## 第一步：数据库备份

优先使用云数据库快照。如果需要额外做逻辑备份：

```bash
export BACKUP_DIR=/path/to/persistent/backups
mkdir -p "$BACKUP_DIR"

podman run --rm \
  --network "$CSE_NETWORK" \
  --env-file "$ENV_FILE" \
  -v "$BACKUP_DIR:/backup" \
  postgres:16 \
  sh -lc 'pg_dump "$DATABASE_URL" --format=custom --file=/backup/training-ops-rewards.dump'
```

生产环境应优先采用现有云数据库快照和备份流程。

## 第二步：只读预检

使用仓库脚本的默认模式。未传 `--apply` 时不会写数据库：

```bash
podman run --rm \
  --network "$CSE_NETWORK" \
  --env-file "$ENV_FILE" \
  -v "$APP_ROOT:/workspace:ro" \
  -w /workspace \
  -e NODE_PATH=/app/node_modules \
  -e PATH=/app/node_modules/.bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin \
  localhost/cselearning-migrator:latest \
  tsx scripts/reconcile-training-ops-rewards.ts \
  | tee reward-backfill-dry-run.txt
```

重点检查输出：

- `Unscoped star awards`
- `Unambiguously resolvable`
- `Conflicting domain candidates`
- `Unresolved`
- `Missing eligible badge awards after mapping`
- `Resolvable star awards by domain`
- `Missing badges by domain`

任何 `Conflicting domain candidates` 都不会自动修改，必须根据 Exam、Event 和 Series 配置人工判断。

## 第三步：执行修复

只有在 dry-run 结果经过审核后才运行：

```bash
podman run --rm \
  --network "$CSE_NETWORK" \
  --env-file "$ENV_FILE" \
  -v "$APP_ROOT:/workspace:ro" \
  -w /workspace \
  -e NODE_PATH=/app/node_modules \
  -e PATH=/app/node_modules/.bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin \
  localhost/cselearning-migrator:latest \
  tsx scripts/reconcile-training-ops-rewards.ts \
  --apply \
  --confirm=BACKFILL_TRAINING_OPS_REWARDS \
  | tee reward-backfill-apply.txt
```

所有 Star Award 更新和 Badge reconciliation 在同一个数据库事务中执行。中途失败会整体回滚。

补发的历史 Badge 使用执行修复时的 `awardedAt`，并保留 `eventId = NULL`、`examId = NULL`，因为它代表累计 Domain stars 达标，不应伪造某一场考试为唯一来源。

## 第四步：执行后校验

再次运行“第二步：只读预检”中的同一条 Podman dry-run 命令，并保存第二份输出用于对比。

期望结果：

- `Unambiguously resolvable: 0`，或者只剩无法解析/冲突的记录；
- `Missing eligible badge awards after mapping: 0`；
- 再次执行 apply 时 `Star awards updated: 0`、`Badge awards created: 0`。

数据库只读校验：

```sql
SELECT COUNT(*) AS unscoped_star_awards
FROM star_awards
WHERE "domainId" IS NULL;

SELECT COUNT(*) AS badge_awards
FROM badge_awards;

SELECT
  d.name AS domain,
  bm.name AS badge,
  bm."thresholdStars",
  COUNT(ba.id) AS awards
FROM badge_milestones bm
JOIN product_domains d ON d.id = bm."domainId"
LEFT JOIN badge_awards ba ON ba."badgeId" = bm.id
GROUP BY d.name, bm.id
ORDER BY d.name, bm."thresholdStars";
```

## 冲突记录处理

脚本会打印冲突 Star Award ID 及候选 Domain ID。处理流程：

1. 查询对应 Star Award、Exam、Learning Event 和 Series。
2. 由 Training Ops owner 确认业务 Domain。
3. 单条更新前记录审批依据。
4. 更新后重新运行 dry-run，由 reconciliation 自动判断是否需要补发 Badge。

不要通过“选择第一个非空 Domain”批量处理冲突数据。

## 回滚

最可靠的回滚方式是恢复执行前数据库快照。不要只删除本次新增的 Badge Award，因为 Star Award Domain 更新与 Badge 补发属于同一业务修复，部分回滚会再次造成数据不一致。

如果必须做逻辑回滚，应先根据 `reward-backfill-apply.txt`、数据库审计日志和执行时间窗口生成精确清单，并经过人工审核。
