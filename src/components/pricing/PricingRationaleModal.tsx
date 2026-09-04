import { useState } from "react";
import type { PricingRationale, RoomId } from "@/types";
import { formatCurrency } from "@/lib/utils";
import { ROOMS } from "@/data/rooms";
import {
  X,
  Info,
  Calendar,
  Layers,
  Sparkles,
  TrendingUp,
  CheckCircle2,
  Coffee,
  Users,
  MapPin,
  AlertTriangle,
} from "lucide-react";

interface PricingRationaleModalProps {
  rationale: PricingRationale;
  onClose: () => void;
}

export function PricingRationaleModal({ rationale, onClose }: PricingRationaleModalProps) {
  const [activeTab, setActiveTab] = useState<"steps" | "rooms" | "events">("steps");

  const [y, m, d] = rationale.date.split("-");
  const formattedDate = `${d}/${m}/${y}`;

  const getStepIcon = (step: number) => {
    switch (step) {
      case 1:
        return <Calendar size={15} color="var(--navy)" />;
      case 2:
        return <Layers size={15} color="var(--gold)" />;
      case 3:
        return <Sparkles size={15} color="#c87941" />;
      case 4:
        return <TrendingUp size={15} color="#1d4ed8" />;
      case 5:
        return <CheckCircle2 size={15} color="#166534" />;
      default:
        return <Info size={15} />;
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-box"
        style={{ maxWidth: 720, maxHeight: "90vh", overflowY: "auto" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: 20,
          }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <span
                style={{
                  fontFamily: "var(--sans)",
                  fontSize: 10,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: "var(--gold)",
                  fontWeight: 600,
                }}
              >
                Racional de Precificação Transparente
              </span>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  padding: "1px 8px",
                  borderRadius: "50px",
                  fontSize: 10,
                  fontWeight: 600,
                  background: "var(--gold-soft)",
                  color: "var(--navy)",
                  border: "1px solid var(--gold-line)",
                }}
              >
                BAR {rationale.finalBarLevel}
              </span>
            </div>
            <h2
              style={{
                fontFamily: "var(--serif)",
                fontSize: "1.4rem",
                fontWeight: 300,
                color: "var(--navy)",
                margin: 0,
              }}
            >
              {rationale.roomName} · {formattedDate}
            </h2>
            <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--mid)" }}>
              {rationale.pax} {rationale.pax === 1 ? "Hóspede" : "Hóspedes"} ·{" "}
              {rationale.breakfast ? "Com Café da Manhã" : "Sem Café"}
            </p>
          </div>
          <button onClick={onClose} className="btn btn-ghost" style={{ padding: 6 }}>
            <X size={18} />
          </button>
        </div>

        {/* Hero Final Price Box */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 20px",
            background: "var(--navy)",
            borderRadius: "var(--r-md)",
            color: "var(--cream)",
            marginBottom: 20,
          }}
        >
          <div>
            <span
              style={{
                fontSize: 10,
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                color: "rgba(168,144,112,0.8)",
                display: "block",
                marginBottom: 2,
              }}
            >
              Tarifa Diária Final
            </span>
            <div
              style={{
                fontFamily: "var(--serif)",
                fontSize: "1.9rem",
                fontWeight: 300,
                letterSpacing: "-0.02em",
                lineHeight: 1,
              }}
            >
              {formatCurrency(rationale.finalPrice)}
            </div>
          </div>
          <div style={{ textAlign: "right", fontSize: 12, color: "rgba(245,242,236,0.7)" }}>
            <div>Temporada: <strong style={{ color: "var(--cream)", textTransform: "capitalize" }}>{rationale.finalSeason}</strong></div>
            <div>Fonte: <strong style={{ color: "var(--cream)" }}>{rationale.appliedEvents.length > 0 ? `Evento (${rationale.appliedEvents[0].title})` : rationale.manualOverridePeriod?.isManual ? "Ajuste Manual" : "Histórico Sazonal"}</strong></div>
          </div>
        </div>

        {/* Tabs */}
        <div
          style={{
            display: "flex",
            gap: 6,
            borderBottom: "1px solid var(--line)",
            marginBottom: 16,
            paddingBottom: 2,
          }}
        >
          {[
            { id: "steps", label: "Árvore de Decisão (5 Passos)" },
            { id: "rooms", label: "Matriz das 6 Tipologias" },
            { id: "events", label: `Eventos Conhecidos (${rationale.appliedEvents.length})` },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id as typeof activeTab)}
              style={{
                padding: "8px 14px",
                fontSize: 12,
                fontWeight: activeTab === t.id ? 600 : 400,
                color: activeTab === t.id ? "var(--navy)" : "var(--mid)",
                borderBottom: activeTab === t.id ? "2px solid var(--gold)" : "2px solid transparent",
                background: "none",
                border: "none",
                cursor: "pointer",
                fontFamily: "var(--sans)",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab 1: Step by step breakdown */}
        {activeTab === "steps" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {rationale.steps.map((s) => (
              <div
                key={s.step}
                style={{
                  display: "flex",
                  gap: 14,
                  padding: "12px 16px",
                  borderRadius: "var(--r-sm)",
                  background: "var(--paper-2)",
                  border: "1px solid var(--line)",
                }}
              >
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: "50%",
                    background: "var(--paper)",
                    border: "1px solid var(--line)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    marginTop: 2,
                  }}
                >
                  {getStepIcon(s.step)}
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
                    <h4
                      style={{
                        margin: 0,
                        fontSize: 13,
                        fontWeight: 600,
                        color: "var(--navy)",
                        fontFamily: "var(--sans)",
                      }}
                    >
                      Passo {s.step}: {s.title}
                    </h4>
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: "var(--navy)",
                        padding: "2px 8px",
                        borderRadius: "var(--r-sm)",
                        background: "var(--gold-soft)",
                        border: "1px solid var(--gold-line)",
                        flexShrink: 0,
                      }}
                    >
                      {s.resultValue}
                    </span>
                  </div>
                  <p style={{ margin: 0, fontSize: 12, color: "var(--mid)", lineHeight: 1.5 }}>
                    {s.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Tab 2: All rooms comparison */}
        {activeTab === "rooms" && (
          <div>
            <div style={{ fontSize: 12, color: "var(--mid)", marginBottom: 12 }}>
              Valores calculados para todas as tipologias no nível <strong>BAR {rationale.finalBarLevel}</strong>:
            </div>
            <table className="data-table" style={{ fontSize: 12, width: "100%" }}>
              <thead>
                <tr>
                  <th>Tipologia</th>
                  <th style={{ textAlign: "right" }}>Sem Café (1 Px)</th>
                  <th style={{ textAlign: "right" }}>Sem Café (2 Px)</th>
                  <th style={{ textAlign: "right" }}>Com Café (1 Px)</th>
                  <th style={{ textAlign: "right" }}>Com Café (2 Px)</th>
                </tr>
              </thead>
              <tbody>
                {ROOMS.map((r) => {
                  const prices = rationale.allRoomPrices[r.id as RoomId];
                  const isSelected = r.id === rationale.roomId;
                  return (
                    <tr
                      key={r.id}
                      style={{
                        background: isSelected ? "rgba(168,144,112,0.12)" : "transparent",
                        fontWeight: isSelected ? 600 : 400,
                      }}
                    >
                      <td>
                        {r.name} {isSelected && <span style={{ color: "var(--gold)", fontSize: 10 }}>● Atual</span>}
                      </td>
                      <td style={{ textAlign: "right", fontFamily: "var(--serif)" }}>
                        {formatCurrency(prices?.without_breakfast_1pax ?? 0)}
                      </td>
                      <td style={{ textAlign: "right", fontFamily: "var(--serif)" }}>
                        {formatCurrency(prices?.without_breakfast_2pax ?? 0)}
                      </td>
                      <td style={{ textAlign: "right", fontFamily: "var(--serif)" }}>
                        {formatCurrency(prices?.with_breakfast_1pax ?? 0)}
                      </td>
                      <td style={{ textAlign: "right", fontFamily: "var(--serif)" }}>
                        {formatCurrency(prices?.with_breakfast_2pax ?? 0)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Tab 3: Events Details */}
        {activeTab === "events" && (
          <div>
            {rationale.appliedEvents.length === 0 ? (
              <div style={{ textAlign: "center", padding: "32px 0", color: "var(--mid)" }}>
                <Sparkles size={24} style={{ margin: "0 auto 8px", opacity: 0.5 }} />
                <p style={{ margin: "0 0 4px", fontSize: 13, fontWeight: 500 }}>
                  Nenhum grande evento mapeado para esta data
                </p>
                <p style={{ margin: 0, fontSize: 11 }}>
                  Você pode escanear eventos futuros na aba "Eventos" usando IA.
                </p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {rationale.appliedEvents.map((e) => (
                  <div
                    key={e.id}
                    style={{
                      padding: "12px 16px",
                      borderRadius: "var(--r-sm)",
                      border: "1px solid var(--line)",
                      background: "var(--paper-2)",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, color: "var(--navy)" }}>{e.title}</div>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 600,
                          padding: "2px 7px",
                          borderRadius: "50px",
                          background:
                            e.impact === "critico"
                              ? "#fee2e2"
                              : e.impact === "alto"
                              ? "#ffedd5"
                              : "#e0f2fe",
                          color:
                            e.impact === "critico"
                              ? "#991b1b"
                              : e.impact === "alto"
                              ? "#9a3412"
                              : "#0369a1",
                        }}
                      >
                        Impacto {e.impact.toUpperCase()} · Sugere BAR {e.recommendedBar}
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: 12, fontSize: 11, color: "var(--mid)", marginBottom: 6 }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <MapPin size={11} /> {e.location} {e.distanceKm ? `(~${e.distanceKm} km)` : ""}
                      </span>
                      {e.estimatedAttendance && <span>Público: {e.estimatedAttendance}</span>}
                    </div>
                    <p style={{ margin: 0, fontSize: 12, color: "var(--body)" }}>{e.reason}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div style={{ marginTop: 24, display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button onClick={onClose} className="btn btn-gold" style={{ fontSize: 13 }}>
            Fechar Racional
          </button>
        </div>
      </div>
    </div>
  );
}
