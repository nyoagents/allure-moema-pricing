import { useState, useEffect, useCallback } from "react";
import Head from "next/head";
import Image from "next/image";
import Layout from "@/components/layout/Layout";
import { useAuth } from "@/contexts/AuthContext";
import type { BarPeriod, Season } from "@/types";
import { formatDate } from "@/lib/utils";
import { ROOMS } from "@/data/rooms";
import { getRatesForRoom, OPERATIONAL_BAR_LEVELS, barToSeason } from "@/lib/pricing-engine";
import { formatCurrency } from "@/lib/utils";
import { Plus, Trash2, Edit2, X, Check, AlertCircle, Info } from "lucide-react";

const SEASON_OPTIONS: { value: Season; label: string }[] = [
  { value: "alta", label: "Alta Temporada" },
  { value: "media", label: "Média Temporada" },
  { value: "normal", label: "Temporada Normal" },
  { value: "baixa", label: "Baixa Temporada" },
];

const SEASON_LABEL: Record<Season, string> = {
  alta: "Alta", media: "Média", normal: "Normal", baixa: "Baixa",
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

type ActiveTab = "bar-periods" | "bar-table";

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

  useEffect(() => {
    fetchPeriods();
  }, [fetchPeriods]);

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
    setError("");
  };

  const openEdit = (p: BarPeriod) => {
    setEditingId(p.id);
    setForm({ startDate: p.startDate, endDate: p.endDate, barLevel: p.barLevel, season: p.season, notes: p.notes ?? "" });
    setShowForm(true);
    setError("");
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      const url = editingId ? `/api/bar-periods/${editingId}` : "/api/bar-periods";
      const method = editingId ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erro ao salvar");

      await fetchPeriods();
      closeForm();
      setSuccess(editingId ? "Período atualizado!" : "Período criado!");
      setTimeout(() => setSuccess(""), 3000);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/bar-periods/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Erro ao excluir");
      await fetchPeriods();
      setDeleteConfirm(null);
      setSuccess("Período removido!");
      setTimeout(() => setSuccess(""), 3000);
    } catch (e) {
      setError((e as Error).message);
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
        title="Configurações"
        subtitle="Gerencie períodos BAR e visualize a tabela de tarifas"
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
          {(["bar-periods", "bar-table"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding: "7px 20px",
                borderRadius: "var(--r-sm)",
                border: "none",
                cursor: "pointer",
                fontSize: 13,
                fontFamily: "var(--sans)",
                fontWeight: 500,
                transition: "all 0.2s",
                background: tab === t ? "var(--navy)" : "transparent",
                color: tab === t ? "var(--cream)" : "var(--mid)",
              }}
            >
              {t === "bar-periods" ? "Períodos BAR" : "Tabela de Tarifas"}
            </button>
          ))}
        </div>

        {/* Success / Error banners */}
        {success && (
          <div className="alert alert-success" style={{ marginBottom: 16 }}>
            <Check size={16} /> {success}
          </div>
        )}
        {error && !showForm && (
          <div className="alert alert-error" style={{ marginBottom: 16 }}>
            <AlertCircle size={16} /> {error}
          </div>
        )}

        {/* ── BAR PERIODS TAB ── */}
        {tab === "bar-periods" && (
          <div>
            {/* Info box */}
            <div className="alert alert-info" style={{ marginBottom: 20 }}>
              <Info size={16} />
              <div style={{ fontSize: 12 }}>
                <strong>Como funciona:</strong> Os períodos configurados aqui têm prioridade sobre os dados históricos.
                Para datas sem período configurado, o sistema usa a sazonalidade histórica de 2023-2024 como fallback (BAR 5 se não houver histórico).
              </div>
            </div>

            {loading ? (
              <div style={{ textAlign: "center", padding: 40, color: "var(--mid)" }}>Carregando...</div>
            ) : periods.length === 0 ? (
              <div className="card empty-state">
                <div style={{ fontSize: 40, marginBottom: 12 }}>📅</div>
                <h3 style={{ fontFamily: "var(--serif)", fontWeight: 300, margin: "0 0 8px" }}>
                  Nenhum período configurado
                </h3>
                <p style={{ margin: "0 0 20px", fontSize: 13 }}>
                  O sistema está usando apenas dados históricos (2023-2024) para definir o BAR.
                </p>
                {isAdmin && (
                  <button onClick={openCreate} className="btn btn-gold">
                    <Plus size={14} />
                    Criar primeiro período
                  </button>
                )}
              </div>
            ) : (
              <div className="card" style={{ padding: 0 }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Período</th>
                      <th>BAR Level</th>
                      <th>Temporada</th>
                      <th>Notas</th>
                      <th>Fonte</th>
                      {isAdmin && <th style={{ width: 100 }}>Ações</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {periods.map((p) => (
                      <tr key={p.id}>
                        <td>
                          <span style={{ fontFamily: "var(--sans)", fontWeight: 500, fontSize: 13 }}>
                            {formatDate(p.startDate)}
                          </span>
                          <span style={{ color: "var(--mid)", margin: "0 8px" }}>→</span>
                          <span style={{ fontFamily: "var(--sans)", fontWeight: 500, fontSize: 13 }}>
                            {formatDate(p.endDate)}
                          </span>
                        </td>
                        <td>
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              padding: "3px 12px",
                              background: "var(--gold-soft)",
                              border: "1px solid var(--gold-line)",
                              borderRadius: "50px",
                              fontSize: 12,
                              fontWeight: 600,
                              color: "var(--navy)",
                            }}
                          >
                            BAR {p.barLevel}
                          </span>
                        </td>
                        <td>
                          <span className={`season-chip ${p.season}`}>{SEASON_LABEL[p.season]}</span>
                        </td>
                        <td style={{ color: "var(--mid)", fontSize: 12 }}>
                          {p.notes || "—"}
                        </td>
                        <td>
                          <span style={{ fontSize: 11, color: "var(--mid)" }}>Manual</span>
                        </td>
                        {isAdmin && (
                          <td>
                            <div style={{ display: "flex", gap: 6 }}>
                              <button
                                onClick={() => openEdit(p)}
                                className="btn btn-ghost"
                                style={{ padding: "4px 8px" }}
                              >
                                <Edit2 size={13} />
                              </button>
                              {deleteConfirm === p.id ? (
                                <div style={{ display: "flex", gap: 4 }}>
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
                                    style={{ padding: "4px 8px" }}
                                  >
                                    <X size={12} />
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => setDeleteConfirm(p.id)}
                                  className="btn btn-ghost"
                                  style={{ padding: "4px 8px", color: "var(--danger)" }}
                                >
                                  <Trash2 size={13} />
                                </button>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── BAR TABLE TAB ── */}
        {tab === "bar-table" && (
          <div>
            {/* Filter bar */}
            <div
              style={{
                display: "flex",
                gap: 12,
                alignItems: "center",
                marginBottom: 20,
                padding: "12px 16px",
                background: "var(--paper)",
                border: "1px solid var(--line)",
                borderRadius: "var(--r-md)",
              }}
            >
              <span style={{ fontSize: 12, color: "var(--mid)", textTransform: "uppercase", letterSpacing: "0.1em" }}>Exibir:</span>
              <div style={{ display: "flex", gap: 6 }}>
                {([1, 2] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => setBarTablePax(p)}
                    className={`btn ${barTablePax === p ? "btn-primary" : "btn-outline"}`}
                    style={{ padding: "5px 14px", fontSize: 12 }}
                  >
                    {p} Pax
                  </button>
                ))}
              </div>
              <div style={{ width: 1, height: 24, background: "var(--line)" }} />
              <button
                onClick={() => setBarTableBreakfast((v) => !v)}
                className={`btn ${barTableBreakfast ? "btn-gold" : "btn-outline"}`}
                style={{ padding: "5px 14px", fontSize: 12 }}
              >
                {barTableBreakfast ? "Com café" : "Sem café"}
              </button>
              <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--mid)" }}>
                Dados extraídos da planilha "TARIFÁRIO" (Allure 2023-2024)
              </span>
            </div>

            {/* BAR level color legend */}
            <div
              style={{
                display: "flex",
                gap: 6,
                flexWrap: "wrap",
                marginBottom: 12,
              }}
            >
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
                      background: b <= 2 ? "#fff3e6" : b <= 4 ? "var(--gold-soft)" : b <= 6 ? "#eef2f6" : "#e2eaf2",
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

            {/* Price table */}
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
                          <div style={{ position: "relative", width: 44, height: 34, borderRadius: 6, overflow: "hidden", flexShrink: 0 }}>
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
                                b <= 2 ? "rgba(200,121,65,0.06)" :
                                b <= 4 ? "rgba(168,144,112,0.06)" :
                                b <= 6 ? "transparent" :
                                "rgba(176,189,208,0.08)",
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

            <div style={{ marginTop: 12, fontSize: 12, color: "var(--mid)", display: "flex", alignItems: "center", gap: 6 }}>
              <Info size={12} />
              A tabela completa (BAR -9 a BAR 17) está salva em <code>src/data/bar-table.ts</code> e pode ser carregada via <code>scripts/seed-bar-table.ts</code>
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
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <label className="form-label">Data Início</label>
                    <input
                      type="date"
                      className="form-input"
                      value={form.startDate}
                      onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
                      required
                    />
                  </div>
                  <div>
                    <label className="form-label">Data Fim</label>
                    <input
                      type="date"
                      className="form-input"
                      value={form.endDate}
                      onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
                      required
                    />
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <label className="form-label">Nível BAR</label>
                    <select
                      className="form-select"
                      value={form.barLevel}
                      onChange={(e) => {
                        const bar = parseInt(e.target.value, 10);
                        setForm((f) => ({
                          ...f,
                          barLevel: bar,
                          season: barToSeason(bar),
                        }));
                      }}
                    >
                      {OPERATIONAL_BAR_LEVELS.map((b) => (
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
                      value={form.season}
                      onChange={(e) => setForm((f) => ({ ...f, season: e.target.value as Season }))}
                    >
                      {SEASON_OPTIONS.map((s) => (
                        <option key={s.value} value={s.value}>{s.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Preview */}
                <div
                  style={{
                    padding: "12px 16px",
                    background: "var(--paper-2)",
                    border: "1px solid var(--line)",
                    borderRadius: "var(--r-sm)",
                  }}
                >
                  <div style={{ fontSize: 11, color: "var(--mid)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                    Pré-visualização — Studio Standard
                  </div>
                  <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                    {[
                      { label: "S/ Café 1Px", key: "without_breakfast_1pax" },
                      { label: "S/ Café 2Px", key: "without_breakfast_2pax" },
                      { label: "C/ Café 1Px", key: "with_breakfast_1pax" },
                      { label: "C/ Café 2Px", key: "with_breakfast_2pax" },
                    ].map(({ label, key }) => {
                      const rates = getRatesForRoom("standard", form.barLevel);
                      const price = rates?.[key as keyof typeof rates] ?? 0;
                      return (
                        <div key={key}>
                          <div style={{ fontSize: 10, color: "var(--mid)" }}>{label}</div>
                          <div style={{ fontFamily: "var(--serif)", fontSize: "1.1rem", color: "var(--navy)" }}>
                            {formatCurrency(price)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="form-label">Notas (opcional)</label>
                  <input
                    type="text"
                    className="form-input"
                    value={form.notes}
                    onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                    placeholder="Ex: Carnaval, Réveillon, Semana de eventos..."
                  />
                </div>

                {error && (
                  <div className="alert alert-error">
                    <AlertCircle size={14} /> {error}
                  </div>
                )}

                <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 4 }}>
                  <button type="button" onClick={closeForm} className="btn btn-outline">
                    Cancelar
                  </button>
                  <button type="submit" className="btn btn-gold" disabled={submitting}>
                    {submitting ? "Salvando..." : editingId ? "Atualizar" : "Criar Período"}
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
