# Production Deployment Quick Reference
Step 1: 先手动 run 一次容器（确认能正常启动） 
# Web podman rm -f cselearning-web || true 
podman run -d --name cselearning-web -p 3000:3000 --env-file /home/ubuntu/cselearning.env -e CSE_LOG=api,db,s3,knowledgecontext,openai,worker,transcriptprocessing localhost/cselearning-web:latest

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

systemctl --user restart container-cselearning-web.service
systemctl --user restart container-cselearning-worker.service

podman rm -f cselearning-web || true
podman run -d --name cselearning-web -p 3000:3000 --env-file /home/ubuntu/cselearning.env -e CSE_LOG=api,db,s3,knowledgecontext,openai,worker,transcriptprocessing localhost/cselearning-web:latest

podman run --rm --env-file /home/ubuntu/cselearning.env localhost/cselearning-migrator:latest

podman rm -f cselearning-worker || true
podman run -d --name cselearning-worker --env-file /home/ubuntu/cselearning.env -e CSE_LOG=api,db,s3,knowledgecontext,openai,worker,transcriptprocessing localhost/cselearning-worker:latest


podman logs --tail 50 cselearning-worker
podman logs --tail 50 cselearning-web