import { useState, useEffect } from "react";
import Head from "next/head";
import Layout from "@/components/layout/Layout";
import { useAuth } from "@/contexts/AuthContext";
import { todayISO, addDays, formatDate } from "@/lib/utils";
import type { EventItem, EventImpact } from "@/types";
import {
  Sparkles,
  Calendar,
  CalendarDays,
  MapPin,
  Users,
  CheckCircle2,
  Trash2,
  RefreshCw,
  AlertCircle,
  Search,
  Tag,
  Activity,
  Zap,
  TrendingUp,
  Flame,
  Navigation,
  Compass,
} from "lucide-react";

export default function EventosPage() {
  const { user, loading: authLoading } = useAuth();
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [showScanModal, setShowScanModal] = useState(false);

  // Scan modal form
  const [scanStart, setScanStart] = useState(todayISO());
  const [scanEnd, setScanEnd] = useState(addDays(todayISO(), 90));

  // Filters (All in one single clean row)
  const [searchTerm, setSearchTerm] = useState("");
  const [filterImpact, setFilterImpact] = useState<string>("all");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  // Toggle loading state per event
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const fetchEvents = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/events");
      if (res.ok) {
        const data = await res.json();
        setEvents(data.events ?? []);
      }
    } catch (err) {
      console.error("Failed to fetch events:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading && user) {
      fetchEvents();
    }
  }, [authLoading, user]);

  const handleScan = async (e: React.FormEvent) => {
    e.preventDefault();
    setScanning(true);
    setActionMessage(null);
    try {
      const res = await fetch("/api/events/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startDate: scanStart,
          endDate: scanEnd,
          autoSave: true,
        }),
      });

      if (!res.ok) {
        throw new Error("Erro ao escanear eventos no período");
      }

      const data = await res.json();
      setActionMessage({
        type: "success",
        text: `${data.count} eventos identificados e aplicados automaticamente ao calendário!`,
      });
      setShowScanModal(false);
      await fetchEvents();
    } catch (err: any) {
      setActionMessage({
        type: "error",
        text: err.message || "Falha ao escanear eventos",
      });
    } finally {
      setScanning(false);
    }
  };

  const handleToggleEvent = async (event: EventItem) => {
    const nextEnabled = event.enabled === false ? true : false;
    setTogglingId(event.id);
    setActionMessage(null);

    // Optimistic update
    setEvents((prev) =>
      prev.map((e) => (e.id === event.id ? { ...e, enabled: nextEnabled } : e))
    );

    try {
      const res = await fetch(`/api/events/${event.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...event,
          enabled: nextEnabled,
        }),
      });

      if (!res.ok) {
        throw new Error("Falha ao atualizar status do evento");
      }

      setActionMessage({
        type: "success",
        text: nextEnabled
          ? `BAR ${event.recommendedBar} ativado e aplicado ao calendário para "${event.title}"!`
          : `BAR do evento "${event.title}" desativado do calendário.`,
      });
    } catch (err: any) {
      // Revert optimistic update
      setEvents((prev) =>
        prev.map((e) => (e.id === event.id ? { ...e, enabled: !nextEnabled } : e))
      );
      setActionMessage({
        type: "error",
        text: err.message || "Erro ao alterar status do evento",
      });
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Deseja realmente remover este evento e retirar seu BAR do calendário?")) return;
    try {
      const res = await fetch(`/api/events/${id}`, { method: "DELETE" });
      if (res.ok) {
        setEvents((prev) => prev.filter((e) => e.id !== id));
        setActionMessage({
          type: "success",
          text: "Evento e período BAR correspondente removidos com sucesso.",
        });
      }
    } catch (err) {
      console.error("Failed to delete event:", err);
    }
  };

  const filteredEvents = events.filter((e) => {
    const isEnabled = e.enabled !== false;
    if (filterStatus === "active" && !isEnabled) return false;
    if (filterStatus === "disabled" && isEnabled) return false;
    if (filterImpact !== "all" && e.impact !== filterImpact) return false;
    if (filterCategory !== "all" && e.category !== filterCategory) return false;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      const matchTitle = e.title.toLowerCase().includes(term);
      const matchLoc = e.location.toLowerCase().includes(term);
      const matchReason = e.reason.toLowerCase().includes(term);
      if (!matchTitle && !matchLoc && !matchReason) return false;
    }
    return true;
  });

  const activeCount = events.filter((e) => e.enabled !== false).length;
  const criticalCount = events.filter((e) => e.impact === "critico" || e.impact === "alto").length;
  const nearbyCount = events.filter((e) => (e.distanceKm ?? 99) <= 10).length;

  const formatDateRange = (s: string, e: string) => {
    const [sy, sm, sd] = s.split("-");
    const [ey, em, ed] = e.split("-");
    if (s === e) return `${sd}/${sm}/${sy}`;
    return `${sd}/${sm}/${sy} a ${ed}/${em}/${ey}`;
  };

  const getImpactBadge = (impact: EventImpact) => {
    switch (impact) {
      case "critico":
        return { bg: "#fee2e2", text: "#991b1b", border: "#fecaca", label: "Impacto Crítico" };
      case "alto":
        return { bg: "#ffedd5", text: "#9a3412", border: "#fed7aa", label: "Impacto Alto" };
      case "medio":
        return { bg: "#fef9c3", text: "#854d0e", border: "#fef08a", label: "Impacto Médio" };
      default:
        return { bg: "#e0f2fe", text: "#0369a1", border: "#bae6fd", label: "Impacto Baixo" };
    }
  };

  return (
    <>
      <Head>
        <title>Eventos — Allure Moema Precificação</title>
      </Head>
      <Layout
        title="Eventos"
        subtitle="Mapeamento e precificação inteligente com aplicação automática no calendário"
        user={user}
        actions={
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <button
              onClick={() => setShowScanModal(true)}
              className="btn btn-gold"
              style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, padding: "7px 16px" }}
            >
              <Sparkles size={15} />
              Escanear Eventos
            </button>
            <button
              onClick={fetchEvents}
              disabled={loading}
              className="btn btn-outline"
              style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, padding: "7px 14px" }}
            >
              <RefreshCw size={14} className={loading ? "spin" : ""} />
              Atualizar
            </button>
          </div>
        }
      >
        {/* Action Message Alert */}
        {actionMessage && (
          <div
            style={{
              padding: "12px 16px",
              borderRadius: "var(--r-md)",
              marginBottom: 20,
              display: "flex",
              alignItems: "center",
              gap: 10,
              fontSize: 13,
              background: actionMessage.type === "success" ? "#f0fdf4" : "#fef2f2",
              color: actionMessage.type === "success" ? "#166534" : "#991b1b",
              border: `1px solid ${actionMessage.type === "success" ? "#bbf7d0" : "#fecaca"}`,
            }}
          >
            {actionMessage.type === "success" ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
            <span style={{ flex: 1 }}>{actionMessage.text}</span>
            <button
              onClick={() => setActionMessage(null)}
              style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", fontSize: 14 }}
            >
              ✕
            </button>
          </div>
        )}

        {/* Stats Summary */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 14,
            marginBottom: 20,
          }}
        >
          {/* Card 1: Total Mapeados */}
          <div
            className="card"
            style={{
              padding: "16px 20px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div>
              <div style={{ fontSize: 11, color: "var(--mid)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>
                Total Mapeados
              </div>
              <div style={{ fontFamily: "var(--serif)", fontSize: "1.85rem", color: "var(--navy)", marginTop: 2, lineHeight: 1.1 }}>
                {events.length}
              </div>
              <div style={{ fontSize: 11, color: "var(--mid)", marginTop: 4 }}>
                SP & Região Metropolitana
              </div>
            </div>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: "var(--r-md)",
                background: "var(--paper-2)",
                border: "1px solid var(--line)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--navy)",
                flexShrink: 0,
              }}
            >
              <CalendarDays size={22} />
            </div>
          </div>

          {/* Card 2: BARs Ativos */}
          <div
            className="card"
            style={{
              padding: "16px 20px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div>
              <div style={{ fontSize: 11, color: "var(--mid)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>
                BARs no Calendário
              </div>
              <div style={{ fontFamily: "var(--serif)", fontSize: "1.85rem", color: "#166534", marginTop: 2, lineHeight: 1.1 }}>
                {activeCount}
              </div>
              <div style={{ fontSize: 11, color: "#16a34a", marginTop: 4, fontWeight: 500 }}>
                ● Tarifas automáticas ativas
              </div>
            </div>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: "var(--r-md)",
                background: "#f0fdf4",
                border: "1px solid #bbf7d0",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#166534",
                flexShrink: 0,
              }}
            >
              <CheckCircle2 size={22} />
            </div>
          </div>

          {/* Card 3: Alta Pressão Tarifária */}
          <div
            className="card"
            style={{
              padding: "16px 20px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div>
              <div style={{ fontSize: 11, color: "var(--mid)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>
                Alta Pressão Tarifária
              </div>
              <div style={{ fontFamily: "var(--serif)", fontSize: "1.85rem", color: "#c87941", marginTop: 2, lineHeight: 1.1 }}>
                {criticalCount}
              </div>
              <div style={{ fontSize: 11, color: "#9a3412", marginTop: 4 }}>
                Impacto Crítico / Alto
              </div>
            </div>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: "var(--r-md)",
                background: "#fff7ed",
                border: "1px solid #fed7aa",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#ea580c",
                flexShrink: 0,
              }}
            >
              <TrendingUp size={22} />
            </div>
          </div>

          {/* Card 4: Raio Imediato */}
          <div
            className="card"
            style={{
              padding: "16px 20px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div>
              <div style={{ fontSize: 11, color: "var(--mid)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>
                Raio Imediato (&lt;10km)
              </div>
              <div style={{ fontFamily: "var(--serif)", fontSize: "1.85rem", color: "var(--gold)", marginTop: 2, lineHeight: 1.1 }}>
                {nearbyCount}
              </div>
              <div style={{ fontSize: 11, color: "var(--mid)", marginTop: 4 }}>
                Moema, Ibirapuera & SP Expo
              </div>
            </div>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: "var(--r-md)",
                background: "var(--gold-soft)",
                border: "1px solid var(--gold-line)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--gold)",
                flexShrink: 0,
              }}
            >
              <MapPin size={22} />
            </div>
          </div>
        </div>

        {/* ── Single-line Filters & Search Bar with Icons ── */}
        <div
          className="card"
          style={{
            padding: "12px 16px",
            marginBottom: 20,
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "nowrap",
            overflowX: "auto",
          }}
        >
          {/* Search Input with Icon */}
          <div style={{ position: "relative", flex: "1 1 280px", minWidth: 220 }}>
            <Search
              size={15}
              style={{
                position: "absolute",
                left: 12,
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--mid)",
                pointerEvents: "none",
              }}
            />
            <input
              type="text"
              placeholder="Buscar evento por título, local ou descrição..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="form-input"
              style={{
                width: "100%",
                paddingLeft: 36,
                paddingRight: 12,
                fontSize: 13,
                height: 38,
              }}
            />
          </div>

          {/* Filter Status (Active / Paused) */}
          <div style={{ position: "relative", flex: "0 0 170px" }}>
            <CheckCircle2
              size={14}
              style={{
                position: "absolute",
                left: 10,
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--mid)",
                pointerEvents: "none",
              }}
            />
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="form-select"
              style={{ width: "100%", paddingLeft: 30, fontSize: 12, height: 38 }}
            >
              <option value="all">Todos os Status</option>
              <option value="active">● BARs Ativos ({activeCount})</option>
              <option value="disabled">○ Pausados ({events.length - activeCount})</option>
            </select>
          </div>

          {/* Filter Impact */}
          <div style={{ position: "relative", flex: "0 0 160px" }}>
            <Activity
              size={14}
              style={{
                position: "absolute",
                left: 10,
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--mid)",
                pointerEvents: "none",
              }}
            />
            <select
              value={filterImpact}
              onChange={(e) => setFilterImpact(e.target.value)}
              className="form-select"
              style={{ width: "100%", paddingLeft: 30, fontSize: 12, height: 38 }}
            >
              <option value="all">Todos os Impactos</option>
              <option value="critico">Crítico</option>
              <option value="alto">Alto</option>
              <option value="medio">Médio</option>
              <option value="baixo">Baixo</option>
            </select>
          </div>

          {/* Filter Category */}
          <div style={{ position: "relative", flex: "0 0 170px" }}>
            <Tag
              size={14}
              style={{
                position: "absolute",
                left: 10,
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--mid)",
                pointerEvents: "none",
              }}
            />
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="form-select"
              style={{ width: "100%", paddingLeft: 30, fontSize: 12, height: 38 }}
            >
              <option value="all">Todas as Categorias</option>
              <option value="feira_negocios">Feira de Negócios</option>
              <option value="congresso">Congresso</option>
              <option value="show_festival">Show / Festival</option>
              <option value="esporte">Esporte</option>
              <option value="feriado">Feriado</option>
            </select>
          </div>
        </div>

        {/* Event List */}
        {loading ? (
          <div style={{ textAlign: "center", padding: "48px 0", color: "var(--mid)" }}>
            <RefreshCw size={28} className="spin" style={{ margin: "0 auto 12px" }} />
            <p>Carregando eventos mapeados...</p>
          </div>
        ) : filteredEvents.length === 0 ? (
          <div className="card" style={{ textAlign: "center", padding: "48px 24px" }}>
            <Sparkles size={36} color="var(--gold)" style={{ margin: "0 auto 12px", opacity: 0.6 }} />
            <h3 style={{ fontFamily: "var(--serif)", fontSize: "1.3rem", color: "var(--navy)", margin: "0 0 8px" }}>
              Nenhum evento encontrado
            </h3>
            <p style={{ margin: "0 0 16px", fontSize: 13, color: "var(--mid)" }}>
              Escaneie novos congressos, feiras e shows de São Paulo para aplicar tarifas automáticas.
            </p>
            <button onClick={() => setShowScanModal(true)} className="btn btn-gold">
              <Sparkles size={15} /> Escanear Eventos Agora
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {filteredEvents.map((event) => {
              const badge = getImpactBadge(event.impact);
              const isEnabled = event.enabled !== false;
              const isToggling = togglingId === event.id;

              const leadIn = event.leadInDays ?? 1;
              const effectiveStart = event.effectiveStartDate || addDays(event.startDate, -leadIn);

              return (
                <div
                  key={event.id}
                  className="card"
                  style={{
                    padding: "20px 24px",
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 20,
                    flexWrap: "wrap",
                    alignItems: "flex-start",
                    opacity: isEnabled ? 1 : 0.75,
                    borderLeft: `4px solid ${
                      !isEnabled
                        ? "var(--line)"
                        : event.impact === "critico"
                        ? "#ef4444"
                        : event.impact === "alto"
                        ? "#f97316"
                        : "var(--gold)"
                    }`,
                    transition: "all 0.2s ease",
                  }}
                >
                  <div style={{ flex: "1 1 520px", minWidth: 280 }}>
                    {/* Badges Header */}
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                      {/* Active Status Badge */}
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          padding: "2px 10px",
                          borderRadius: "50px",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 5,
                          background: isEnabled ? "#dcfce7" : "var(--paper-2)",
                          color: isEnabled ? "#166534" : "var(--mid)",
                          border: `1px solid ${isEnabled ? "#bbf7d0" : "var(--line)"}`,
                        }}
                      >
                        <span
                          style={{
                            width: 7,
                            height: 7,
                            borderRadius: "50%",
                            background: isEnabled ? "#16a34a" : "#94a3b8",
                          }}
                        />
                        {isEnabled ? `BAR ${event.recommendedBar} Aplicado` : "BAR Pausado"}
                      </span>

                      {/* Impact Badge */}
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          textTransform: "uppercase",
                          padding: "2px 8px",
                          borderRadius: "50px",
                          background: badge.bg,
                          color: badge.text,
                          border: `1px solid ${badge.border}`,
                        }}
                      >
                        {badge.label}
                      </span>

                      {/* Category */}
                      {event.category && (
                        <span
                          style={{
                            fontSize: 11,
                            color: "var(--mid)",
                            textTransform: "capitalize",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 4,
                          }}
                        >
                          <Tag size={11} /> {event.category.replace("_", " ")}
                        </span>
                      )}
                    </div>

                    {/* Title */}
                    <h3
                      style={{
                        fontFamily: "var(--serif)",
                        fontSize: "1.35rem",
                        fontWeight: 400,
                        color: "var(--navy)",
                        margin: "0 0 8px",
                      }}
                    >
                      {event.title}
                    </h3>

                    {/* Info items */}
                    <div
                      style={{
                        display: "flex",
                        gap: 16,
                        flexWrap: "wrap",
                        fontSize: 12,
                        color: "var(--mid)",
                        marginBottom: 10,
                      }}
                    >
                      {/* Dates including Lead-in */}
                      <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                        <Calendar size={13} color="var(--gold)" />
                        <strong>{formatDateRange(event.startDate, event.endDate)}</strong>
                        <span
                          style={{
                            fontSize: 10,
                            padding: "1px 6px",
                            borderRadius: 4,
                            background: "var(--gold-soft)",
                            color: "var(--navy)",
                            fontWeight: 500,
                          }}
                          title={`A tarifa BAR é aplicada desde a véspera (${formatDate(effectiveStart)}) para cobrir a chegada de hóspedes`}
                        >
                          Tarifa de {formatDate(effectiveStart)} a {formatDate(event.endDate)} (D-{leadIn})
                        </span>
                      </span>

                      {/* Location & Distance */}
                      <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <MapPin size={13} color="var(--gold)" />
                        {event.location} {event.distanceKm ? `(~${event.distanceKm} km de Moema)` : ""}
                      </span>

                      {/* Attendance */}
                      {event.estimatedAttendance && (
                        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <Users size={13} color="var(--gold)" />
                          {event.estimatedAttendance}
                        </span>
                      )}
                    </div>

                    <p style={{ margin: 0, fontSize: 13, color: "var(--body)", lineHeight: 1.55 }}>
                      {event.reason}
                    </p>
                  </div>

                  {/* Actions / Switch on the Right Side */}
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                      alignItems: "flex-end",
                      gap: 16,
                      flex: "0 0 auto",
                    }}
                  >
                    {/* Toggle Switch */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        background: "var(--paper-2)",
                        padding: "6px 12px",
                        borderRadius: "var(--r-md)",
                        border: "1px solid var(--line)",
                      }}
                    >
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--navy)" }}>
                          {isEnabled ? "BAR Ativo no Calendário" : "BAR Desativado"}
                        </div>
                        <div style={{ fontSize: 10, color: "var(--mid)" }}>
                          {isEnabled ? `Aplicando BAR ${event.recommendedBar}` : "Usando base normal"}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleToggleEvent(event)}
                        disabled={isToggling}
                        title={isEnabled ? "Desativar este evento do calendário" : "Ativar este evento no calendário"}
                        style={{
                          width: 44,
                          height: 24,
                          borderRadius: 50,
                          background: isEnabled ? "var(--gold)" : "var(--line)",
                          border: "none",
                          cursor: "pointer",
                          position: "relative",
                          transition: "background 0.2s",
                          padding: 2,
                        }}
                      >
                        <div
                          style={{
                            width: 20,
                            height: 20,
                            borderRadius: "50%",
                            background: "#fff",
                            transform: isEnabled ? "translateX(20px)" : "translateX(0px)",
                            transition: "transform 0.2s",
                            boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                          }}
                        />
                      </button>
                    </div>

                    {/* Delete button */}
                    <button
                      onClick={() => handleDelete(event.id)}
                      className="btn btn-ghost"
                      style={{ color: "var(--mid)", padding: "4px 8px", fontSize: 12 }}
                      title="Excluir evento"
                    >
                      <Trash2 size={14} style={{ marginRight: 4 }} />
                      Excluir
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Modal: Scan Events */}
        {showScanModal && (
          <div className="modal-backdrop" onClick={() => !scanning && setShowScanModal(false)}>
            <div className="modal-box" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Sparkles size={20} color="var(--gold)" />
                  <h3 className="modal-title" style={{ margin: 0 }}>
                    Escanear Novos Eventos
                  </h3>
                </div>
                {!scanning && (
                  <button onClick={() => setShowScanModal(false)} className="btn btn-ghost" style={{ padding: 4 }}>
                    ✕
                  </button>
                )}
              </div>

              <p style={{ fontSize: 13, color: "var(--mid)", margin: "0 0 16px", lineHeight: 1.5 }}>
                A varredura inteligente pesquisa convenções no <strong>São Paulo Expo</strong>, <strong>Ibirapuera</strong>,
                congressos médicos, festivais e feiras corporativas no raio de influência do <strong>Allure Moema</strong>.
                Os BARs recomendados são <strong>aplicados automaticamente</strong> cobrindo a véspera (D-1).
              </p>

              <form onSubmit={handleScan}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
                  <div>
                    <label className="form-label">Data Início</label>
                    <input
                      type="date"
                      value={scanStart}
                      onChange={(e) => setScanStart(e.target.value)}
                      className="form-input"
                      required
                    />
                  </div>
                  <div>
                    <label className="form-label">Data Fim</label>
                    <input
                      type="date"
                      value={scanEnd}
                      onChange={(e) => setScanEnd(e.target.value)}
                      className="form-input"
                      required
                    />
                  </div>
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                  <button
                    type="button"
                    onClick={() => setShowScanModal(false)}
                    disabled={scanning}
                    className="btn btn-outline"
                  >
                    Cancelar
                  </button>
                  <button type="submit" disabled={scanning} className="btn btn-gold">
                    {scanning ? (
                      <>
                        <RefreshCw size={14} className="spin" />
                        Pesquisando eventos...
                      </>
                    ) : (
                      <>
                        <Sparkles size={14} />
                        Iniciar Varredura
                      </>
                    )}
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
