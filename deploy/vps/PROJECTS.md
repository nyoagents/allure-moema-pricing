# Projetos na VPS Hetzner (62.238.29.122)

Este arquivo deve existir em `/opt/PROJECTS.md` na VPS.
**Nunca misture pastas, containers, crons ou `.env` entre os projetos.**

| Pasta na VPS | Projeto | O que roda | Containers / PM2 | Cron |
|---|---|---|---|---|
| `/opt/nyo-kpi-warm/` | **X — Nyo Experts Hub** | KPI warm + MCP Hub | `nyo-kpi-warm`, mcp em `:3100` | interno do worker |
| `/opt/allure-pricing/` | **Y — Allure Moema Precificação** | Scraper Booking + crons de tarifa | `allure-scraper` | host crontab → `allure-*` |

## Regras

1. **Experts Hub** = repo `nyo-experts-hub` → deploy só em `/opt/nyo-kpi-warm`.
2. **Allure Pricing** = repo `allure-pricing` → deploy só em `/opt/allure-pricing`.
3. Não compartilhar `.env`, Firebase project secrets, nem `docker compose` entre as pastas.
4. Crons do Allure usam comentário `# allure-pricing` — nunca editar linhas do Experts Hub.
5. Logs Allure: `/var/log/allure-*.log` · Logs Experts: `docker logs nyo-kpi-warm`.
