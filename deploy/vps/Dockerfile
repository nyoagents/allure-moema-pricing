# Playwright + Node — scraper Allure (Projeto Y)
# Não reutilizar esta imagem para o Experts Hub.
FROM mcr.microsoft.com/playwright:v1.49.0-jammy

WORKDIR /app

ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
ENV PATH="/app/node_modules/.bin:${PATH}"

COPY package.json package-lock.json* ./
# Instala com NODE_ENV unset para não dropar deps; production vem depois
RUN npm install --omit=dev --no-audit --no-fund \
  && test -d node_modules/playwright \
  && node -e "require('playwright'); require('firebase-admin'); console.log('deps ok')"

COPY tsconfig.json ./
COPY src ./src
COPY scripts ./scripts
COPY deploy/vps ./deploy/vps

ENV NODE_ENV=production

CMD ["tsx", "scripts/vps-scraper-runner.ts", "--period-days", "30", "--step", "2"]
