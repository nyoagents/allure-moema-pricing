import { useState, useEffect } from "react";
import Head from "next/head";
import Image from "next/image";
import Link from "next/link";
import Layout from "@/components/layout/Layout";
import { useAuth } from "@/contexts/AuthContext";
import type { PricingResult } from "@/types";
import { formatCurrency, todayISO, addDays } from "@/lib/utils";
import { barToSeason } from "@/lib/pricing-engine";
import { ROOMS } from "@/data/rooms";
import { CalendarDays, TrendingUp, Coffee, Users, ArrowRight, RefreshCw, X, Calculator } from "lucide-react";
import { getRatesForRoom } from "@/lib/pricing-engine";

// Room image map (photos from allure-moema-nextjs)
const ROOM_IMAGES: Record<string, string> = {
  standard: "/images/accommodations/standard.webp",
  select: "/images/accommodations/select.webp",
  "standard-garden": "/images/accommodations/standard-garden.webp",
  "select-garden": "/images/accommodations/select-garden.webp",
  "select-plus": "/images/accommodations/select-plus.webp",
  suite: "/images/accommodations/suite.webp",
};

const BAR_CLASS: Record<string, string> = {
  alta: "bar-badge bar-alta",
  media: "bar-badge bar-media",
  normal: "bar-badge bar-normal",
  baixa: "bar-badge bar-baixa",
};

const SEASON_LABEL: Record<string, string> = {
  alta: "Alta Temporada",
  media: "Média Temporada",
  normal: "Temporada Normal",
  baixa: "Baixa Temporada",
};

interface DashboardData {
  date: string;
  pricing: PricingResult[];
  barPeriods: unknown[];
}

interface WeekDay {
  date: string;
  barLevel: number;
  season: string;
  source: string;
  standardPrice: number;
}

interface DayModal {
  date: string;
  barLevel: number;
  season: string;
  source: string;
}

interface SimDay {
  date: string;
  barLevel: number;
  season: string;
  barSource: string;
  price: number;
}

interface SimResult {
  breakdown: SimDay[];
  total: number;
  nights: number;
}

export default function DashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [weekData, setWeekData] = useState<WeekDay[]>([]);
  const [selectedDate, setSelectedDate] = useState(todayISO());
  const [pax, setPax] = useState<1 | 2>(1);
  const [breakfast, setBreakfast] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState("");
  const [dayModal, setDayModal] = useState<DayModal | null>(null);

  // Simulation modal
  const [simOpen, setSimOpen] = useState(false);
  const [simRoom, setSimRoom] = useState("standard");
  const [simCheckin, setSimCheckin] = useState(todayISO());
  const [simCheckout, setSimCheckout] = useState(addDays(todayISO(), 3));
  const [simPax, setSimPax] = useState<1 | 2>(1);
  const [simBreakfast, setSimBreakfast] = useState(false);
  const [simResult, setSimResult] = useState<SimResult | null>(null);
  const [simLoading, setSimLoading] = useState(false);

  const fetchPricing = async (date: string) => {
    setFetching(true);
    setError("");
    try {
      const res = await fetch(`/api/pricing/current?date=${date}`);
      if (!res.ok) throw new Error("Erro ao buscar preços");
      const json = await res.json();
      setData(json);

      // Fetch week
      const today = todayISO();
      const weekDays = Array.from({ length: 7 }, (_, i) => addDays(today, i));
      const weekResults: WeekDay[] = weekDays.map((d) => {
        const dayPricing = json.pricing as PricingResult[];
        const standard = dayPricing.find((p) => p.roomId === "standard");
        return {
          date: d,
          barLevel: standard?.barLevel ?? 5,
          season: standard?.season ?? "normal",
          source: standard?.barSource ?? "default",
          standardPrice: standard?.prices.without_breakfast_1pax ?? 0,
        };
      });
      setWeekData(weekResults);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setFetching(false);
    }
  };

  useEffect(() => {
    if (!authLoading && user) {
      fetchPricing(selectedDate);
    }
  }, [authLoading, user, selectedDate]);

  const runSimulation = async () => {
    setSimLoading(true);
    setSimResult(null);
    try {
      const params = new URLSearchParams({
        roomId: simRoom,
        checkin: simCheckin,
        checkout: simCheckout,
        pax: String(simPax),
        breakfast: String(simBreakfast),
      });
      const res = await fetch(`/api/pricing/simulate?${params}`);
      if (!res.ok) throw new Error("Erro ao calcular simulação");
      setSimResult(await res.json());
    } catch {
      // ignore
    } finally {
      setSimLoading(false);
    }
  };

  const getPrice = (p: PricingResult): number => {
    if (breakfast) {
      return pax === 2 ? p.prices.with_breakfast_2pax : p.prices.with_breakfast_1pax;
    }
    return pax === 2 ? p.prices.without_breakfast_2pax : p.prices.without_breakfast_1pax;
  };

  const today = todayISO();
  const [todayY, todayM, todayD] = today.split("-");

  if (authLoading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--cream)",
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            border: "2px solid var(--line)",
            borderTopColor: "var(--gold)",
            borderRadius: "50%",
            animation: "spin 0.8s linear infinite",
          }}
        />
      </div>
    );
  }

  const mainPricing = data?.pricing ?? [];
  const currentBAR = mainPricing[0]?.barLevel ?? 5;
  const currentSeason = mainPricing[0]?.season ?? "normal";

  return (
    <>
      <Head>
        <title>Dashboard — Allure Moema Precificação</title>
      </Head>
      <Layout
        title="Dashboard de Tarifas"
        subtitle={`${todayD}/${todayM}/${todayY} · Allure Moema Precificação`}
        user={user}
        actions={
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {/* Date picker */}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <CalendarDays size={15} color="var(--mid)" />
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="form-input"
                style={{ padding: "6px 10px", fontSize: 13, width: 150 }}
              />
            </div>

            <button
              onClick={() => fetchPricing(selectedDate)}
              disabled={fetching}
              className="btn btn-outline"
              style={{ gap: 6, padding: "6px 14px", fontSize: 13 }}
            >
              <RefreshCw size={14} style={{ animation: fetching ? "spin 0.8s linear infinite" : "none" }} />
              Atualizar
            </button>

            <Link
              href="/calculadora"
              className="btn btn-gold"
              style={{ gap: 6, padding: "6px 14px", fontSize: 13, textDecoration: "none" }}
            >
              <Calculator size={14} />
              Calculadora
            </Link>
          </div>
        }
      >
        {/* Hero stat bar */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 12,
            marginBottom: 28,
          }}
        >
          {/* BAR Level — destaque */}
          <div
            style={{
              background: "var(--navy)",
              borderRadius: "var(--r-lg)",
              padding: "20px 24px",
              position: "relative",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: -20,
                right: -20,
                width: 80,
                height: 80,
                borderRadius: "50%",
                background: "rgba(168,144,112,0.12)",
              }}
            />
            <span
              style={{
                fontFamily: "var(--sans)",
                fontSize: 10,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "rgba(168,144,112,0.7)",
                display: "block",
                marginBottom: 8,
              }}
            >
              BAR Vigente
            </span>
            <div
              style={{
                fontFamily: "var(--serif)",
                fontSize: "2.2rem",
                fontWeight: 300,
                color: "var(--cream)",
                letterSpacing: "-0.03em",
                lineHeight: 1,
              }}
            >
              BAR {currentBAR}
            </div>
            <div style={{ marginTop: 8 }}>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  padding: "2px 10px",
                  borderRadius: "50px",
                  fontFamily: "var(--sans)",
                  fontSize: 11,
                  fontWeight: 500,
                  background:
                    currentSeason === "alta" ? "rgba(200,121,65,0.25)" :
                    currentSeason === "media" ? "rgba(168,144,112,0.25)" :
                    currentSeason === "normal" ? "rgba(255,255,255,0.1)" :
                    "rgba(176,189,208,0.15)",
                  color:
                    currentSeason === "alta" ? "#f5c39a" :
                    currentSeason === "media" ? "#d4b896" :
                    currentSeason === "normal" ? "rgba(245,242,236,0.7)" :
                    "rgba(176,189,208,0.8)",
                  border: "1px solid rgba(255,255,255,0.08)",
                }}
              >
                {SEASON_LABEL[currentSeason]}
              </span>
            </div>
          </div>

          <div className="stat-card">
            <span className="stat-label">Studio Standard</span>
            <div className="stat-value">
              {formatCurrency(mainPricing.find((p) => p.roomId === "standard")?.prices.without_breakfast_1pax ?? 0)}
            </div>
            <div className="stat-sub">1 pax · sem café</div>
          </div>

          <div className="stat-card">
            <span className="stat-label">Fonte do BAR</span>
            <div
              style={{
                fontFamily: "var(--sans)",
                fontSize: 15,
                fontWeight: 500,
                color: "var(--navy)",
                marginTop: 4,
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background:
                    mainPricing[0]?.barSource === "event" ? "#d97706" :
                    mainPricing[0]?.barSource === "manual" ? "#1f9d55" :
                    "var(--gold)",
                }}
              />
              {mainPricing[0]?.barSource === "event"
                ? "Evento"
                : mainPricing[0]?.barSource === "manual"
                ? "Ajuste Manual"
                : "Histórico Sazonal"}
            </div>
            <div className="stat-sub">
              {mainPricing[0]?.barSource === "event"
                ? "Pressão tarifária"
                : mainPricing[0]?.barSource === "manual"
                ? "Definido pelo usuário"
                : "Calibração de sazonalidade"}
            </div>
          </div>

          <div className="stat-card">
            <span className="stat-label">Data Consultada</span>
            <div className="stat-value" style={{ fontSize: "1.3rem" }}>
              {selectedDate.split("-").reverse().join("/")}
            </div>
            <div className="stat-sub">
              {selectedDate === today ? "✦ Hoje" : "Data específica"}
            </div>
          </div>
        </div>

        {/* Filter options */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginBottom: 20,
            padding: "12px 16px",
            background: "var(--paper)",
            border: "1px solid var(--line)",
            borderRadius: "var(--r-md)",
          }}
        >
          <span style={{ fontSize: 12, color: "var(--mid)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
            Exibir:
          </span>

          <div style={{ display: "flex", gap: 8 }}>
            {([1, 2] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPax(p)}
                className={`btn ${pax === p ? "btn-primary" : "btn-outline"}`}
                style={{ padding: "5px 14px", fontSize: 12, gap: 6 }}
              >
                <Users size={13} />
                {p} Pax
              </button>
            ))}
          </div>

          <div className="divider" style={{ width: 1, height: 24, margin: 0, background: "var(--line)" }} />

          <button
            onClick={() => setBreakfast((v) => !v)}
            className={`btn ${breakfast ? "btn-gold" : "btn-outline"}`}
            style={{ padding: "5px 14px", fontSize: 12, gap: 6 }}
          >
            <Coffee size={13} />
            {breakfast ? "Com café incluso" : "Sem café"}
          </button>
        </div>

        {/* Room pricing grid */}
        {error ? (
          <div className="alert alert-error">{error}</div>
        ) : fetching && !data ? (
          <div style={{ textAlign: "center", padding: "48px 0" }}>
            <div
              style={{
                width: 28,
                height: 28,
                border: "2px solid var(--line)",
                borderTopColor: "var(--gold)",
                borderRadius: "50%",
                animation: "spin 0.8s linear infinite",
                margin: "0 auto 12px",
              }}
            />
            <p style={{ color: "var(--mid)", fontSize: 13 }}>Calculando tarifas...</p>
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
              gap: 16,
              marginBottom: 32,
            }}
          >
            {ROOMS.map((room) => {
              const pricing = mainPricing.find((p) => p.roomId === room.id);
              const price = pricing ? getPrice(pricing) : 0;
              const barLevel = pricing?.barLevel ?? 5;
              const season = pricing?.season ?? "normal";

              return (
                <div
                  key={room.id}
                  className="animate-fade"
                  style={{
                    background: "var(--paper)",
                    border: "1px solid var(--line)",
                    borderRadius: "var(--r-lg)",
                    overflow: "hidden",
                    transition: "box-shadow 0.2s var(--ease-out), transform 0.2s var(--ease-out)",
                    boxShadow: "var(--shadow-sm)",
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = "var(--shadow-md)"; (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = "var(--shadow-sm)"; (e.currentTarget as HTMLElement).style.transform = "translateY(0)"; }}
                >
                  {/* Room photo */}
                  <div style={{ position: "relative", height: 140, overflow: "hidden" }}>
                    <Image
                      src={ROOM_IMAGES[room.id] ?? "/images/accommodations/standard.webp"}
                      alt={room.name}
                      fill
                      style={{ objectFit: "cover" }}
                      sizes="(max-width: 640px) 100vw, 340px"
                    />
                    {/* Gradient overlay */}
                    <div
                      style={{
                        position: "absolute",
                        inset: 0,
                        background: "linear-gradient(to top, rgba(7,23,34,0.55) 0%, transparent 55%)",
                      }}
                    />
                    {/* BAR badge sobre a foto */}
                    <div style={{ position: "absolute", top: 10, right: 10 }}>
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          padding: "3px 10px",
                          borderRadius: "50px",
                          fontFamily: "var(--sans)",
                          fontSize: 11,
                          fontWeight: 600,
                          letterSpacing: "0.06em",
                          background:
                            season === "alta" ? "#c87941" :
                            season === "media" ? "var(--gold)" :
                            season === "normal" ? "rgba(0,0,0,0.4)" :
                            "rgba(28,46,74,0.7)",
                          color: "#fff",
                          backdropFilter: "blur(6px)",
                          border: "1px solid rgba(255,255,255,0.15)",
                        }}
                      >
                        BAR {barLevel}
                      </span>
                    </div>
                    {/* Room name over photo */}
                    <div style={{ position: "absolute", bottom: 10, left: 14 }}>
                      <span
                        style={{
                          fontFamily: "var(--sans)",
                          fontSize: 10,
                          letterSpacing: "0.14em",
                          textTransform: "uppercase",
                          color: "rgba(245,242,236,0.7)",
                        }}
                      >
                        {room.sqm}m²
                      </span>
                    </div>
                  </div>

                  {/* Content */}
                  <div style={{ padding: "16px 18px 18px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                      <div>
                        <h3 style={{ fontFamily: "var(--serif)", fontSize: "1.05rem", fontWeight: 300, color: "var(--navy)", margin: "0 0 2px" }}>
                          {room.name}
                        </h3>
                        <span style={{ fontFamily: "var(--sans)", fontSize: 11, color: "var(--mid)", letterSpacing: "0.06em" }}>
                          {room.maxGuests} hóspedes ·{" "}
                          {room.stayType === "both" ? "short & long" : room.stayType === "short" ? "short stay" : "long stay"}
                        </span>
                      </div>
                    </div>

                    <div style={{ height: 1, background: "var(--line)", margin: "12px 0" }} />

                    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
                      <div>
                        <div
                          style={{
                            fontFamily: "var(--serif)",
                            fontSize: "1.75rem",
                            fontWeight: 300,
                            color: "var(--navy)",
                            letterSpacing: "-0.02em",
                            lineHeight: 1,
                          }}
                        >
                          {formatCurrency(price)}
                        </div>
                        <div
                          style={{
                            fontFamily: "var(--sans)",
                            fontSize: 11,
                            color: "var(--mid)",
                            marginTop: 3,
                            letterSpacing: "0.04em",
                          }}
                        >
                          {pax} pax · {breakfast ? "c/ café" : "s/ café"}
                        </div>
                      </div>

                      {pricing && (
                        <div style={{ textAlign: "right", fontSize: 11, color: "var(--mid)", lineHeight: 1.6 }}>
                          <div>1Px {formatCurrency(breakfast ? pricing.prices.with_breakfast_1pax : pricing.prices.without_breakfast_1pax)}</div>
                          <div>2Px {formatCurrency(breakfast ? pricing.prices.with_breakfast_2pax : pricing.prices.without_breakfast_2pax)}</div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* 7-day outlook */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Próximos 7 dias</h3>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--mid)" }}>
              <TrendingUp size={14} />
              Studio Standard · 1 pax · sem café
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 8 }}>
            {weekData.map((day) => {
              const [y, m, d] = day.date.split("-");
              const isToday = day.date === today;
              const season = barToSeason(day.barLevel);
              const barClass = BAR_CLASS[season] ?? "bar-badge bar-normal";

              return (
                <div
                  key={day.date}
                  onClick={() => {
                    setSelectedDate(day.date);
                    setDayModal({ date: day.date, barLevel: day.barLevel, season: day.season, source: day.source });
                  }}
                  style={{
                    textAlign: "center",
                    padding: "12px 8px",
                    borderRadius: "var(--r-md)",
                    border: `1.5px solid ${isToday ? "var(--navy)" : "var(--line)"}`,
                    background: isToday ? "rgba(28,46,74,0.04)" : "transparent",
                    cursor: "pointer",
                    transition: "all 0.15s",
                  }}
                >
                  <div style={{ fontSize: 11, color: "var(--mid)", marginBottom: 4 }}>
                    {new Date(`${y}-${m}-${d}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "short" })}
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 500, color: "var(--navy)", marginBottom: 6 }}>{d}</div>
                  <div className={barClass} style={{ fontSize: 10, padding: "1px 6px", display: "inline-flex" }}>
                    {day.barLevel}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--navy)", marginTop: 6, fontFamily: "var(--serif)" }}>
                    {formatCurrency(day.standardPrice)}
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end" }}>
            <a href="/calendario" style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--gold)", textDecoration: "none" }}>
              Ver calendário completo
              <ArrowRight size={14} />
            </a>
          </div>
        </div>

        {/* ── Simulation modal ──────────────────────────────────────────────── */}
        {simOpen && (
          <div className="modal-backdrop" onClick={() => setSimOpen(false)}>
            <div
              className="modal-box"
              style={{ maxWidth: 680, maxHeight: "90vh", overflowY: "auto" }}
              onClick={e => e.stopPropagation()}
            >
              {/* Header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
                <div>
                  <p style={{ fontFamily: "var(--sans)", fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--gold)", margin: "0 0 4px" }}>
                    Simulação de Tarifa
                  </p>
                  <h2 style={{ fontFamily: "var(--serif)", fontSize: "1.4rem", fontWeight: 300, margin: 0 }}>
                    Calcule o valor de uma estadia
                  </h2>
                </div>
                <button onClick={() => setSimOpen(false)} className="btn btn-ghost" style={{ padding: 6 }}>
                  <X size={18} />
                </button>
              </div>

              <div style={{ height: 1, background: "var(--line)", margin: "0 0 20px" }} />

              {/* Controls */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
                {/* Room */}
                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--mid)", display: "block", marginBottom: 6 }}>
                    Tipo de quarto
                  </label>
                  <select
                    value={simRoom}
                    onChange={e => { setSimRoom(e.target.value); setSimResult(null); }}
                    className="form-input"
                    style={{ width: "100%", fontSize: 14 }}
                  >
                    {ROOMS.map(r => (
                      <option key={r.id} value={r.id}>{r.name} — {r.sqm}m²</option>
                    ))}
                  </select>
                </div>

                {/* Check-in */}
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--mid)", display: "block", marginBottom: 6 }}>
                    Check-in
                  </label>
                  <input
                    type="date"
                    value={simCheckin}
                    onChange={e => { setSimCheckin(e.target.value); setSimResult(null); }}
                    className="form-input"
                    style={{ width: "100%", fontSize: 14 }}
                  />
                </div>

                {/* Check-out */}
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--mid)", display: "block", marginBottom: 6 }}>
                    Check-out
                  </label>
                  <input
                    type="date"
                    value={simCheckout}
                    onChange={e => { setSimCheckout(e.target.value); setSimResult(null); }}
                    className="form-input"
                    style={{ width: "100%", fontSize: 14 }}
                  />
                </div>

                {/* Hóspedes */}
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--mid)", display: "block", marginBottom: 6 }}>
                    Hóspedes
                  </label>
                  <div style={{ display: "flex", gap: 8 }}>
                    {([1, 2] as const).map(n => (
                      <button
                        key={n}
                        onClick={() => { setSimPax(n); setSimResult(null); }}
                        className={simPax === n ? "btn btn-gold" : "btn btn-outline"}
                        style={{ flex: 1, gap: 6 }}
                      >
                        <Users size={13} />
                        {n} {n === 1 ? "adulto" : "adultos"}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Café */}
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--mid)", display: "block", marginBottom: 6 }}>
                    Café da manhã
                  </label>
                  <div style={{ display: "flex", gap: 8 }}>
                    {[false, true].map(v => (
                      <button
                        key={String(v)}
                        onClick={() => { setSimBreakfast(v); setSimResult(null); }}
                        className={simBreakfast === v ? "btn btn-gold" : "btn btn-outline"}
                        style={{ flex: 1, gap: 6 }}
                      >
                        <Coffee size={13} />
                        {v ? "Com café" : "Sem café"}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Calculate button */}
              <button
                onClick={runSimulation}
                disabled={simLoading || simCheckin >= simCheckout}
                className="btn btn-gold"
                style={{ width: "100%", justifyContent: "center", padding: "10px", fontSize: 14, marginBottom: simResult ? 24 : 0 }}
              >
                {simLoading
                  ? <><RefreshCw size={14} style={{ animation: "spin 0.8s linear infinite" }} /> Calculando...</>
                  : <><Calculator size={14} /> Calcular simulação</>}
              </button>

              {/* Results */}
              {simResult && (
                <>
                  {/* Summary bar */}
                  <div style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "14px 18px", borderRadius: "var(--r-md)",
                    background: "var(--navy)", color: "#fff", marginBottom: 16,
                  }}>
                    <div>
                      <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 2, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                        Total da estadia · {simResult.nights} {simResult.nights === 1 ? "noite" : "noites"}
                      </div>
                      <div style={{ fontFamily: "var(--serif)", fontSize: "1.6rem", fontWeight: 300 }}>
                        {formatCurrency(simResult.total)}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 2 }}>Média por noite</div>
                      <div style={{ fontSize: "1.1rem", fontWeight: 500 }}>
                        {formatCurrency(simResult.total / simResult.nights)}
                      </div>
                    </div>
                  </div>

                  {/* Day breakdown */}
                  <table className="data-table" style={{ fontSize: 12, width: "100%" }}>
                    <thead>
                      <tr>
                        <th>Data</th>
                        <th>Dia</th>
                        <th style={{ textAlign: "center" }}>BAR</th>
                        <th style={{ textAlign: "center" }}>Temporada</th>
                        <th style={{ textAlign: "right" }}>Tarifa</th>
                      </tr>
                    </thead>
                    <tbody>
                      {simResult.breakdown.map((d) => {
                        const dt = new Date(d.date + "T12:00:00");
                        const weekday = dt.toLocaleDateString("pt-BR", { weekday: "short" });
                        const dateLabel = dt.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
                        const season = barToSeason(d.barLevel);
                        const barCls = BAR_CLASS[season] ?? "bar-badge bar-normal";
                        return (
                          <tr key={d.date}>
                            <td style={{ fontWeight: 500 }}>{dateLabel}</td>
                            <td style={{ color: "var(--mid)", textTransform: "capitalize" }}>{weekday}</td>
                            <td style={{ textAlign: "center" }}>
                              <span className={barCls} style={{ fontSize: 10, padding: "1px 6px" }}>
                                {d.barLevel}
                              </span>
                            </td>
                            <td style={{ textAlign: "center" }}>
                              <span className={`season-chip ${season}`} style={{ fontSize: 10 }}>
                                {SEASON_LABEL[season]}
                              </span>
                            </td>
                            <td style={{ textAlign: "right", fontWeight: 600, fontFamily: "var(--serif)" }}>
                              {formatCurrency(d.price)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr style={{ background: "var(--paper-2)" }}>
                        <td colSpan={4} style={{ fontWeight: 600 }}>
                          Total · {simResult.nights} {simResult.nights === 1 ? "noite" : "noites"}
                        </td>
                        <td style={{ textAlign: "right", fontWeight: 700, fontSize: 14, fontFamily: "var(--serif)", color: "var(--navy)" }}>
                          {formatCurrency(simResult.total)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </>
              )}
            </div>
          </div>
        )}

        {/* Day detail modal */}
        {dayModal && (
          <div className="modal-backdrop" onClick={() => setDayModal(null)}>
            <div className="modal-box" style={{ maxWidth: 540 }} onClick={e => e.stopPropagation()}>
              {/* Header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
                <div>
                  <p style={{ fontFamily: "var(--sans)", fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--gold)", margin: "0 0 4px" }}>
                    Tarifas do dia
                  </p>
                  <h2 style={{ fontFamily: "var(--serif)", fontSize: "1.5rem", fontWeight: 300, margin: "0 0 8px" }}>
                    {new Date(dayModal.date + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}
                  </h2>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <span style={{
                      display: "inline-flex", alignItems: "center", padding: "2px 10px",
                      borderRadius: "50px", fontSize: 12, fontWeight: 600,
                      background: "var(--gold-soft)", border: "1px solid var(--gold-line)", color: "var(--navy)",
                    }}>
                      BAR {dayModal.barLevel}
                    </span>
                    <span className={`season-chip ${dayModal.season}`}>{SEASON_LABEL[dayModal.season]}</span>
                    <span style={{ fontSize: 11, color: "var(--mid)" }}>
                      {dayModal.source === "firestore" ? "configurado manualmente" : dayModal.source === "historical" ? "referência histórica" : "padrão BAR 5"}
                    </span>
                  </div>
                </div>
                <button onClick={() => setDayModal(null)} className="btn btn-ghost" style={{ padding: 6 }}>
                  <X size={18} />
                </button>
              </div>

              <div style={{ height: 1, background: "var(--line)", margin: "0 0 16px" }} />

              {/* Price table — all rooms */}
              <table className="data-table" style={{ fontSize: 12, marginBottom: 20, tableLayout: "fixed", width: "100%" }}>
                <thead>
                  <tr>
                    <th style={{ width: "30%" }}>Quarto</th>
                    <th style={{ width: "17.5%", textAlign: "right" }}>S/Café 1Px</th>
                    <th style={{ width: "17.5%", textAlign: "right" }}>S/Café 2Px</th>
                    <th style={{ width: "17.5%", textAlign: "right" }}>C/Café 1Px</th>
                    <th style={{ width: "17.5%", textAlign: "right" }}>C/Café 2Px</th>
                  </tr>
                </thead>
                <tbody>
                  {ROOMS.map((room) => {
                    const rates = getRatesForRoom(room.id, dayModal.barLevel);
                    return (
                      <tr key={room.id}>
                        <td style={{ fontWeight: 500 }}>{room.name}</td>
                        <td style={{ textAlign: "right" }}>{formatCurrency(rates?.without_breakfast_1pax ?? 0)}</td>
                        <td style={{ textAlign: "right" }}>{formatCurrency(rates?.without_breakfast_2pax ?? 0)}</td>
                        <td style={{ textAlign: "right" }}>{formatCurrency(rates?.with_breakfast_1pax ?? 0)}</td>
                        <td style={{ textAlign: "right" }}>{formatCurrency(rates?.with_breakfast_2pax ?? 0)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button onClick={() => setDayModal(null)} className="btn btn-outline">Fechar</button>
                <a href="/calendario" className="btn btn-gold" style={{ textDecoration: "none" }}>
                  Abrir no Calendário
                  <ArrowRight size={13} />
                </a>
              </div>
            </div>
          </div>
        )}
      </Layout>
    </>
  );
}
