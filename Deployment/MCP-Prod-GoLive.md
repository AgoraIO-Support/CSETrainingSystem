# MCP Production Go-Live

## Scope

This document covers production rollout of the standard MCP server exposed from:

```text
/api/mcp
```

It assumes the application is deployed on AWS EC2 with rootless Podman and `systemd --user`, following:

- [/Users/zhonghuang/Documents/CSETrainingSystem/Deployment/ProdDeploy.md](/Users/zhonghuang/Documents/CSETrainingSystem/Deployment/ProdDeploy.md)

## Recommended access model

Use a public gateway + internal runtime model:

1. External users authenticate with your existing application and create a personal MCP access token.
2. Desktop MCP clients call `https://cselearning.club/api/mcp` with the user's personal MCP token.
3. The public gateway validates that token, resolves the user, and checks that the user is still `ACTIVE` and `SME`/`ADMIN`.
4. The public gateway calls the internal runtime at `/api/internal/mcp` using `SME_MCP_INTERNAL_TOKEN`.
5. The internal runtime validates the service token and trusted caller before executing tools.

Do not give `SME_MCP_INTERNAL_TOKEN` directly to end-user desktop clients in production.

## Required production env

Add these to `/home/ubuntu/cselearning.env`:

```env
SME_MCP_INTERNAL_TOKEN=replace-with-long-random-token
SME_MCP_INTERNAL_USER_EMAIL=admin@agora.io
SME_MCP_PUBLIC_GATEWAY_CALLER_ID=nginx-gateway
SME_MCP_PROD_MODE=true
SME_MCP_DISABLE_FALLBACK_USER=true
SME_MCP_TRUST_PROXY_HEADERS=true
SME_MCP_ENABLE_ADVANCED_TOOLS=false
SME_MCP_ENABLE_INSIGHT_TOOLS=false
SME_MCP_AUDIT_LOGGING=true
SME_MCP_RATE_LIMIT_ENABLED=true
SME_MCP_RATE_LIMIT_WINDOW_MS=60000
SME_MCP_RATE_LIMIT_MAX_REQUESTS=120
SME_MCP_RATE_LIMIT_MAX_TOOL_CALLS=60
SME_MCP_ALLOWED_CALLER_IPS=10.0.0.10,10.0.0.11
SME_MCP_ALLOWED_CALLER_IDS=nginx-gateway
```

Ready-to-copy template:

- [/Users/zhonghuang/Documents/CSETrainingSystem/Deployment/cselearning.env.mcp.example](/Users/zhonghuang/Documents/CSETrainingSystem/Deployment/cselearning.env.mcp.example)

## Standard production tool surface

The production MCP server should expose only the SME-first tools:

- `list_my_workspace`
- `create_badge`
- `create_series`
- `create_event`
- `create_course`
- `design_course`
- `create_exam`
- `design_exam_questions`
- `review_event_status`
- `share_course_with_learners`
- `publish_exam_for_learners`

Advanced and insight tools should remain hidden by default. Legacy compatibility tools are not exposed.

## Deployment sequence

1. Build production images.
2. Run `migrator`.
3. Update `/home/ubuntu/cselearning.env`.
4. Restart `container-cselearning-web.service`.
5. Restart `container-cselearning-worker.service`.
6. Run the MCP smoke checks below.

## Smoke checks

### Discovery

```bash
curl -s https://your-domain.example.com/api/mcp
```

### Protocol + tool exposure

```bash
BASE_URL=https://your-domain.example.com/api/internal/mcp \
INTERNAL_MCP_TOKEN=replace-with-internal-token \
MCP_USER_EMAIL=rtcsme@agora.io \
EXPECT_NO_LEGACY=1 \
zsh scripts/mcp/test-standard-mcp.sh
```

### Public gateway validation

Run at least one user-token flow against the public MCP endpoint:

```bash
curl -s https://your-domain.example.com/api/mcp \
  -H "Authorization: Bearer $CSE_MCP_USER_TOKEN" \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_my_workspace","arguments":{}}}'
```

### Business workflow spot-check

Run at least these tools through your trusted gateway path:

- `list_my_workspace`
- `create_event`
- `create_course`
- `design_course`
- `create_exam`
- `design_exam_questions`
- `review_event_status`

For learner-facing operations, spot-check:

- `share_course_with_learners`
- `publish_exam_for_learners`

## Audit expectations

Every MCP invocation should record:

- request id
- method
- tool name
- resolved user id/email
- caller id/ip
- duration
- success/failure
- error code

High-risk tools should be especially easy to trace:

- `share_course_with_learners`
- `publish_exam_for_learners`
- transcript processing tools, if enabled

## Rollout recommendation

1. Internal beta only.
2. Limited SME pilot.
3. Expand after validating:
   - no unexpected legacy tool exposure
   - auth logs look correct
   - learner share/publish actions are auditable
   - worker/transcript queues remain healthy
