# Allure Moema — Sistema de Precificação

Admin system para precificação dinâmica dos apartamentos do Allure Moema, baseado em BAR levels com dados históricos da planilha 2023-2024.

## Stack

- **Next.js 16** (Pages Router) + TypeScript
- **Tailwind CSS 4**
- **Firebase Auth + Admin SDK** (Firestore)
- **Lucide React** icons
- Design: paleta Allure Moema (cream/navy/gold) + layout NYO Admin

## Setup

### 1. Variáveis de Ambiente

Copie `.env.example` para `.env.local` e preencha:

```bash
cp .env.example .env.local
```

Campos necessários:
- `FIREBASE_PROJECT_ID` — ID do projeto Firebase
- `FIREBASE_CLIENT_EMAIL` — email da service account
- `FIREBASE_PRIVATE_KEY` — chave privada da service account
- `FIREBASE_API_KEY` — chave de API Firebase (para login server-side)
- `NEXT_PUBLIC_FIREBASE_*` — configuração do SDK cliente
- `SESSION_SECRET` — mínimo 32 caracteres para encriptação AES-256-GCM

### 2. Instalar dependências

```bash
npm install
```

### 3. Iniciar o servidor

```bash
npm run dev
```

Acesse: http://localhost:3000

## Populando o Firestore

Execute os scripts de seed após configurar o `.env.local`:

```bash
# Popular todos (recomendado na primeira vez)
npm run seed:all

# Ou individualmente:
npm run seed:rooms        # 6 tipologias de quartos
npm run seed:bar          # Tabela BAR completa (extraída da planilha TARIFÁRIO)
npm run seed:historical   # 357 dias do calendário 2023-2024 (BAR diário)
npm run seed:competitors  # 3 amostras históricas de concorrentes
```

## Estrutura do Projeto

```
src/
├── pages/
│   ├── login.tsx              # Autenticação
│   ├── dashboard.tsx          # Visão geral de tarifas + 7 dias
│   ├── calendario.tsx         # Calendário mensal com color-coding BAR
│   ├── configuracoes.tsx      # CRUD de períodos BAR + tabela de tarifas
│   ├── concorrentes.tsx       # Análise de concorrentes + amostras
│   └── api/
│       ├── auth/              # login, logout, me
│       ├── pricing/current    # Calcula preços por data
│       ├── bar-periods/       # CRUD de períodos BAR
│       └── competitors/       # Amostras de concorrentes
├── lib/
│   ├── pricing-engine.ts      # Lógica BAR → preço final
│   ├── firebase-admin.ts      # SDK Admin (server)
│   ├── firebase-client.ts     # SDK Client (browser)
│   └── session.ts             # Cookie AES-256-GCM + auth helpers
├── data/
│   ├── rooms.ts               # 6 tipologias (fallback estático)
│   ├── bar-table.ts           # Tabela BAR completa (-9 a 17) por quarto
│   └── historical-calendar.ts # 357 dias 2023-2024 com BAR + preços
└── types/index.ts             # Tipos TypeScript
scripts/
├── seed-rooms.ts
├── seed-bar-table.ts
├── seed-historical.ts
└── seed-competitors.ts
```

## Coleções Firestore

| Coleção | Descrição |
|---------|-----------|
| `/rooms/{roomId}` | 6 tipologias de quartos |
| `/bar_rates/{roomId}` | Tabela BAR por quarto (todos os níveis) |
| `/bar_periods/{id}` | Períodos configurados manualmente pelo admin |
| `/historical_data/{YYYYMMDD}` | Calendário histórico 2023-2024 |
| `/competitor_samples/{id}` | Amostras de preços da concorrência |
| `/users/{uid}` | Usuários com role admin/viewer |

## Lógica de Precificação (BAR)

O sistema determina o nível BAR para cada data em 3 camadas:

1. **Firestore `bar_periods`** — períodos configurados manualmente (maior prioridade)
2. **`historical_data`** — sazonalidade inferida do calendário 2023-2024
3. **Padrão BAR 5** — fallback se não houver histórico

Escala BAR: 1 (tarifa mais alta, alta temporada) → 10 (tarifa mais baixa, baixa temporada).  
BAR 5 é a tarifa-base.

## Concorrentes Identificados

Mercure SP Moema, Wyndham, EstanPlaza, Intercity, Comfort Ibirapuera, Ibis SP, Slaviero SP Moema, Mercure SP Ibirapuera, Melià Ibirapuera, Mercure SP Times Square, TSUE The Place Flats.

> Integração Booking.com planejada para próxima versão.
