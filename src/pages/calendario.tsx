import { useState, useEffect, useCallback } from "react";
import Head from "next/head";
import Image from "next/image";
import Layout from "@/components/layout/Layout";
import { useAuth } from "@/contexts/AuthContext";
import type { BarPeriod, Season } from "@/types";
import { formatCurrency, monthName, daysInMonth, firstDayOfMonth, todayISO } from "@/lib/utils";
import { getRatesForRoom, OPERATIONAL_BAR_LEVELS, barToSeason } from "@/lib/pricing-engine";
import { ChevronLeft, ChevronRight, X, Info, Check, AlertCircle } from "lucide-react";

const SEASON_LABEL: Record<Season, string> = {
  alta: "Alta Temporada",
  media: "Média Temporada",
  normal: "Normal",
  baixa: "Baixa Temporada",
};

const DAY_NAMES = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const ROOM_NAMES: Record<string, string> = {
  standard: "Studio Standard",
  "standard-garden": "Std. Garden",
  select: "Studio Select",
  "select-garden": "Select Garden",
  "select-plus": "Select Plus",
  suite: "Suite",
};

interface CalDay {
  date: string;
  day: number;
  barLevel: number;
  source: string;
  season: Season;
  standardPrice: number;
}

// Modal: detalhe do dia + opção de setar BAR
interface DayModal {
  date: string;
  barLevel: number;
  season: Season;
  source: string;
  standardPrice: number;
}

// Modal: criar período (pode ser 1 dia ou range)
interface PeriodModal {
  mode: "day" | "range";
  startDate: string;
  endDate: string;
  barLevel: number;
  season: Season;
  notes: string;
}

export default function CalendarioPage() {
  const { user, loading: authLoading } = useAuth();
  const today = todayISO();
  const [todayYear, todayMonth] = today.split("-").map(Number);

  const [year, setYear] = useState(todayYear);
  const [month, setMonth] = useState(todayMonth);
  const [calData, setCalData] = useState<CalDay[]>([]);
  const [barPeriods, setBarPeriods] = useState<BarPeriod[]>([]);
  const [fetching, setFetching] = useState(false);

  // Day detail modal
  const [dayModal, setDayModal] = useState<DayModal | null>(null);

  // Set BAR period modal (from clicking a day or the sidebar)
  const [periodModal, setPeriodModal] = useState<PeriodModal | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState("");

  const fetchMonth = useCallback(async () => {
    if (authLoading || !user) return;
    setFetching(true);
    try {
      const res = await fetch(`/api/pricing/current?year=${year}&month=${month}`);
      if (!res.ok) return;
      const json = await res.json();
      setCalData(json.calendar ?? []);
      setBarPeriods(json.barPeriods ?? []);
    } finally {
      setFetching(false);
    }
  }, [year, month, authLoading, user]);

  useEffect(() => { fetchMonth(); }, [fetchMonth]);

  const prevMonth = () => {
    if (month === 1) { setYear(y => y - 1); setMonth(12); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 12) { setYear(y => y + 1); setMonth(1); }
    else setMonth(m => m + 1);
  };

  const handleDayClick = (day: CalDay) => {
    setDayModal({
      date: day.date,
      barLevel: day.barLevel,
      season: day.season,
      source: day.source,
      standardPrice: day.standardPrice,
    });
  };

  const openSetBAR = (date: string, currentBar: number) => {
    setDayModal(null);
    setPeriodModal({
      mode: "day",
      startDate: date,
      endDate: date,
      barLevel: currentBar,
      season: barToSeason(currentBar),
      notes: "",
    });
    setSaveError("");
  };

  const handleSavePeriod = async () => {
    if (!periodModal) return;
    setSaving(true);
    setSaveError("");
    try {
      const res = await fetch("/api/bar-periods", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startDate: periodModal.startDate,
          endDate: periodModal.endDate,
          barLevel: periodModal.barLevel,
          season: periodModal.season,
          notes: periodModal.notes,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erro ao salvar");
      setPeriodModal(null);
      setSaveSuccess(`BAR ${periodModal.barLevel} definido para ${periodModal.startDate === periodModal.endDate ? periodModal.startDate.split("-").reverse().join("/") : `${periodModal.startDate.split("-").reverse().join("/")} → ${periodModal.endDate.split("-").reverse().join("/")}`}`);
      setTimeout(() => setSaveSuccess(""), 4000);
      await fetchMonth();
    } catch (e) {
      setSaveError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const firstDay = firstDayOfMonth(year, month);
  const daysCount = daysInMonth(year, month);
  const calMap = Object.fromEntries(calData.map((d) => [d.day, d]));

  const isAdmin = user?.role === "admin";

  return (
    <>
      <Head>
        <title>Calendário — Allure Moema Precificação</title>
      </Head>
      <Layout title="Calendário de Tarifas" subtitle="Visualize e configure o BAR por dia" user={user}>
        {saveSuccess && (
          <div className="alert alert-success" style={{ marginBottom: 16 }}>
            <Check size={14} /> {saveSuccess}
          </div>
        )}

        <div style={{ display: "flex", gap: 24 }}>
          {/* Main calendar */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Month nav */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 16,
                padding: "12px 20px",
                background: "var(--paper)",
                border: "1px solid var(--line)",
                borderRadius: "var(--r-lg)",
              }}
            >
              <button onClick={prevMonth} className="btn btn-ghost" style={{ padding: 8 }}>
                <ChevronLeft size={18} />
              </button>
              <div style={{ textAlign: "center" }}>
                <h2 style={{ fontFamily: "var(--serif)", fontSize: "1.4rem", fontWeight: 300, margin: 0, color: "var(--navy)" }}>
                  {monthName(month)} {year}
                </h2>
                {fetching && <span style={{ fontSize: 11, color: "var(--mid)" }}>Carregando...</span>}
              </div>
              <button onClick={nextMonth} className="btn btn-ghost" style={{ padding: 8 }}>
                <ChevronRight size={18} />
              </button>
            </div>

            {/* Day headers */}
            <div className="cal-grid" style={{ marginBottom: 4 }}>
              {DAY_NAMES.map((d) => (
                <div key={d} className="cal-day-header">{d}</div>
              ))}
            </div>

            {/* Calendar grid */}
            <div className="cal-grid">
              {Array.from({ length: firstDay }).map((_, i) => (
                <div key={`e${i}`} className="cal-day empty" />
              ))}

              {Array.from({ length: daysCount }).map((_, i) => {
                const day = i + 1;
                const dayData = calMap[day];
                const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                const isToday = dateStr === today;
                const barLevel = dayData?.barLevel ?? 5;
                const clampedBar = Math.min(10, Math.max(1, barLevel));
                const isManual = dayData?.source === "firestore";

                return (
                  <div
                    key={day}
                    className={`cal-day bar-${clampedBar} ${isToday ? "today" : ""}`}
                    onClick={() => dayData ? handleDayClick(dayData) : handleDayClick({
                      date: dateStr, day, barLevel: 5, source: "default", season: "normal", standardPrice: 0,
                    })}
                    title={dayData ? `BAR ${barLevel} · ${SEASON_LABEL[dayData.season]} · clique para detalhes` : "Clique para definir BAR"}
                    style={{ cursor: "pointer", position: "relative" }}
                  >
                    {/* Manual dot indicator */}
                    {isManual && (
                      <div
                        style={{
                          position: "absolute",
                          top: 5,
                          right: 5,
                          width: 5,
                          height: 5,
                          borderRadius: "50%",
                          background: clampedBar <= 4 ? "rgba(255,255,255,0.7)" : "var(--gold)",
                        }}
                      />
                    )}
                    <span className="cal-day-num">{day}</span>
                    {dayData && (
                      <>
                        <span className="cal-bar-label">BAR {barLevel}</span>
                        <span className="cal-price">{formatCurrency(dayData.standardPrice)}</span>
                      </>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Legend */}
            <div
              style={{
                display: "flex",
                gap: 10,
                flexWrap: "wrap",
                alignItems: "center",
                marginTop: 16,
                padding: "10px 16px",
                background: "var(--paper)",
                border: "1px solid var(--line)",
                borderRadius: "var(--r-md)",
                fontSize: 11,
              }}
            >
              <span style={{ color: "var(--mid)", marginRight: 4 }}>Legenda:</span>
              {[
                { label: "BAR 1-2 (Alta)", cls: "bar-1" },
                { label: "BAR 3-4 (Média)", cls: "bar-4" },
                { label: "BAR 5-6 (Normal)", cls: "bar-5" },
                { label: "BAR 7-8", cls: "bar-8" },
                { label: "BAR 9-10 (Baixa)", cls: "bar-10" },
              ].map(({ label, cls }) => (
                <div key={label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <div className={`cal-day ${cls}`} style={{ width: 18, height: 18, minHeight: "auto", borderRadius: 4, cursor: "default", padding: 0 }} />
                  <span style={{ color: "var(--mid)" }}>{label}</span>
                </div>
              ))}
              <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 5, color: "var(--mid)" }}>
                <div style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--gold)" }} />
                Definido manualmente
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div style={{ width: 268, flexShrink: 0 }}>
            {/* Quick action */}
            {isAdmin && (
              <div className="card" style={{ marginBottom: 16 }}>
                <p style={{ fontFamily: "var(--sans)", fontSize: 12, color: "var(--mid)", margin: "0 0 12px", lineHeight: 1.5 }}>
                  Clique em qualquer dia para ver detalhes ou definir um BAR específico.
                </p>
                <button
                  onClick={() => setPeriodModal({ mode: "range", startDate: "", endDate: "", barLevel: 5, season: "normal", notes: "" })}
                  className="btn btn-gold"
                  style={{ width: "100%", justifyContent: "center", fontSize: 13 }}
                >
                  + Novo período de datas
                </button>
              </div>
            )}

            {/* Active periods */}
            <div className="card">
              <div className="card-header" style={{ marginBottom: 12 }}>
                <h3 className="card-title">Períodos Configurados</h3>
                <Info size={14} color="var(--mid)" />
              </div>

              {barPeriods.length === 0 ? (
                <div style={{ textAlign: "center", padding: "16px 0", color: "var(--mid)", fontSize: 12 }}>
                  <p style={{ margin: "0 0 4px" }}>Nenhum período configurado.</p>
                  <p style={{ margin: 0, fontSize: 11 }}>Usando dados históricos 2023-2024.</p>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {(barPeriods as BarPeriod[]).map((p) => {
                    const [sy, sm, sd] = p.startDate.split("-");
                    const [ey, em, ed] = p.endDate.split("-");
                    const isSingleDay = p.startDate === p.endDate;
                    return (
                      <div
                        key={p.id}
                        style={{ padding: "9px 12px", border: "1px solid var(--line)", borderRadius: "var(--r-sm)", background: "var(--paper-2)" }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                          <span style={{ fontFamily: "var(--sans)", fontSize: 12, fontWeight: 500, color: "var(--navy)" }}>
                            BAR {p.barLevel}
                          </span>
                          <span className={`season-chip ${p.season}`}>{p.season}</span>
                        </div>
                        <div style={{ fontSize: 11, color: "var(--mid)" }}>
                          {isSingleDay
                            ? `${sd}/${sm}/${sy}`
                            : `${sd}/${sm}/${sy} → ${ed}/${em}/${ey}`}
                        </div>
                        {p.notes && <div style={{ fontSize: 11, color: "var(--mid)", marginTop: 3, fontStyle: "italic" }}>{p.notes}</div>}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Seasonal summary */}
            <div className="card" style={{ marginTop: 16 }}>
              <div className="card-header" style={{ marginBottom: 12 }}>
                <h3 className="card-title">Sazonalidade Histórica</h3>
              </div>
              <div style={{ fontSize: 11, color: "var(--mid)", marginBottom: 10 }}>Média BAR por mês (2023-2024)</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {[
                  { m: 1, avg: 5 }, { m: 2, avg: 5 }, { m: 3, avg: 10 },
                  { m: 4, avg: 5 }, { m: 5, avg: 5 }, { m: 6, avg: 5 },
                  { m: 7, avg: 5 }, { m: 8, avg: 8 }, { m: 9, avg: 9 },
                  { m: 10, avg: 4 }, { m: 11, avg: 5 }, { m: 12, avg: 5 },
                ].map(({ m, avg }) => (
                  <div key={m} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 11, color: "var(--mid)", width: 26, flexShrink: 0 }}>{monthName(m).slice(0, 3)}</span>
                    <div style={{ flex: 1, height: 5, background: "var(--line)", borderRadius: 3, overflow: "hidden" }}>
                      <div style={{
                        height: "100%",
                        width: `${((10 - avg + 1) / 10) * 100}%`,
                        background: avg <= 4 ? "#c87941" : avg <= 6 ? "var(--gold)" : "var(--light-blue)",
                        borderRadius: 3,
                      }} />
                    </div>
                    <span style={{ fontSize: 10, color: "var(--mid)", width: 32, textAlign: "right" }}>BAR {avg}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── Day detail modal ── */}
        {dayModal && (
          <div className="modal-backdrop" onClick={() => setDayModal(null)}>
            <div className="modal-box" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
                <div>
                  <p style={{ fontFamily: "var(--sans)", fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--gold)", margin: "0 0 4px" }}>
                    Detalhes do dia
                  </p>
                  <h2 style={{ fontFamily: "var(--serif)", fontSize: "1.5rem", fontWeight: 300, margin: "0 0 8px" }}>
                    {dayModal.date.split("-").reverse().join("/")}
                  </h2>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
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

              {/* Price table */}
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
                  {Object.entries(ROOM_NAMES).map(([roomId, name]) => {
                    const rates = getRatesForRoom(roomId, dayModal.barLevel);
                    return (
                      <tr key={roomId}>
                        <td style={{ fontWeight: 500 }}>{name}</td>
                        <td style={{ textAlign: "right" }}>{formatCurrency(rates?.without_breakfast_1pax ?? 0)}</td>
                        <td style={{ textAlign: "right" }}>{formatCurrency(rates?.without_breakfast_2pax ?? 0)}</td>
                        <td style={{ textAlign: "right" }}>{formatCurrency(rates?.with_breakfast_1pax ?? 0)}</td>
                        <td style={{ textAlign: "right" }}>{formatCurrency(rates?.with_breakfast_2pax ?? 0)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {isAdmin && (
                <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                  <button onClick={() => setDayModal(null)} className="btn btn-outline">
                    Fechar
                  </button>
                  <button
                    onClick={() => openSetBAR(dayModal.date, dayModal.barLevel)}
                    className="btn btn-gold"
                  >
                    Definir BAR para este dia
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Set BAR period modal ── */}
        {periodModal && (
          <div className="modal-backdrop" onClick={() => setPeriodModal(null)}>
            <div className="modal-box" style={{ maxWidth: 460 }} onClick={e => e.stopPropagation()}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
                <div>
                  <p style={{ fontFamily: "var(--sans)", fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--gold)", margin: "0 0 4px" }}>
                    {periodModal.mode === "day" ? "Definir BAR para o dia" : "Novo período BAR"}
                  </p>
                  <h2 style={{ fontFamily: "var(--serif)", fontSize: "1.3rem", fontWeight: 300, margin: 0 }}>
                    {periodModal.mode === "day" && periodModal.startDate
                      ? periodModal.startDate.split("-").reverse().join("/")
                      : "Selecione o período"}
                  </h2>
                </div>
                <button onClick={() => setPeriodModal(null)} className="btn btn-ghost" style={{ padding: 6 }}>
                  <X size={18} />
                </button>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {periodModal.mode === "range" && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div>
                      <label className="form-label">Data início</label>
                      <input type="date" className="form-input"
                        value={periodModal.startDate}
                        onChange={e => setPeriodModal(p => p ? { ...p, startDate: e.target.value } : null)}
                        required
                      />
                    </div>
                    <div>
                      <label className="form-label">Data fim</label>
                      <input type="date" className="form-input"
                        value={periodModal.endDate}
                        onChange={e => setPeriodModal(p => p ? { ...p, endDate: e.target.value } : null)}
                        required
                      />
                    </div>
                  </div>
                )}

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div>
                    <label className="form-label">Nível BAR</label>
                    <select
                      className="form-select"
                      value={periodModal.barLevel}
                      onChange={e => {
                        const bar = parseInt(e.target.value, 10);
                        setPeriodModal(p => p ? { ...p, barLevel: bar, season: barToSeason(bar) } : null);
                      }}
                    >
                      {OPERATIONAL_BAR_LEVELS.map(b => (
                        <option key={b} value={b}>
                          BAR {b} — {barToSeason(b) === "alta" ? "Alta" : barToSeason(b) === "media" ? "Média" : barToSeason(b) === "normal" ? "Normal" : "Baixa"}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="form-label">Temporada</label>
                    <select
                      className="form-select"
                      value={periodModal.season}
                      onChange={e => setPeriodModal(p => p ? { ...p, season: e.target.value as Season } : null)}
                    >
                      <option value="alta">Alta Temporada</option>
                      <option value="media">Média Temporada</option>
                      <option value="normal">Temporada Normal</option>
                      <option value="baixa">Baixa Temporada</option>
                    </select>
                  </div>
                </div>

                {/* Preview */}
                <div style={{ padding: "10px 14px", background: "var(--paper-2)", border: "1px solid var(--line)", borderRadius: "var(--r-sm)" }}>
                  <div style={{ fontSize: 10, color: "var(--mid)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                    Studio Standard a este BAR
                  </div>
                  <div style={{ display: "flex", gap: 16 }}>
                    {[
                      { label: "1Px s/café", key: "without_breakfast_1pax" as const },
                      { label: "2Px s/café", key: "without_breakfast_2pax" as const },
                      { label: "1Px c/café", key: "with_breakfast_1pax" as const },
                    ].map(({ label, key }) => {
                      const rates = getRatesForRoom("standard", periodModal.barLevel);
                      return (
                        <div key={key}>
                          <div style={{ fontSize: 10, color: "var(--mid)" }}>{label}</div>
                          <div style={{ fontFamily: "var(--serif)", fontSize: "1rem", color: "var(--navy)" }}>
                            {formatCurrency(rates?.[key] ?? 0)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="form-label">Notas (opcional)</label>
                  <input type="text" className="form-input"
                    value={periodModal.notes}
                    onChange={e => setPeriodModal(p => p ? { ...p, notes: e.target.value } : null)}
                    placeholder="Ex: Carnaval, Feriado, Evento..."
                  />
                </div>

                {saveError && (
                  <div className="alert alert-error">
                    <AlertCircle size={14} /> {saveError}
                  </div>
                )}

                <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                  <button onClick={() => setPeriodModal(null)} className="btn btn-outline">Cancelar</button>
                  <button
                    onClick={handleSavePeriod}
                    className="btn btn-gold"
                    disabled={saving || (periodModal.mode === "range" && (!periodModal.startDate || !periodModal.endDate))}
                  >
                    {saving ? "Salvando..." : "Confirmar BAR"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </Layout>
    </>
  );
}
