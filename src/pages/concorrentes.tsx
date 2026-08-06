import { useState, useEffect, useCallback, useRef } from "react";
import Head from "next/head";
import Image from "next/image";
import Layout from "@/components/layout/Layout";
import { useAuth } from "@/contexts/AuthContext";
import type { CompetitorSample, CompetitorEntry } from "@/types";
import { COMPETITOR_URLS } from "@/data/competitors";
import { formatCurrency, formatDate, formatTimestamp } from "@/lib/utils";
import { getRatesForRoom } from "@/lib/pricing-engine";
import {
  Plus, X, TrendingUp, TrendingDown, Minus,
  AlertCircle, ExternalLink, RefreshCw, Terminal,
  Check, Coffee, Wine, Wifi, ArrowUp, ArrowDown,
} from "lucide-react";

// ── Helpers ────────────────────────────────────────────────────────────────────
const KNOWN_COMPETITORS = COMPETITOR_URLS.map((h) => h.name);

interface NewEntry {
  name: string;
  sqm: string;
  price1Pax: string;
  price2Pax: string;
  fee: string;
}

const EMPTY_ENTRY: NewEntry = { name: "", sqm: "", price1Pax: "", price2Pax: "", fee: "0" };

/** Pick an icon for a known inclusion keyword */
function InclusionBadge({ text }: { text: string }) {
  const lower = text.toLowerCase();
  const isBreakfast = lower.includes("café") || lower.includes("breakfast") || lower.includes("manhã");
  const isWine = lower.includes("vinho") || lower.includes("wine");
  const isWifi = lower.includes("internet") || lower.includes("wifi") || lower.includes("wi-fi");

  return (
    <span
      title={text}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 3,
        padding: "2px 7px",
        borderRadius: "50px",
        fontSize: 10,
        fontFamily: "var(--sans)",
        fontWeight: 500,
        background: isBreakfast ? "#fff7ed" : isWine ? "#fdf4ff" : isWifi ? "#eff6ff" : "#f1f5f9",
        color: isBreakfast ? "#c2410c" : isWine ? "#7e22ce" : isWifi ? "#1d4ed8" : "var(--mid)",
        border: `1px solid ${isBreakfast ? "#fed7aa" : isWine ? "#e9d5ff" : isWifi ? "#bfdbfe" : "var(--line)"}`,
        maxWidth: 120,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      }}
    >
      {isBreakfast ? <Coffee size={9} /> : isWine ? <Wine size={9} /> : isWifi ? <Wifi size={9} /> : null}
      {text.length > 22 ? text.slice(0, 20) + "…" : text}
    </span>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────
export default function ConcorrentesPage() {
  const { user, loading: authLoading } = useAuth();
  const [samples, setSamples] = useState<CompetitorSample[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedSample, setExpandedSample] = useState<string | null>(null);

  // Manual form
  const [showForm, setShowForm] = useState(false);
  const [formDate, setFormDate] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [entries, setEntries] = useState<NewEntry[]>([{ ...EMPTY_ENTRY }]);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [success, setSuccess] = useState("");

  // Scrape modal
  const [showScrape, setShowScrape] = useState(false);
  const [scrapeMode, setScrapeMode] = useState<"period" | "single">("period");
  // period mode
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [scrapeStep, setScrapeStep] = useState(1);
  const [weekendsOnly, setWeekendsOnly] = useState(false);
  // single mode
  const [scrapeCheckin, setScrapeCheckin] = useState("");
  const [scrapeCheckout, setScrapeCheckout] = useState("");
  // common
  const [scrapeAdults, setScrapeAdults] = useState<1 | 2 | "both">("both");
  const [scrapeHotel, setScrapeHotel] = useState("");
  const [scraping, setScraping] = useState(false);
  const [scrapeLog, setScrapeLog] = useState<string[]>([]);
  const [scrapeDone, setScrapeDone] = useState(false);
  const [scrapeSuccess, setScrapeSuccess] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  const fetchSamples = useCallback(async () => {
    if (authLoading || !user) return;
    setLoading(true);
    try {
      const res = await fetch("/api/competitors");
      const json = await res.json();
      setSamples(json.samples ?? []);
    } finally {
      setLoading(false);
    }
  }, [authLoading, user]);

  useEffect(() => { fetchSamples(); }, [fetchSamples]);

  // Auto-scroll scrape log
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [scrapeLog]);

  // Pre-fill period = next month
  const openScrape = () => {
    const today = new Date();
    // Default: next month start → end
    const nextMonthStart = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    const nextMonthEnd = new Date(today.getFullYear(), today.getMonth() + 2, 0);
    setPeriodStart(nextMonthStart.toISOString().slice(0, 10));
    setPeriodEnd(nextMonthEnd.toISOString().slice(0, 10));
    setScrapeStep(1);
    setWeekendsOnly(false);
    // single mode defaults
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    setScrapeCheckin(today.toISOString().slice(0, 10));
    setScrapeCheckout(tomorrow.toISOString().slice(0, 10));
    setScrapeLog([]);
    setScrapeDone(false);
    setScrapeSuccess(false);
    setShowScrape(true);
  };

  // Estimate number of dates for a period
  const estimateDates = (): number => {
    if (!periodStart || !periodEnd) return 0;
    const start = new Date(periodStart + "T12:00:00Z");
    const end = new Date(periodEnd + "T12:00:00Z");
    let count = 0;
    const cur = new Date(start);
    while (cur <= end) {
      const dow = cur.getUTCDay();
      if (!weekendsOnly || dow === 0 || dow === 5 || dow === 6) count++;
      cur.setUTCDate(cur.getUTCDate() + scrapeStep);
    }
    return count;
  };

  const handleScrape = async () => {
    const isValid = scrapeMode === "period" ? (periodStart && periodEnd) : (scrapeCheckin && scrapeCheckout);
    if (!isValid) return;
    setScraping(true);
    setScrapeDone(false);
    setScrapeLog(["Iniciando scraper..."]);

    const body: Record<string, unknown> = { adults: scrapeAdults };
    if (scrapeMode === "period") {
      body.periodStart = periodStart;
      body.periodEnd = periodEnd;
      if (scrapeStep > 1) body.step = scrapeStep;
      if (weekendsOnly) body.weekendsOnly = true;
    } else {
      body.checkin = scrapeCheckin;
      body.checkout = scrapeCheckout;
    }
    if (scrapeHotel) body.hotel = scrapeHotel;

    try {
      const res = await fetch("/api/competitors/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        const errMsg = json.error ?? `Erro HTTP ${res.status}`;
        if (json.cli) {
          setScrapeLog((l) => [...l, `⚠ ${errMsg}`, ``, `Comando CLI:`, `  ${json.cli}`]);
        } else {
          setScrapeLog((l) => [...l, `✗ ${errMsg}`]);
        }
        setScrapeDone(true);
        setScrapeSuccess(false);
        setScraping(false);
        return;
      }

      // Stream NDJSON
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line) as { type: string; line?: string; exitCode?: number; success?: boolean };
            if (event.type === "log" && event.line) {
              setScrapeLog((l) => [...l, event.line!]);
            } else if (event.type === "error" && event.line) {
              setScrapeLog((l) => [...l, `⚠ ${event.line}`]);
            } else if (event.type === "done") {
              setScrapeSuccess(event.success ?? false);
              setScrapeDone(true);
              if (event.success) {
                setScrapeLog((l) => [...l, "", "✅ Concluído! Amostra salva com sucesso."]);
                await fetchSamples();
              }
            }
          } catch {
            // non-JSON line, show raw
            setScrapeLog((l) => [...l, line]);
          }
        }
      }
    } catch (e) {
      setScrapeLog((l) => [...l, `✗ Erro de rede: ${(e as Error).message}`]);
      setScrapeDone(true);
      setScrapeSuccess(false);
    } finally {
      setScraping(false);
    }
  };

  // ── Manual form handlers ────────────────────────────────────────────────────
  const addEntry = () => setEntries((e) => [...e, { ...EMPTY_ENTRY }]);
  const removeEntry = (i: number) => setEntries((e) => e.filter((_, idx) => idx !== i));
  const updateEntry = (i: number, field: keyof NewEntry, value: string) =>
    setEntries((e) => e.map((entry, idx) => (idx === i ? { ...entry, [field]: value } : entry)));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError("");

    const competitors: CompetitorEntry[] = entries
      .filter((e) => e.name && e.price1Pax)
      .map((e) => {
        const p1 = parseFloat(e.price1Pax) || 0;
        const p2 = parseFloat(e.price2Pax) || 0;
        const fee = parseFloat(e.fee) || 0;
        return {
          name: e.name,
          sqm: parseFloat(e.sqm) || undefined,
          price1Pax: p1,
          price2Pax: p2,
          fee,
          finalPrice1Pax: p1 + fee,
          finalPrice2Pax: p2 + fee,
        };
      });

    if (!competitors.length) {
      setFormError("Adicione ao menos um concorrente");
      setSubmitting(false);
      return;
    }

    try {
      const res = await fetch("/api/competitors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: formDate, notes: formNotes, competitors }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erro ao salvar");
      await fetchSamples();
      setShowForm(false);
      setFormDate("");
      setFormNotes("");
      setEntries([{ ...EMPTY_ENTRY }]);
      setSuccess("Amostra registrada!");
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const getAllureStandard = (barLevel?: number): number => {
    const rates = getRatesForRoom("standard", barLevel ?? 5);
    return rates?.without_breakfast_1pax ?? 0;
  };

  const isAdmin = user?.role === "admin";

  return (
    <>
      <Head>
        <title>Concorrentes — Allure Moema Precificação</title>
      </Head>
      <Layout
        title="Análise de Concorrentes"
        subtitle="Compare preços do mercado com as tarifas Allure Moema"
        user={user}
        actions={
          isAdmin ? (
            <div style={{ display: "flex", gap: 8 }}>
              {process.env.NODE_ENV === "development" && (
                <button onClick={openScrape} className="btn btn-outline" style={{ fontSize: 13 }}>
                  <RefreshCw size={13} />
                  Atualizar Preços
                </button>
              )}
              <button onClick={() => setShowForm(true)} className="btn btn-gold" style={{ fontSize: 13 }}>
                <Plus size={14} />
                Nova Amostra
              </button>
            </div>
          ) : undefined
        }
      >
        {/* Hero strip */}
        <div style={{ position: "relative", height: 120, borderRadius: "var(--r-lg)", overflow: "hidden", marginBottom: 24 }}>
          <Image src="/images/espaco/lobby.webp" alt="Allure Moema" fill style={{ objectFit: "cover", objectPosition: "center 40%" }} />
          <div style={{
            position: "absolute", inset: 0,
            background: "linear-gradient(90deg, rgba(7,23,34,0.82) 0%, rgba(7,23,34,0.5) 60%, rgba(168,144,112,0.15) 100%)",
            display: "flex", alignItems: "center", padding: "0 32px",
          }}>
            <div>
              <p style={{ fontFamily: "var(--sans)", fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--gold)", margin: "0 0 6px" }}>
                Posicionamento de mercado
              </p>
              <p style={{ fontFamily: "var(--serif)", fontSize: "1.3rem", fontWeight: 300, color: "var(--cream)", margin: 0 }}>
                Allure Moema vs. Concorrentes
              </p>
            </div>
            <div style={{ position: "absolute", inset: 16 }}>
              {[["top","left"],["top","right"],["bottom","left"],["bottom","right"]].map(([v,h]) => (
                <div key={`${v}${h}`} style={{
                  position: "absolute", [v]: 0, [h]: 0, width: 20, height: 20,
                  borderTop: v === "top" ? "1px solid rgba(168,144,112,0.4)" : undefined,
                  borderBottom: v === "bottom" ? "1px solid rgba(168,144,112,0.4)" : undefined,
                  borderLeft: h === "left" ? "1px solid rgba(168,144,112,0.4)" : undefined,
                  borderRight: h === "right" ? "1px solid rgba(168,144,112,0.4)" : undefined,
                }} />
              ))}
            </div>
          </div>
        </div>

        {/* Monitoring badge */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, color: "var(--mid)", fontFamily: "var(--sans)" }}>
            {COMPETITOR_URLS.filter((h) => h.active).length} hotéis monitorados:
          </span>
          {COMPETITOR_URLS.filter((h) => h.active).map((h) => (
            <a
              key={h.id}
              href={h.bookingUrl}
              target="_blank"
              rel="noopener noreferrer"
              title={h.bookingUrl}
              style={{
                display: "inline-flex", alignItems: "center", gap: 3,
                padding: "2px 8px", borderRadius: "50px",
                fontSize: 10, fontFamily: "var(--sans)", fontWeight: 500,
                background: "var(--paper)", border: "1px solid var(--line)",
                color: "var(--navy)", textDecoration: "none",
                transition: "border-color 0.15s",
              }}
            >
              {h.name} <ExternalLink size={8} />
            </a>
          ))}
        </div>

        {success && (
          <div className="alert alert-success" style={{ marginBottom: 16 }}>
            <Check size={14} /> {success}
          </div>
        )}

        {/* Samples */}
        {loading ? (
          <div style={{ textAlign: "center", padding: 40, color: "var(--mid)" }}>Carregando...</div>
        ) : samples.length === 0 ? (
          <div className="card empty-state">
            <TrendingUp size={32} />
            <h3 style={{ fontFamily: "var(--serif)", fontWeight: 300, margin: "12px 0 8px" }}>
              Sem amostras registradas
            </h3>
            <p style={{ margin: "0 0 20px", fontSize: 13 }}>
              Use "Atualizar Preços" para fazer o scraping via Booking ou registre manualmente.
            </p>
            {isAdmin && process.env.NODE_ENV === "development" && (
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={openScrape} className="btn btn-gold">
                  <RefreshCw size={13} /> Buscar Preços Agora
                </button>
              </div>
            )}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {samples.map((sample) => {
              const isExpanded = expandedSample === sample.id;
              const validEntries = sample.competitors.filter((c) => c.finalPrice2Pax > 0);
              const avg2Pax = validEntries.reduce((s, c) => s + c.finalPrice2Pax, 0) / (validEntries.length || 1);
              const avg1Pax = sample.competitors.filter((c) => c.finalPrice1Pax > 0)
                .reduce((s, c) => s + c.finalPrice1Pax, 0) /
                (sample.competitors.filter((c) => c.finalPrice1Pax > 0).length || 1);
              const allurePrice = getAllureStandard();
              const diff = avg1Pax - allurePrice;
              const isScraped = !!sample.scrapedAt;

              // diff = avg1Pax(mercado) - allurePrice
              // diff > 0 → Allure mais barato que o mercado (bom)
              // diff < 0 → Allure mais caro que o mercado (atenção)
              const absDiff = Math.abs(Math.round(diff));
              const diffLabel = diff > 5
                ? `Allure R$${absDiff} abaixo da média`
                : diff < -5
                  ? `Allure R$${absDiff} acima da média`
                  : "Allure na média do mercado";
              const diffBg    = diff > 5 ? "#f0fdf4" : diff < -5 ? "#fef2f2" : "#fffbeb";
              const diffColor = diff > 5 ? "#166534" : diff < -5 ? "#991b1b" : "#92400e";
              const diffBorder= diff > 5 ? "#bbf7d0" : diff < -5 ? "#fca5a5" : "#fcd34d";

              return (
                <div key={sample.id} className="card" style={{ padding: 0 }}>
                  {/* Header */}
                  <div
                    style={{ padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, cursor: "pointer", borderBottom: isExpanded ? "1px solid var(--line)" : "none" }}
                    onClick={() => setExpandedSample(isExpanded ? null : sample.id)}
                  >
                    {/* Left: date + meta */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <h3 style={{ fontFamily: "var(--serif)", fontSize: "1.05rem", fontWeight: 300, margin: 0 }}>
                          {sample.checkin && sample.checkout
                            ? `${sample.checkin.split("-").reverse().join("/")} → ${sample.checkout.split("-").reverse().join("/")}`
                            : sample.date.split("-").reverse().join("/")}
                        </h3>
                        {isScraped && (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: "1px 7px", borderRadius: "50px", fontSize: 10, background: "#f0fdf4", color: "#166534", border: "1px solid #bbf7d0", fontFamily: "var(--sans)" }}>
                            <RefreshCw size={9} /> scraping automático
                          </span>
                        )}
                        {sample.notes && (
                          <span style={{ fontSize: 12, color: "var(--mid)" }}>{sample.notes}</span>
                        )}
                      </div>

                      {/* Price comparison row */}
                      <div style={{ display: "flex", alignItems: "center", gap: 20, marginTop: 8, flexWrap: "wrap" }}>
                        {/* Mercado */}
                        <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                          <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--dim)" }}>
                            Mercado ({validEntries.length} hotéis)
                          </span>
                          <div style={{ display: "flex", gap: 10 }}>
                            <span style={{ fontSize: 13, color: "var(--body)" }}>
                              <span style={{ fontSize: 10, color: "var(--mid)", marginRight: 2 }}>1 pax</span>
                              <strong>{formatCurrency(avg1Pax)}</strong>
                            </span>
                            <span style={{ fontSize: 13, color: "var(--body)" }}>
                              <span style={{ fontSize: 10, color: "var(--mid)", marginRight: 2 }}>2 pax</span>
                              <strong>{formatCurrency(avg2Pax)}</strong>
                            </span>
                          </div>
                        </div>

                        {/* Divisor */}
                        <div style={{ width: 1, height: 28, background: "var(--line)", flexShrink: 0 }} />

                        {/* Allure */}
                        <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                          <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--dim)" }}>
                            Allure Std. (1 pax · s/ café)
                          </span>
                          <span style={{ fontSize: 13, color: "var(--body)" }}>
                            <strong>{formatCurrency(allurePrice)}</strong>
                          </span>
                        </div>

                        {sample.scrapedAt && (
                          <span style={{ fontSize: 10, color: "var(--dim)", marginLeft: "auto" }}>
                            coletado {formatTimestamp(sample.scrapedAt!)}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Right: diff badge + chevron */}
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                      <div style={{
                        display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
                        padding: "8px 16px", borderRadius: 8, fontSize: 12, fontWeight: 600,
                        background: diffBg, color: diffColor, border: `1px solid ${diffBorder}`,
                        minWidth: 140, textAlign: "center",
                      }}>
                        {/* Main value: how much Allure is above/below market */}
                        <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 16 }}>
                          {diff < -5
                            ? <ArrowUp size={15} strokeWidth={2.5} />
                            : diff > 5
                              ? <ArrowDown size={15} strokeWidth={2.5} />
                              : <Minus size={15} strokeWidth={2.5} />}
                          {formatCurrency(Math.abs(diff))}
                        </div>
                        {/* Explanatory label */}
                        <span style={{ fontSize: 10, fontWeight: 500, opacity: 0.85, lineHeight: 1.3 }}>
                          {diffLabel}
                        </span>
                      </div>
                      <div style={{ fontSize: 18, color: "var(--mid)" }}>{isExpanded ? "▲" : "▼"}</div>
                    </div>
                  </div>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div style={{ padding: "16px 20px", overflowX: "auto" }}>
                      <table className="data-table" style={{ fontSize: 12, minWidth: 700 }}>
                        <thead>
                          <tr>
                            <th style={{ minWidth: 160 }}>Concorrente</th>
                            <th style={{ textAlign: "right" }}>1 Pax</th>
                            <th style={{ textAlign: "right" }}>2 Pax</th>
                            <th>Quarto / Incluso</th>
                            <th>Cancelamento</th>
                            <th style={{ textAlign: "right" }}>concorrente vs Allure</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sample.competitors.map((c, idx) => {
                            const d = c.finalPrice1Pax > 0 ? c.finalPrice1Pax - allurePrice : null;
                            const competitorUrl = COMPETITOR_URLS.find((u) => u.name === c.name || (c.bookingUrl && u.bookingUrl.includes(c.bookingUrl.split("/")[5])));
                            return (
                              <tr key={idx}>
                                <td style={{ fontWeight: 500 }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                    {c.name}
                                    {(c.bookingUrl || competitorUrl?.bookingUrl) && (
                                      <a
                                        href={c.bookingUrl ?? competitorUrl?.bookingUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        style={{ color: "var(--mid)", flexShrink: 0 }}
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        <ExternalLink size={10} />
                                      </a>
                                    )}
                                  </div>
                                  {c.sqm && (
                                    <div style={{ fontSize: 10, color: "var(--dim)" }}>{c.sqm} m²</div>
                                  )}
                                </td>
                                <td style={{ textAlign: "right" }}>
                                  {c.finalPrice1Pax > 0 ? formatCurrency(c.finalPrice1Pax) : "—"}
                                </td>
                                <td style={{ textAlign: "right", fontWeight: 500 }}>
                                  {c.finalPrice2Pax > 0 ? formatCurrency(c.finalPrice2Pax) : "—"}
                                </td>
                                <td>
                                  <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                                    {c.roomType && (
                                      <span style={{ fontSize: 10, color: "var(--mid)" }}>{c.roomType}</span>
                                    )}
                                    {c.inclusions && c.inclusions.length > 0 && (
                                      <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
                                        {c.inclusions.map((inc, ii) => (
                                          <InclusionBadge key={ii} text={inc} />
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                </td>
                                <td style={{ fontSize: 11, color: "var(--mid)" }}>
                                  {c.cancellation ?? "—"}
                                </td>
                                <td style={{ textAlign: "right" }}>
                                  {d !== null ? (
                                    <span style={{
                                      display: "inline-flex", alignItems: "center", gap: 3,
                                      fontWeight: 500,
                                      // d > 0: concorrente mais caro que Allure (verde p/ Allure)
                                      // d < 0: concorrente mais barato que Allure (vermelho p/ Allure)
                                      color: d > 5 ? "#166534" : d < -5 ? "#991b1b" : "var(--mid)",
                                    }}>
                                      {d > 5 ? <ArrowDown size={10} /> : d < -5 ? <ArrowUp size={10} /> : <Minus size={10} />}
                                      {d > 0 ? "+" : ""}{formatCurrency(d)}
                                    </span>
                                  ) : "—"}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot>
                          <tr style={{ background: "var(--paper-2)" }}>
                            <td style={{ fontWeight: 600 }}>
                              <div style={{ fontSize: 11, color: "var(--dim)", marginBottom: 1 }}>MERCADO</div>
                              Média concorrentes
                            </td>
                            <td style={{ textAlign: "right", fontWeight: 600 }}>{formatCurrency(avg1Pax)}</td>
                            <td style={{ textAlign: "right", fontWeight: 600 }}>{formatCurrency(avg2Pax)}</td>
                            <td colSpan={3} />
                          </tr>
                          <tr style={{ background: "rgba(168,144,112,0.06)" }}>
                            <td style={{ fontWeight: 600 }}>
                              <div style={{ fontSize: 11, color: "var(--gold)", marginBottom: 1 }}>ALLURE</div>
                              Studio Standard · 1 pax · s/ café
                            </td>
                            <td style={{ textAlign: "right", fontWeight: 700, color: "var(--navy)", fontSize: 14 }}>{formatCurrency(allurePrice)}</td>
                            <td colSpan={3} />
                            <td style={{ textAlign: "right", fontWeight: 700, color: diff > 5 ? "#166534" : diff < -5 ? "#991b1b" : "var(--mid)" }}>
                              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 1 }}>
                                <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
                                  {diff < -5 ? <ArrowUp size={11} /> : diff > 5 ? <ArrowDown size={11} /> : <Minus size={11} />}
                                  {formatCurrency(Math.abs(diff))}
                                </span>
                                <span style={{ fontSize: 10, fontWeight: 400, color: "var(--dim)" }}>
                                  {diff < -5 ? "Allure acima da média" : diff > 5 ? "Allure abaixo da média" : "na média"}
                                </span>
                              </div>
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── Scrape modal ── */}
        {showScrape && (
          <div className="modal-backdrop" onClick={() => { if (!scraping) setShowScrape(false); }}>
            <div className="modal-box" style={{ maxWidth: 540 }} onClick={(e) => e.stopPropagation()}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
                <div>
                  <p style={{ fontFamily: "var(--sans)", fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--gold)", margin: "0 0 4px" }}>
                    Booking.com
                  </p>
                  <h2 style={{ fontFamily: "var(--serif)", fontSize: "1.3rem", fontWeight: 300, margin: 0 }}>
                    Atualizar Preços
                  </h2>
                </div>
                {!scraping && (
                  <button onClick={() => setShowScrape(false)} className="btn btn-ghost" style={{ padding: 6 }}>
                    <X size={18} />
                  </button>
                )}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {!scrapeDone && (
                  <>
                    {/* Mode toggle */}
                    <div style={{ display: "flex", gap: 0, border: "1px solid var(--line)", borderRadius: "var(--r-sm)", overflow: "hidden" }}>
                      {(["period", "single"] as const).map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setScrapeMode(m)}
                          disabled={scraping}
                          style={{
                            flex: 1, padding: "8px 0", fontSize: 12, fontFamily: "var(--sans)",
                            border: "none", cursor: scraping ? "default" : "pointer",
                            background: scrapeMode === m ? "var(--navy)" : "var(--paper)",
                            color: scrapeMode === m ? "#fff" : "var(--mid)",
                            fontWeight: scrapeMode === m ? 600 : 400,
                            transition: "all 0.15s",
                          }}
                        >
                          {m === "period" ? "Período de datas" : "Diária única"}
                        </button>
                      ))}
                    </div>

                    {scrapeMode === "period" ? (
                      <>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                          <div>
                            <label className="form-label">Início do período</label>
                            <input type="date" className="form-input" value={periodStart}
                              onChange={(e) => setPeriodStart(e.target.value)} disabled={scraping} required />
                          </div>
                          <div>
                            <label className="form-label">Fim do período</label>
                            <input type="date" className="form-input" value={periodEnd}
                              onChange={(e) => setPeriodEnd(e.target.value)} disabled={scraping} required />
                          </div>
                        </div>

                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 0.8fr", gap: 10, alignItems: "end" }}>
                          <div>
                            <label className="form-label">Intervalo (dias)</label>
                            <select className="form-select" value={scrapeStep}
                              onChange={(e) => setScrapeStep(Number(e.target.value))} disabled={scraping}>
                              <option value={1}>Cada dia</option>
                              <option value={2}>A cada 2 dias</option>
                              <option value={3}>A cada 3 dias</option>
                              <option value={7}>Semanal</option>
                            </select>
                          </div>
                          <div>
                            <label className="form-label">Adultos</label>
                            <select className="form-select" value={scrapeAdults}
                              onChange={(e) => setScrapeAdults(e.target.value as 1 | 2 | "both")} disabled={scraping}>
                              <option value="both">Ambos (1 e 2)</option>
                              <option value={2}>2 adultos</option>
                              <option value={1}>1 adulto</option>
                            </select>
                          </div>
                          <div style={{ paddingBottom: 1 }}>
                            <label style={{ display: "flex", alignItems: "center", gap: 7, cursor: scraping ? "default" : "pointer", fontSize: 12, color: "var(--mid)", fontFamily: "var(--sans)", userSelect: "none" }}>
                              <input type="checkbox" checked={weekendsOnly}
                                onChange={(e) => setWeekendsOnly(e.target.checked)} disabled={scraping} />
                              Só fins de semana
                            </label>
                          </div>
                        </div>

                        {periodStart && periodEnd && (
                          <div style={{ padding: "8px 12px", background: "var(--gold-soft)", borderRadius: "var(--r-sm)", border: "1px solid var(--gold-line)", fontSize: 11, color: "var(--navy)", display: "flex", justifyContent: "space-between" }}>
                            <span>Estimativa de datas a scraper</span>
                            <strong>{estimateDates()} {estimateDates() === 1 ? "data" : "datas"} × {scrapeHotel ? 1 : COMPETITOR_URLS.filter(h => h.active).length} hotéis = ~{estimateDates() * (scrapeHotel ? 1 : COMPETITOR_URLS.filter(h => h.active).length)} requests</strong>
                          </div>
                        )}
                      </>
                    ) : (
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 0.6fr", gap: 10 }}>
                        <div>
                          <label className="form-label">Check-in</label>
                          <input type="date" className="form-input" value={scrapeCheckin}
                            onChange={(e) => setScrapeCheckin(e.target.value)} disabled={scraping} required />
                        </div>
                        <div>
                          <label className="form-label">Check-out</label>
                          <input type="date" className="form-input" value={scrapeCheckout}
                            onChange={(e) => setScrapeCheckout(e.target.value)} disabled={scraping} required />
                        </div>
                        <div>
                          <label className="form-label">Adultos</label>
                          <select className="form-select" value={scrapeAdults}
                            onChange={(e) => setScrapeAdults(e.target.value as 1 | 2 | "both")} disabled={scraping}>
                            <option value="both">Ambos (1 e 2)</option>
                            <option value={2}>2 adultos</option>
                            <option value={1}>1 adulto</option>
                          </select>
                        </div>
                      </div>
                    )}

                    <div>
                      <label className="form-label">Hotel específico (opcional)</label>
                      <select className="form-select" value={scrapeHotel}
                        onChange={(e) => setScrapeHotel(e.target.value)} disabled={scraping}>
                        <option value="">Todos os {COMPETITOR_URLS.filter((h) => h.active).length} hotéis ativos</option>
                        {COMPETITOR_URLS.filter((h) => h.active).map((h) => (
                          <option key={h.id} value={h.id}>{h.name}</option>
                        ))}
                      </select>
                    </div>

                    <div style={{ padding: "10px 12px", background: "var(--paper-2)", borderRadius: "var(--r-sm)", border: "1px solid var(--line)", fontSize: 11, color: "var(--mid)", lineHeight: 1.6 }}>
                      O scraper abre o Chromium localmente e extrai os preços do Booking.com.
                      Requer servidor Node.js (não funciona em ambiente serverless/Vercel).
                    </div>
                  </>
                )}

                {/* Log terminal */}
                {(scraping || scrapeLog.length > 0) && (
                  <div
                    ref={logRef}
                    style={{
                      background: "#0f1923",
                      borderRadius: "var(--r-sm)",
                      padding: "12px 14px",
                      maxHeight: 220,
                      overflowY: "auto",
                      fontFamily: "monospace",
                      fontSize: 12,
                      color: "#c8d9e8",
                      lineHeight: 1.7,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, color: "rgba(200,217,232,0.4)", fontSize: 10 }}>
                      <Terminal size={10} /> scrape-competitors.ts
                    </div>
                    {scrapeLog.map((line, i) => (
                      <div key={i} style={{
                        color: line.startsWith("✅") ? "#4ade80"
                          : line.startsWith("✗") || line.startsWith("⚠") ? "#f87171"
                          : line.startsWith("  [") ? "#94a3b8"
                          : "#c8d9e8",
                      }}>
                        {line || "\u00A0"}
                      </div>
                    ))}
                    {scraping && (
                      <div style={{ color: "rgba(200,217,232,0.4)" }}>█</div>
                    )}
                  </div>
                )}

                <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                  {!scraping && !scrapeDone && (
                    <>
                      <button onClick={() => setShowScrape(false)} className="btn btn-outline">Cancelar</button>
                      <button
                        onClick={handleScrape}
                        className="btn btn-gold"
                        disabled={scrapeMode === "period" ? (!periodStart || !periodEnd) : (!scrapeCheckin || !scrapeCheckout)}
                      >
                        <RefreshCw size={13} /> Iniciar Scraping
                      </button>
                    </>
                  )}
                  {scrapeDone && (
                    <button
                      onClick={() => setShowScrape(false)}
                      className={scrapeSuccess ? "btn btn-gold" : "btn btn-outline"}
                    >
                      {scrapeSuccess ? <Check size={13} /> : null} Fechar
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Manual form modal ── */}
        {showForm && (
          <div className="modal-backdrop" onClick={() => setShowForm(false)}>
            <div className="modal-box" style={{ maxWidth: 700 }} onClick={(e) => e.stopPropagation()}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
                <h2 style={{ fontFamily: "var(--serif)", fontSize: "1.3rem", fontWeight: 300, margin: 0 }}>
                  Nova Amostra Manual
                </h2>
                <button onClick={() => setShowForm(false)} className="btn btn-ghost" style={{ padding: 6 }}>
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 12 }}>
                  <div>
                    <label className="form-label">Data da Pesquisa</label>
                    <input type="date" className="form-input" value={formDate}
                      onChange={(e) => setFormDate(e.target.value)} required />
                  </div>
                  <div>
                    <label className="form-label">Observações</label>
                    <input type="text" className="form-input" value={formNotes}
                      onChange={(e) => setFormNotes(e.target.value)} placeholder="Ex: Alta temporada, feriado..." />
                  </div>
                </div>

                <div className="divider" />
                <div style={{ fontSize: 12, color: "var(--mid)", marginBottom: -4 }}>
                  Preços 1 Pax e 2 Pax antes das taxas. Taxa de resort/serviço por diária.
                </div>

                {entries.map((entry, idx) => (
                  <div key={idx} style={{ display: "grid", gridTemplateColumns: "2fr 0.6fr 1fr 1fr 0.8fr auto", gap: 8, alignItems: "end" }}>
                    <div>
                      {idx === 0 && <label className="form-label">Concorrente</label>}
                      <input list="known-competitors" className="form-input" value={entry.name}
                        onChange={(e) => updateEntry(idx, "name", e.target.value)} placeholder="Nome do hotel" required />
                      <datalist id="known-competitors">
                        {KNOWN_COMPETITORS.map((c) => <option key={c} value={c} />)}
                      </datalist>
                    </div>
                    <div>
                      {idx === 0 && <label className="form-label">m²</label>}
                      <input type="number" className="form-input" value={entry.sqm}
                        onChange={(e) => updateEntry(idx, "sqm", e.target.value)} placeholder="—" min={0} />
                    </div>
                    <div>
                      {idx === 0 && <label className="form-label">1 Pax (R$)</label>}
                      <input type="number" className="form-input" value={entry.price1Pax}
                        onChange={(e) => updateEntry(idx, "price1Pax", e.target.value)} placeholder="0" min={0} step="0.01" required />
                    </div>
                    <div>
                      {idx === 0 && <label className="form-label">2 Pax (R$)</label>}
                      <input type="number" className="form-input" value={entry.price2Pax}
                        onChange={(e) => updateEntry(idx, "price2Pax", e.target.value)} placeholder="0" min={0} step="0.01" />
                    </div>
                    <div>
                      {idx === 0 && <label className="form-label">Taxa</label>}
                      <input type="number" className="form-input" value={entry.fee}
                        onChange={(e) => updateEntry(idx, "fee", e.target.value)} placeholder="0" min={0} step="0.01" />
                    </div>
                    <button type="button" onClick={() => removeEntry(idx)} className="btn btn-ghost"
                      style={{ padding: "7px 10px", color: "var(--danger)", marginBottom: 0 }} disabled={entries.length === 1}>
                      <X size={14} />
                    </button>
                  </div>
                ))}

                <button type="button" onClick={addEntry} className="btn btn-outline" style={{ fontSize: 13 }}>
                  <Plus size={13} /> Adicionar concorrente
                </button>

                {formError && (
                  <div className="alert alert-error">
                    <AlertCircle size={14} /> {formError}
                  </div>
                )}

                <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                  <button type="button" onClick={() => setShowForm(false)} className="btn btn-outline">Cancelar</button>
                  <button type="submit" className="btn btn-gold" disabled={submitting}>
                    {submitting ? "Salvando..." : "Registrar Amostra"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </Layout>
    </>
  );
}
