import type { EventItem, EventImpact, BarLevel } from "@/types";
import { addDays, daysBetween } from "@/lib/utils";

const CLAUDE_API_KEY = process.env.ANTHROPIC_API_KEY || "";

const ALLURE_CONTEXT = `
Empreendimento: Allure Moema (Courchevel)
Website: https://www.alluremoema.com.br/pt-br
Localização: Moema, Zona Sul, São Paulo - SP (Próximo ao Parque Ibirapuera e Aeroporto de Congonhas)
Capacidade: 30 Studios de alto padrão (público corporativo executivo, participantes de feiras, congressistas e turistas de grandes shows).

Pontos de interesse e distâncias:
- Aeroporto de Congonhas (CGH): 12 minutos
- Parque do Ibirapuera / Bienal / Auditório / MAM: 8 minutos
- São Paulo Expo (maior centro de convenções da América Latina na Rod. Imigrantes): 15 minutos
- Eixo Corporativo Faria Lima / Itaim Bibi / Vila Olímpia / Berrini: 12-15 minutos
- Shopping Ibirapuera / Estação de Metrô Eucaliptos e Moema: 5-8 minutos
- Autódromo de Interlagos (F1, Lollapalooza, The Town): 25 minutos
- WTC Events Center / Transamérica Expo: 15-20 minutos
- Distritos Médicos: Hospital Santa Paula, AACD, Hospital São Paulo / EPM, Hcor, Albert Einstein, Sírio-Libanês.
`;

/**
 * Curated list of high-impact events in São Paulo with verified dates,
 * capped durations (max 3-4 days), and realistic BAR recommendations.
 */
export const CURATED_SP_EVENTS: EventItem[] = [
  {
    id: "f1-interlagos-2026",
    title: "Grande Prêmio de São Paulo de Fórmula 1",
    startDate: "2026-11-06",
    endDate: "2026-11-08",
    leadInDays: 1,
    effectiveStartDate: "2026-11-05",
    enabled: true,
    location: "Autódromo de Interlagos",
    venue: "Interlagos",
    distanceKm: 14,
    estimatedAttendance: "260.000 pessoas",
    impact: "critico",
    recommendedBar: 1,
    category: "esporte",
    reason: "Maior evento esportivo da América Latina. Ocupação hoteleira máxima na capital e tarifas no teto histórico desde a véspera (quinta-feira).",
    source: "Calendário Oficial SPTuris",
    createdAt: new Date().toISOString(),
  },
  {
    id: "hospitalar-2026",
    title: "Hospitalar Feira & Fórum",
    startDate: "2026-05-19",
    endDate: "2026-05-22",
    leadInDays: 1,
    effectiveStartDate: "2026-05-18",
    enabled: true,
    location: "São Paulo Expo",
    venue: "SP Expo",
    distanceKm: 7.5,
    estimatedAttendance: "50.000 profissionais",
    impact: "alto",
    recommendedBar: 2,
    category: "feira_negocios",
    reason: "Principal feira de saúde do continente no São Paulo Expo, a 15 minutos do Allure Moema. Altíssima demanda de executivos e médicos.",
    source: "SP Expo",
    createdAt: new Date().toISOString(),
  },
  {
    id: "lollapalooza-2026",
    title: "Lollapalooza Brasil 2026",
    startDate: "2026-03-27",
    endDate: "2026-03-29",
    leadInDays: 1,
    effectiveStartDate: "2026-03-26",
    enabled: true,
    location: "Autódromo de Interlagos",
    venue: "Interlagos",
    distanceKm: 14,
    estimatedAttendance: "300.000 pessoas",
    impact: "critico",
    recommendedBar: 1,
    category: "show_festival",
    reason: "Mega festival de música com enorme demanda turística para Moema e eixo sul de São Paulo.",
    source: "Live Nation",
    createdAt: new Date().toISOString(),
  },
  {
    id: "feicon-2026",
    title: "FEICON — Salão da Construção Civil e Arquitetura",
    startDate: "2026-04-07",
    endDate: "2026-04-10",
    leadInDays: 1,
    effectiveStartDate: "2026-04-06",
    enabled: true,
    location: "São Paulo Expo",
    venue: "SP Expo",
    distanceKm: 7.5,
    estimatedAttendance: "80.000 visitantes",
    impact: "alto",
    recommendedBar: 2,
    category: "feira_negocios",
    reason: "Grande afluência de executivos e compradores com alta procura por studios corporativos em Moema.",
    source: "RX Global",
    createdAt: new Date().toISOString(),
  },
  {
    id: "bienal-art-2026",
    title: "Bienal Internacional de Arte de São Paulo (Abertura & Feriado)",
    startDate: "2026-09-05",
    endDate: "2026-09-08",
    leadInDays: 1,
    effectiveStartDate: "2026-09-04",
    enabled: true,
    location: "Parque Ibirapuera - Pavilhão Ciccillo Matarazzo",
    venue: "Parque Ibirapuera",
    distanceKm: 3.2,
    estimatedAttendance: "70.000 visitantes (abertura)",
    impact: "medio",
    recommendedBar: 4,
    category: "show_festival",
    reason: "Semana de vernissage e abertura da Bienal vizinha a Moema durante o feriado da Independência, atraindo público cultural e colecionadores.",
    source: "Fundação Bienal SP",
    createdAt: new Date().toISOString(),
  },
  {
    id: "ccxp-2026",
    title: "CCXP — Comic Con Experience 2026",
    startDate: "2026-12-03",
    endDate: "2026-12-06",
    leadInDays: 1,
    effectiveStartDate: "2026-12-02",
    enabled: true,
    location: "São Paulo Expo",
    venue: "SP Expo",
    distanceKm: 7.5,
    estimatedAttendance: "280.000 pessoas",
    impact: "critico",
    recommendedBar: 1,
    category: "show_festival",
    reason: "Maior evento de cultura pop do mundo no São Paulo Expo, lotando a hotelaria da Zona Sul de SP.",
    source: "Omelete Company",
    createdAt: new Date().toISOString(),
  },
  {
    id: "futurecom-2026",
    title: "Futurecom Telecom & Tecnologia",
    startDate: "2026-10-06",
    endDate: "2026-10-08",
    leadInDays: 1,
    effectiveStartDate: "2026-10-05",
    enabled: true,
    location: "São Paulo Expo",
    venue: "SP Expo",
    distanceKm: 7.5,
    estimatedAttendance: "35.000 executivos",
    impact: "alto",
    recommendedBar: 2,
    category: "feira_negocios",
    reason: "Principal congresso de tecnologia e conectividade da América Latina no SP Expo.",
    source: "Informa Markets",
    createdAt: new Date().toISOString(),
  },
];

export interface ScanEventsParams {
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
}

/**
 * Hard guardrail to sanitize and validate any event item before persisting or pricing.
 * Prevents long multi-week events from locking high BARs and destroying hotel occupancy.
 */
export function sanitizeEventItem(e: Partial<EventItem>, fallbackStartDate?: string): EventItem {
  const start = e.startDate || fallbackStartDate || new Date().toISOString().slice(0, 10);
  let end = e.endDate || start;

  if (end < start) {
    end = start;
  }

  // Calculate event duration in days
  const duration = Math.max(1, daysBetween(start, end));

  // Sanitize lead-in days (0 to 2 max, standard 1)
  const leadIn = typeof e.leadInDays === "number" ? Math.max(0, Math.min(2, e.leadInDays)) : 1;
  const effectiveStart = e.effectiveStartDate || addDays(start, -leadIn);

  let bar = typeof e.recommendedBar === "number" ? Math.max(1, Math.min(10, Math.round(e.recommendedBar))) : 4;
  let impact: EventImpact = e.impact || "medio";

  // ── REVENUE MANAGEMENT HARD GUARDRAILS ──
  // 1. Never allow a high-pressure BAR (BAR 1, 2 or 3) for more than 4 days continuously.
  // If duration > 4 days, cap end date to 4 days or soften BAR to avoid crushing occupancy.
  if (duration > 4) {
    if (bar <= 2) {
      // Cap duration to peak 4 days
      end = addDays(start, 3);
    } else if (bar === 3) {
      end = addDays(start, 4);
    } else if (duration > 5) {
      // For moderate events longer than 5 days, adjust BAR to balanced level (BAR 5+)
      bar = Math.max(bar, 5);
      if (duration > 7) {
        end = addDays(start, 4); // Trim to opening peak
      }
    }
  }

  // 2. Validate BAR vs Impact correlation
  if (bar === 1 && impact !== "critico") {
    bar = 2;
  }
  if (bar === 2 && impact === "baixo") {
    bar = 4;
  }

  return {
    id: e.id || `event-${start}-${Math.random().toString(36).slice(2, 7)}`,
    title: e.title || "Evento Corporativo São Paulo",
    startDate: start,
    endDate: end,
    leadInDays: leadIn,
    effectiveStartDate: effectiveStart,
    enabled: e.enabled !== false,
    location: e.location || "São Paulo - SP",
    venue: e.venue || "Polo de Eventos SP",
    distanceKm: typeof e.distanceKm === "number" ? e.distanceKm : 8,
    estimatedAttendance: e.estimatedAttendance || "Relevante",
    impact,
    recommendedBar: bar as BarLevel,
    category: e.category || "feira_negocios",
    reason: e.reason || "Evento relevante com pressão tarifária sobre Moema e região sul de SP.",
    source: e.source || "Inteligência de Mercado",
    createdAt: e.createdAt || new Date().toISOString(),
  };
}

export async function scanEventsWithClaude({
  startDate,
  endDate,
}: ScanEventsParams): Promise<EventItem[]> {
  const prompt = `Você é um Diretor Sênior de Revenue Management Hoteleiro especializado na praça de São Paulo / Moema.

Analise os eventos reais, feiras de negócios, congressos, grandes shows e festivais em São Paulo no período de ${startDate} até ${endDate} com potencial de gerar compressão de demanda para o ALLURE MOEMA (studios boutique em Moema, próximo ao Ibirapuera, Congonhas e São Paulo Expo).

${ALLURE_CONTEXT}

═════════════════════════════════════════════════════════════════════
DIRETRIZES FUNDAMENTAIS DE REVENUE MANAGEMENT (ANTI-DISTORÇÃO):
═════════════════════════════════════════════════════════════════════

1. REGRA DE DURAÇÃO MÁXIMA POR EVENTO:
   - Todo evento concentrado (feira, congresso, festival, mega-show) dura de 2 a 4 dias no máximo.
   - NUNCA retorne um evento com data início e fim cobrindo semanas ou meses seguidos.
   - Para temporadas culturais, mostras de arte ou bienais longas (ex: Bienal de SP, CASACOR, temporadas no MASP):
     Mapeie ESTRITAMENTE o fim de semana de abertura / vernissage ou feriado de pico (máximo 3 a 4 dias). Dias úteis comuns de visitação diluída NÃO têm compressão de demanda e não devem receber BAR agressivo.

2. MATRIZ DE RECOMENDAÇÃO DE BAR (TARIFAS ALLURE MOEMA):
   - BAR 1 (Tarifa Teto Máximo ~R$ 800-950): Estritamente reservado para MEGA EVENTOS globais/nacionais que lotam toda a cidade de SP (ex: F1 GP Interlagos, Lollapalooza, The Town, Réveillon da Paulista). Duração máx 3 dias.
   - BAR 2 (Tarifa Muito Alta ~R$ 700-800): Grandes feiras no São Paulo Expo com +50k visitantes (Hospitalar, Feicon, CCXP) ou congressos médicos internacionais. Duração máx 4 dias.
   - BAR 3 (Tarifa Alta ~R$ 640-720): Shows em estádios (Allianz Parque, Morumbi), feiras médias no WTC / Anhembi ou congressos jurídicos/financeiros na Faria Lima. Duração máx 3 dias.
   - BAR 4 a 5 (Tarifa Moderada / Feriado ~R$ 560-640): Feriados prolongados, abertura de bienais, eventos de médio porte.
   - BAR 6 a 8 (Tarifa Normal / Corporativa ~R$ 460-540): Eventos menores ou regionais.

3. RESPEITO À ELASTICIDADE DA DEMANDA:
   - Se os preços forem inflacionados sem demanda real durante semanas seguidas, o hotel perde a clientela corporativa regular e sofre colapso de ocupação. Mantenha os eventos estritamente nos dias de real pico de hospedagem.

Retorne EXCLUSIVAMENTE um array JSON puro (sem markdown, sem explicações antes ou depois):
[
  {
    "id": "slug-identificador-ano",
    "title": "Nome Oficial do Evento",
    "startDate": "YYYY-MM-DD",
    "endDate": "YYYY-MM-DD",
    "location": "Bairro / Endereço / Cidade",
    "venue": "Pavilhão / Estádio / Parque",
    "distanceKm": 7.5,
    "estimatedAttendance": "Ex: 60.000 profissionais",
    "impact": "critico" | "alto" | "medio" | "baixo",
    "recommendedBar": 1,
    "category": "feira_negocios" | "congresso" | "show_festival" | "esporte" | "feriado" | "outro",
    "reason": "Justificativa técnica de ocupação e revenue para o Allure Moema."
  }
]
`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": CLAUDE_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 4000,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.warn("Claude API error:", response.status, errText);
      return filterCuratedEvents(startDate, endDate);
    }

    const data = await response.json();
    const rawText = data?.content?.[0]?.text ?? "";

    const jsonMatch = rawText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.warn("Could not parse JSON from Claude response, using curated fallback");
      return filterCuratedEvents(startDate, endDate);
    }

    const parsed = JSON.parse(jsonMatch[0]) as Partial<EventItem>[];
    return parsed.map((e) => sanitizeEventItem(e, startDate));
  } catch (err) {
    console.error("Failed to scan events with Claude:", err);
    return filterCuratedEvents(startDate, endDate);
  }
}

function filterCuratedEvents(startDate: string, endDate: string): EventItem[] {
  const filtered = CURATED_SP_EVENTS.filter(
    (e) =>
      (e.startDate >= startDate && e.startDate <= endDate) ||
      (e.endDate >= startDate && e.endDate <= endDate) ||
      (e.startDate <= startDate && e.endDate >= endDate)
  );

  return filtered.map((e) => sanitizeEventItem(e, startDate));
}
