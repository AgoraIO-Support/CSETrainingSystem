# Production Deployment Quick Reference

## Build Images

```bash
podman build -t cselearning-web:latest -f Containerfile .
podman build --target migrator -t localhost/cselearning-migrator:latest -f Containerfile .
podman build --target worker -t localhost/cselearning-worker:latest -f Containerfile .
```

## Run Database Migration

```bash
podman run --rm --env-file /home/ubuntu/cselearning.env cselearning-migrator:latest
```

## Restart Services

```bash
systemctl --user restart container-cselearning-web.service
systemctl --user restart container-cselearning-worker.service
```
