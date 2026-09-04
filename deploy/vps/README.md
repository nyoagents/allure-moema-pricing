# Deploy VPS — Allure Moema Precificação (Projeto Y)

A VPS `62.238.29.122` já hospeda o **Nyo Experts Hub (Projeto X)**.
O scraper/cron do Allure sobe **isolado** em outra pasta e outro container.

## Mapa (não misturar)

```
/opt/
├── PROJECTS.md              ← índice X vs Y
├── nyo-kpi-warm/            ← X: Nyo Experts Hub (KPI warm + MCP)
│   └── workers/kpi-warm/    ← docker: nyo-kpi-warm
└── allure-pricing/          ← Y: Allure Moema (este repo)
    ├── deploy/vps/          ← docker + crontab Allure
    ├── scripts/             ← scrape-competitors.ts, vps-scraper-runner.ts
    └── .env                 ← secrets Allure (Firebase Allure, não Experts)
```

| | Projeto X | Projeto Y |
|---|---|---|
| Repo | `nyo-experts-hub` | `allure-pricing` |
| Pasta VPS | `/opt/nyo-kpi-warm` | `/opt/allure-pricing` |
| Container | `nyo-kpi-warm` | `allure-scraper` |
| Firebase | projeto Experts Hub | projeto Allure Pricing |
| Doc existente | `docs/kpi-warm-vps.md` | este arquivo |

## Pré-requisitos na VPS

Docker já deve estar instalado (usado pelo Experts Hub). Conferir:

```bash
ssh root@62.238.29.122
docker ps
ls /opt/nyo-kpi-warm   # Projeto X — não alterar
```

## 1. Deploy (do Mac, na raiz do repo allure-pricing)

```bash
cd /Users/joaopedro/Documents/Work/nyo/allure-pricing

# Cria índice X/Y na VPS (uma vez)
scp deploy/vps/PROJECTS.md root@62.238.29.122:/opt/PROJECTS.md

# Sobe código + build da imagem do scraper
./deploy/vps/deploy.sh
# ou: ./deploy/vps/deploy.sh root@62.238.29.122
```

O script:
- faz rsync para `/opt/allure-pricing` (não toca `/opt/nyo-kpi-warm`)
- copia `.env.local` → `/opt/allure-pricing/deploy/vps/.env` se existir
- `docker compose build` do serviço `allure-scraper`
- sobe o worker sempre-on `allure-scraper-worker` (fila `scrape_jobs` da UI)

## 2. Secrets (Projeto Y only)

Na VPS:

```bash
ssh root@62.238.29.122
nano /opt/allure-pricing/deploy/vps/.env
chmod 600 /opt/allure-pricing/deploy/vps/.env
```

Campos mínimos (ver `.env.example` nesta pasta):

```env
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
CRON_SECRET=allure-pricing-cron-2026
SCRAPER_WEBHOOK_SECRET=allure-scraper-vps-2026
# URL do app (Vercel) — usado pelo cron de sync Desbravador
ALLURE_APP_URL=https://SEU-APP.vercel.app
DESBRAVADOR_USER=
DESBRAVADOR_PASS=
```

**Não** use o `.env` do Experts Hub aqui.

## 3. Teste manual do scraper

```bash
ssh root@62.238.29.122
cd /opt/allure-pricing/deploy/vps

# Dry-run curto (5 dias, step 2)
docker compose --profile allure run --rm allure-scraper \
  npx tsx scripts/vps-scraper-runner.ts --period-days 5 --step 2

# Hotéis específicos
docker compose --profile allure run --rm allure-scraper \
  npx tsx scripts/scrape-competitors.ts \
  --period-start 2026-09-19 --period-end 2026-09-20 \
  --hotels blue-tree-premium-morumbi,novotel-sao-paulo-berrini \
  --adults both
```

## 4. Crons (host crontab — só linhas Allure)

```bash
ssh root@62.238.29.122
crontab -e
```

Cole **apenas** o bloco de `crontab.example` (comentado `# allure-pricing`).  
Não remova/altere crons do Experts Hub, se existirem.

Resumo:

| Horário | Job | Comando |
|---|---|---|
| 03:00 BRT | Scraper 30 dias / step 2 | `docker compose --profile allure run --rm allure-scraper ...` |
| 06:00 BRT | Sync tarifas Desbravador | `curl` para `$ALLURE_APP_URL/api/cron/sync-rates` (só se toggle ligado no app) |

## 5. Operação dia a dia

```bash
# Logs scraper (última execução via cron redireciona para arquivo)
tail -f /var/log/allure-scraper.log

# Rebuild após git pull / deploy.sh
cd /opt/allure-pricing/deploy/vps && docker compose --profile allure build

# NÃO confundir com Experts:
docker logs -f nyo-kpi-warm          # Projeto X
docker ps --filter name=allure       # Projeto Y
docker ps --filter name=nyo          # Projeto X
```

## 6. Disparo pela webapp (fila sincronizada)

Em `/concorrentes` → **Coletar Preços**, a UI enfileira um job em Firestore (`scrape_jobs`) e fica em loading enquanto faz poll do status.

O container **`allure-scraper-worker`** (sempre ligado após `deploy.sh`) pega jobs `pending`, roda Playwright e grava logs/`progressPercent` de volta — a barra de progresso da UI acompanha a VPS.

```bash
docker logs -f allure-scraper-worker
docker ps --filter name=allure-scraper-worker
```

Amostras manuais e histórico continuam no Firestore; o cron diário segue usando `allure-scraper` one-shot.
