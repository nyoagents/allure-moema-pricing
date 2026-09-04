import { useState, useEffect } from "react";
import Head from "next/head";
import Link from "next/link";
import Layout from "@/components/layout/Layout";
import { useAuth } from "@/contexts/AuthContext";
import { todayISO, formatCurrency, addDays } from "@/lib/utils";
import { ROOMS } from "@/data/rooms";
import {
  getDetailedPricingRationale,
  getRatesForRoom,
  OPERATIONAL_BAR_LEVELS,
  barToSeason,
} from "@/lib/pricing-engine";
import type { BarPeriod, EventItem, CompetitorSample, RoomId } from "@/types";
import {
  HelpCircle,
  Layers,
  Sparkles,
  TrendingUp,
  CalendarDays,
  CheckCircle2,
  ArrowRight,
  ShieldCheck,
  Building2,
  DollarSign,
  Compass,
  User,
  Users,
  Coffee,
  Ban,
  Calendar,
  Sliders,
  Calculator,
  Info,
} from "lucide-react";

export default function RacionalPage() {
  const { user, loading: authLoading } = useAuth();
  const [selectedDate, setSelectedDate] = useState(todayISO());
  const [selectedRoom, setSelectedRoom] = useState<RoomId>("standard");
  const [pax, setPax] = useState<1 | 2>(1);
  const [breakfast, setBreakfast] = useState(false);

  const [barPeriods, setBarPeriods] = useState<BarPeriod[]>([]);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [samples, setSamples] = useState<CompetitorSample[]>([]);
  const [loadingData, setLoadingData] = useState(false);

  useEffect(() => {
    async function loadContext() {
      if (!user) return;
      setLoadingData(true);
      try {
        const [pRes, eRes, cRes] = await Promise.all([
          fetch("/api/bar-periods"),
          fetch("/api/events"),
          fetch("/api/competitors"),
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
      } catch {
        // demo fallback
      } finally {
        setLoadingData(false);
      }
    }
    if (!authLoading && user) {
      loadContext();
    }
  }, [authLoading, user]);

  const rationale = getDetailedPricingRationale(
    selectedDate,
    selectedRoom,
    { pax, breakfast },
    barPeriods,
    events,
    samples
  );

  const stepIcons = [CalendarDays, Sliders, Sparkles, TrendingUp, Layers];

  return (
    <>
      <Head>
        <title>Racional do Cálculo — Allure Moema Precificação</title>
      </Head>
      <Layout
        title="Racional de Precificação"
        subtitle="Entenda as 5 etapas que compõem o valor de cada tarifa no Allure Moema"
        user={user}
      >
        {/* Top Hero Banner */}
        <div
          style={{
            background: "linear-gradient(135deg, var(--navy) 0%, #15293d 100%)",
            borderRadius: "var(--r-lg)",
            padding: "24px 28px",
            color: "var(--cream)",
            marginBottom: 24,
            position: "relative",
            overflow: "hidden",
            boxShadow: "var(--shadow-md)",
          }}
        >
          <div
            style={{
              position: "absolute",
              right: -30,
              top: -30,
              width: 150,
              height: 150,
              borderRadius: "50%",
              background: "rgba(168,144,112,0.12)",
              pointerEvents: "none",
            }}
          />
          <div style={{ maxWidth: 680 }}>
            <span
              style={{
                fontFamily: "var(--sans)",
                fontSize: 11,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "var(--gold)",
                fontWeight: 600,
                display: "block",
                marginBottom: 6,
              }}
            >
              Metodologia de Revenue Management
            </span>
            <h2
              style={{
                fontFamily: "var(--serif)",
                fontSize: "1.65rem",
                fontWeight: 300,
                color: "#ffffff",
                margin: "0 0 10px",
                lineHeight: 1.25,
              }}
            >
              Transparência total na formação do preço diário
            </h2>
            <p style={{ margin: 0, fontSize: 13, color: "rgba(245,242,236,0.85)", lineHeight: 1.6 }}>
              A precificação do Allure Moema não é arbitrária. Ela opera sob uma arquitetura de decisão
              em 5 camadas que une sazonalidade histórica, regras manuais de revenue, inteligência de
              eventos locais, benchmark concorrencial e tabelas matriciais de tipologia.
            </p>
          </div>
        </div>

        {/* 5 Pillars Summary Cards */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
            gap: 14,
            marginBottom: 28,
          }}
        >
          {[
            {
              step: 1,
              title: "Sazonalidade Histórica",
              desc: "Base consolidada 2023-2024 que determina o BAR padrão por mês e dia da semana.",
              icon: CalendarDays,
              color: "var(--navy)",
            },
            {
              step: 2,
              title: "Períodos Manuais",
              desc: "Ajustes de yield e exceções cadastradas pelo time que sobrepõem a sazonalidade.",
              icon: Sliders,
              color: "var(--gold)",
            },
            {
              step: 3,
              title: "Pressão de Eventos",
              desc: "Mapeamento contínuo de congressos, shows e feiras no raio de Moema/SP.",
              icon: Sparkles,
              color: "#c87941",
            },
            {
              step: 4,
              title: "Benchmark Concorrentes",
              desc: "Monitoramento diário dos 19 concorrentes no Booking para manter Allure competitivo.",
              icon: TrendingUp,
              color: "#1d4ed8",
            },
            {
              step: 5,
              title: "Matriz das Tipologias",
              desc: "Conversão do BAR consolidado nas 6 tipologias em 1/2 PAX e com/sem café.",
              icon: Layers,
              color: "#166534",
            },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.step}
                className="card"
                style={{
                  padding: "16px 18px",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                }}
              >
                <div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: 10,
                    }}
                  >
                    <span
                      style={{
                        fontFamily: "var(--sans)",
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: "0.1em",
                        color: item.color,
                        background: "rgba(0,0,0,0.03)",
                        padding: "2px 8px",
                        borderRadius: 4,
                      }}
                    >
                      PASSO {item.step}
                    </span>
                    <Icon size={16} color={item.color} />
                  </div>
                  <h3
                    style={{
                      fontFamily: "var(--serif)",
                      fontSize: "1.1rem",
                      fontWeight: 400,
                      color: "var(--navy)",
                      margin: "0 0 6px",
                    }}
                  >
                    {item.title}
                  </h3>
                  <p style={{ margin: 0, fontSize: 12, color: "var(--mid)", lineHeight: 1.5 }}>
                    {item.desc}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Interactive Live Rationale Inspector */}
        <div className="card" style={{ marginBottom: 28, padding: "22px 24px" }}>
          <div className="card-header" style={{ marginBottom: 18 }}>
            <div>
              <span
                style={{
                  fontFamily: "var(--sans)",
                  fontSize: 10,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: "var(--gold)",
                  fontWeight: 600,
                  display: "block",
                  marginBottom: 2,
                }}
              >
                Simulador Interativo do Racional
              </span>
              <h3 className="card-title">Inspecione o cálculo exato para qualquer data</h3>
            </div>
            {loadingData && (
              <span style={{ fontSize: 11, color: "var(--mid)" }}>Atualizando contexto...</span>
            )}
          </div>

          {/* Controls Bar - Harmonized & Polished */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
              gap: 14,
              padding: "16px 18px",
              background: "var(--paper-2)",
              borderRadius: "var(--r-md)",
              border: "1px solid var(--line)",
              marginBottom: 22,
            }}
          >
            {/* 1. Data */}
            <div>
              <label
                className="form-label"
                style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 6, fontSize: 12 }}
              >
                <Calendar size={13} color="var(--gold)" />
                Data a Auditar
              </label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="form-input"
                style={{ width: "100%", fontSize: 13, height: 38 }}
              />
            </div>

            {/* 2. Tipologia */}
            <div>
              <label
                className="form-label"
                style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 6, fontSize: 12 }}
              >
                <Building2 size={13} color="var(--gold)" />
                Tipologia
              </label>
              <select
                value={selectedRoom}
                onChange={(e) => setSelectedRoom(e.target.value as RoomId)}
                className="form-select"
                style={{ width: "100%", fontSize: 13, height: 38 }}
              >
                {ROOMS.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({r.sqm}m²)
                  </option>
                ))}
              </select>
            </div>

            {/* 3. Ocupação Segmented Control */}
            <div>
              <label
                className="form-label"
                style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 6, fontSize: 12 }}
              >
                <User size={13} color="var(--gold)" />
                Ocupação
              </label>
              <div
                style={{
                  display: "flex",
                  background: "var(--cream)",
                  padding: 3,
                  borderRadius: "var(--r-sm)",
                  border: "1px solid var(--line)",
                  height: 38,
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
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 6,
                        fontSize: 12,
                        fontWeight: active ? 600 : 500,
                        color: active ? "#ffffff" : "var(--navy)",
                        background: active ? "var(--navy)" : "transparent",
                        border: "none",
                        borderRadius: "calc(var(--r-sm) - 2px)",
                        cursor: "pointer",
                        transition: "all 0.15s ease",
                        boxShadow: active ? "0 1px 3px rgba(0,0,0,0.15)" : "none",
                      }}
                    >
                      {p === 1 ? <User size={13} /> : <Users size={13} />}
                      {p} {p === 1 ? "Pax" : "Pax"}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 4. Café da Manhã Segmented Control */}
            <div>
              <label
                className="form-label"
                style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 6, fontSize: 12 }}
              >
                <Coffee size={13} color="var(--gold)" />
                Café da Manhã
              </label>
              <div
                style={{
                  display: "flex",
                  background: "var(--cream)",
                  padding: 3,
                  borderRadius: "var(--r-sm)",
                  border: "1px solid var(--line)",
                  height: 38,
                }}
              >
                {[
                  { val: false, label: "Sem Café", icon: Ban },
                  { val: true, label: "Com Café", icon: Coffee },
                ].map((item) => {
                  const active = breakfast === item.val;
                  const Icon = item.icon;
                  return (
                    <button
                      key={String(item.val)}
                      type="button"
                      onClick={() => setBreakfast(item.val)}
                      style={{
                        flex: 1,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 6,
                        fontSize: 12,
                        fontWeight: active ? 600 : 500,
                        color: active ? "#ffffff" : "var(--navy)",
                        background: active ? "var(--navy)" : "transparent",
                        border: "none",
                        borderRadius: "calc(var(--r-sm) - 2px)",
                        cursor: "pointer",
                        transition: "all 0.15s ease",
                        boxShadow: active ? "0 1px 3px rgba(0,0,0,0.15)" : "none",
                      }}
                    >
                      <Icon size={13} />
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Cascading Breakdown Flow */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 24 }}>
            {rationale.steps.map((s, index) => {
              const Icon = stepIcons[index] || CheckCircle2;
              return (
                <div
                  key={s.step}
                  style={{
                    display: "flex",
                    gap: 16,
                    padding: "16px 20px",
                    borderRadius: "var(--r-md)",
                    background: "var(--paper)",
                    border: "1px solid var(--line)",
                    alignItems: "flex-start",
                    transition: "border-color 0.15s ease",
                  }}
                >
                  <div
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: "50%",
                      background: "var(--navy)",
                      color: "var(--cream)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: 600,
                      fontSize: 13,
                      flexShrink: 0,
                    }}
                  >
                    <Icon size={16} color="var(--gold)" />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 8,
                        marginBottom: 4,
                      }}
                    >
                      <h4 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "var(--navy)" }}>
                        Passo {s.step}: {s.title}
                      </h4>
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          padding: "2px 10px",
                          borderRadius: "50px",
                          background: "var(--gold-soft)",
                          color: "var(--navy)",
                          border: "1px solid var(--gold-line)",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {s.resultValue}
                      </span>
                    </div>
                    <p style={{ margin: 0, fontSize: 13, color: "var(--mid)", lineHeight: 1.55 }}>
                      {s.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Result Highlight Box */}
          <div
            style={{
              padding: "20px 24px",
              background: "linear-gradient(135deg, var(--navy) 0%, #15293d 100%)",
              borderRadius: "var(--r-md)",
              color: "#ffffff",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: 16,
              boxShadow: "var(--shadow-md)",
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 11,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: "var(--gold)",
                  fontWeight: 600,
                  marginBottom: 4,
                }}
              >
                Tarifa Final Calculada
              </div>
              <div
                style={{
                  fontFamily: "var(--serif)",
                  fontSize: "2.3rem",
                  fontWeight: 300,
                  lineHeight: 1.1,
                }}
              >
                {formatCurrency(rationale.finalPrice)}
              </div>
            </div>

            <div style={{ textAlign: "right", display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.85)" }}>
                {rationale.roomName} · {pax} Pax · {breakfast ? "Com Café" : "Sem Café"}
              </div>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "4px 12px",
                  borderRadius: "50px",
                  background: "rgba(168,144,112,0.2)",
                  border: "1px solid rgba(168,144,112,0.4)",
                  color: "var(--gold)",
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                <span>Vigência: BAR {rationale.finalBarLevel} ({rationale.finalSeason.toUpperCase()})</span>
              </div>
            </div>
          </div>
        </div>

        {/* Operational BAR Table Reference */}
        <div className="card" style={{ padding: "20px 24px" }}>
          <div className="card-header" style={{ marginBottom: 12 }}>
            <h3 className="card-title">Tabela Matricial de Referência dos BARs Operacionais (1 a 10)</h3>
          </div>
          <p style={{ fontSize: 12, color: "var(--mid)", margin: "0 0 16px" }}>
            Valores base de Studio Standard (1 Pax sem café) nos diferentes níveis de mercado do Allure Moema:
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10 }}>
            {OPERATIONAL_BAR_LEVELS.map((b) => {
              const rates = getRatesForRoom("standard", b);
              const season = barToSeason(b);
              const isCurrent = b === rationale.finalBarLevel;
              return (
                <div
                  key={b}
                  style={{
                    padding: "14px 12px",
                    borderRadius: "var(--r-sm)",
                    border: isCurrent ? "2px solid var(--gold)" : "1px solid var(--line)",
                    background: isCurrent ? "var(--gold-soft)" : "var(--paper-2)",
                    textAlign: "center",
                    position: "relative",
                    transition: "all 0.15s ease",
                  }}
                >
                  {isCurrent && (
                    <div
                      style={{
                        position: "absolute",
                        top: -8,
                        left: "50%",
                        transform: "translateX(-50%)",
                        background: "var(--navy)",
                        color: "#fff",
                        fontSize: 9,
                        fontWeight: 700,
                        padding: "1px 6px",
                        borderRadius: 4,
                        letterSpacing: "0.06em",
                        whiteSpace: "nowrap",
                      }}
                    >
                      ATUAL
                    </div>
                  )}
                  <div style={{ fontSize: 12, fontWeight: 700, color: "var(--navy)", marginBottom: 2 }}>
                    BAR {b}
                  </div>
                  <div style={{ fontSize: 10, color: "var(--mid)", textTransform: "capitalize", marginBottom: 6 }}>
                    {season}
                  </div>
                  <div style={{ fontFamily: "var(--serif)", fontSize: "1.1rem", fontWeight: 600, color: "var(--navy)" }}>
                    {formatCurrency(rates?.without_breakfast_1pax ?? 0)}
                  </div>
                  <div style={{ fontSize: 10, color: "var(--mid)", marginTop: 2 }}>1 Pax</div>
                </div>
              );
            })}
          </div>
        </div>
      </Layout>
    </>
  );
}
