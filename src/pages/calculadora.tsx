import { useState, useEffect } from "react";
import Head from "next/head";
import Layout from "@/components/layout/Layout";
import { useAuth } from "@/contexts/AuthContext";
import { todayISO, addDays, formatCurrency, daysBetween } from "@/lib/utils";
import { ROOMS } from "@/data/rooms";
import {
  getPriceForDate,
  getDetailedPricingRationale,
  getRatesForRoom,
} from "@/lib/pricing-engine";
import { PricingRationaleModal } from "@/components/pricing/PricingRationaleModal";
import type {
  BarPeriod,
  EventItem,
  CompetitorSample,
  RoomId,
  SimulationRecord,
  SimulationDayBreakdown,
  PricingRationale,
} from "@/types";
import {
  Calculator,
  Calendar,
  Layers,
  History,
  BookmarkPlus,
  Trash2,
  ExternalLink,
  CheckCircle2,
  Info,
  Clock,
  Sparkles,
  Users,
  Coffee,
  RotateCcw,
  ArrowRight,
} from "lucide-react";

export default function CalculadoraPage() {
  const { user, loading: authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<"calculator" | "history">("calculator");

  // Calculator form
  const [checkin, setCheckin] = useState(todayISO());
  const [checkout, setCheckout] = useState(addDays(todayISO(), 3));
  const [selectedRoom, setSelectedRoom] = useState<RoomId>("standard");
  const [pax, setPax] = useState<1 | 2>(1);
  const [breakfast, setBreakfast] = useState(false);
  const [notes, setNotes] = useState("");

  // Context data
  const [barPeriods, setBarPeriods] = useState<BarPeriod[]>([]);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [samples, setSamples] = useState<CompetitorSample[]>([]);
  const [simulations, setSimulations] = useState<SimulationRecord[]>([]);

  const [savingSim, setSavingSim] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Selected rationale for modal
  const [selectedRationale, setSelectedRationale] = useState<PricingRationale | null>(null);

  // History detail modal
  const [historyDetailSim, setHistoryDetailSim] = useState<SimulationRecord | null>(null);

  useEffect(() => {
    async function loadData() {
      if (!user) return;
      try {
        const [pRes, eRes, cRes, sRes] = await Promise.all([
          fetch("/api/bar-periods"),
          fetch("/api/events"),
          fetch("/api/competitors"),
          fetch("/api/simulations"),
        ]);
        if (pRes.ok) {
          const pj = await pRes.json();
          setBarPeriods(pj.periods ?? []);
        }
        if (eRes.ok) {
          const ej = await eRes.json();
          setEvents(ej.events ?? []);
        }
        if (cRes.ok) {
          const cj = await cRes.json();
          setSamples(cj.samples ?? []);
        }
        if (sRes.ok) {
          const sj = await sRes.json();
          setSimulations(sj.simulations ?? []);
        }
      } catch (err) {
        console.error("Error loading simulation context:", err);
      }
    }
    if (!authLoading && user) {
      loadData();
    }
  }, [authLoading, user]);

  const nights = Math.max(1, daysBetween(checkin, checkout));

  // Compute daily breakdown for simulator
  const breakdown: SimulationDayBreakdown[] = [];
  let current = checkin;
  let total = 0;

  const dayNames = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

  while (current < checkout) {
    const { price, barLevel, barSource, season } = getPriceForDate(
      selectedRoom,
      current,
      { pax, breakfast },
      barPeriods,
      events
    );

    const dateObj = new Date(`${current}T12:00:00`);
    const dayOfWeek = dayNames[dateObj.getDay()];

    const dayEvents = events
      .filter((e) => {
        if (e.enabled === false) return false;
        const start = e.effectiveStartDate || (e.startDate ? addDays(e.startDate, -(e.leadInDays ?? 1)) : e.startDate);
        return current >= start && current <= e.endDate;
      })
      .map((e) => e.title);

    breakdown.push({
      date: current,
      dayOfWeek,
      barLevel,
      season,
      barSource,
      price,
      events: dayEvents,
    });

    total += price;
    current = addDays(current, 1);
  }

  const averagePerNight = nights > 0 ? Math.round(total / nights) : 0;
  const roomObj = ROOMS.find((r) => r.id === selectedRoom) ?? ROOMS[0];

  // Set duration shortcut
  const handleSetNights = (n: number) => {
    setCheckout(addDays(checkin, n));
  };

  const handleSaveSimulation = async () => {
    if (!user) return;
    setSavingSim(true);
    setSaveSuccess(false);
    try {
      const payload: Omit<SimulationRecord, "id" | "createdAt" | "userEmail"> = {
        roomId: selectedRoom,
        roomName: roomObj.name,
        checkin,
        checkout,
        nights,
        pax,
        breakfast,
        total,
        averagePerNight,
        breakdown,
        notes: notes.trim() || undefined,
      };

      const res = await fetch("/api/simulations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const data = await res.json();
        setSimulations((prev) => [data.simulation, ...prev]);
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3500);
      }
    } catch (err) {
      console.error("Failed to save simulation:", err);
    } finally {
      setSavingSim(false);
    }
  };

  const handleDeleteSimulation = async (id: string) => {
    if (!confirm("Deseja realmente remover esta simulação do histórico?")) return;
    try {
      const res = await fetch(`/api/simulations/${id}`, { method: "DELETE" });
      if (res.ok) {
        setSimulations((prev) => prev.filter((s) => s.id !== id));
        if (historyDetailSim?.id === id) setHistoryDetailSim(null);
      }
    } catch (err) {
      console.error("Failed to delete simulation:", err);
    }
  };

  const handleOpenRationaleForDay = (dateISO: string) => {
    const rat = getDetailedPricingRationale(
      dateISO,
      selectedRoom,
      { pax, breakfast },
      barPeriods,
      events,
      samples
    );
    setSelectedRationale(rat);
  };

  const handleLoadPastSimulation = (sim: SimulationRecord) => {
    setSelectedRoom(sim.roomId);
    setCheckin(sim.checkin);
    setCheckout(sim.checkout);
    setPax(sim.pax);
    setBreakfast(sim.breakfast);
    if (sim.notes) setNotes(sim.notes);
    setActiveTab("calculator");
  };

  return (
    <>
      <Head>
        <title>Calculadora & Histórico — Allure Moema Precificação</title>
      </Head>
      <Layout
        title="Calculadora de Tarifas"
        subtitle="Cálculo detalhado de estadias e histórico completo de simulações com racional"
        user={user}
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
            onClick={() => setActiveTab("calculator")}
            style={{
              padding: "10px 18px",
              fontSize: 13,
              fontWeight: activeTab === "calculator" ? 600 : 400,
              color: activeTab === "calculator" ? "var(--navy)" : "var(--mid)",
              borderBottom: activeTab === "calculator" ? "2px solid var(--gold)" : "2px solid transparent",
              background: "none",
              border: "none",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              fontFamily: "var(--sans)",
            }}
          >
            <Calculator size={16} color={activeTab === "calculator" ? "var(--gold)" : "inherit"} />
            Simulador de Estadia
          </button>

          <button
            onClick={() => setActiveTab("history")}
            style={{
              padding: "10px 18px",
              fontSize: 13,
              fontWeight: activeTab === "history" ? 600 : 400,
              color: activeTab === "history" ? "var(--navy)" : "var(--mid)",
              borderBottom: activeTab === "history" ? "2px solid var(--gold)" : "2px solid transparent",
              background: "none",
              border: "none",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              fontFamily: "var(--sans)",
            }}
          >
            <History size={16} color={activeTab === "history" ? "var(--gold)" : "inherit"} />
            Histórico de Cotações ({simulations.length})
          </button>
        </div>

        {activeTab === "calculator" ? (
          <div style={{ display: "grid", gridTemplateColumns: "360px 1fr", gap: 24, alignItems: "start" }}>
            {/* Left Column: Form Controls */}
            <div className="card" style={{ padding: "20px 22px" }}>
              <h3
                style={{
                  fontFamily: "var(--serif)",
                  fontSize: "1.2rem",
                  fontWeight: 400,
                  color: "var(--navy)",
                  margin: "0 0 16px",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <Calculator size={18} color="var(--gold)" />
                Parâmetros da Cotação
              </h3>

              {/* Room Type */}
              <div style={{ marginBottom: 16 }}>
                <label className="form-label">Tipologia de Quarto</label>
                <select
                  value={selectedRoom}
                  onChange={(e) => setSelectedRoom(e.target.value as RoomId)}
                  className="form-select"
                  style={{ width: "100%", fontSize: 13 }}
                >
                  {ROOMS.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} ({r.sqm}m²)
                    </option>
                  ))}
                </select>
              </div>

              {/* Checkin / Checkout */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
                <div>
                  <label className="form-label">Check-in</label>
                  <input
                    type="date"
                    value={checkin}
                    onChange={(e) => {
                      setCheckin(e.target.value);
                      if (e.target.value >= checkout) {
                        setCheckout(addDays(e.target.value, 1));
                      }
                    }}
                    className="form-input"
                    style={{ fontSize: 12 }}
                  />
                </div>
                <div>
                  <label className="form-label">Check-out</label>
                  <input
                    type="date"
                    value={checkout}
                    min={addDays(checkin, 1)}
                    onChange={(e) => setCheckout(e.target.value)}
                    className="form-input"
                    style={{ fontSize: 12 }}
                  />
                </div>
              </div>

              {/* Duration Shortcuts */}
              <div style={{ marginBottom: 16 }}>
                <span style={{ fontSize: 10, color: "var(--mid)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>
                  Atalhos de Duração
                </span>
                <div
                  style={{
                    display: "flex",
                    gap: 3,
                    marginTop: 4,
                    background: "var(--cream)",
                    padding: 3,
                    borderRadius: "var(--r-sm)",
                    border: "1px solid var(--line)",
                  }}
                >
                  {[1, 2, 3, 7, 14, 30].map((n) => {
                    const active = nights === n;
                    return (
                      <button
                        key={n}
                        type="button"
                        onClick={() => handleSetNights(n)}
                        style={{
                          flex: 1,
                          padding: "5px 0",
                          fontSize: 11,
                          fontWeight: active ? 600 : 500,
                          borderRadius: 4,
                          border: "none",
                          cursor: "pointer",
                          background: active ? "var(--navy)" : "transparent",
                          color: active ? "#ffffff" : "var(--navy)",
                          boxShadow: active ? "0 1px 3px rgba(0,0,0,0.12)" : "none",
                          transition: "all 0.15s ease",
                        }}
                      >
                        {n}N
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* PAX and Breakfast */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
                <div>
                  <label className="form-label" style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <Users size={12} color="var(--gold)" />
                    Hóspedes (PAX)
                  </label>
                  <div
                    style={{
                      display: "flex",
                      background: "var(--cream)",
                      padding: 3,
                      borderRadius: "var(--r-sm)",
                      border: "1px solid var(--line)",
                      height: 36,
                    }}
                  >
                    {([1, 2] as const).map((p) => {
                      const active = pax === p;
                      return (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setPax(p)}
                          style={{
                            flex: 1,
                            fontSize: 11,
                            fontWeight: active ? 600 : 500,
                            borderRadius: 4,
                            border: "none",
                            cursor: "pointer",
                            background: active ? "var(--navy)" : "transparent",
                            color: active ? "#ffffff" : "var(--navy)",
                            boxShadow: active ? "0 1px 3px rgba(0,0,0,0.12)" : "none",
                            transition: "all 0.15s ease",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: 4,
                          }}
                        >
                          <Users size={12} opacity={active ? 1 : 0.6} />
                          {p === 1 ? "1 Adulto" : "2 Adultos"}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="form-label" style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <Coffee size={12} color="var(--gold)" />
                    Café da Manhã
                  </label>
                  <div
                    style={{
                      display: "flex",
                      background: "var(--cream)",
                      padding: 3,
                      borderRadius: "var(--r-sm)",
                      border: "1px solid var(--line)",
                      height: 36,
                    }}
                  >
                    {[
                      { value: false, label: "Sem Café" },
                      { value: true, label: "Com Café" },
                    ].map((opt) => {
                      const active = breakfast === opt.value;
                      return (
                        <button
                          key={String(opt.value)}
                          type="button"
                          onClick={() => setBreakfast(opt.value)}
                          style={{
                            flex: 1,
                            fontSize: 11,
                            fontWeight: active ? 600 : 500,
                            borderRadius: 4,
                            border: "none",
                            cursor: "pointer",
                            background: active ? "var(--navy)" : "transparent",
                            color: active ? "#ffffff" : "var(--navy)",
                            boxShadow: active ? "0 1px 3px rgba(0,0,0,0.12)" : "none",
                            transition: "all 0.15s ease",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: 4,
                          }}
                        >
                          <Coffee size={12} opacity={active ? 1 : 0.6} />
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Optional Notes */}
              <div style={{ marginBottom: 20 }}>
                <label className="form-label">Anotações / Cliente (Opcional)</label>
                <input
                  type="text"
                  placeholder="Ex: Cotação para evento médico SP Expo"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="form-input"
                  style={{ width: "100%", fontSize: 12 }}
                />
              </div>

              {/* Save Button */}
              <button
                onClick={handleSaveSimulation}
                disabled={savingSim}
                className="btn btn-gold"
                style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
              >
                <BookmarkPlus size={16} />
                {savingSim ? "Salvando cotação..." : "Salvar no Histórico"}
              </button>

              {saveSuccess && (
                <div
                  style={{
                    marginTop: 10,
                    padding: "8px 12px",
                    background: "#f0fdf4",
                    color: "#166534",
                    borderRadius: "var(--r-sm)",
                    fontSize: 12,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <CheckCircle2 size={14} /> Cotação gravada no histórico com sucesso!
                </div>
              )}
            </div>

            {/* Right Column: Total Banner & Day-by-day Breakdown */}
            <div>
              {/* Grand Total Card */}
              <div
                style={{
                  background: "linear-gradient(135deg, var(--navy) 0%, #172a3a 100%)",
                  borderRadius: "var(--r-md)",
                  padding: "22px 26px",
                  color: "var(--cream)",
                  marginBottom: 20,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: 16,
                }}
              >
                <div>
                  <span
                    style={{
                      fontSize: 11,
                      letterSpacing: "0.12em",
                      textTransform: "uppercase",
                      color: "rgba(168,144,112,0.9)",
                      display: "block",
                      marginBottom: 2,
                    }}
                  >
                    Valor Total da Estadia ({nights} {nights === 1 ? "diária" : "diárias"})
                  </span>
                  <div
                    style={{
                      fontFamily: "var(--serif)",
                      fontSize: "2.3rem",
                      fontWeight: 300,
                      lineHeight: 1.1,
                    }}
                  >
                    {formatCurrency(total)}
                  </div>
                  <div style={{ fontSize: 13, color: "rgba(245,242,236,0.75)", marginTop: 4 }}>
                    Média por diária: <strong>{formatCurrency(averagePerNight)}</strong>
                  </div>
                </div>

                <div style={{ textAlign: "right", fontSize: 12, color: "rgba(245,242,236,0.8)" }}>
                  <div>Quarto: <strong style={{ color: "#fff" }}>{roomObj.name}</strong> ({roomObj.sqm}m²)</div>
                  <div>Hóspedes: <strong style={{ color: "#fff" }}>{pax} PAX</strong> · {breakfast ? "Com Café" : "Sem Café"}</div>
                  <div>Período: <strong style={{ color: "var(--gold)" }}>{checkin} a {checkout}</strong></div>
                </div>
              </div>

              {/* Breakdown Table */}
              <div className="card" style={{ padding: 0, overflow: "hidden" }}>
                <div
                  style={{
                    padding: "16px 20px",
                    borderBottom: "1px solid var(--line)",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: 8,
                  }}
                >
                  <h3 className="card-title" style={{ margin: 0 }}>
                    Detalhamento Diária a Diária
                  </h3>
                  <span style={{ fontSize: 11, color: "var(--mid)" }}>
                    Clique em &quot;Racional&quot; para auditar qualquer data
                  </span>
                </div>

                <div style={{ overflowX: "auto" }}>
                  <table className="data-table" style={{ width: "100%", fontSize: 12, margin: 0 }}>
                    <thead>
                      <tr>
                        <th style={{ width: "100px", whiteSpace: "nowrap" }}>Data</th>
                        <th style={{ width: "50px", whiteSpace: "nowrap" }}>Dia</th>
                        <th style={{ width: "95px", whiteSpace: "nowrap" }}>Nível BAR</th>
                        <th style={{ width: "100px", whiteSpace: "nowrap" }}>Temporada</th>
                        <th style={{ width: "115px", whiteSpace: "nowrap" }}>Fonte</th>
                        <th style={{ minWidth: "160px" }}>Eventos</th>
                        <th style={{ width: "110px", textAlign: "right", whiteSpace: "nowrap" }}>Tarifa</th>
                        <th style={{ width: "90px", textAlign: "center", whiteSpace: "nowrap" }}>Racional</th>
                      </tr>
                    </thead>
                    <tbody>
                      {breakdown.map((day) => {
                        const [y, m, d] = day.date.split("-");
                        const hasEvent = day.events && day.events.length > 0;
                        return (
                          <tr key={day.date}>
                            <td style={{ whiteSpace: "nowrap" }}>
                              <strong>{`${d}/${m}/${y}`}</strong>
                            </td>
                            <td style={{ whiteSpace: "nowrap", color: "var(--mid)" }}>
                              {day.dayOfWeek}
                            </td>
                            <td style={{ whiteSpace: "nowrap" }}>
                              <span
                                style={{
                                  display: "inline-block",
                                  padding: "2px 8px",
                                  borderRadius: 4,
                                  background: hasEvent ? "#fef3c7" : "var(--gold-soft)",
                                  color: hasEvent ? "#92400e" : "var(--navy)",
                                  fontWeight: 700,
                                  fontSize: 11,
                                  border: `1px solid ${hasEvent ? "#fde68a" : "var(--gold-line)"}`,
                                }}
                              >
                                BAR {day.barLevel}
                              </span>
                            </td>
                            <td style={{ textTransform: "capitalize", whiteSpace: "nowrap" }}>
                              {day.season}
                            </td>
                            <td style={{ whiteSpace: "nowrap" }}>
                              {day.barSource === "event" ? (
                                <span
                                  style={{
                                    fontSize: 11,
                                    fontWeight: 600,
                                    color: "#b45309",
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: 4,
                                  }}
                                >
                                  <Sparkles size={11} color="#d97706" /> Evento
                                </span>
                              ) : day.barSource === "manual" ? (
                                <span style={{ fontSize: 11, color: "var(--navy)", fontWeight: 600 }}>
                                  Ajuste Manual
                                </span>
                              ) : (
                                <span style={{ fontSize: 11, color: "var(--mid)" }}>
                                  Histórico Sazonal
                                </span>
                              )}
                            </td>
                            <td>
                              {hasEvent ? (
                                <span
                                  style={{
                                    fontSize: 11,
                                    color: "#9a3412",
                                    background: "#ffedd5",
                                    padding: "3px 8px",
                                    borderRadius: 4,
                                    display: "inline-block",
                                    fontWeight: 500,
                                    lineHeight: 1.3,
                                  }}
                                  title={day.events?.join(" + ")}
                                >
                                  {day.events![0]} {day.events!.length > 1 ? `(+${day.events!.length - 1})` : ""}
                                </span>
                              ) : (
                                <span style={{ color: "var(--line)", fontSize: 12 }}>—</span>
                              )}
                            </td>
                            <td style={{ textAlign: "right", fontFamily: "var(--serif)", fontSize: 14, whiteSpace: "nowrap" }}>
                              <strong>{formatCurrency(day.price)}</strong>
                            </td>
                            <td style={{ textAlign: "center", whiteSpace: "nowrap" }}>
                              <button
                                onClick={() => handleOpenRationaleForDay(day.date)}
                                className="btn btn-ghost"
                                style={{ padding: "3px 8px", fontSize: 11, color: "var(--navy)" }}
                                title="Ver árvore de decisão completa desta data"
                              >
                                <Info size={13} style={{ marginRight: 4 }} />
                                Racional
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* History Tab */
          <div className="card">
            <div className="card-header" style={{ marginBottom: 16 }}>
              <div>
                <h3 className="card-title">Histórico de Cotações & Simulações Gravadas</h3>
                <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--mid)" }}>
                  Todas as cotações realizadas pela equipe com o racional completo da data da consulta.
                </p>
              </div>
            </div>

            {simulations.length === 0 ? (
              <div style={{ textAlign: "center", padding: "48px 0", color: "var(--mid)" }}>
                <Calculator size={36} color="var(--gold)" style={{ margin: "0 auto 12px", opacity: 0.5 }} />
                <h4 style={{ fontFamily: "var(--serif)", fontSize: "1.2rem", color: "var(--navy)", margin: "0 0 6px" }}>
                  Nenhuma cotação gravada ainda
                </h4>
                <p style={{ margin: "0 0 16px", fontSize: 12 }}>
                  Gere novas cotações no simulador e clique em "Salvar no Histórico".
                </p>
                <button onClick={() => setActiveTab("calculator")} className="btn btn-gold">
                  Ir para o Simulador
                </button>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {simulations.map((sim) => {
                  const createdDate = new Date(sim.createdAt).toLocaleString("pt-BR", {
                    dateStyle: "short",
                    timeStyle: "short",
                  });

                  return (
                    <div
                      key={sim.id}
                      style={{
                        padding: "16px 20px",
                        borderRadius: "var(--r-md)",
                        border: "1px solid var(--line)",
                        background: "var(--paper-2)",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        flexWrap: "wrap",
                        gap: 16,
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 260 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                          <span style={{ fontWeight: 600, fontSize: 14, color: "var(--navy)" }}>
                            {sim.roomName}
                          </span>
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 600,
                              padding: "2px 6px",
                              borderRadius: 4,
                              background: "var(--gold-soft)",
                            }}
                          >
                            {sim.pax} PAX · {sim.breakfast ? "Com Café" : "Sem Café"}
                          </span>
                          {sim.notes && (
                            <span style={{ fontSize: 11, color: "var(--mid)", fontStyle: "italic" }}>
                              "{sim.notes}"
                            </span>
                          )}
                        </div>

                        <div style={{ display: "flex", gap: 16, fontSize: 12, color: "var(--mid)" }}>
                          <span>Período: <strong>{sim.checkin} a {sim.checkout}</strong> ({sim.nights}N)</span>
                          <span>Cotado em: {createdDate}</span>
                          <span>Por: {sim.userEmail}</span>
                        </div>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
                        <div style={{ textAlign: "right" }}>
                          <div
                            style={{
                              fontFamily: "var(--serif)",
                              fontSize: "1.4rem",
                              fontWeight: 400,
                              color: "var(--navy)",
                            }}
                          >
                            {formatCurrency(sim.total)}
                          </div>
                          <div style={{ fontSize: 11, color: "var(--mid)" }}>
                            Média: {formatCurrency(sim.averagePerNight)}/noite
                          </div>
                        </div>

                        <div style={{ display: "flex", gap: 6 }}>
                          <button
                            onClick={() => setHistoryDetailSim(sim)}
                            className="btn btn-outline"
                            style={{ padding: "6px 10px", fontSize: 12 }}
                            title="Ver detalhamento e diárias"
                          >
                            Detalhes
                          </button>
                          <button
                            onClick={() => handleLoadPastSimulation(sim)}
                            className="btn btn-ghost"
                            style={{ padding: "6px 8px", color: "var(--navy)" }}
                            title="Carregar no simulador"
                          >
                            <RotateCcw size={14} />
                          </button>
                          <button
                            onClick={() => handleDeleteSimulation(sim.id)}
                            className="btn btn-ghost"
                            style={{ padding: "6px 8px", color: "var(--mid)" }}
                            title="Excluir do histórico"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Pricing Rationale Modal */}
        {selectedRationale && (
          <PricingRationaleModal
            rationale={selectedRationale}
            onClose={() => setSelectedRationale(null)}
          />
        )}

        {/* History Detail Modal */}
        {historyDetailSim && (
          <div className="modal-backdrop" onClick={() => setHistoryDetailSim(null)}>
            <div className="modal-box" style={{ maxWidth: 680 }} onClick={(e) => e.stopPropagation()}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                <div>
                  <h3 className="modal-title" style={{ margin: 0 }}>
                    Cotação: {historyDetailSim.roomName}
                  </h3>
                  <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--mid)" }}>
                    {historyDetailSim.checkin} a {historyDetailSim.checkout} ({historyDetailSim.nights} noites) ·{" "}
                    {historyDetailSim.pax} PAX · {historyDetailSim.breakfast ? "Com Café" : "Sem Café"}
                  </p>
                </div>
                <button onClick={() => setHistoryDetailSim(null)} className="btn btn-ghost">
                  ✕
                </button>
              </div>

              <div
                style={{
                  padding: "14px 18px",
                  borderRadius: "var(--r-sm)",
                  background: "var(--navy)",
                  color: "#fff",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 16,
                }}
              >
                <div>
                  <span style={{ fontSize: 10, textTransform: "uppercase", color: "rgba(168,144,112,0.8)" }}>
                    Valor Total Cotado
                  </span>
                  <div style={{ fontFamily: "var(--serif)", fontSize: "1.6rem" }}>
                    {formatCurrency(historyDetailSim.total)}
                  </div>
                </div>
                <div style={{ fontSize: 12, opacity: 0.85 }}>
                  Média: {formatCurrency(historyDetailSim.averagePerNight)}/diária
                </div>
              </div>

              <div style={{ maxHeight: 320, overflowY: "auto", marginBottom: 20 }}>
                <table className="data-table" style={{ width: "100%", fontSize: 12 }}>
                  <thead>
                    <tr>
                      <th style={{ whiteSpace: "nowrap" }}>Data</th>
                      <th style={{ whiteSpace: "nowrap" }}>Nível BAR</th>
                      <th style={{ whiteSpace: "nowrap" }}>Temporada</th>
                      <th style={{ whiteSpace: "nowrap" }}>Fonte / Evento</th>
                      <th style={{ textAlign: "right", whiteSpace: "nowrap" }}>Valor Diária</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyDetailSim.breakdown?.map((d) => (
                      <tr key={d.date}>
                        <td style={{ whiteSpace: "nowrap" }}><strong>{d.date}</strong> {d.dayOfWeek ? `(${d.dayOfWeek})` : ""}</td>
                        <td style={{ whiteSpace: "nowrap" }}>
                          <span
                            style={{
                              display: "inline-block",
                              padding: "2px 6px",
                              borderRadius: 4,
                              background: d.events && d.events.length > 0 ? "#fef3c7" : "var(--gold-soft)",
                              color: d.events && d.events.length > 0 ? "#92400e" : "var(--navy)",
                              fontWeight: 600,
                              fontSize: 11,
                            }}
                          >
                            BAR {d.barLevel}
                          </span>
                        </td>
                        <td style={{ textTransform: "capitalize", whiteSpace: "nowrap" }}>{d.season}</td>
                        <td>
                          {d.events && d.events.length > 0 ? (
                            <span style={{ fontSize: 11, color: "#9a3412", fontWeight: 500 }}>
                              {d.events[0]}
                            </span>
                          ) : (
                            <span style={{ fontSize: 11, color: "var(--mid)" }}>
                              {d.barSource === "manual" ? "Ajuste Manual" : "Histórico Sazonal"}
                            </span>
                          )}
                        </td>
                        <td style={{ textAlign: "right", fontFamily: "var(--serif)", fontSize: 13, whiteSpace: "nowrap" }}>
                          <strong>{formatCurrency(d.price)}</strong>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                <button
                  onClick={() => {
                    handleLoadPastSimulation(historyDetailSim);
                    setHistoryDetailSim(null);
                  }}
                  className="btn btn-gold"
                >
                  Carregar no Simulador
                </button>
              </div>
            </div>
          </div>
        )}
      </Layout>
    </>
  );
}
