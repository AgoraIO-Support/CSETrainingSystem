    podman build -t cselearning-web:latest -f Containerfile .
    podman build --target migrator -t localhost/cselearning-migrator:latest -f Containerfile .
    podman build -t cselearning-backend:latest -f backend/Containerfile .
    <!-- podman exec -it cselearning-web sh -lc 'cd /app && npx prisma migrate deploy' -->
    # 执行SQL Migration
    podman run --rm --env-file /home/ubuntu/cselearning.env cselearning-migrator:latest
    systemctl --user restart container-cselearning-web.service
    systemctl --user restart container-cselearning-backend.service
