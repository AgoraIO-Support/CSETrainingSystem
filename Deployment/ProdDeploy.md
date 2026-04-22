# Production Deployment Quick Reference
Step 1: 先手动 run 一次容器（确认能正常启动） 
# Web podman rm -f cselearning-web || true 
podman run -d --name cselearning-web -p 3000:3000 --env-file /home/ubuntu/cselearning.env -e CSE_LOG=api,db,s3,knowledgecontext,openai,worker,transcriptprocessing  -e CSE_WECOM_LOG_CONTENT=1 localhost/cselearning-web:latest

# Worker 
podman rm -f cselearning-worker || true 
podman run -d --name cselearning-worker --env-file /home/ubuntu/cselearning.env -e CSE_LOG=api,db,s3,knowledgecontext,openai,worker,transcriptprocessing localhost/cselearning-worker:latest

# 确认正常 
podman ps 
podman logs --tail 50 cselearning-web 
podman logs --tail 50 cselearning-worker 

Step 2: 生成 systemd unit 文件 
# 先停掉容器 
podman stop cselearning-web cselearning-worker 
# 生成 unit 文件（--new 表示每次 start 重新创建容器） 
podman generate systemd --name cselearning-web --files --new 
podman generate systemd --name cselearning-worker --files --new 
# 移到 systemd user 目录 
mkdir -p ~/.config/systemd/user 
mv container-cselearning-web.service ~/.config/systemd/user/ 
mv container-cselearning-worker.service ~/.config/systemd/user/ 
# 删掉手动创建的容器（systemd 会自己创建） 
podman rm -f cselearning-web cselearning-worker 

Step 3: 启用服务 
systemctl --user daemon-reload 
systemctl --user enable --now container-cselearning-web.service 
systemctl --user enable --now container-cselearning-worker.service 
# 对应的配置在这个路径
cat ~/.config/systemd/user/container-cselearning-worker.service
cat ~/.config/systemd/user/container-cselearning-web.service

Step 4: 允许开机自启（没有 SSH 登录也能运行） 

sudo loginctl enable-linger ubuntu 

常用管理命令： 
# 查看状态 
systemctl --user status container-cselearning-web.service 
systemctl --user status container-cselearning-worker.service 
# 重启（比如更新 env 或重新 build 后） 
systemctl --user restart container-cselearning-web.service 
systemctl --user restart container-cselearning-worker.service 
# 看日志 
journalctl --user -u container-cselearning-web.service -n 200 --no-pager 
journalctl --user -u container-cselearning-web.service -f   # 实时跟踪 
# 停止 
systemctl --user stop container-cselearning-web.service 
关键点：用 systemctl --user（rootless podman），不要用 sudo systemctl，否则找不到你的镜像和容器。


如果代码有改动，需要先git pull，然后执行下列命令：
## Build Images

```bash
podman build -t cselearning-web:latest -f Containerfile .
podman build --target migrator -t localhost/cselearning-migrator:latest -f Containerfile .
podman build --target worker -t localhost/cselearning-worker:latest -f Containerfile .
```

## Run Database Migration
## --rm 表示运行完自动删除容器。它会连接 cselearning.env 里配置的 DATABASE_URL（你的 RDS 地址），执行 prisma migrate deploy，完成后退出。
## 什么时候需要跑 migrator： - 第一次部署 - 代码更新后 prisma/migrations/ 目录有新的 migration 文件 - 日常重启 web/worker 不需要重新跑        
podman run --rm --env-file /home/ubuntu/cselearning.env cselearning-migrator:latest
```

## Restart Services
systemctl --user daemon-reload
systemctl --user restart container-cselearning-web.service
systemctl --user restart container-cselearning-worker.service

podman rm -f cselearning-web || true
podman run -d --name cselearning-web -p 3000:3000 --env-file /home/ubuntu/cselearning.env -e CSE_LOG=api,db,s3,knowledgecontext,openai,worker,transcriptprocessing localhost/cselearning-web:latest

podman run --rm --env-file /home/ubuntu/cselearning.env localhost/cselearning-migrator:latest

podman rm -f cselearning-worker || true
podman run -d --name cselearning-worker --env-file /home/ubuntu/cselearning.env -e CSE_LOG=api,db,s3,knowledgecontext,openai,worker,transcriptprocessing localhost/cselearning-worker:latest


podman logs --tail 50 cselearning-worker
podman logs --tail 50 cselearning-web

## Appendix: Platform-aware build tags

Use this new build flow in addition to the commands above when you want explicit architecture-specific images.

Recommended tag rules:

- Local Apple Silicon test builds:
  - Web: `localhost/cselearning-web:dev-arm64`
  - Worker: `localhost/cselearning-worker:dev-arm64`
  - Migrator: `localhost/cselearning-migrator:dev-arm64`
- Ubuntu x86_64 production builds:
  - Web: `localhost/cselearning-web:prod-amd64`
  - Worker: `localhost/cselearning-worker:prod-amd64`
  - Migrator: `localhost/cselearning-migrator:prod-amd64`
- `:latest` is only an alias for the current runtime target. Add it intentionally with `--latest-alias`.

Local MacBook Pro M2:

```bash
./scripts/podman/build-images.sh --profile dev --platform linux/arm64 --latest-alias
```

Ubuntu production host or CI:

```bash
# build web + worker + migrator for Ubuntu x86_64
./scripts/podman/build-images.sh --profile prod --platform linux/amd64 --latest-alias
```

Build only one production image when needed:

```bash
# web only
./scripts/podman/build-images.sh --profile prod --platform linux/amd64 --web-only --latest-alias

# worker only
./scripts/podman/build-images.sh --profile prod --platform linux/amd64 --worker-only --latest-alias

# migrator only
./scripts/podman/build-images.sh --profile prod --platform linux/amd64 --migrator-only --latest-alias
```

If you want to reference the explicit architecture tags directly instead of `:latest`, use:

```bash
localhost/cselearning-web:prod-amd64
localhost/cselearning-worker:prod-amd64
localhost/cselearning-migrator:prod-amd64
```

Production images should be built on Ubuntu or CI, not on the M2 laptop, to avoid slow cross-architecture emulation and QEMU instability during `next build`.

## MCP Production Notes

The standard MCP server runs inside the same `cselearning-web` container and is exposed at:

```text
/api/mcp
```

Before enabling MCP in production, add these variables to `/home/ubuntu/cselearning.env`:

```env
SME_MCP_INTERNAL_TOKEN=replace-with-long-random-token
SME_MCP_INTERNAL_USER_EMAIL=admin@agora.io
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
SME_MCP_ALLOWED_CALLER_IDS=internal-gateway
```

You can copy the ready-made MCP block from:

- [/Users/zhonghuang/Documents/CSETrainingSystem/Deployment/cselearning.env.mcp.example](/Users/zhonghuang/Documents/CSETrainingSystem/Deployment/cselearning.env.mcp.example)

Recommended access model:

- Do not expose `/api/mcp` directly to arbitrary public MCP clients.
- Put `/api/mcp` behind your reverse proxy / internal gateway.
- Only the trusted gateway should hold `SME_MCP_INTERNAL_TOKEN`.
- Only the trusted gateway should inject `x-sme-user-email`.

After updating the env file, restart the web service:

```bash
systemctl --user restart container-cselearning-web.service
```

### MCP smoke checks

```bash
curl -s https://your-domain.example.com/api/mcp
```

```bash
BASE_URL=https://your-domain.example.com/api/mcp \
INTERNAL_MCP_TOKEN=replace-with-token \
MCP_USER_EMAIL=rtcsme@agora.io \
zsh scripts/mcp/test-standard-mcp.sh
```

For the detailed production rollout and reverse-proxy guidance, see:

- [/Users/zhonghuang/Documents/CSETrainingSystem/Deployment/MCP-Prod-GoLive.md](/Users/zhonghuang/Documents/CSETrainingSystem/Deployment/MCP-Prod-GoLive.md)
- [/Users/zhonghuang/Documents/CSETrainingSystem/Deployment/nginx-mcp.conf.example](/Users/zhonghuang/Documents/CSETrainingSystem/Deployment/nginx-mcp.conf.example)
