import { useState, useEffect, useCallback } from "react";
import Head from "next/head";
import Link from "next/link";
import Image from "next/image";
import Layout from "@/components/layout/Layout";
import { useAuth } from "@/contexts/AuthContext";
import type {
  BarPeriod,
  Season,
  IntegrationSettings,
  DesbravadorSyncLog,
  DesbravadorComparisonItem,
  RoomId,
} from "@/types";
import { formatDate, todayISO, addDays, formatCurrency } from "@/lib/utils";
import { ROOMS } from "@/data/rooms";
import {
  getRatesForRoom,
  OPERATIONAL_BAR_LEVELS,
  barToSeason,
} from "@/lib/pricing-engine";
import {
  DESBRAVADOR_PLANS,
  DESBRAVADOR_CONFIG,
  DESBRAVADOR_ROOM_MAP,
  buildDesbravadorPayload,
} from "@/lib/desbravador";
import {
  Plus,
  Trash2,
  Edit2,
  X,
  Check,
  AlertCircle,
  Info,
  Radio,
  Send,
  RefreshCw,
  Zap,
  CheckCircle2,
  Sliders,
  ShieldCheck,
  Clock,
  Terminal,
  User,
  Users,
  Coffee,
  Ban,
  TrendingUp,
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
  Calendar,
  Layers,
  Sparkles,
  ArrowRight,
} from "lucide-react";

const SEASON_OPTIONS: { value: Season; label: string }[] = [
  { value: "alta", label: "Alta Temporada" },
  { value: "media", label: "Média Temporada" },
  { value: "normal", label: "Temporada Normal" },
  { value: "baixa", label: "Baixa Temporada" },
];

const SEASON_LABEL: Record<Season, string> = {
  alta: "Alta",
  media: "Média",
  normal: "Normal",
  baixa: "Baixa",
};

interface PeriodFormData {
  startDate: string;
  endDate: string;
  barLevel: number;
  season: Season;
  notes: string;
}

const EMPTY_FORM: PeriodFormData = {
  startDate: "",
  endDate: "",
  barLevel: 5,
  season: "normal",
  notes: "",
};

type ActiveTab = "bar-periods" | "bar-table" | "integracoes";

export default function ConfiguracoesPage() {
  const { user, loading: authLoading } = useAuth();
  const [tab, setTab] = useState<ActiveTab>("bar-periods");
  const [periods, setPeriods] = useState<BarPeriod[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<PeriodFormData>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // BAR table view options
  const [barTablePax, setBarTablePax] = useState<1 | 2>(1);
  const [barTableBreakfast, setBarTableBreakfast] = useState(false);

  // Integration Settings & Logs (Starts disabled by default)
  const [integrationSettings, setIntegrationSettings] = useState<IntegrationSettings>({
    desbravadorAutoSync: false,
    desbravadorCompanyId: 6181,
    desbravadorChannelId: 4484,
    syncHorizonDays: 30,
  });
  const [integrationLogs, setIntegrationLogs] = useState<DesbravadorSyncLog[]>([]);
  const [loadingIntegration, setLoadingIntegration] = useState(false);
  const [syncingNow, setSyncingNow] = useState(false);

  // API Test Panel state
  const [isLocalhost, setIsLocalhost] = useState(false);
  const [testStartDate, setTestStartDate] = useState(todayISO());
  const [testEndDate, setTestEndDate] = useState(addDays(todayISO(), 1));
  const [testPlanId, setTestPlanId] = useState<number>(DESBRAVADOR_PLANS.WITHOUT_BREAKFAST.id);
  const [testOffsetCents, setTestOffsetCents] = useState<number>(1); // +1 centavo
  const [testRoomId, setTestRoomId] = useState<RoomId>("standard");
  const [testSending, setTestSending] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);

  const fetchPeriods = useCallback(async () => {
    if (authLoading || !user) return;
    setLoading(true);
    try {
      const res = await fetch("/api/bar-periods");
      const json = await res.json();
      setPeriods(json.periods ?? []);
    } finally {
      setLoading(false);
    }
  }, [authLoading, user]);

  const fetchIntegrationStatus = useCallback(async () => {
    if (authLoading || !user) return;
    setLoadingIntegration(true);
    try {
      const res = await fetch("/api/desbravador/status");
      if (res.ok) {
        const json = await res.json();
        if (json.settings) setIntegrationSettings(json.settings);
        if (json.logs) setIntegrationLogs(json.logs);
      }
    } finally {
      setLoadingIntegration(false);
    }
  }, [authLoading, user]);

  useEffect(() => {
    fetchPeriods();
    fetchIntegrationStatus();
    if (typeof window !== "undefined") {
      const host = window.location.hostname;
      setIsLocalhost(
        host === "localhost" ||
        host === "127.0.0.1" ||
        host.startsWith("192.168.") ||
        process.env.NODE_ENV === "development"
      );
    }
  }, [fetchPeriods, fetchIntegrationStatus]);

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError("");
    setShowForm(true);
  };

  const openEdit = (period: BarPeriod) => {
    setEditingId(period.id);
    setForm({
      startDate: period.startDate,
      endDate: period.endDate,
      barLevel: period.barLevel,
      season: period.season,
      notes: period.notes ?? "",
    });
    setError("");
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError("");
  };

  const handleBarChange = (bar: number) => {
    const s = barToSeason(bar);
    setForm((prev) => ({ ...prev, barLevel: bar, season: s }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.startDate || !form.endDate) {
      setError("Preencha as datas de início e fim.");
      return;
    }
    if (form.startDate > form.endDate) {
      setError("A data de início deve ser anterior à data de fim.");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      if (editingId) {
        const res = await fetch(`/api/bar-periods/${editingId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Erro ao atualizar");
        setSuccess("Período atualizado com sucesso!");
      } else {
        const res = await fetch("/api/bar-periods", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Erro ao criar");
        setSuccess("Período criado com sucesso!");
      }

      closeForm();
      await fetchPeriods();
      setTimeout(() => setSuccess(""), 4000);
    } catch (err: any) {
      setError(err.message || "Ocorreu um erro.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/bar-periods/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || "Erro ao excluir");
      }
      setDeleteConfirm(null);
      setSuccess("Período excluído com sucesso.");
      await fetchPeriods();
      setTimeout(() => setSuccess(""), 4000);
    } catch (err: any) {
      setError(err.message || "Erro ao excluir período.");
    }
  };

  const handleToggleAutoSync = async () => {
    const nextVal = !integrationSettings.desbravadorAutoSync;
    setIntegrationSettings((prev) => ({ ...prev, desbravadorAutoSync: nextVal }));

    try {
      const res = await fetch("/api/desbravador/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ desbravadorAutoSync: nextVal }),
      });
      if (res.ok) {
        setSuccess(
          nextVal
            ? "Distribuição automática ativada para o Desbravador."
            : "Distribuição automática desativada."
        );
        setTimeout(() => setSuccess(""), 4000);
      }
    } catch (err) {
      console.error("Failed to update auto sync status:", err);
    }
  };

  const handleChangeHorizon = async (horizonDays: number) => {
    setIntegrationSettings((prev) => ({ ...prev, syncHorizonDays: horizonDays }));
    try {
      await fetch("/api/desbravador/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ syncHorizonDays: horizonDays }),
      });
    } catch (err) {
      console.error("Failed to update horizon:", err);
    }
  };

  const handleTriggerManualSync = async () => {
    setSyncingNow(true);
    setError("");
    try {
      const res = await fetch("/api/desbravador/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          horizonDays: integrationSettings.syncHorizonDays || 30,
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Falha na sincronização");

      setSuccess(`Sincronização enviada para o Desbravador com sucesso! (${json.count} planos)`);
      setTimeout(() => setSuccess(""), 4000);
      await fetchIntegrationStatus();
    } catch (err: any) {
      setError(err.message || "Erro ao sincronizar tarifas com Desbravador");
    } finally {
      setSyncingNow(false);
    }
  };

  const handleSendTestRate = async (e: React.FormEvent) => {
    e.preventDefault();
    setTestSending(true);
    setTestResult(null);
    setError("");

    try {
      const res = await fetch("/api/desbravador/test-rate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startDate: testStartDate,
          endDate: testEndDate,
          planId: testPlanId,
          offsetCents: testOffsetCents,
          roomId: testRoomId,
        }),
      });

      const json = await res.json();
      setTestResult(json);
      await fetchIntegrationStatus();
    } catch (err: any) {
      setError(err.message || "Erro ao disparar teste de API");
    } finally {
      setTestSending(false);
    }
  };

  const isAdmin = user?.role === "admin";

  const getPriceKey = (breakfast: boolean, pax: 1 | 2) => {
    if (breakfast) return pax === 2 ? "with_breakfast_2pax" : "with_breakfast_1pax";
    return pax === 2 ? "without_breakfast_2pax" : "without_breakfast_1pax";
  };

  return (
    <>
      <Head>
        <title>Configurações — Allure Moema Precificação</title>
      </Head>
      <Layout
        title="Configurações & Integrações"
        subtitle="Gerencie períodos BAR, tabela de tarifas e distribuição para o Desbravador CM"
        user={user}
        actions={
          tab === "bar-periods" && isAdmin ? (
            <button onClick={openCreate} className="btn btn-gold" style={{ fontSize: 13 }}>
              <Plus size={14} />
              Novo Período
            </button>
          ) : undefined
        }
      >
        {/* Tabs */}
        <div
          style={{
            display: "flex",
            gap: 0,
            background: "var(--paper)",
            border: "1px solid var(--line)",
            borderRadius: "var(--r-md)",
            padding: 4,
            width: "fit-content",
            marginBottom: 24,
          }}
        >
          {(["bar-periods", "bar-table", "integracoes"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding: "8px 18px",
                borderRadius: "var(--r-sm)",
                fontSize: 13,
                fontWeight: tab === t ? 600 : 400,
                color: tab === t ? "var(--navy)" : "var(--mid)",
                background: tab === t ? "var(--cream)" : "transparent",
                border: "none",
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              {t === "bar-periods" && "Períodos BAR"}
              {t === "bar-table" && "Tabela de Tarifas (BAR 1 a 10)"}
              {t === "integracoes" && "Integração Desbravador CM"}
            </button>
          ))}
        </div>

        {/* Feedback Messages */}
        {success && (
          <div
            style={{
              padding: "10px 14px",
              borderRadius: "var(--r-md)",
              marginBottom: 16,
              background: "#f0fdf4",
              border: "1px solid #bbf7d0",
              color: "#166534",
              fontSize: 13,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <CheckCircle2 size={16} />
            {success}
          </div>
        )}

        {error && (
          <div
            style={{
              padding: "10px 14px",
              borderRadius: "var(--r-md)",
              marginBottom: 16,
              background: "#fef2f2",
              border: "1px solid #fecaca",
              color: "#991b1b",
              fontSize: 13,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <AlertCircle size={16} />
            {error}
          </div>
        )}

        {/* ── TAB 1: PERÍODOS BAR ── */}
        {tab === "bar-periods" && (
          <div>
            <div className="card" style={{ padding: 0 }}>
              {loading ? (
                <div style={{ padding: 32, textAlign: "center", color: "var(--mid)", fontSize: 13 }}>
                  Carregando períodos...
                </div>
              ) : periods.length === 0 ? (
                <div style={{ padding: 48, textAlign: "center" }}>
                  <p style={{ color: "var(--mid)", margin: "0 0 16px", fontSize: 13 }}>
                    Nenhum período BAR configurado. O sistema usará o calendário histórico.
                  </p>
                  {isAdmin && (
                    <button onClick={openCreate} className="btn btn-gold" style={{ fontSize: 13 }}>
                      <Plus size={14} /> Criar Primeiro Período
                    </button>
                  )}
                </div>
              ) : (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Período</th>
                      <th>Duração</th>
                      <th>BAR</th>
                      <th>Temporada</th>
                      <th>Notas</th>
                      {isAdmin && <th style={{ textAlign: "right" }}>Ações</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {periods.map((p) => {
                      const days = Math.round(
                        (new Date(p.endDate).getTime() - new Date(p.startDate).getTime()) /
                          (1000 * 60 * 60 * 24)
                      ) + 1;
                      return (
                        <tr key={p.id}>
                          <td>
                            <strong>{formatDate(p.startDate)}</strong> até{" "}
                            <strong>{formatDate(p.endDate)}</strong>
                          </td>
                          <td style={{ color: "var(--mid)", fontSize: 12 }}>{days} dias</td>
                          <td>
                            <span
                              style={{
                                display: "inline-block",
                                padding: "2px 8px",
                                borderRadius: 4,
                                background: "var(--gold-soft)",
                                color: "var(--navy)",
                                fontWeight: 600,
                                fontSize: 12,
                              }}
                            >
                              BAR {p.barLevel}
                            </span>
                          </td>
                          <td>
                            <span
                              style={{
                                display: "inline-block",
                                padding: "2px 8px",
                                borderRadius: 4,
                                fontSize: 11,
                                fontWeight: 500,
                                background:
                                  p.season === "alta"
                                    ? "#fee2e2"
                                    : p.season === "media"
                                    ? "#ffedd5"
                                    : p.season === "normal"
                                    ? "#f0fdf4"
                                    : "#e0f2fe",
                                color:
                                  p.season === "alta"
                                    ? "#991b1b"
                                    : p.season === "media"
                                    ? "#9a3412"
                                    : p.season === "normal"
                                    ? "#166534"
                                    : "#0369a1",
                              }}
                            >
                              {SEASON_LABEL[p.season]}
                            </span>
                          </td>
                          <td style={{ color: "var(--mid)", fontSize: 12, maxWidth: 220 }}>
                            {p.notes || "—"}
                          </td>
                          {isAdmin && (
                            <td style={{ textAlign: "right" }}>
                              <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                                <button
                                  onClick={() => openEdit(p)}
                                  className="btn btn-ghost"
                                  style={{ padding: 6 }}
                                  title="Editar"
                                >
                                  <Edit2 size={14} />
                                </button>
                                {deleteConfirm === p.id ? (
                                  <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                                    <button
                                      onClick={() => handleDelete(p.id)}
                                      className="btn btn-danger"
                                      style={{ padding: "4px 8px", fontSize: 11 }}
                                    >
                                      Confirmar
                                    </button>
                                    <button
                                      onClick={() => setDeleteConfirm(null)}
                                      className="btn btn-ghost"
                                      style={{ padding: 4 }}
                                    >
                                      <X size={13} />
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => setDeleteConfirm(p.id)}
                                    className="btn btn-ghost"
                                    style={{ padding: 6, color: "var(--dim)" }}
                                    title="Excluir"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                )}
                              </div>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* ── TAB 2: TABELA DE TARIFAS ── */}
        {tab === "bar-table" && (
          <div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 16,
                flexWrap: "wrap",
                gap: 12,
              }}
            >
              <div>
                <p style={{ margin: 0, fontSize: 13, color: "var(--mid)" }}>
                  Matriz oficial de tarifas calculadas para cada BAR level (1 = máxima alta temporada; 10 = baixa temporada).
                </p>
              </div>

              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <div style={{ display: "flex", gap: 4 }}>
                  {([1, 2] as const).map((p) => (
                    <button
                      key={p}
                      onClick={() => setBarTablePax(p)}
                      className={`btn ${barTablePax === p ? "btn-primary" : "btn-outline"}`}
                      style={{ padding: "4px 10px", fontSize: 12 }}
                    >
                      {p} Pax
                    </button>
                  ))}
                </div>

                <div style={{ display: "flex", gap: 4 }}>
                  {[false, true].map((b) => (
                    <button
                      key={String(b)}
                      onClick={() => setBarTableBreakfast(b)}
                      className={`btn ${barTableBreakfast === b ? "btn-gold" : "btn-outline"}`}
                      style={{ padding: "4px 10px", fontSize: 12 }}
                    >
                      {b ? "Com Café" : "Sem Café"}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
              {OPERATIONAL_BAR_LEVELS.map((b) => {
                const s = barToSeason(b);
                return (
                  <div
                    key={b}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 5,
                      padding: "3px 10px",
                      borderRadius: "50px",
                      border: "1px solid var(--line)",
                      background:
                        b <= 2
                          ? "#fff3e6"
                          : b <= 4
                          ? "var(--gold-soft)"
                          : b <= 6
                          ? "#eef2f6"
                          : "#e2eaf2",
                      fontSize: 11,
                    }}
                  >
                    <strong>BAR {b}</strong>
                    <span style={{ color: "var(--mid)" }}>·</span>
                    <span style={{ color: "var(--mid)" }}>
                      {s === "alta" ? "Alta" : s === "media" ? "Média" : s === "normal" ? "Normal" : "Baixa"}
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="card" style={{ padding: 0, overflowX: "auto" }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ minWidth: 180 }}>Quarto</th>
                    {OPERATIONAL_BAR_LEVELS.map((b) => (
                      <th key={b} style={{ textAlign: "center", minWidth: 86 }}>
                        BAR {b}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ROOMS.map((room) => (
                    <tr key={room.id}>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div
                            style={{
                              position: "relative",
                              width: 44,
                              height: 34,
                              borderRadius: 6,
                              overflow: "hidden",
                              flexShrink: 0,
                            }}
                          >
                            <Image
                              src={`/images/accommodations/${room.id}.webp`}
                              alt={room.name}
                              fill
                              style={{ objectFit: "cover" }}
                              sizes="44px"
                            />
                          </div>
                          <div>
                            <div style={{ fontWeight: 500, fontSize: 13 }}>{room.name}</div>
                            <div style={{ fontSize: 11, color: "var(--mid)" }}>{room.sqm}m²</div>
                          </div>
                        </div>
                      </td>
                      {OPERATIONAL_BAR_LEVELS.map((b) => {
                        const rates = getRatesForRoom(room.id, b);
                        const key = getPriceKey(barTableBreakfast, barTablePax);
                        const price = rates?.[key as keyof typeof rates] ?? 0;
                        const season = barToSeason(b);
                        return (
                          <td
                            key={b}
                            style={{
                              textAlign: "center",
                              fontFamily: "var(--serif)",
                              fontSize: 14,
                              background:
                                b <= 2
                                  ? "rgba(200,121,65,0.06)"
                                  : b <= 4
                                  ? "rgba(168,144,112,0.06)"
                                  : b <= 6
                                  ? "transparent"
                                  : "rgba(176,189,208,0.08)",
                              fontWeight: season === "alta" ? 500 : 400,
                            }}
                          >
                            {formatCurrency(price)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── TAB 3: INTEGRAÇÕES (DESBRAVADOR CM) ── */}
        {tab === "integracoes" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            {/* Prominent VPS Staging Safety Callout */}
            <div
              style={{
                padding: "16px 20px",
                borderRadius: "var(--r-md)",
                background: "#fef3c7",
                border: "1px solid #fde68a",
                color: "#92400e",
                display: "flex",
                alignItems: "flex-start",
                gap: 12,
              }}
            >
              <Info size={20} style={{ flexShrink: 0, marginTop: 2, color: "#b45309" }} />
              <div>
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 2, color: "#78350f" }}>
                  Distribuição Automática Desativada (Proteção Operacional)
                </div>
                <div style={{ fontSize: 12, lineHeight: 1.55 }}>
                  O envio em lote e automático das tarifas para o Desbravador ocorrerá de forma agendada via rotina de sincronização quando a distribuição for habilitada. O interruptor abaixo permanece desligado por padrão.
                  Você pode auditar o comparativo das tarifas atuais do PMS vs o sugerido do sistema logo abaixo.
                </div>
              </div>
            </div>

            {/* Top Status & Distribution Switch */}
            <div
              className="card"
              style={{
                padding: "20px 24px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: 16,
              }}
            >
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: "50%",
                      background: integrationSettings.desbravadorAutoSync ? "#22c55e" : "#94a3b8",
                    }}
                  />
                  <h3
                    style={{
                      margin: 0,
                      fontFamily: "var(--serif)",
                      fontSize: "1.25rem",
                      fontWeight: 400,
                      color: "var(--navy)",
                    }}
                  >
                    Desbravador Channel Manager (Bebook Sync)
                  </h3>
                </div>
                <p style={{ margin: 0, fontSize: 12, color: "var(--mid)" }}>
                  Protocolo: <strong>{DESBRAVADOR_CONFIG.PROTOCOL}</strong> · Company ID:{" "}
                  <strong>{DESBRAVADOR_CONFIG.COMPANY_ID}</strong> · Canal:{" "}
                  <strong>{DESBRAVADOR_CONFIG.CHANNEL_ID}</strong>
                </p>
              </div>

              {/* Toggle switch & Sync Now button */}
              <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 13, fontWeight: 500, color: "var(--navy)" }}>
                    {integrationSettings.desbravadorAutoSync ? "Distribuição Ativa" : "Distribuição Desligada"}
                  </span>
                  <button
                    onClick={handleToggleAutoSync}
                    title={
                      integrationSettings.desbravadorAutoSync
                        ? "Desligar distribuição automática"
                        : "Ligar distribuição automática"
                    }
                    style={{
                      width: 48,
                      height: 26,
                      borderRadius: 50,
                      background: integrationSettings.desbravadorAutoSync ? "var(--gold)" : "var(--line)",
                      border: "none",
                      cursor: "pointer",
                      position: "relative",
                      transition: "background 0.2s",
                      padding: 2,
                    }}
                  >
                    <div
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: "50%",
                        background: "#fff",
                        transform: integrationSettings.desbravadorAutoSync ? "translateX(22px)" : "translateX(0px)",
                        transition: "transform 0.2s",
                        boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                      }}
                    />
                  </button>
                </div>

                <div style={{ width: 1, height: 28, background: "var(--line)" }} />

                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 12, color: "var(--mid)" }}>Horizonte:</span>
                  <select
                    value={integrationSettings.syncHorizonDays || 30}
                    onChange={(e) => handleChangeHorizon(Number(e.target.value))}
                    className="form-select"
                    style={{ fontSize: 12, padding: "4px 8px" }}
                  >
                    <option value={7}>7 dias</option>
                    <option value={15}>15 dias</option>
                    <option value={30}>30 dias</option>
                    <option value={60}>60 dias</option>
                    <option value={90}>90 dias</option>
                  </select>

                  <button
                    onClick={handleTriggerManualSync}
                    disabled={syncingNow}
                    className="btn btn-gold"
                    style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}
                  >
                    <RefreshCw size={14} className={syncingNow ? "spin" : ""} />
                    {syncingNow ? "Sincronizando..." : "Sincronizar Tarifas Agora"}
                  </button>
                </div>
              </div>
            </div>

            {/* ── BANNER AUDITORIA TARIFÁRIA & RECEITA ── */}
            <div
              className="card"
              style={{
                padding: "20px 24px",
                background: "linear-gradient(135deg, var(--paper-2) 0%, var(--gold-soft) 100%)",
                border: "1px solid var(--gold-line)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: 16,
              }}
            >
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <BarChart3 size={18} color="var(--gold)" />
                  <h3 className="card-title" style={{ margin: 0 }}>
                    Painel de Auditoria de Tarifas & Simulação de Receita
                  </h3>
                </div>
                <p style={{ margin: 0, fontSize: 13, color: "var(--navy)", opacity: 0.85, maxWidth: 640, lineHeight: 1.5 }}>
                  Acesse o painel completo de auditoria para confrontar as tarifas do Desbravador com o sugerido do sistema e simular o <strong>Yield Gap (faturado real vs. faturamento potencial)</strong> com base no volume de ocupação.
                </p>
              </div>

              <Link
                href="/auditoria"
                className="btn btn-gold"
                style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, textDecoration: "none" }}
              >
                <BarChart3 size={15} />
                Abrir Painel de Auditoria
                <ArrowRight size={14} />
              </Link>
            </div>

            {/* API Test Panel (+/- R$ 0,01) - Visible only in localhost */}
            {isLocalhost && (
              <div
                className="card"
                style={{
                  border: "1px solid var(--gold-line)",
                  background: "linear-gradient(180deg, var(--paper) 0%, var(--paper-2) 100%)",
                  padding: "20px 24px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  <Zap size={18} color="var(--gold)" />
                  <h3 className="card-title" style={{ margin: 0 }}>
                    Painel de Teste de API Desbravador (+/- R$ 0,01)
                  </h3>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      padding: "2px 6px",
                      borderRadius: 4,
                      background: "var(--navy)",
                      color: "#fff",
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                    }}
                  >
                    Ambiente Local
                  </span>
                </div>
                <p style={{ margin: "0 0 16px", fontSize: 12, color: "var(--mid)", lineHeight: 1.5 }}>
                  Envie uma tarifa de teste com variação pontual de <strong>+1 centavo</strong> ou <strong>-1 centavo</strong> para
                  validar a comunicação ponta a ponta com o Channel Manager sem alterar a operação comercial.
                </p>

                <form onSubmit={handleSendTestRate}>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                      gap: 12,
                      marginBottom: 16,
                    }}
                  >
                    <div>
                      <label className="form-label">Data Início</label>
                      <input
                        type="date"
                        value={testStartDate}
                        onChange={(e) => setTestStartDate(e.target.value)}
                        className="form-input"
                        style={{ fontSize: 12 }}
                        required
                      />
                    </div>

                    <div>
                      <label className="form-label">Data Fim</label>
                      <input
                        type="date"
                        value={testEndDate}
                        onChange={(e) => setTestEndDate(e.target.value)}
                        className="form-input"
                        style={{ fontSize: 12 }}
                        required
                      />
                    </div>

                    <div>
                      <label className="form-label">Tipologia</label>
                      <select
                        value={testRoomId}
                        onChange={(e) => setTestRoomId(e.target.value as RoomId)}
                        className="form-select"
                        style={{ fontSize: 12 }}
                      >
                        {ROOMS.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name} (Unit {DESBRAVADOR_ROOM_MAP[r.id as RoomId]})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="form-label">Plano de Tarifa</label>
                      <select
                        value={testPlanId}
                        onChange={(e) => setTestPlanId(Number(e.target.value))}
                        className="form-select"
                        style={{ fontSize: 12 }}
                      >
                        <option value={DESBRAVADOR_PLANS.WITHOUT_BREAKFAST.id}>
                          {DESBRAVADOR_PLANS.WITHOUT_BREAKFAST.name} (ID {DESBRAVADOR_PLANS.WITHOUT_BREAKFAST.id})
                        </option>
                        <option value={DESBRAVADOR_PLANS.WITH_BREAKFAST.id}>
                          {DESBRAVADOR_PLANS.WITH_BREAKFAST.name} (ID {DESBRAVADOR_PLANS.WITH_BREAKFAST.id})
                        </option>
                      </select>
                    </div>

                    <div>
                      <label className="form-label">Offset de Teste</label>
                      <select
                        value={testOffsetCents}
                        onChange={(e) => setTestOffsetCents(Number(e.target.value))}
                        className="form-select"
                        style={{ fontSize: 12, fontWeight: 600 }}
                      >
                        <option value={1}>+ R$ 0,01 (+1 centavo)</option>
                        <option value={-1}>- R$ 0,01 (-1 centavo)</option>
                        <option value={100}>+ R$ 1,00 (+1 real)</option>
                        <option value={-100}>- R$ 1,00 (-1 real)</option>
                        <option value={0}>Sem offset (Preço Original)</option>
                      </select>
                    </div>
                  </div>

                  <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                    <button
                      type="submit"
                      disabled={testSending}
                      className="btn btn-gold"
                      style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}
                    >
                      <Send size={13} />
                      {testSending ? "Enviando Teste..." : "Disparar Teste de API no Desbravador"}
                    </button>
                  </div>
                </form>

                {/* Real-time Test Response Preview */}
                {testResult && (
                  <div
                    style={{
                      marginTop: 18,
                      padding: "14px 16px",
                      borderRadius: "var(--r-sm)",
                      background: testResult.success ? "#f0fdf4" : "#fef2f2",
                      border: `1px solid ${testResult.success ? "#bbf7d0" : "#fecaca"}`,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 600, fontSize: 13, color: testResult.success ? "#166534" : "#991b1b" }}>
                        {testResult.success ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                        {testResult.success ? "Tarifa de Teste Aceita com Sucesso pela API!" : "Erro Retornado pela API"}
                      </div>
                      <span style={{ fontSize: 11, color: "var(--mid)" }}>
                        Status HTTP {testResult.statusCode} · {testResult.durationMs}ms
                      </span>
                    </div>

                    <div style={{ fontSize: 11, fontFamily: "monospace", background: "#fff", padding: 10, borderRadius: 4, overflowX: "auto" }}>
                      <strong>Resposta Desbravador:</strong> {JSON.stringify(testResult.rawResponse)}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Sync Logs Table */}
            <div className="card" style={{ padding: 0 }}>
              <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--line)" }}>
                <h3 className="card-title" style={{ margin: 0 }}>
                  Histórico de Execuções & Sincronizações
                </h3>
              </div>

              {integrationLogs.length === 0 ? (
                <div style={{ padding: "32px 0", textAlign: "center", color: "var(--mid)", fontSize: 13 }}>
                  Nenhum log de sincronização registrado ainda.
                </div>
              ) : (
                <table className="data-table" style={{ width: "100%", fontSize: 12 }}>
                  <thead>
                    <tr>
                      <th>Data / Hora</th>
                      <th>Plano</th>
                      <th>Período</th>
                      <th>Tarifas</th>
                      <th>Status</th>
                      <th>Disparo</th>
                      <th>Mensagem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {integrationLogs.map((log) => {
                      const formattedTime = new Date(log.timestamp).toLocaleString("pt-BR", {
                        dateStyle: "short",
                        timeStyle: "medium",
                      });

                      return (
                        <tr key={log.id}>
                          <td>{formattedTime}</td>
                          <td><strong>{log.rateCompanyName}</strong></td>
                          <td>{log.startDate} a {log.endDate}</td>
                          <td>{log.ratesCount} itens</td>
                          <td>
                            <span
                              style={{
                                padding: "2px 8px",
                                borderRadius: 4,
                                fontSize: 10,
                                fontWeight: 600,
                                background: log.status === "success" ? "#dcfce7" : "#fee2e2",
                                color: log.status === "success" ? "#166534" : "#991b1b",
                              }}
                            >
                              {log.status === "success" ? "SUCESSO" : "ERRO"}
                            </span>
                          </td>
                          <td>
                            <span style={{ fontSize: 11, color: "var(--mid)" }}>
                              {log.isTestOffset ? `Teste (${log.offsetAmount && log.offsetAmount > 0 ? `+${log.offsetAmount}` : log.offsetAmount})` : log.triggeredBy}
                            </span>
                          </td>
                          <td style={{ maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {log.message}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* Modal: Create/Edit Period */}
        {showForm && (
          <div className="modal-backdrop" onClick={closeForm}>
            <div className="modal-box" onClick={(e) => e.stopPropagation()}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
                <h2 style={{ fontFamily: "var(--serif)", fontSize: "1.3rem", fontWeight: 300, margin: 0 }}>
                  {editingId ? "Editar Período BAR" : "Novo Período BAR"}
                </h2>
                <button onClick={closeForm} className="btn btn-ghost" style={{ padding: 6 }}>
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div>
                  <label className="form-label">Data Início</label>
                  <input
                    type="date"
                    value={form.startDate}
                    onChange={(e) => setForm((prev) => ({ ...prev, startDate: e.target.value }))}
                    className="form-input"
                    required
                  />
                </div>

                <div>
                  <label className="form-label">Data Fim</label>
                  <input
                    type="date"
                    value={form.endDate}
                    onChange={(e) => setForm((prev) => ({ ...prev, endDate: e.target.value }))}
                    className="form-input"
                    required
                  />
                </div>

                <div>
                  <label className="form-label">Nível de BAR</label>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                    {OPERATIONAL_BAR_LEVELS.map((b) => (
                      <button
                        key={b}
                        type="button"
                        onClick={() => handleBarChange(b)}
                        style={{
                          padding: "6px 12px",
                          borderRadius: "var(--r-sm)",
                          border: form.barLevel === b ? "2px solid var(--gold)" : "1px solid var(--line)",
                          background: form.barLevel === b ? "var(--gold-soft)" : "var(--paper)",
                          color: "var(--navy)",
                          fontWeight: form.barLevel === b ? 700 : 400,
                          fontSize: 12,
                          cursor: "pointer",
                        }}
                      >
                        BAR {b}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="form-label">Temporada</label>
                  <select
                    value={form.season}
                    onChange={(e) => setForm((prev) => ({ ...prev, season: e.target.value as Season }))}
                    className="form-select"
                  >
                    {SEASON_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="form-label">Notas / Motivo (opcional)</label>
                  <input
                    type="text"
                    value={form.notes}
                    onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
                    placeholder="Ex: F1 Interlagos, Feriado Prolongado..."
                    className="form-input"
                  />
                </div>

                {error && <div style={{ color: "#dc2626", fontSize: 12 }}>{error}</div>}

                <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
                  <button type="button" onClick={closeForm} className="btn btn-outline">
                    Cancelar
                  </button>
                  <button type="submit" disabled={submitting} className="btn btn-gold">
                    {submitting ? "Salvando..." : editingId ? "Salvar Alterações" : "Criar Período"}
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
