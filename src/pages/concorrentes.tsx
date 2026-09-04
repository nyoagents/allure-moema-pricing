import { useState, useEffect, useCallback, useRef } from "react";
import Head from "next/head";
import Image from "next/image";
import Layout from "@/components/layout/Layout";
import { useAuth } from "@/contexts/AuthContext";
import type { CompetitorSample, CompetitorEntry, CompetitorUrl, ScrapeJob, ScrapeJobStatus } from "@/types";
import { COMPETITOR_URLS } from "@/data/competitors";
import { formatCurrency, formatTimestamp, formatDateShort, formatDateRange } from "@/lib/utils";
import { getRatesForRoom } from "@/lib/pricing-engine";
import { estimateScrapeWorkload } from "@/lib/scrape-estimate";

/** Garante 1 pax ≥5% abaixo de 2 pax na exibição. */
function displayPaxPrices(price1: number, price2: number): { price1Pax: number; price2Pax: number } {
  const p2 = price2 > 0 ? price2 : 0;
  if (!p2) return { price1Pax: price1 > 0 ? price1 : 0, price2Pax: 0 };
  const max1 = Math.round(p2 * 0.95);
  const p1 = price1 > 0 ? price1 : max1;
  return { price1Pax: Math.min(p1, max1), price2Pax: p2 };
}
import {
  Plus,
  X,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertCircle,
  ExternalLink,
  RefreshCw,
  Check,
  Coffee,
  Wine,
  Wifi,
  ArrowUp,
  ArrowDown,
  Building,
  History,
  Layers,
  Search,
  ChevronRight,
  Play,
  CheckSquare,
  Square,
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

export default function ConcorrentesPage() {
  const { user, loading: authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<"hotels" | "runs">("hotels");
  const [samples, setSamples] = useState<CompetitorSample[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedSample, setExpandedSample] = useState<string | null>(null);

  // Selected hotel for drilldown modal
  const [selectedHotel, setSelectedHotel] = useState<CompetitorUrl | null>(null);
  const [hotelSearch, setHotelSearch] = useState("");

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
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [scrapeStep, setScrapeStep] = useState(1);
  const [weekendsOnly, setWeekendsOnly] = useState(false);
  const [scrapeCheckin, setScrapeCheckin] = useState("");
  const [scrapeCheckout, setScrapeCheckout] = useState("");
  const [scrapeAdults, setScrapeAdults] = useState<1 | 2 | "both">("both");
  const [scrapeHotelIds, setScrapeHotelIds] = useState<string[]>([]);
  const [hotelPickerSearch, setHotelPickerSearch] = useState("");
  const [scraping, setScraping] = useState(false);
  const [scrapeDone, setScrapeDone] = useState(false);
  const [scrapeSuccess, setScrapeSuccess] = useState(false);
  const [scrapeProgress, setScrapeProgress] = useState(0);
  const [scrapeJobStatus, setScrapeJobStatus] = useState<ScrapeJobStatus | null>(null);
  const [scrapeEstimateLabel, setScrapeEstimateLabel] = useState("");
  const [scrapeStartedAt, setScrapeStartedAt] = useState<string | null>(null);
  const [scrapeError, setScrapeError] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPoll = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  useEffect(() => () => stopPoll(), []);

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

  useEffect(() => {
    fetchSamples();
  }, [fetchSamples]);

  const openScrape = (preselectedHotelId?: string) => {
    const today = new Date();
    const nextMonthStart = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    const nextMonthEnd = new Date(today.getFullYear(), today.getMonth() + 2, 0);
    setPeriodStart(nextMonthStart.toISOString().slice(0, 10));
    setPeriodEnd(nextMonthEnd.toISOString().slice(0, 10));
    setScrapeStep(1);
    setWeekendsOnly(false);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    setScrapeCheckin(today.toISOString().slice(0, 10));
    setScrapeCheckout(tomorrow.toISOString().slice(0, 10));
    setScrapeHotelIds(preselectedHotelId ? [preselectedHotelId] : []);
    setHotelPickerSearch("");
    setScrapeDone(false);
    setScrapeSuccess(false);
    setScrapeProgress(0);
    setScrapeJobStatus(null);
    setScrapeEstimateLabel("");
    setScrapeStartedAt(null);
    setScrapeError("");
    stopPoll();
    setShowScrape(true);
  };

  const activeHotelList = COMPETITOR_URLS.filter((h) => h.active);
  const selectedHotelCount = scrapeHotelIds.length;

  const toggleHotelId = (id: string) => {
    setScrapeHotelIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const selectAllHotels = () => setScrapeHotelIds(activeHotelList.map((h) => h.id));
  const clearHotelSelection = () => setScrapeHotelIds([]);

  const liveWorkload = estimateScrapeWorkload({
    mode: scrapeMode,
    periodStart: periodStart || undefined,
    periodEnd: periodEnd || undefined,
    step: scrapeStep,
    weekendsOnly,
    checkin: scrapeCheckin || undefined,
    checkout: scrapeCheckout || undefined,
    hotelIds: scrapeHotelIds,
    adults: scrapeAdults,
  });

  const applyJobToUi = (job: ScrapeJob) => {
    setScrapeJobStatus(job.status);
    const pct = job.progressPercent ?? 0;
    // Nunca mostrar "concluída" com menos de 100%
    setScrapeProgress(job.status === "done" || job.status === "error" ? 100 : Math.min(99, pct));
    setScrapeEstimateLabel(
      `Tempo de trabalho do bot: ~${job.estimatedMinutesMin}–${job.estimatedMinutesMax} min · ${job.estimatedDates} datas × ${job.estimatedHotels} hotéis`
    );
    if (job.status === "error" && job.error) setScrapeError(job.error);
  };

  const handleScrape = async () => {
    const isValid = scrapeMode === "period" ? periodStart && periodEnd : scrapeCheckin && scrapeCheckout;
    if (!isValid) return;

    stopPoll();
    setScraping(true);
    setScrapeDone(false);
    setScrapeSuccess(false);
    setScrapeProgress(0);
    setScrapeJobStatus("pending");
    setScrapeStartedAt(new Date().toISOString());
    setScrapeError("");
    setScrapeEstimateLabel(
      `Tempo de trabalho do bot: ~${liveWorkload.estimatedMinutesMin}–${liveWorkload.estimatedMinutesMax} min (${liveWorkload.estimatedDates} datas × ${liveWorkload.estimatedHotels} hotéis)`
    );

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
    if (scrapeHotelIds.length === 1) {
      body.hotel = scrapeHotelIds[0];
    } else if (scrapeHotelIds.length > 1) {
      body.hotels = scrapeHotelIds;
    }

    try {
      const res = await fetch("/api/competitors/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        setScrapeError(json.error ?? `Erro HTTP ${res.status}`);
        setScrapeDone(true);
        setScrapeSuccess(false);
        setScraping(false);
        setScrapeJobStatus("error");
        return;
      }

      const jobId = json.jobId as string;
      if (json.job) applyJobToUi(json.job as ScrapeJob);

      let finished = false;
      let lastSampleRefresh = 0;
      const pollOnce = async () => {
        const statusRes = await fetch(`/api/competitors/scrape-jobs/${jobId}`);
        const statusJson = await statusRes.json().catch(() => ({}));
        if (!statusRes.ok) {
          throw new Error(statusJson.error ?? `Erro ao consultar job (${statusRes.status})`);
        }
        const job = statusJson.job as ScrapeJob;
        applyJobToUi(job);

        // Libera cards/histórico conforme o bot grava cada hotel
        const now = Date.now();
        if (job.status === "running" || job.status === "done") {
          if (job.status === "done" || now - lastSampleRefresh > 4000) {
            lastSampleRefresh = now;
            await fetchSamples();
          }
        }

        if (job.status === "done" || job.status === "error") {
          finished = true;
          stopPoll();
          setScraping(false);
          setScrapeDone(true);
          setScrapeProgress(100);
          setScrapeSuccess(job.status === "done");
          if (job.status === "error") setScrapeError(job.error || "Coleta falhou");
          if (job.status === "done") await fetchSamples();
        }
      };

      await pollOnce();
      if (!finished) {
        pollRef.current = setInterval(() => {
          void pollOnce().catch((e) => {
            stopPoll();
            setScrapeError(`Erro ao sincronizar com o bot: ${(e as Error).message}`);
            setScraping(false);
            setScrapeDone(true);
            setScrapeSuccess(false);
            setScrapeJobStatus("error");
          });
        }, 2500);
      }
    } catch (e) {
      stopPoll();
      setScrapeError(`Erro de rede: ${(e as Error).message}`);
      setScrapeDone(true);
      setScrapeSuccess(false);
      setScraping(false);
      setScrapeJobStatus("error");
    }
  };

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

  const allurePrice = getAllureStandard();
  const isAdmin = user?.role === "admin";

  const samplesByRun = [...samples].sort((a, b) => {
    const ta = a.scrapedAt || a.createdAt || `${a.date}T00:00:00.000Z`;
    const tb = b.scrapedAt || b.createdAt || `${b.date}T00:00:00.000Z`;
    return tb.localeCompare(ta);
  });

  /** Resultados liberados nesta coleta (amostras gravadas após o início do job). */
  const scrapeResultSamples = scrapeStartedAt
    ? samplesByRun.filter((s) => {
        const t = s.scrapedAt || s.createdAt;
        if (!t) return false;
        // Folga de 60s: clock client vs VPS pode divergir
        const cutoff = new Date(new Date(scrapeStartedAt).getTime() - 60_000).toISOString();
        if (t < cutoff) return false;
        const stay = s.checkin || s.date;
        if (scrapeMode === "single") return stay === scrapeCheckin;
        if (periodStart && periodEnd) return stay >= periodStart && stay <= periodEnd;
        return true;
      })
    : [];

  const scrapeResultRows = scrapeResultSamples.flatMap((s) =>
    s.competitors.map((c) => {
      const raw1 = c.price1Pax || c.finalPrice1Pax;
      const raw2 = c.price2Pax || c.finalPrice2Pax;
      const { price1Pax, price2Pax } = displayPaxPrices(raw1, raw2);
      return {
        sampleId: s.id,
        stay: s.checkin && s.checkout ? formatDateRange(s.checkin, s.checkout) : formatDateShort(s.date),
        name: c.name,
        price1Pax,
        price2Pax,
        roomType: c.roomType,
        fee: c.fee,
      };
    })
  );

  // Filtered hotels list
  const activeHotels = COMPETITOR_URLS.filter((h) => h.active);
  const filteredHotels = activeHotels.filter((h) =>
    h.name.toLowerCase().includes(hotelSearch.toLowerCase())
  );

  // Helper to extract all collected entries for a specific hotel across samples
  const getHotelHistory = (hotelName: string) => {
    const history: {
      date: string;
      checkin?: string;
      checkout?: string;
      price1Pax: number;
      price2Pax: number;
      roomType?: string;
      inclusions?: string[];
      cancellation?: string;
      scrapedAt?: string;
    }[] = [];

    for (const s of samplesByRun) {
      const match = s.competitors.find(
        (c) => c.name.toLowerCase() === hotelName.toLowerCase() || hotelName.toLowerCase().includes(c.name.toLowerCase())
      );
      if (match) {
        const { price1Pax, price2Pax } = displayPaxPrices(match.finalPrice1Pax, match.finalPrice2Pax);
        history.push({
          date: s.date,
          checkin: s.checkin,
          checkout: s.checkout,
          price1Pax,
          price2Pax,
          roomType: match.roomType,
          inclusions: match.inclusions,
          cancellation: match.cancellation,
          scrapedAt: s.scrapedAt,
        });
      }
    }

    return history;
  };

  return (
    <>
      <Head>
        <title>Concorrentes — Allure Moema Precificação</title>
      </Head>
      <Layout
        title="Concorrentes"
        subtitle={`Monitoramento Booking.com — ${COMPETITOR_URLS.filter((h) => h.active).length} hotéis · coleta manual e automática`}
        user={user}
        actions={
          isAdmin ? (
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => openScrape()} className="btn btn-gold" style={{ fontSize: 13 }}>
                <Play size={13} />
                Coletar Preços
              </button>
              <button onClick={() => setShowForm(true)} className="btn btn-outline" style={{ fontSize: 13 }}>
                <Plus size={14} />
                Nova Amostra
              </button>
            </div>
          ) : undefined
        }
      >
        {/* Navigation Tabs */}
        <div
          style={{
            display: "flex",
            gap: 10,
            borderBottom: "1px solid var(--line)",
            marginBottom: 24,
            paddingBottom: 2,
          }}
        >
          <button
            onClick={() => setActiveTab("hotels")}
            style={{
              padding: "10px 18px",
              fontSize: 13,
              fontWeight: activeTab === "hotels" ? 600 : 400,
              color: activeTab === "hotels" ? "var(--navy)" : "var(--mid)",
              borderBottom: activeTab === "hotels" ? "2px solid var(--gold)" : "2px solid transparent",
              background: "none",
              border: "none",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              fontFamily: "var(--sans)",
            }}
          >
            <Building size={16} color={activeTab === "hotels" ? "var(--gold)" : "inherit"} />
            Hotéis Monitorados ({activeHotels.length})
          </button>

          <button
            onClick={() => setActiveTab("runs")}
            style={{
              padding: "10px 18px",
              fontSize: 13,
              fontWeight: activeTab === "runs" ? 600 : 400,
              color: activeTab === "runs" ? "var(--navy)" : "var(--mid)",
              borderBottom: activeTab === "runs" ? "2px solid var(--gold)" : "2px solid transparent",
              background: "none",
              border: "none",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              fontFamily: "var(--sans)",
            }}
          >
            <History size={16} color={activeTab === "runs" ? "var(--gold)" : "inherit"} />
            Histórico de Execuções Gerais ({samplesByRun.length} runs)
          </button>
        </div>

        {/* ── TAB 1: INDIVIDUAL HOTELS MONITORING ── */}
        {activeTab === "hotels" && (
          <div>
            {/* Search and context bar */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: 12,
                marginBottom: 20,
              }}
            >
              <div style={{ position: "relative", width: 320 }}>
                <Search size={15} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--mid)" }} />
                <input
                  type="text"
                  placeholder="Buscar hotel concorrente..."
                  value={hotelSearch}
                  onChange={(e) => setHotelSearch(e.target.value)}
                  className="form-input"
                  style={{ width: "100%", paddingLeft: 34, fontSize: 13 }}
                />
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <div style={{ fontSize: 12, color: "var(--mid)" }}>
                  Clique no hotel para o histórico · use <strong>Coletar Preços</strong> para um período ou hotéis específicos.
                </div>
                {isAdmin && (
                  <button
                    onClick={() => openScrape()}
                    className="btn btn-outline"
                    style={{ fontSize: 12, padding: "6px 12px" }}
                  >
                    <Play size={12} />
                    Coletar
                  </button>
                )}
              </div>
            </div>

            {/* Grid of 19 Competitor Cards */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
                gap: 16,
              }}
            >
              {filteredHotels.map((hotel) => {
                const history = getHotelHistory(hotel.name);
                const latest = history[0];
                const price1 = latest?.price1Pax ?? 0;
                const price2 = latest?.price2Pax ?? 0;
                const diff = price1 > 0 ? price1 - allurePrice : 0;

                return (
                  <div
                    key={hotel.id}
                    className="card"
                    onClick={() => setSelectedHotel(hotel)}
                    style={{
                      padding: "18px 20px",
                      cursor: "pointer",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                      transition: "transform 0.15s, border-color 0.15s",
                      border: "1px solid var(--line)",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = "var(--gold)";
                      e.currentTarget.style.transform = "translateY(-2px)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = "var(--line)";
                      e.currentTarget.style.transform = "translateY(0)";
                    }}
                  >
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 8 }}>
                        <h3
                          style={{
                            fontFamily: "var(--serif)",
                            fontSize: "1.15rem",
                            fontWeight: 400,
                            color: "var(--navy)",
                            margin: 0,
                          }}
                        >
                          {hotel.name}
                        </h3>
                        <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                          {isAdmin && (
                            <button
                              type="button"
                              title="Coletar preços deste hotel"
                              className="btn btn-ghost"
                              style={{ padding: 4, color: "var(--gold)" }}
                              onClick={(e) => {
                                e.stopPropagation();
                                openScrape(hotel.id);
                              }}
                            >
                              <Play size={12} />
                            </button>
                          )}
                          <a
                            href={hotel.bookingUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            title="Abrir no Booking.com"
                            className="btn btn-ghost"
                            style={{ padding: 4, color: "var(--mid)" }}
                          >
                            <ExternalLink size={12} />
                          </a>
                        </div>
                      </div>

                      {/* Latest price info */}
                      {latest ? (
                        <div style={{ marginBottom: 12 }}>
                          <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                            <span style={{ fontSize: 11, color: "var(--mid)" }}>Última Coleta:</span>
                            <span style={{ fontFamily: "var(--serif)", fontSize: "1.35rem", fontWeight: 600, color: "var(--navy)" }}>
                              {price1 > 0 ? formatCurrency(price1) : "—"}
                            </span>
                            <span style={{ fontSize: 11, color: "var(--mid)" }}>1 Pax</span>
                            {price2 > 0 && (
                              <span style={{ fontSize: 11, color: "var(--mid)" }}>
                                · {formatCurrency(price2)} (2 Pax)
                              </span>
                            )}
                          </div>

                          {/* Diff vs Allure */}
                          <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
                            <span
                              style={{
                                padding: "2px 6px",
                                borderRadius: 4,
                                fontWeight: 600,
                                background: diff > 5 ? "#dcfce7" : diff < -5 ? "#fee2e2" : "#fef9c3",
                                color: diff > 5 ? "#166534" : diff < -5 ? "#991b1b" : "#854d0e",
                              }}
                            >
                              {diff > 5
                                ? `Allure R$ ${Math.round(diff)} abaixo`
                                : diff < -5
                                ? `Allure R$ ${Math.round(Math.abs(diff))} acima`
                                : "Na média com Allure"}
                            </span>
                          </div>

                          {/* Inclusions */}
                          {latest.inclusions && latest.inclusions.length > 0 && (
                            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 8 }}>
                              {latest.inclusions.slice(0, 3).map((inc, i) => (
                                <InclusionBadge key={i} text={inc} />
                              ))}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div style={{ padding: "12px 0", fontSize: 12, color: "var(--mid)" }}>
                          Nenhuma coleta recente registrada.
                        </div>
                      )}
                    </div>

                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        borderTop: "1px solid var(--line)",
                        paddingTop: 10,
                        marginTop: 10,
                        fontSize: 11,
                        color: "var(--gold)",
                        fontWeight: 600,
                      }}
                    >
                      <span>{history.length} coletas no histórico</span>
                      <span style={{ display: "flex", alignItems: "center", gap: 2 }}>
                        Ver Análise Completa <ChevronRight size={12} />
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── TAB 2: GENERAL SCRAPING RUNS ── */}
        {activeTab === "runs" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {samplesByRun.length === 0 ? (
              <div className="card empty-state">
                <TrendingUp size={32} />
                <h3 style={{ fontFamily: "var(--serif)", fontWeight: 300, margin: "12px 0 8px" }}>
                  Sem amostras registradas
                </h3>
                <p style={{ margin: "0 0 20px", fontSize: 13 }}>
                  Use &quot;Coletar Preços&quot; para buscar tarifas no Booking ou aguarde a coleta automática diária.
                </p>
                {isAdmin && (
                  <button onClick={() => openScrape()} className="btn btn-gold">
                    <Play size={13} /> Coletar Preços
                  </button>
                )}
              </div>
            ) : (
              samplesByRun.map((sample) => {
                const isExpanded = expandedSample === sample.id;
                const validEntries = sample.competitors.filter((c) => c.finalPrice2Pax > 0);
                const avg2Pax =
                  validEntries.reduce((s, c) => s + c.finalPrice2Pax, 0) / (validEntries.length || 1);
                const priced = sample.competitors
                  .map((c) => displayPaxPrices(c.finalPrice1Pax, c.finalPrice2Pax))
                  .filter((p) => p.price1Pax > 0);
                const avg1Pax =
                  priced.reduce((s, p) => s + p.price1Pax, 0) / (priced.length || 1);
                const diff = avg1Pax - allurePrice;
                const isScraped = !!sample.scrapedAt;

                const absDiff = Math.abs(Math.round(diff));
                const diffLabel =
                  diff > 5
                    ? `Allure R$${absDiff} abaixo da média`
                    : diff < -5
                    ? `Allure R$${absDiff} acima da média`
                    : "Allure na média do mercado";
                const diffBg = diff > 5 ? "#f0fdf4" : diff < -5 ? "#fef2f2" : "#fffbeb";
                const diffColor = diff > 5 ? "#166534" : diff < -5 ? "#991b1b" : "#92400e";
                const diffBorder = diff > 5 ? "#bbf7d0" : diff < -5 ? "#fca5a5" : "#fcd34d";

                return (
                  <div key={sample.id} className="card" style={{ padding: 0 }}>
                    <div
                      style={{
                        padding: "16px 20px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 16,
                        cursor: "pointer",
                        borderBottom: isExpanded ? "1px solid var(--line)" : "none",
                      }}
                      onClick={() => setExpandedSample(isExpanded ? null : sample.id)}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <h3 style={{ fontFamily: "var(--serif)", fontSize: "1.05rem", fontWeight: 300, margin: 0 }}>
                            {sample.checkin && sample.checkout
                              ? formatDateRange(sample.checkin, sample.checkout)
                              : formatDateShort(sample.date)}
                          </h3>
                          {isScraped && (
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 3,
                                padding: "1px 7px",
                                borderRadius: "50px",
                                fontSize: 10,
                                background: "#f0fdf4",
                                color: "#166534",
                                border: "1px solid #bbf7d0",
                                fontFamily: "var(--sans)",
                              }}
                            >
                              <RefreshCw size={9} /> scraping automático
                            </span>
                          )}
                          {sample.notes && <span style={{ fontSize: 12, color: "var(--mid)" }}>{sample.notes}</span>}
                        </div>

                        <div style={{ display: "flex", alignItems: "center", gap: 20, marginTop: 8, flexWrap: "wrap" }}>
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

                          <div style={{ width: 1, height: 28, background: "var(--line)", flexShrink: 0 }} />

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

                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            gap: 2,
                            padding: "8px 16px",
                            borderRadius: 8,
                            fontSize: 12,
                            fontWeight: 600,
                            background: diffBg,
                            color: diffColor,
                            border: `1px solid ${diffBorder}`,
                            minWidth: 140,
                            textAlign: "center",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 16 }}>
                            {diff < -5 ? (
                              <ArrowUp size={15} strokeWidth={2.5} />
                            ) : diff > 5 ? (
                              <ArrowDown size={15} strokeWidth={2.5} />
                            ) : (
                              <Minus size={15} strokeWidth={2.5} />
                            )}
                            {formatCurrency(Math.abs(diff))}
                          </div>
                          <span style={{ fontSize: 10, fontWeight: 500, opacity: 0.85, lineHeight: 1.3 }}>
                            {diffLabel}
                          </span>
                        </div>
                        <div style={{ fontSize: 18, color: "var(--mid)" }}>{isExpanded ? "▲" : "▼"}</div>
                      </div>
                    </div>

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
                              <th style={{ textAlign: "right" }}>Concorrente vs Allure</th>
                            </tr>
                          </thead>
                          <tbody>
                            {sample.competitors.map((c, idx) => {
                              const { price1Pax: p1, price2Pax: p2 } = displayPaxPrices(
                                c.finalPrice1Pax,
                                c.finalPrice2Pax
                              );
                              const d = p1 > 0 ? p1 - allurePrice : null;
                              return (
                                <tr key={idx}>
                                  <td style={{ fontWeight: 500 }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                      {c.name}
                                    </div>
                                    {c.sqm && <div style={{ fontSize: 10, color: "var(--dim)" }}>{c.sqm} m²</div>}
                                  </td>
                                  <td style={{ textAlign: "right" }}>
                                    {p1 > 0 ? formatCurrency(p1) : "—"}
                                  </td>
                                  <td style={{ textAlign: "right", fontWeight: 500 }}>
                                    {p2 > 0 ? formatCurrency(p2) : "—"}
                                  </td>
                                  <td>
                                    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                                      {c.roomType && <span style={{ fontSize: 10, color: "var(--mid)" }}>{c.roomType}</span>}
                                      {c.inclusions && c.inclusions.length > 0 && (
                                        <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
                                          {c.inclusions.map((inc, ii) => (
                                            <InclusionBadge key={ii} text={inc} />
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  </td>
                                  <td style={{ fontSize: 11, color: "var(--mid)" }}>{c.cancellation ?? "—"}</td>
                                  <td style={{ textAlign: "right" }}>
                                    {d !== null ? (
                                      <span
                                        style={{
                                          display: "inline-flex",
                                          alignItems: "center",
                                          gap: 3,
                                          fontWeight: 500,
                                          color: d > 5 ? "#166534" : d < -5 ? "#991b1b" : "var(--mid)",
                                        }}
                                      >
                                        {d > 5 ? <ArrowDown size={10} /> : d < -5 ? <ArrowUp size={10} /> : <Minus size={10} />}
                                        {d > 0 ? "+" : ""}
                                        {formatCurrency(d)}
                                      </span>
                                    ) : (
                                      "—"
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* ── HOTEL DRILLDOWN MODAL ── */}
        {selectedHotel && (
          <div className="modal-backdrop" onClick={() => setSelectedHotel(null)}>
            <div className="modal-box" style={{ maxWidth: 740, maxHeight: "90vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                <div>
                  <span style={{ fontSize: 10, color: "var(--gold)", letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 600 }}>
                    Drilldown de Concorrente Individual
                  </span>
                  <h3 className="modal-title" style={{ margin: "2px 0 0", fontSize: "1.35rem" }}>
                    {selectedHotel.name}
                  </h3>
                </div>
                <button onClick={() => setSelectedHotel(null)} className="btn btn-ghost" style={{ padding: 6 }}>
                  <X size={18} />
                </button>
              </div>

              {/* Booking link & meta bar */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "12px 16px",
                  background: "var(--paper-2)",
                  borderRadius: "var(--r-sm)",
                  border: "1px solid var(--line)",
                  marginBottom: 20,
                  flexWrap: "wrap",
                  gap: 10,
                }}
              >
                <div style={{ fontSize: 12, color: "var(--mid)" }}>
                  Monitoramento ativo em Moema / São Paulo
                </div>
                <a
                  href={selectedHotel.bookingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-outline"
                  style={{ fontSize: 11, display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 12px" }}
                >
                  <ExternalLink size={12} /> Abrir Página no Booking.com
                </a>
              </div>

              {/* History Table */}
              <div>
                <h4 style={{ fontSize: 13, fontWeight: 600, color: "var(--navy)", marginBottom: 10 }}>
                  Histórico de Tarifas Coletadas
                </h4>

                {(() => {
                  const hotelHistory = getHotelHistory(selectedHotel.name);
                  if (hotelHistory.length === 0) {
                    return (
                      <div style={{ padding: "32px 0", textAlign: "center", color: "var(--mid)", fontSize: 12 }}>
                        Nenhuma coleta registrada para este hotel ainda.
                      </div>
                    );
                  }

                  return (
                    <table className="data-table" style={{ width: "100%", fontSize: 12 }}>
                      <thead>
                        <tr>
                          <th>Data / Período</th>
                          <th style={{ textAlign: "right" }}>1 Pax</th>
                          <th style={{ textAlign: "right" }}>2 Pax</th>
                          <th>Inclusões / Quarto</th>
                          <th style={{ textAlign: "right" }}>vs Allure Std. ({formatCurrency(allurePrice)})</th>
                        </tr>
                      </thead>
                      <tbody>
                        {hotelHistory.map((h, i) => {
                          const diff = h.price1Pax > 0 ? h.price1Pax - allurePrice : null;
                          return (
                            <tr key={i}>
                              <td>
                                <strong>
                                  {h.checkin && h.checkout
                                    ? formatDateRange(h.checkin, h.checkout)
                                    : formatDateShort(h.date)}
                                </strong>
                              </td>
                              <td style={{ textAlign: "right", fontFamily: "var(--serif)", fontSize: 13 }}>
                                {h.price1Pax > 0 ? formatCurrency(h.price1Pax) : "—"}
                              </td>
                              <td style={{ textAlign: "right", fontFamily: "var(--serif)", fontSize: 13 }}>
                                {h.price2Pax > 0 ? formatCurrency(h.price2Pax) : "—"}
                              </td>
                              <td>
                                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                                  {h.inclusions?.map((inc, idx) => (
                                    <InclusionBadge key={idx} text={inc} />
                                  ))}
                                  {h.roomType && <span style={{ fontSize: 10, color: "var(--mid)" }}>{h.roomType}</span>}
                                </div>
                              </td>
                              <td style={{ textAlign: "right" }}>
                                {diff !== null ? (
                                  <span
                                    style={{
                                      fontWeight: 600,
                                      color: diff > 5 ? "#166534" : diff < -5 ? "#991b1b" : "var(--mid)",
                                    }}
                                  >
                                    {diff > 0 ? `+${formatCurrency(diff)}` : formatCurrency(diff)}
                                  </span>
                                ) : (
                                  "—"
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  );
                })()}
              </div>
            </div>
          </div>
        )}

        {/* ── Scrape modal ── */}
        {showScrape && (
          <div
            className="modal-backdrop"
            onClick={() => {
              if (!scraping) setShowScrape(false);
            }}
          >
            <div className="modal-box" style={{ maxWidth: scrapeDone || scrapeResultRows.length ? 720 : 620 }} onClick={(e) => e.stopPropagation()}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
                <div>
                  <p style={{ fontFamily: "var(--sans)", fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--gold)", margin: "0 0 4px" }}>
                    Booking.com
                  </p>
                  <h2 style={{ fontFamily: "var(--serif)", fontSize: "1.3rem", fontWeight: 300, margin: 0 }}>
                    Coletar Preços dos Concorrentes
                  </h2>
                  <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--mid)" }}>
                    O bot coleta no Booking e libera os preços hotel a hotel enquanto trabalha.
                  </p>
                </div>
                {!scraping && (
                  <button onClick={() => setShowScrape(false)} className="btn btn-ghost" style={{ padding: 6 }}>
                    <X size={18} />
                  </button>
                )}
              </div>

              <div
                style={{
                  marginBottom: 14,
                  padding: "10px 12px",
                  background: "#fffbeb",
                  border: "1px solid #fcd34d",
                  borderRadius: "var(--r-sm)",
                  fontSize: 12,
                  color: "#92400e",
                  lineHeight: 1.45,
                  display: "flex",
                  gap: 8,
                  alignItems: "flex-start",
                }}
              >
                <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 2 }} />
                <div>
                  <strong style={{ display: "block", marginBottom: 2 }}>Quanto maior o período, maior o tempo de trabalho do bot.</strong>
                  Cada combinação de data × hotel × adultos é uma visita ao Booking. Períodos longos, muitos hotéis ou “Ambos (1 e 2)” podem levar dezenas de minutos — os resultados vão aparecendo conforme cada concorrente é coletado.
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {!scrapeDone && (
                  <>
                    <div style={{ display: "flex", gap: 0, border: "1px solid var(--line)", borderRadius: "var(--r-sm)", overflow: "hidden" }}>
                      {(["period", "single"] as const).map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setScrapeMode(m)}
                          disabled={scraping}
                          style={{
                            flex: 1,
                            padding: "8px 0",
                            fontSize: 12,
                            fontFamily: "var(--sans)",
                            border: "none",
                            cursor: scraping ? "default" : "pointer",
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
                            <input
                              type="date"
                              className="form-input"
                              value={periodStart}
                              onChange={(e) => setPeriodStart(e.target.value)}
                              disabled={scraping}
                              required
                            />
                          </div>
                          <div>
                            <label className="form-label">Fim do período</label>
                            <input
                              type="date"
                              className="form-input"
                              value={periodEnd}
                              onChange={(e) => setPeriodEnd(e.target.value)}
                              disabled={scraping}
                              required
                            />
                          </div>
                        </div>

                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 0.8fr", gap: 10, alignItems: "end" }}>
                          <div>
                            <label className="form-label">Intervalo (dias)</label>
                            <select
                              className="form-select"
                              value={scrapeStep}
                              onChange={(e) => setScrapeStep(Number(e.target.value))}
                              disabled={scraping}
                            >
                              <option value={1}>Cada dia</option>
                              <option value={2}>A cada 2 dias</option>
                              <option value={3}>A cada 3 dias</option>
                              <option value={7}>Semanal</option>
                            </select>
                          </div>
                          <div>
                            <label className="form-label">Adultos</label>
                            <select
                              className="form-select"
                              value={scrapeAdults}
                              onChange={(e) => setScrapeAdults(e.target.value as 1 | 2 | "both")}
                              disabled={scraping}
                            >
                              <option value="both">Ambos (1 e 2)</option>
                              <option value={2}>2 adultos</option>
                              <option value={1}>1 adulto</option>
                            </select>
                          </div>
                          <div style={{ paddingBottom: 1 }}>
                            <label
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 7,
                                cursor: scraping ? "default" : "pointer",
                                fontSize: 12,
                                color: "var(--mid)",
                                fontFamily: "var(--sans)",
                                userSelect: "none",
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={weekendsOnly}
                                onChange={(e) => setWeekendsOnly(e.target.checked)}
                                disabled={scraping}
                              />
                              Só fins de semana
                            </label>
                          </div>
                        </div>

                        {periodStart && periodEnd && (
                          <div
                            style={{
                              padding: "8px 12px",
                              background: "var(--gold-soft)",
                              borderRadius: "var(--r-sm)",
                              border: "1px solid var(--gold-line)",
                              fontSize: 11,
                              color: "var(--navy)",
                              display: "flex",
                              flexDirection: "column",
                              gap: 4,
                            }}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                              <span>Carga estimada</span>
                              <strong>
                                {liveWorkload.estimatedDates} {liveWorkload.estimatedDates === 1 ? "data" : "datas"} ×{" "}
                                {liveWorkload.estimatedHotels} hotéis
                                {selectedHotelCount === 0 ? " (todos)" : ""}
                                {scrapeAdults === "both" ? " × 2 passes" : ""}
                              </strong>
                            </div>
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, color: "var(--mid)" }}>
                              <span>Tempo de trabalho do bot</span>
                              <strong style={{ color: "var(--navy)" }}>
                                ~{liveWorkload.estimatedMinutesMin}–{liveWorkload.estimatedMinutesMax} min
                              </strong>
                            </div>
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 0.6fr", gap: 10 }}>
                          <div>
                            <label className="form-label">Check-in</label>
                            <input
                              type="date"
                              className="form-input"
                              value={scrapeCheckin}
                              onChange={(e) => setScrapeCheckin(e.target.value)}
                              disabled={scraping}
                              required
                            />
                          </div>
                          <div>
                            <label className="form-label">Check-out</label>
                            <input
                              type="date"
                              className="form-input"
                              value={scrapeCheckout}
                              onChange={(e) => setScrapeCheckout(e.target.value)}
                              disabled={scraping}
                              required
                            />
                          </div>
                          <div>
                            <label className="form-label">Adultos</label>
                            <select
                              className="form-select"
                              value={scrapeAdults}
                              onChange={(e) => setScrapeAdults(e.target.value as 1 | 2 | "both")}
                              disabled={scraping}
                            >
                              <option value="both">Ambos (1 e 2)</option>
                              <option value={2}>2 adultos</option>
                              <option value={1}>1 adulto</option>
                            </select>
                          </div>
                        </div>
                        {scrapeCheckin && scrapeCheckout && (
                          <div
                            style={{
                              padding: "8px 12px",
                              background: "var(--gold-soft)",
                              borderRadius: "var(--r-sm)",
                              border: "1px solid var(--gold-line)",
                              fontSize: 11,
                              color: "var(--navy)",
                              display: "flex",
                              justifyContent: "space-between",
                              gap: 8,
                            }}
                          >
                            <span>Tempo de trabalho do bot</span>
                            <strong>
                              ~{liveWorkload.estimatedMinutesMin}–{liveWorkload.estimatedMinutesMax} min ·{" "}
                              {liveWorkload.estimatedHotels} hotéis
                            </strong>
                          </div>
                        )}
                      </>
                    )}

                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6, gap: 8, flexWrap: "wrap" }}>
                        <label className="form-label" style={{ margin: 0 }}>
                          Concorrentes ({selectedHotelCount === 0 ? `todos · ${activeHotelList.length}` : selectedHotelCount})
                        </label>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button
                            type="button"
                            className="btn btn-outline"
                            style={{ padding: "3px 8px", fontSize: 11 }}
                            onClick={selectAllHotels}
                            disabled={scraping}
                          >
                            <CheckSquare size={11} /> Todos
                          </button>
                          <button
                            type="button"
                            className="btn btn-outline"
                            style={{ padding: "3px 8px", fontSize: 11 }}
                            onClick={clearHotelSelection}
                            disabled={scraping || selectedHotelCount === 0}
                          >
                            <Square size={11} /> Limpar
                          </button>
                        </div>
                      </div>
                      <div style={{ position: "relative", marginBottom: 8 }}>
                        <Search size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--mid)" }} />
                        <input
                          type="text"
                          className="form-input"
                          placeholder="Filtrar por nome..."
                          value={hotelPickerSearch}
                          onChange={(e) => setHotelPickerSearch(e.target.value)}
                          disabled={scraping}
                          style={{ width: "100%", paddingLeft: 30, fontSize: 12, height: 34 }}
                        />
                      </div>
                      <div
                        style={{
                          maxHeight: 200,
                          overflowY: "auto",
                          border: "1px solid var(--line)",
                          borderRadius: "var(--r-sm)",
                          background: "var(--paper)",
                          padding: 6,
                          display: "flex",
                          flexDirection: "column",
                          gap: 2,
                        }}
                      >
                        {activeHotelList
                          .filter((h) =>
                            !hotelPickerSearch.trim() ||
                            h.name.toLowerCase().includes(hotelPickerSearch.trim().toLowerCase())
                          )
                          .map((h) => {
                            const checked = scrapeHotelIds.includes(h.id);
                            return (
                              <label
                                key={h.id}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 8,
                                  padding: "6px 8px",
                                  borderRadius: 4,
                                  cursor: scraping ? "default" : "pointer",
                                  background: checked ? "var(--gold-soft)" : "transparent",
                                  fontSize: 12,
                                  color: "var(--navy)",
                                  fontFamily: "var(--sans)",
                                }}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggleHotelId(h.id)}
                                  disabled={scraping}
                                />
                                <span style={{ flex: 1 }}>{h.name}</span>
                              </label>
                            );
                          })}
                      </div>
                      <p style={{ margin: "6px 0 0", fontSize: 11, color: "var(--mid)" }}>
                        Sem seleção = todos os hotéis ativos. Marque um ou mais para scrapar só esses.
                      </p>
                    </div>
                  </>
                )}

                {/* Progress sync'd with bot */}
                {(scraping || scrapeDone) && (
                  <div
                    style={{
                      padding: "12px 14px",
                      border: "1px solid var(--line)",
                      borderRadius: "var(--r-sm)",
                      background: "var(--paper-2)",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 8, fontSize: 12 }}>
                      <span style={{ color: "var(--navy)", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <RefreshCw size={12} style={scraping ? { animation: "spin 1s linear infinite" } : undefined} />
                        {scrapeJobStatus === "pending"
                          ? "Na fila do bot…"
                          : scrapeJobStatus === "running"
                          ? "Bot trabalhando…"
                          : scrapeJobStatus === "done"
                          ? "Coleta concluída"
                          : scrapeJobStatus === "error"
                          ? "Coleta falhou"
                          : "Sincronizando…"}
                      </span>
                      <span style={{ color: "var(--mid)", fontVariantNumeric: "tabular-nums" }}>
                        {scrapeJobStatus === "done" || scrapeJobStatus === "error" ? 100 : scrapeProgress}%
                      </span>
                    </div>
                    <div
                      style={{
                        height: 8,
                        borderRadius: 4,
                        background: "var(--line)",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          height: "100%",
                          width: `${
                            scrapeJobStatus === "done" || scrapeJobStatus === "error"
                              ? 100
                              : Math.max(2, Math.min(100, scrapeProgress))
                          }%`,
                          background:
                            scrapeJobStatus === "error"
                              ? "#ef4444"
                              : scrapeJobStatus === "done"
                              ? "#22c55e"
                              : "var(--gold)",
                          transition: "width 0.4s ease",
                        }}
                      />
                    </div>
                    {(scrapeEstimateLabel || scraping) && (
                      <p style={{ margin: "8px 0 0", fontSize: 11, color: "var(--mid)" }}>
                        {scrapeEstimateLabel ||
                          `Tempo de trabalho do bot: ~${liveWorkload.estimatedMinutesMin}–${liveWorkload.estimatedMinutesMax} min`}
                        {scraping ? " · preços liberados hotel a hotel" : ""}
                      </p>
                    )}
                  </div>
                )}

                {scrapeError && (
                  <div className="alert alert-error" style={{ fontSize: 12 }}>
                    <AlertCircle size={14} /> {scrapeError}
                  </div>
                )}

                {/* Resultados liberados (durante e ao fim da coleta) */}
                {scrapeResultRows.length > 0 && (
                  <div
                    style={{
                      border: "1px solid var(--line)",
                      borderRadius: "var(--r-sm)",
                      overflow: "hidden",
                      background: "var(--paper)",
                    }}
                  >
                    <div
                      style={{
                        padding: "10px 14px",
                        borderBottom: "1px solid var(--line)",
                        background: scrapeDone && scrapeSuccess ? "#f0fdf4" : "var(--paper-2)",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      <span style={{ fontSize: 12, fontWeight: 600, color: "var(--navy)" }}>
                        {scrapeDone && scrapeSuccess ? "Resultados da coleta" : "Resultados liberados"}
                      </span>
                      <span style={{ fontSize: 11, color: "var(--mid)" }}>
                        {scrapeResultRows.length} preço{scrapeResultRows.length === 1 ? "" : "s"} ·{" "}
                        {scrapeResultSamples.length} amostra{scrapeResultSamples.length === 1 ? "" : "s"}
                      </span>
                    </div>
                    <div style={{ maxHeight: 280, overflowY: "auto" }}>
                      <table className="data-table" style={{ width: "100%", fontSize: 12, margin: 0 }}>
                        <thead>
                          <tr>
                            <th>Hotel</th>
                            <th>Período</th>
                            <th style={{ textAlign: "right" }}>1 Pax</th>
                            <th style={{ textAlign: "right" }}>2 Pax</th>
                          </tr>
                        </thead>
                        <tbody>
                          {scrapeResultRows.map((row, i) => (
                            <tr key={`${row.sampleId}-${row.name}-${i}`}>
                              <td style={{ fontWeight: 500 }}>
                                {row.name}
                                {row.roomType ? (
                                  <div style={{ fontSize: 10, color: "var(--dim)", fontWeight: 400 }}>{row.roomType}</div>
                                ) : null}
                              </td>
                              <td style={{ color: "var(--mid)", whiteSpace: "nowrap" }}>{row.stay}</td>
                              <td style={{ textAlign: "right", fontFamily: "var(--serif)" }}>
                                {row.price1Pax > 0 ? formatCurrency(row.price1Pax) : "—"}
                              </td>
                              <td style={{ textAlign: "right", fontFamily: "var(--serif)", fontWeight: 600 }}>
                                {row.price2Pax > 0 ? formatCurrency(row.price2Pax) : "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {scrapeDone && scrapeSuccess && scrapeResultRows.length === 0 && (
                  <div
                    style={{
                      padding: "12px 14px",
                      borderRadius: "var(--r-sm)",
                      border: "1px solid #fcd34d",
                      background: "#fffbeb",
                      fontSize: 12,
                      color: "#92400e",
                    }}
                  >
                    Coleta finalizou, mas nenhum preço novo apareceu ainda. Feche e confira o histórico — ou rode de novo.
                  </div>
                )}

                <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                  {!scraping && !scrapeDone && (
                    <>
                      <button onClick={() => setShowScrape(false)} className="btn btn-outline">
                        Cancelar
                      </button>
                      <button
                        onClick={handleScrape}
                        className="btn btn-gold"
                        disabled={scrapeMode === "period" ? !periodStart || !periodEnd : !scrapeCheckin || !scrapeCheckout}
                      >
                        <RefreshCw size={13} /> Iniciar Coleta
                      </button>
                    </>
                  )}
                  {scraping && (
                    <button className="btn btn-outline" disabled style={{ opacity: 0.7 }}>
                      <RefreshCw size={13} style={{ animation: "spin 1s linear infinite" }} /> Bot em execução…
                    </button>
                  )}
                  {scrapeDone && (
                    <button
                      onClick={() => {
                        setShowScrape(false);
                        if (scrapeSuccess) {
                          setActiveTab("runs");
                          const runId = scrapeResultSamples[0]?.id;
                          if (runId) setExpandedSample(runId);
                        }
                      }}
                      className={scrapeSuccess ? "btn btn-gold" : "btn btn-outline"}
                    >
                      {scrapeSuccess ? <Check size={13} /> : null}{" "}
                      {scrapeSuccess ? "Ver na lista" : "Fechar"}
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
                    <input
                      type="date"
                      className="form-input"
                      value={formDate}
                      onChange={(e) => setFormDate(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <label className="form-label">Observações</label>
                    <input
                      type="text"
                      className="form-input"
                      value={formNotes}
                      onChange={(e) => setFormNotes(e.target.value)}
                      placeholder="Ex: Alta temporada, feriado..."
                    />
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
                      <input
                        list="known-competitors"
                        className="form-input"
                        value={entry.name}
                        onChange={(e) => updateEntry(idx, "name", e.target.value)}
                        placeholder="Nome do hotel"
                        required
                      />
                      <datalist id="known-competitors">
                        {KNOWN_COMPETITORS.map((c) => (
                          <option key={c} value={c} />
                        ))}
                      </datalist>
                    </div>
                    <div>
                      {idx === 0 && <label className="form-label">m²</label>}
                      <input
                        type="number"
                        className="form-input"
                        value={entry.sqm}
                        onChange={(e) => updateEntry(idx, "sqm", e.target.value)}
                        placeholder="—"
                        min={0}
                      />
                    </div>
                    <div>
                      {idx === 0 && <label className="form-label">1 Pax (R$)</label>}
                      <input
                        type="number"
                        className="form-input"
                        value={entry.price1Pax}
                        onChange={(e) => updateEntry(idx, "price1Pax", e.target.value)}
                        placeholder="0"
                        min={0}
                        step="0.01"
                        required
                      />
                    </div>
                    <div>
                      {idx === 0 && <label className="form-label">2 Pax (R$)</label>}
                      <input
                        type="number"
                        className="form-input"
                        value={entry.price2Pax}
                        onChange={(e) => updateEntry(idx, "price2Pax", e.target.value)}
                        placeholder="0"
                        min={0}
                        step="0.01"
                      />
                    </div>
                    <div>
                      {idx === 0 && <label className="form-label">Taxa</label>}
                      <input
                        type="number"
                        className="form-input"
                        value={entry.fee}
                        onChange={(e) => updateEntry(idx, "fee", e.target.value)}
                        placeholder="0"
                        min={0}
                        step="0.01"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => removeEntry(idx)}
                      className="btn btn-ghost"
                      style={{ padding: "7px 10px", color: "var(--danger)", marginBottom: 0 }}
                      disabled={entries.length === 1}
                    >
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
                  <button type="button" onClick={() => setShowForm(false)} className="btn btn-outline">
                    Cancelar
                  </button>
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
