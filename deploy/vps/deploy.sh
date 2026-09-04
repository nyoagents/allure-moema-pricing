#!/usr/bin/env bash
# Deploy Allure Pricing scraper → VPS Hetzner (Projeto Y isolado).
# NÃO usa /opt/nyo-kpi-warm (Projeto X — Nyo Experts Hub).
#
# Usage (na raiz do repo allure-pricing):
#   ./deploy/vps/deploy.sh
#   ./deploy/vps/deploy.sh root@62.238.29.122
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
HOST="${1:-root@62.238.29.122}"
REMOTE="/opt/allure-pricing"
COMPOSE_DIR="$REMOTE/deploy/vps"

echo "==> [Allure / Projeto Y] rsync → $HOST:$REMOTE"
echo "    (Experts Hub / Projeto X permanece em /opt/nyo-kpi-warm — intocado)"

ssh "$HOST" "mkdir -p $REMOTE /opt && test -f /opt/PROJECTS.md || true"

# Índice X vs Y
scp "$ROOT/deploy/vps/PROJECTS.md" "$HOST:/opt/PROJECTS.md"

rsync -az --delete \
  --exclude node_modules \
  --exclude .next \
  --exclude .git \
  --exclude '.env*' \
  --exclude 'deploy/vps/.env' \
  "$ROOT/" "$HOST:$REMOTE/"

# Secrets: .env.local → .env → deploy/vps/.env (Allure only — never Experts Hub)
if [[ -f "$ROOT/.env.local" ]]; then
  echo "==> syncing .env.local → $COMPOSE_DIR/.env"
  scp "$ROOT/.env.local" "$HOST:$COMPOSE_DIR/.env"
  ssh "$HOST" "chmod 600 $COMPOSE_DIR/.env"
elif [[ -f "$ROOT/.env" ]]; then
  echo "==> syncing .env → $COMPOSE_DIR/.env"
  scp "$ROOT/.env" "$HOST:$COMPOSE_DIR/.env"
  ssh "$HOST" "chmod 600 $COMPOSE_DIR/.env"
elif [[ -f "$ROOT/deploy/vps/.env" ]]; then
  echo "==> syncing deploy/vps/.env"
  scp "$ROOT/deploy/vps/.env" "$HOST:$COMPOSE_DIR/.env"
  ssh "$HOST" "chmod 600 $COMPOSE_DIR/.env"
else
  echo "==> AVISO: nenhum .env encontrado."
  echo "    Crie $COMPOSE_DIR/.env na VPS a partir de deploy/vps/.env.example"
  ssh "$HOST" "test -f $COMPOSE_DIR/.env || cp $COMPOSE_DIR/.env.example $COMPOSE_DIR/.env"
fi

echo "==> docker build allure-scraper (sem tocar em nyo-kpi-warm)"
ssh "$HOST" "cd $COMPOSE_DIR && docker compose --profile allure build allure-scraper"

echo "==> start allure-scraper-worker (fila UI → VPS)"
ssh "$HOST" "cd $COMPOSE_DIR && docker compose --profile allure up -d allure-scraper-worker"

echo "==> done."
echo "    Worker: ssh $HOST 'docker ps --filter name=allure-scraper-worker'"
echo "    Logs:   ssh $HOST 'docker logs -f allure-scraper-worker'"
echo "    Teste:  ssh $HOST 'cd $COMPOSE_DIR && docker compose --profile allure run --rm allure-scraper tsx scripts/vps-scraper-runner.ts --period-days 3 --step 2'"
echo "    Crontab: ver deploy/vps/crontab.example"
echo "    Mapa:   ssh $HOST 'cat /opt/PROJECTS.md'"
