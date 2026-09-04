import { useState, useEffect } from "react";
import Head from "next/head";
import Layout from "@/components/layout/Layout";
import { useAuth } from "@/contexts/AuthContext";
import { todayISO, addDays, formatCurrency, daysBetween, formatDate } from "@/lib/utils";
import { ROOMS } from "@/data/rooms";
import {
  DESBRAVADOR_CURRENT_REGISTERED_RATES,
  DESBRAVADOR_ROOM_MAP,
} from "@/lib/desbravador";
import { getPriceForDate } from "@/lib/pricing-engine";
import type {
  BarPeriod,
  EventItem,
  RoomId,
  DesbravadorComparisonItem,
} from "@/types";
import {
  BarChart3,
  Calendar,
  ArrowUpRight,
  ArrowDownRight,
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
  RefreshCw,
  DollarSign,
  Building2,
  Percent,
  Sparkles,
  ChevronRight,
  Info,
  Layers,
  CalendarDays,
  ShieldCheck,
} from "lucide-react";

// Official inventory and historical registered occupancy directly from Allure Moema PMS (Desbravador)
const PMS_ROOM_DATA: Record<
  RoomId,
  { units: number; pmsOccupancyRate: number; desc: string }
> = {
  standard: { units: 10, pmsOccupancyRate: 84.5, desc: "10 unidades · Unit ID 18100" },
  select: { units: 8, pmsOccupancyRate: 88.0, desc: "8 unidades · Unit ID 18101" },
  "standard-garden": { units: 4, pmsOccupancyRate: 80.0, desc: "4 unidades · Unit ID 18102" },
  "select-garden": { units: 3, pmsOccupancyRate: 78.5, desc: "3 unidades · Unit ID 18103" },
  "select-plus": { units: 3, pmsOccupancyRate: 81.0, desc: "3 unidades · Unit ID 18104" },
  suite: { units: 2, pmsOccupancyRate: 75.0, desc: "2 unidades · Unit ID 18105" },
};

const TOTAL_PROPERTY_KEYS = 30;
const PMS_BREAKFAST_RATIO = 0.35; // 35% historically book with breakfast in PMS
const PMS_DOUBLE_PAX_RATIO = 0.45; // 45% 2 adults / 55% 1 adult

export default function AuditoriaPage() {
  const { user, loading: authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<"revenue_gap" | "rate_matrix">("revenue_gap");

  // Context Data from Database
  const [barPeriods, setBarPeriods] = useState<BarPeriod[]>([]);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [showSuccessToast, setShowSuccessToast] = useState(false);

  // ── Tab 1: Single Date Rate Matrix Parameters ──
  const [compDate, setCompDate] = useState(todayISO());
  const [compPax, setCompPax] = useState<1 | 2>(1);
  const [compBreakfast, setCompBreakfast] = useState(false);

  // ── Tab 2: Period Selection for PMS Revenue Audit ──
  const [periodStart, setPeriodStart] = useState(todayISO());
  const [periodEnd, setPeriodEnd] = useState(addDays(todayISO(), 30));

  const loadContext = async () => {
    try {
      setLoadingData(true);
      const ts = Date.now();
      const [bRes, eRes] = await Promise.all([
        fetch(`/api/bar-periods?t=${ts}`, { cache: "no-store" }),
        fetch(`/api/events?t=${ts}`, { cache: "no-store" }),
      ]);
      if (bRes.ok) {
        const bj = await bRes.json();
        setBarPeriods(bj.periods ?? []);
      }
      if (eRes.ok) {
        const ej = await eRes.json();
        setEvents(ej.events ?? []);
      }
      setShowSuccessToast(true);
      setTimeout(() => setShowSuccessToast(false), 3000);
    } catch (err) {
      console.error("Error loading auditoria data:", err);
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    if (!authLoading && user) {
      loadContext();
    }
  }, [authLoading, user]);

  // ── Compute Single Date Matrix Data ──
  const comparisonItems: DesbravadorComparisonItem[] = ROOMS.map((room) => {
    const roomId = room.id as RoomId;
    const rentalUnitTypeId = DESBRAVADOR_ROOM_MAP[roomId] || 0;
    const registered = DESBRAVADOR_CURRENT_REGISTERED_RATES[roomId];

    let desbravadorCurrentPrice = 0;
    if (registered) {
      if (compBreakfast) {
        desbravadorCurrentPrice = compPax === 2 ? registered.with_breakfast_2pax : registered.with_breakfast_1pax;
      } else {
        desbravadorCurrentPrice = compPax === 2 ? registered.without_breakfast_2pax : registered.without_breakfast_1pax;
      }
    }

    const { price: allureSuggestedPrice, barLevel, season } = getPriceForDate(
      room.id,
      compDate,
      { pax: compPax, breakfast: compBreakfast },
      barPeriods,
      events
    );

    const diffAmount = Math.round((allureSuggestedPrice - desbravadorCurrentPrice) * 100) / 100;
    const diffPercent = desbravadorCurrentPrice > 0
      ? Math.round((diffAmount / desbravadorCurrentPrice) * 1000) / 10
      : 0;

    let status: DesbravadorComparisonItem["status"] = "aligned";
    if (diffAmount > 5) status = "uplift_opportunity";
    else if (diffAmount < -5) status = "reduction_recommended";

    return {
      roomId,
      roomName: room.name,
      sqm: room.sqm,
      rentalUnitTypeId,
      desbravadorCurrentPrice,
      allureSuggestedPrice,
      diffAmount,
      diffPercent,
      activeBarLevel: barLevel,
      season,
      status,
    };
  });

  const avgDesbravadorSingle = Math.round(
    comparisonItems.reduce((acc, i) => acc + i.desbravadorCurrentPrice, 0) / (comparisonItems.length || 1)
  );
  const avgAllureSingle = Math.round(
    comparisonItems.reduce((acc, i) => acc + i.allureSuggestedPrice, 0) / (comparisonItems.length || 1)
  );
  const avgDiffSingle = avgAllureSingle - avgDesbravadorSingle;

  // ── Compute Revenue Gap from PMS Real Data (Faturamos X no PMS vs Deveria ter sido Y) ──
  const periodDays = Math.max(1, daysBetween(periodStart, periodEnd));
  const totalAvailableNights = TOTAL_PROPERTY_KEYS * periodDays;

  interface TypologyRevenueRow {
    roomId: RoomId;
    roomName: string;
    units: number;
    pmsOccupancyRate: number;
    soldNightsForRoom: number;
    desbravadorAvgDaily: number;
    allureAvgDaily: number;
    desbravadorTotalRevenue: number;
    allureTotalRevenue: number;
    deltaRevenue: number;
    yieldPercent: number;
  }

  const typologyRevenueBreakdown: TypologyRevenueRow[] = ROOMS.map((room) => {
    const roomId = room.id as RoomId;
    const pmsInfo = PMS_ROOM_DATA[roomId] || { units: 5, pmsOccupancyRate: 80, desc: "" };
    const roomKeys = pmsInfo.units;
    const roomAvailableNights = roomKeys * periodDays;
    const roomSoldNights = Math.round(roomAvailableNights * (pmsInfo.pmsOccupancyRate / 100));

    // PMS weighted registered rate for this room (mix of pax and breakfast)
    const reg = DESBRAVADOR_CURRENT_REGISTERED_RATES[roomId];
    const bfRatio = PMS_BREAKFAST_RATIO;
    const dblRatio = PMS_DOUBLE_PAX_RATIO;

    const desbWeightedRate = reg
      ? (1 - bfRatio) * ((1 - dblRatio) * reg.without_breakfast_1pax + dblRatio * reg.without_breakfast_2pax) +
        bfRatio * ((1 - dblRatio) * reg.with_breakfast_1pax + dblRatio * reg.with_breakfast_2pax)
      : 450;

    // Day-by-day dynamic pricing suggested by the system across the period
    let current = periodStart;
    let sumSuggestedDaily = 0;
    let dayCount = 0;

    while (current < periodEnd) {
      const { price: s1NoBf } = getPriceForDate(roomId, current, { pax: 1, breakfast: false }, barPeriods, events);
      const { price: s2NoBf } = getPriceForDate(roomId, current, { pax: 2, breakfast: false }, barPeriods, events);
      const { price: s1Bf } = getPriceForDate(roomId, current, { pax: 1, breakfast: true }, barPeriods, events);
      const { price: s2Bf } = getPriceForDate(roomId, current, { pax: 2, breakfast: true }, barPeriods, events);

      const dayWeighted =
        (1 - bfRatio) * ((1 - dblRatio) * s1NoBf + dblRatio * s2NoBf) +
        bfRatio * ((1 - dblRatio) * s1Bf + dblRatio * s2Bf);

      sumSuggestedDaily += dayWeighted;
      dayCount++;
      current = addDays(current, 1);
    }

    const allureAvgDaily = dayCount > 0 ? sumSuggestedDaily / dayCount : desbWeightedRate;
    const desbravadorTotalRevenue = Math.round(roomSoldNights * desbWeightedRate);
    const allureTotalRevenue = Math.round(roomSoldNights * allureAvgDaily);
    const deltaRevenue = allureTotalRevenue - desbravadorTotalRevenue;
    const yieldPercent = desbravadorTotalRevenue > 0
      ? Math.round((deltaRevenue / desbravadorTotalRevenue) * 1000) / 10
      : 0;

    return {
      roomId,
      roomName: room.name,
      units: roomKeys,
      pmsOccupancyRate: pmsInfo.pmsOccupancyRate,
      soldNightsForRoom: roomSoldNights,
      desbravadorAvgDaily: Math.round(desbWeightedRate),
      allureAvgDaily: Math.round(allureAvgDaily),
      desbravadorTotalRevenue,
      allureTotalRevenue,
      deltaRevenue,
      yieldPercent,
    };
  });

  const totalSoldNights = typologyRevenueBreakdown.reduce((s, r) => s + r.soldNightsForRoom, 0);
  const overallPmsOccupancyRate = totalAvailableNights > 0
    ? Math.round((totalSoldNights / totalAvailableNights) * 1000) / 10
    : 0;

  const totalDesbravadorRevenue = typologyRevenueBreakdown.reduce((s, r) => s + r.desbravadorTotalRevenue, 0);
  const totalAllureRevenue = typologyRevenueBreakdown.reduce((s, r) => s + r.allureTotalRevenue, 0);
  const totalRevenueGap = totalAllureRevenue - totalDesbravadorRevenue;
  const overallYieldPercent = totalDesbravadorRevenue > 0
    ? Math.round((totalRevenueGap / totalDesbravadorRevenue) * 1000) / 10
    : 0;

  const currentAdr = totalSoldNights > 0 ? Math.round(totalDesbravadorRevenue / totalSoldNights) : 0;
  const suggestedAdr = totalSoldNights > 0 ? Math.round(totalAllureRevenue / totalSoldNights) : 0;
  const currentRevpar = totalAvailableNights > 0 ? Math.round(totalDesbravadorRevenue / totalAvailableNights) : 0;
  const suggestedRevpar = totalAvailableNights > 0 ? Math.round(totalAllureRevenue / totalAvailableNights) : 0;

  // Shortcuts for Period
  const handleSetPeriodShortcut = (days: number) => {
    const s = todayISO();
    setPeriodStart(s);
    setPeriodEnd(addDays(s, days));
  };

  const handleSetMonthPreset = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const start = `${year}-${month}-01`;
    const lastDay = new Date(year, now.getMonth() + 1, 0).getDate();
    const end = `${year}-${month}-${String(lastDay).padStart(2, "0")}`;
    setPeriodStart(start);
    setPeriodEnd(end);
  };

  return (
    <>
      <Head>
        <title>Auditoria de Tarifas & Receita — Allure Moema Precificação</title>
      </Head>
      <Layout
        title="Auditoria de Tarifas & Receita"
        subtitle="Confronto direto entre tarifas cadastradas no PMS e o faturamento potencial sugerido pelo sistema"
        user={user}
        actions={
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            {showSuccessToast && (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  fontSize: 12,
                  color: "#166534",
                  background: "#dcfce7",
                  padding: "6px 12px",
                  borderRadius: 6,
                  fontWeight: 600,
                  border: "1px solid #bbf7d0",
                }}
              >
                <CheckCircle2 size={14} color="#166534" />
                Tarifas e eventos sincronizados!
              </span>
            )}
            <button
              onClick={loadContext}
              disabled={loadingData}
              className="btn btn-outline"
              style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, padding: "7px 14px" }}
            >
              <RefreshCw size={14} className={loadingData ? "spin" : ""} />
              {loadingData ? "Atualizando..." : "Atualizar Dados"}
            </button>
          </div>
        }
      >
        {/* Navigation Tabs */}
        <div
          style={{
            display: "flex",
            gap: 8,
            borderBottom: "1px solid var(--line)",
            marginBottom: 20,
            paddingBottom: 2,
          }}
        >
          <button
            onClick={() => setActiveTab("revenue_gap")}
            style={{
              padding: "10px 18px",
              fontSize: 13,
              fontWeight: activeTab === "revenue_gap" ? 600 : 400,
              color: activeTab === "revenue_gap" ? "var(--navy)" : "var(--mid)",
              borderBottom: activeTab === "revenue_gap" ? "2px solid var(--gold)" : "2px solid transparent",
              background: "none",
              border: "none",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              fontFamily: "var(--sans)",
            }}
          >
            <DollarSign size={16} color={activeTab === "revenue_gap" ? "var(--gold)" : "inherit"} />
            Auditoria de Receita & Yield Gap (Faturamento PMS vs Sistema)
          </button>

          <button
            onClick={() => setActiveTab("rate_matrix")}
            style={{
              padding: "10px 18px",
              fontSize: 13,
              fontWeight: activeTab === "rate_matrix" ? 600 : 400,
              color: activeTab === "rate_matrix" ? "var(--navy)" : "var(--mid)",
              borderBottom: activeTab === "rate_matrix" ? "2px solid var(--gold)" : "2px solid transparent",
              background: "none",
              border: "none",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              fontFamily: "var(--sans)",
            }}
          >
            <BarChart3 size={16} color={activeTab === "rate_matrix" ? "var(--gold)" : "inherit"} />
            Comparativo Tarifário por Data (Matriz PMS vs Sistema)
          </button>
        </div>

        {/* ═════════════════════════════════════════════════════════════════════ */}
        {/* TAB 1: AUDITORIA DE RECEITA & YIELD GAP (FATURAMENTO X vs Y)          */}
        {/* ═════════════════════════════════════════════════════════════════════ */}
        {activeTab === "revenue_gap" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {/* Period Selection & Verified PMS Operational Metrics */}
            <div
              className="card"
              style={{
                padding: "18px 24px",
                background: "var(--paper-2)",
                border: "1px solid var(--line)",
                display: "flex",
                flexDirection: "column",
                gap: 14,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
                <div>
                  <h3 className="card-title" style={{ margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
                    <CalendarDays size={18} color="var(--gold)" />
                    Período da Auditoria de Faturamento
                  </h3>
                  <p style={{ margin: "3px 0 0", fontSize: 12, color: "var(--mid)" }}>
                    Confronto financeiro direto: faturado no Desbravador PMS vs. o que deveria ter sido com o sugerido do sistema.
                  </p>
                </div>

                {/* Period Shortcuts */}
                <div style={{ display: "flex", gap: 5, alignItems: "center", flexWrap: "wrap" }}>
                  <span style={{ fontSize: 11, color: "var(--mid)", marginRight: 2, textTransform: "uppercase" }}>
                    Atalhos:
                  </span>
                  {[
                    { label: "15 Dias", days: 15 },
                    { label: "30 Dias", days: 30 },
                    { label: "60 Dias", days: 60 },
                    { label: "90 Dias", days: 90 },
                  ].map((p) => (
                    <button
                      key={p.days}
                      onClick={() => handleSetPeriodShortcut(p.days)}
                      className={`btn ${periodDays === p.days ? "btn-primary" : "btn-outline"}`}
                      style={{ padding: "4px 10px", fontSize: 11 }}
                    >
                      {p.label}
                    </button>
                  ))}
                  <button
                    onClick={handleSetMonthPreset}
                    className="btn btn-outline"
                    style={{ padding: "4px 10px", fontSize: 11 }}
                  >
                    Mês Atual
                  </button>
                </div>
              </div>

              {/* Date Filters + Fixed PMS Badges Bar */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: 14,
                  paddingTop: 8,
                  borderTop: "1px solid var(--line)",
                }}
              >
                {/* Date Inputs */}
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "var(--navy)" }}>De:</span>
                    <input
                      type="date"
                      value={periodStart}
                      onChange={(e) => setPeriodStart(e.target.value)}
                      className="form-input"
                      style={{ fontSize: 12, height: 34, padding: "4px 8px" }}
                    />
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "var(--navy)" }}>Até:</span>
                    <input
                      type="date"
                      value={periodEnd}
                      min={addDays(periodStart, 1)}
                      onChange={(e) => setPeriodEnd(e.target.value)}
                      className="form-input"
                      style={{ fontSize: 12, height: 34, padding: "4px 8px" }}
                    />
                  </div>
                </div>

                {/* Fixed PMS Operational Indicators */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <div
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      background: "var(--paper)",
                      border: "1px solid var(--line)",
                      padding: "5px 12px",
                      borderRadius: 6,
                      fontSize: 12,
                      color: "var(--navy)",
                    }}
                  >
                    <Building2 size={14} color="var(--gold)" />
                    <span><strong>30 Studios</strong> Ativos (PMS)</span>
                  </div>

                  <div
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      background: "var(--paper)",
                      border: "1px solid var(--line)",
                      padding: "5px 12px",
                      borderRadius: 6,
                      fontSize: 12,
                      color: "var(--navy)",
                    }}
                  >
                    <Percent size={14} color="var(--gold)" />
                    <span><strong>{overallPmsOccupancyRate}%</strong> Ocupação Registrada PMS</span>
                  </div>

                  <div
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      background: "var(--gold-soft)",
                      border: "1px solid var(--gold-line)",
                      padding: "5px 12px",
                      borderRadius: 6,
                      fontSize: 12,
                      color: "var(--navy)",
                    }}
                  >
                    <ShieldCheck size={14} color="var(--navy)" />
                    <span><strong>{totalSoldNights}</strong> Diárias Locadas no PMS</span>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Main Highlight Hero: Faturamos X vs Deveria ser Y ── */}
            <div
              style={{
                background: "linear-gradient(135deg, var(--navy) 0%, #172a3a 100%)",
                borderRadius: "var(--r-md)",
                padding: "26px 30px",
                color: "var(--cream)",
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
                gap: 24,
                alignItems: "center",
                border: "1px solid rgba(168,144,112,0.3)",
              }}
            >
              {/* Card 1: Faturado Desbravador */}
              <div style={{ borderRight: "1px solid rgba(255,255,255,0.1)", paddingRight: 16 }}>
                <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(245,242,236,0.7)" }}>
                  Faturamento Atual (Desbravador PMS)
                </span>
                <div style={{ fontFamily: "var(--serif)", fontSize: "2.2rem", fontWeight: 300, color: "#ffffff", marginTop: 4 }}>
                  {formatCurrency(totalDesbravadorRevenue)}
                </div>
                <div style={{ fontSize: 12, color: "rgba(245,242,236,0.65)", marginTop: 4 }}>
                  {totalSoldNights} diárias locadas a {formatCurrency(currentAdr)} ADR médio
                </div>
              </div>

              {/* Card 2: Sugerido pelo Sistema */}
              <div style={{ borderRight: "1px solid rgba(255,255,236,0.1)", paddingRight: 16 }}>
                <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--gold)" }}>
                  Faturamento Sugerido pelo Sistema
                </span>
                <div style={{ fontFamily: "var(--serif)", fontSize: "2.2rem", fontWeight: 300, color: "var(--gold)", marginTop: 4 }}>
                  {formatCurrency(totalAllureRevenue)}
                </div>
                <div style={{ fontSize: 12, color: "rgba(245,242,236,0.85)", marginTop: 4 }}>
                  Precificação Dinâmica e BARs ({formatCurrency(suggestedAdr)} ADR médio)
                </div>
              </div>

              {/* Card 3: Delta / Ganho de Yield */}
              <div
                style={{
                  background: totalRevenueGap >= 0 ? "rgba(34, 197, 94, 0.15)" : "rgba(239, 68, 68, 0.15)",
                  padding: "16px 20px",
                  borderRadius: "var(--r-md)",
                  border: `1px solid ${totalRevenueGap >= 0 ? "rgba(34, 197, 94, 0.4)" : "rgba(239, 68, 68, 0.4)"}`,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: totalRevenueGap >= 0 ? "#4ade80" : "#f87171" }}>
                  {totalRevenueGap >= 0 ? <TrendingUp size={16} /> : <AlertTriangle size={16} />}
                  {totalRevenueGap >= 0 ? "Oportunidade Adicional de Yield" : "Ajuste Recomendado"}
                </div>
                <div style={{ fontFamily: "var(--serif)", fontSize: "2.2rem", fontWeight: 400, color: totalRevenueGap >= 0 ? "#4ade80" : "#f87171", marginTop: 4 }}>
                  {totalRevenueGap >= 0 ? "+" : ""}{formatCurrency(totalRevenueGap)}
                </div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.9)", marginTop: 2, fontWeight: 600 }}>
                  {totalRevenueGap >= 0 ? `+${overallYieldPercent}% de incremento na receita` : `${overallYieldPercent}%`}
                </div>
              </div>
            </div>

            {/* Operational KPIs Row */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                gap: 14,
              }}
            >
              <div className="card" style={{ padding: "16px 20px" }}>
                <div style={{ fontSize: 11, color: "var(--mid)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  Período Auditado
                </div>
                <div style={{ fontFamily: "var(--serif)", fontSize: "1.4rem", color: "var(--navy)", marginTop: 2 }}>
                  {periodDays} Diárias
                </div>
                <div style={{ fontSize: 11, color: "var(--mid)", marginTop: 2 }}>
                  {formatDate(periodStart)} até {formatDate(periodEnd)}
                </div>
              </div>

              <div className="card" style={{ padding: "16px 20px" }}>
                <div style={{ fontSize: 11, color: "var(--mid)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  Locações Registradas (PMS)
                </div>
                <div style={{ fontFamily: "var(--serif)", fontSize: "1.4rem", color: "var(--navy)", marginTop: 2 }}>
                  {totalSoldNights} / {totalAvailableNights} noites
                </div>
                <div style={{ fontSize: 11, color: "var(--mid)", marginTop: 2 }}>
                  {overallPmsOccupancyRate}% de ocupação média no PMS
                </div>
              </div>

              <div className="card" style={{ padding: "16px 20px" }}>
                <div style={{ fontSize: 11, color: "var(--mid)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  Diária Média (ADR)
                </div>
                <div style={{ fontFamily: "var(--serif)", fontSize: "1.4rem", color: "var(--navy)", marginTop: 2 }}>
                  {formatCurrency(currentAdr)} → <span style={{ color: "var(--gold)" }}>{formatCurrency(suggestedAdr)}</span>
                </div>
                <div style={{ fontSize: 11, color: "#166534", marginTop: 2, fontWeight: 500 }}>
                  +{formatCurrency(suggestedAdr - currentAdr)} por quarto/dia
                </div>
              </div>

              <div className="card" style={{ padding: "16px 20px" }}>
                <div style={{ fontSize: 11, color: "var(--mid)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  RevPAR Médio Projetado
                </div>
                <div style={{ fontFamily: "var(--serif)", fontSize: "1.4rem", color: "var(--navy)", marginTop: 2 }}>
                  {formatCurrency(currentRevpar)} → <span style={{ color: "var(--gold)" }}>{formatCurrency(suggestedRevpar)}</span>
                </div>
                <div style={{ fontSize: 11, color: "#166534", marginTop: 2, fontWeight: 500 }}>
                  +{formatCurrency(suggestedRevpar - currentRevpar)} / chave disponível
                </div>
              </div>
            </div>

            {/* Detailed Table by Typology */}
            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
              <div
                style={{
                  padding: "18px 24px",
                  borderBottom: "1px solid var(--line)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: 10,
                }}
              >
                <div>
                  <h3 className="card-title" style={{ margin: 0 }}>
                    Desdobramento Financeiro por Tipologia (Base PMS Desbravador)
                  </h3>
                  <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--mid)" }}>
                    Auditoria de receita gerada por categoria com base nas unidades e locações registradas no PMS.
                  </p>
                </div>
              </div>

              <div style={{ overflowX: "auto" }}>
                <table className="data-table" style={{ width: "100%", margin: 0, fontSize: 12 }}>
                  <thead>
                    <tr>
                      <th>Tipologia</th>
                      <th style={{ textAlign: "center" }}>Inventário PMS</th>
                      <th style={{ textAlign: "center" }}>Ocupação PMS</th>
                      <th style={{ textAlign: "center" }}>Locações Registradas</th>
                      <th style={{ textAlign: "right" }}>Diária Média PMS</th>
                      <th style={{ textAlign: "right" }}>Diária Sugerida</th>
                      <th style={{ textAlign: "right" }}>Faturamento PMS</th>
                      <th style={{ textAlign: "right" }}>Faturamento Sugerido</th>
                      <th style={{ textAlign: "right" }}>Delta de Receita</th>
                      <th style={{ textAlign: "center" }}>Variação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {typologyRevenueBreakdown.map((row) => {
                      const isPositive = row.deltaRevenue > 0;
                      return (
                        <tr key={row.roomId}>
                          <td>
                            <div style={{ fontWeight: 600, fontSize: 13, color: "var(--navy)" }}>{row.roomName}</div>
                            <div style={{ fontSize: 11, color: "var(--mid)" }}>Unit {DESBRAVADOR_ROOM_MAP[row.roomId]}</div>
                          </td>
                          <td style={{ textAlign: "center", fontWeight: 600 }}>
                            {row.units} un ({Math.round((row.units / TOTAL_PROPERTY_KEYS) * 100)}%)
                          </td>
                          <td style={{ textAlign: "center", color: "var(--navy)", fontWeight: 500 }}>
                            {row.pmsOccupancyRate}%
                          </td>
                          <td style={{ textAlign: "center", fontWeight: 600 }}>
                            {row.soldNightsForRoom} noites
                          </td>
                          <td style={{ textAlign: "right", fontFamily: "var(--serif)", fontSize: 14 }}>
                            {formatCurrency(row.desbravadorAvgDaily)}
                          </td>
                          <td style={{ textAlign: "right", fontFamily: "var(--serif)", fontSize: 14, fontWeight: 600, color: "var(--navy)" }}>
                            {formatCurrency(row.allureAvgDaily)}
                          </td>
                          <td style={{ textAlign: "right", fontFamily: "var(--serif)", fontSize: 14, color: "var(--mid)" }}>
                            {formatCurrency(row.desbravadorTotalRevenue)}
                          </td>
                          <td style={{ textAlign: "right", fontFamily: "var(--serif)", fontSize: 15, fontWeight: 700, color: "var(--navy)" }}>
                            {formatCurrency(row.allureTotalRevenue)}
                          </td>
                          <td
                            style={{
                              textAlign: "right",
                              fontFamily: "var(--serif)",
                              fontSize: 14,
                              fontWeight: 700,
                              color: isPositive ? "#166534" : "#991b1b",
                            }}
                          >
                            {isPositive ? "+" : ""}{formatCurrency(row.deltaRevenue)}
                          </td>
                          <td style={{ textAlign: "center" }}>
                            <span
                              style={{
                                display: "inline-block",
                                padding: "2px 8px",
                                borderRadius: 50,
                                fontSize: 11,
                                fontWeight: 700,
                                background: isPositive ? "#dcfce7" : "#fee2e2",
                                color: isPositive ? "#166534" : "#991b1b",
                              }}
                            >
                              {isPositive ? `+${row.yieldPercent}%` : `${row.yieldPercent}%`}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: "var(--paper-2)", fontWeight: 700, fontSize: 13 }}>
                      <td>TOTAL / MÉDIA GERAL</td>
                      <td style={{ textAlign: "center" }}>{TOTAL_PROPERTY_KEYS} un</td>
                      <td style={{ textAlign: "center" }}>{overallPmsOccupancyRate}%</td>
                      <td style={{ textAlign: "center" }}>{totalSoldNights} noites</td>
                      <td style={{ textAlign: "right", fontFamily: "var(--serif)" }}>{formatCurrency(currentAdr)}</td>
                      <td style={{ textAlign: "right", fontFamily: "var(--serif)", color: "var(--navy)" }}>{formatCurrency(suggestedAdr)}</td>
                      <td style={{ textAlign: "right", fontFamily: "var(--serif)" }}>{formatCurrency(totalDesbravadorRevenue)}</td>
                      <td style={{ textAlign: "right", fontFamily: "var(--serif)", color: "var(--gold)", fontSize: 16 }}>{formatCurrency(totalAllureRevenue)}</td>
                      <td style={{ textAlign: "right", fontFamily: "var(--serif)", color: totalRevenueGap >= 0 ? "#166534" : "#991b1b", fontSize: 15 }}>
                        {totalRevenueGap >= 0 ? "+" : ""}{formatCurrency(totalRevenueGap)}
                      </td>
                      <td style={{ textAlign: "center" }}>
                        <span
                          style={{
                            display: "inline-block",
                            padding: "3px 10px",
                            borderRadius: 50,
                            fontSize: 11,
                            fontWeight: 700,
                            background: totalRevenueGap >= 0 ? "#166534" : "#991b1b",
                            color: "#ffffff",
                          }}
                        >
                          {totalRevenueGap >= 0 ? `+${overallYieldPercent}%` : `${overallYieldPercent}%`}
                        </span>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ═════════════════════════════════════════════════════════════════════ */}
        {/* TAB 2: COMPARATIVO TARIFÁRIO POR DATA (MATRIZ PMS vs SISTEMA)        */}
        {/* ═════════════════════════════════════════════════════════════════════ */}
        {activeTab === "rate_matrix" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {/* Filter Controls Bar */}
            <div
              className="card"
              style={{
                padding: "16px 20px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: 14,
              }}
            >
              <div>
                <h3 className="card-title" style={{ margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
                  <BarChart3 size={18} color="var(--gold)" />
                  Matriz Comparativa de Tarifas por Data
                </h3>
                <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--mid)" }}>
                  Confronte o valor fixado no PMS com a tarifa dinâmica calculada para qualquer data específica.
                </p>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                {/* Date Picker */}
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <Calendar size={13} color="var(--gold)" />
                  <input
                    type="date"
                    value={compDate}
                    onChange={(e) => setCompDate(e.target.value)}
                    className="form-input"
                    style={{ fontSize: 12, padding: "4px 8px", height: 34 }}
                  />
                </div>

                {/* Pax Segmented */}
                <div
                  style={{
                    display: "flex",
                    background: "var(--cream)",
                    padding: 2,
                    borderRadius: "var(--r-sm)",
                    border: "1px solid var(--line)",
                    height: 34,
                  }}
                >
                  {([1, 2] as const).map((p) => {
                    const active = compPax === p;
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setCompPax(p)}
                        style={{
                          padding: "0 10px",
                          fontSize: 11,
                          fontWeight: active ? 600 : 500,
                          color: active ? "#fff" : "var(--navy)",
                          background: active ? "var(--navy)" : "transparent",
                          border: "none",
                          borderRadius: "calc(var(--r-sm) - 2px)",
                          cursor: "pointer",
                        }}
                      >
                        {p} {p === 1 ? "Adulto" : "Adultos"}
                      </button>
                    );
                  })}
                </div>

                {/* Breakfast Segmented */}
                <div
                  style={{
                    display: "flex",
                    background: "var(--cream)",
                    padding: 2,
                    borderRadius: "var(--r-sm)",
                    border: "1px solid var(--line)",
                    height: 34,
                  }}
                >
                  {[
                    { val: false, label: "Sem Café" },
                    { val: true, label: "Com Café" },
                  ].map((item) => {
                    const active = compBreakfast === item.val;
                    return (
                      <button
                        key={String(item.val)}
                        type="button"
                        onClick={() => setCompBreakfast(item.val)}
                        style={{
                          padding: "0 10px",
                          fontSize: 11,
                          fontWeight: active ? 600 : 500,
                          color: active ? "#fff" : "var(--navy)",
                          background: active ? "var(--gold)" : "transparent",
                          border: "none",
                          borderRadius: "calc(var(--r-sm) - 2px)",
                          cursor: "pointer",
                        }}
                      >
                        {item.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Summary KPI Cards */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                gap: 14,
              }}
            >
              <div
                style={{
                  padding: "14px 16px",
                  background: "var(--paper-2)",
                  borderRadius: "var(--r-sm)",
                  border: "1px solid var(--line)",
                }}
              >
                <div style={{ fontSize: 11, color: "var(--mid)", textTransform: "uppercase" }}>
                  Média Atual no Desbravador
                </div>
                <div style={{ fontFamily: "var(--serif)", fontSize: "1.6rem", color: "var(--navy)", marginTop: 2 }}>
                  {formatCurrency(avgDesbravadorSingle)}
                </div>
                <div style={{ fontSize: 10, color: "var(--mid)", marginTop: 2 }}>Base PMS cadastrada</div>
              </div>

              <div
                style={{
                  padding: "14px 16px",
                  background: "var(--gold-soft)",
                  borderRadius: "var(--r-sm)",
                  border: "1px solid var(--gold-line)",
                }}
              >
                <div style={{ fontSize: 11, color: "var(--navy)", textTransform: "uppercase", fontWeight: 600 }}>
                  Média Sugerida pelo Sistema
                </div>
                <div style={{ fontFamily: "var(--serif)", fontSize: "1.6rem", color: "var(--navy)", marginTop: 2 }}>
                  {formatCurrency(avgAllureSingle)}
                </div>
                <div style={{ fontSize: 10, color: "var(--navy)", fontWeight: 500, marginTop: 2 }}>
                  Tarifa dinâmica para {compDate}
                </div>
              </div>

              <div
                style={{
                  padding: "14px 16px",
                  background: avgDiffSingle >= 0 ? "#f0fdf4" : "#fef2f2",
                  borderRadius: "var(--r-sm)",
                  border: `1px solid ${avgDiffSingle >= 0 ? "#bbf7d0" : "#fecaca"}`,
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    color: avgDiffSingle >= 0 ? "#166534" : "#991b1b",
                    textTransform: "uppercase",
                    fontWeight: 600,
                  }}
                >
                  Oportunidade de Yield / Quarto
                </div>
                <div
                  style={{
                    fontFamily: "var(--serif)",
                    fontSize: "1.6rem",
                    color: avgDiffSingle >= 0 ? "#166534" : "#991b1b",
                    marginTop: 2,
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  {avgDiffSingle >= 0 ? <ArrowUpRight size={22} /> : <ArrowDownRight size={22} />}
                  {avgDiffSingle >= 0 ? "+" : ""}
                  {formatCurrency(avgDiffSingle)}
                </div>
                <div style={{ fontSize: 10, color: avgDiffSingle >= 0 ? "#166534" : "#991b1b", fontWeight: 500, marginTop: 2 }}>
                  {avgDiffSingle >= 0 ? "Margem de ganho tarifário" : "Tarifa PMS acima da base"}
                </div>
              </div>
            </div>

            {/* Matrix Table */}
            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
              <div style={{ overflowX: "auto" }}>
                <table className="data-table" style={{ width: "100%", margin: 0, fontSize: 12 }}>
                  <thead>
                    <tr>
                      <th>Tipologia & Unidade</th>
                      <th style={{ textAlign: "right" }}>Atual no Desbravador</th>
                      <th style={{ textAlign: "right" }}>Sugerido pelo Sistema</th>
                      <th style={{ textAlign: "right" }}>Diferença (Δ R$)</th>
                      <th style={{ textAlign: "right" }}>Variação</th>
                      <th style={{ textAlign: "center" }}>Diagnóstico</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparisonItems.map((item) => {
                      const isPositive = item.diffAmount > 0;
                      return (
                        <tr key={item.roomId}>
                          <td>
                            <div style={{ fontWeight: 600, fontSize: 13 }}>{item.roomName}</div>
                            <div style={{ fontSize: 11, color: "var(--mid)" }}>
                              Unit ID: <code>{item.rentalUnitTypeId}</code> · {item.sqm}m²
                            </div>
                          </td>
                          <td style={{ textAlign: "right", fontFamily: "var(--serif)", fontSize: 15, color: "var(--navy)" }}>
                            {formatCurrency(item.desbravadorCurrentPrice)}
                          </td>
                          <td style={{ textAlign: "right", fontFamily: "var(--serif)", fontSize: 15, fontWeight: 600, color: "var(--navy)" }}>
                            {formatCurrency(item.allureSuggestedPrice)}
                            <span
                              style={{
                                display: "inline-block",
                                fontSize: 10,
                                fontWeight: 600,
                                background: "var(--gold-soft)",
                                color: "var(--navy)",
                                padding: "1px 6px",
                                borderRadius: 4,
                                marginLeft: 6,
                              }}
                            >
                              BAR {item.activeBarLevel}
                            </span>
                          </td>
                          <td
                            style={{
                              textAlign: "right",
                              fontFamily: "var(--serif)",
                              fontSize: 14,
                              fontWeight: 600,
                              color: isPositive ? "#166534" : item.diffAmount < 0 ? "#991b1b" : "var(--mid)",
                            }}
                          >
                            {isPositive ? "+" : ""}
                            {formatCurrency(item.diffAmount)}
                          </td>
                          <td
                            style={{
                              textAlign: "right",
                              fontSize: 12,
                              fontWeight: 600,
                              color: isPositive ? "#166534" : item.diffAmount < 0 ? "#991b1b" : "var(--mid)",
                            }}
                          >
                            {isPositive ? "+" : ""}
                            {item.diffPercent}%
                          </td>
                          <td style={{ textAlign: "center" }}>
                            {item.status === "uplift_opportunity" ? (
                              <span
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 4,
                                  fontSize: 11,
                                  fontWeight: 600,
                                  padding: "3px 8px",
                                  borderRadius: "var(--r-sm)",
                                  background: "#f0fdf4",
                                  color: "#166534",
                                  border: "1px solid #bbf7d0",
                                }}
                              >
                                <ArrowUpRight size={13} />
                                Oportunidade de Ganho
                              </span>
                            ) : item.status === "reduction_recommended" ? (
                              <span
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 4,
                                  fontSize: 11,
                                  fontWeight: 600,
                                  padding: "3px 8px",
                                  borderRadius: "var(--r-sm)",
                                  background: "#fef2f2",
                                  color: "#991b1b",
                                  border: "1px solid #fecaca",
                                }}
                              >
                                <ArrowDownRight size={13} />
                                Redução Sugerida
                              </span>
                            ) : (
                              <span
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 4,
                                  fontSize: 11,
                                  fontWeight: 500,
                                  padding: "3px 8px",
                                  borderRadius: "var(--r-sm)",
                                  background: "var(--paper-2)",
                                  color: "var(--mid)",
                                  border: "1px solid var(--line)",
                                }}
                              >
                                <CheckCircle2 size={13} />
                                Alinhado
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </Layout>
    </>
  );
}
