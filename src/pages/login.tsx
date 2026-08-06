import { useState } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import Image from "next/image";
import { useAuth } from "@/contexts/AuthContext";
import { AllureLogo } from "@/components/brand/AllureLogo";
import { Eye, EyeOff, ArrowRight } from "lucide-react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  const { refresh } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Erro ao fazer login"); return; }
      await refresh();
      router.push("/dashboard");
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Head>
        <title>Acesso — Allure Moema</title>
      </Head>

      <div style={{ display: "flex", minHeight: "100vh", background: "var(--navy-deep)" }}>
        {/* ── LEFT: hero foto ── */}
        <div
          style={{
            flex: 1,
            position: "relative",
            display: "none",
            minWidth: 0,
          }}
          className="login-hero-panel"
        >
          <Image
            src="/images/hero-bg.webp"
            alt="Allure Moema"
            fill
            style={{ objectFit: "cover", objectPosition: "center" }}
            priority
          />
          {/* Overlay gradient */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              background:
                "linear-gradient(135deg, rgba(7,23,34,0.72) 0%, rgba(7,23,34,0.28) 60%, rgba(168,144,112,0.12) 100%)",
            }}
          />
          {/* Corner brackets — estilo courchevel */}
          <div style={{ position: "absolute", inset: 32 }}>
            {/* TL */}
            <div style={{ position: "absolute", top: 0, left: 0, width: 28, height: 28, borderTop: "1.5px solid rgba(168,144,112,0.5)", borderLeft: "1.5px solid rgba(168,144,112,0.5)" }} />
            {/* TR */}
            <div style={{ position: "absolute", top: 0, right: 0, width: 28, height: 28, borderTop: "1.5px solid rgba(168,144,112,0.5)", borderRight: "1.5px solid rgba(168,144,112,0.5)" }} />
            {/* BL */}
            <div style={{ position: "absolute", bottom: 0, left: 0, width: 28, height: 28, borderBottom: "1.5px solid rgba(168,144,112,0.5)", borderLeft: "1.5px solid rgba(168,144,112,0.5)" }} />
            {/* BR */}
            <div style={{ position: "absolute", bottom: 0, right: 0, width: 28, height: 28, borderBottom: "1.5px solid rgba(168,144,112,0.5)", borderRight: "1.5px solid rgba(168,144,112,0.5)" }} />
          </div>

          {/* Copy sobre a foto */}
          <div
            style={{
              position: "absolute",
              bottom: 64,
              left: 56,
              right: 56,
            }}
          >
            <AllureLogo variant="white" height={28} />
            <p
              style={{
                marginTop: 20,
                fontFamily: "var(--serif)",
                fontSize: "clamp(1.5rem, 3vw, 2.2rem)",
                fontWeight: 300,
                color: "var(--cream)",
                lineHeight: 1.25,
                letterSpacing: "-0.01em",
                maxWidth: 440,
              }}
            >
              Sistema de Precificação
              <br />
              <em style={{ color: "rgba(245,242,236,0.6)", fontStyle: "italic" }}>
                Inteligência de tarifas em tempo real
              </em>
            </p>
            <div
              style={{
                marginTop: 20,
                display: "flex",
                gap: 12,
                alignItems: "center",
              }}
            >
              <div
                style={{
                  width: 32,
                  height: 1,
                  background: "rgba(168,144,112,0.6)",
                }}
              />
              <span
                style={{
                  fontFamily: "var(--sans)",
                  fontSize: 11,
                  letterSpacing: "0.16em",
                  textTransform: "uppercase",
                  color: "var(--gold)",
                }}
              >
                Moema · São Paulo
              </span>
            </div>
          </div>
        </div>

        {/* ── RIGHT: form ── */}
        <div
          style={{
            width: "100%",
            maxWidth: 480,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            padding: "48px 56px",
            background: "var(--navy-deep)",
            position: "relative",
            borderLeft: "1px solid rgba(255,255,255,0.06)",
          }}
          className="login-form-panel"
        >
          {/* Subtle background texture */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              backgroundImage:
                "radial-gradient(ellipse at 80% 10%, rgba(168,144,112,0.07) 0%, transparent 55%), radial-gradient(ellipse at 20% 90%, rgba(168,144,112,0.04) 0%, transparent 40%)",
              pointerEvents: "none",
            }}
          />

          <div style={{ position: "relative", zIndex: 1 }}>
            {/* Logo */}
            <div style={{ marginBottom: 48 }}>
              <AllureLogo variant="white" height={26} />
            </div>

            {/* Demo mode banner — only when Firebase is not configured */}
            {!process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID && (
              <div
                style={{
                  marginBottom: 24,
                  padding: "8px 14px",
                  background: "rgba(168,144,112,0.12)",
                  border: "1px solid rgba(168,144,112,0.25)",
                  borderRadius: "var(--r-sm)",
                  fontFamily: "var(--sans)",
                  fontSize: 11,
                  color: "rgba(168,144,112,0.9)",
                  letterSpacing: "0.04em",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <span style={{ fontSize: 14 }}>◈</span>
                Modo demo — qualquer credencial funciona
              </div>
            )}

            {/* Heading */}
            <div style={{ marginBottom: 36 }}>
              <p
                style={{
                  fontFamily: "var(--sans)",
                  fontSize: 11,
                  letterSpacing: "0.16em",
                  textTransform: "uppercase",
                  color: "var(--gold)",
                  marginBottom: 8,
                }}
              >
                Área restrita
              </p>
              <h1
                style={{
                  fontFamily: "var(--serif)",
                  fontSize: "1.9rem",
                  fontWeight: 300,
                  color: "var(--cream)",
                  letterSpacing: "-0.02em",
                  lineHeight: 1.2,
                  margin: 0,
                }}
              >
                Bem-vindo de volta
              </h1>
              <p
                style={{
                  marginTop: 8,
                  fontFamily: "var(--sans)",
                  fontSize: 13.5,
                  color: "rgba(176,189,208,0.7)",
                  lineHeight: 1.5,
                }}
              >
                Entre com seu email e senha para acessar o painel.
              </p>
            </div>

            {/* Form */}
            <form
              onSubmit={handleSubmit}
              style={{ display: "flex", flexDirection: "column", gap: 16 }}
            >
              <div>
                <label
                  style={{
                    display: "block",
                    fontFamily: "var(--sans)",
                    fontSize: 11,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    color: "rgba(176,189,208,0.6)",
                    marginBottom: 8,
                  }}
                >
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  required
                  autoComplete="email"
                  style={{
                    width: "100%",
                    padding: "12px 16px",
                    background: "rgba(255,255,255,0.05)",
                    border: "1.5px solid rgba(255,255,255,0.1)",
                    borderRadius: "var(--r-sm)",
                    fontFamily: "var(--sans)",
                    fontSize: 14,
                    color: "var(--cream)",
                    outline: "none",
                    transition: "border-color 0.2s",
                  }}
                  onFocus={(e) => { e.target.style.borderColor = "rgba(168,144,112,0.5)"; e.target.style.background = "rgba(255,255,255,0.07)"; }}
                  onBlur={(e) => { e.target.style.borderColor = "rgba(255,255,255,0.1)"; e.target.style.background = "rgba(255,255,255,0.05)"; }}
                />
              </div>

              <div>
                <label
                  style={{
                    display: "block",
                    fontFamily: "var(--sans)",
                    fontSize: 11,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    color: "rgba(176,189,208,0.6)",
                    marginBottom: 8,
                  }}
                >
                  Senha
                </label>
                <div style={{ position: "relative" }}>
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    autoComplete="current-password"
                    style={{
                      width: "100%",
                      padding: "12px 46px 12px 16px",
                      background: "rgba(255,255,255,0.05)",
                      border: "1.5px solid rgba(255,255,255,0.1)",
                      borderRadius: "var(--r-sm)",
                      fontFamily: "var(--sans)",
                      fontSize: 14,
                      color: "var(--cream)",
                      outline: "none",
                      transition: "border-color 0.2s",
                    }}
                    onFocus={(e) => { e.target.style.borderColor = "rgba(168,144,112,0.5)"; e.target.style.background = "rgba(255,255,255,0.07)"; }}
                    onBlur={(e) => { e.target.style.borderColor = "rgba(255,255,255,0.1)"; e.target.style.background = "rgba(255,255,255,0.05)"; }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    style={{
                      position: "absolute",
                      right: 14,
                      top: "50%",
                      transform: "translateY(-50%)",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      padding: 4,
                      color: "rgba(176,189,208,0.5)",
                      display: "flex",
                    }}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {error && (
                <div
                  style={{
                    padding: "10px 14px",
                    background: "rgba(220,38,38,0.1)",
                    border: "1px solid rgba(220,38,38,0.3)",
                    borderRadius: "var(--r-sm)",
                    fontFamily: "var(--sans)",
                    fontSize: 13,
                    color: "#fca5a5",
                  }}
                >
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                style={{
                  marginTop: 8,
                  width: "100%",
                  padding: "13px 24px",
                  background: loading ? "rgba(168,144,112,0.5)" : "var(--gold)",
                  border: "none",
                  borderRadius: "var(--r-sm)",
                  fontFamily: "var(--sans)",
                  fontSize: 14,
                  fontWeight: 500,
                  color: loading ? "rgba(255,255,255,0.6)" : "#fff",
                  cursor: loading ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 10,
                  transition: "all 0.2s",
                  letterSpacing: "0.04em",
                }}
              >
                {loading ? (
                  <span
                    style={{
                      width: 16,
                      height: 16,
                      border: "2px solid rgba(255,255,255,0.3)",
                      borderTopColor: "#fff",
                      borderRadius: "50%",
                      animation: "spin 0.6s linear infinite",
                      display: "inline-block",
                    }}
                  />
                ) : (
                  <ArrowRight size={16} />
                )}
                {loading ? "Entrando..." : "Entrar no painel"}
              </button>
            </form>

            {/* Footer */}
            <div
              style={{
                marginTop: 48,
                paddingTop: 24,
                borderTop: "1px solid rgba(255,255,255,0.06)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span style={{ fontFamily: "var(--sans)", fontSize: 11, color: "rgba(176,189,208,0.35)", letterSpacing: "0.06em" }}>
                Courchevel Inc.
              </span>
              <span style={{ fontFamily: "var(--sans)", fontSize: 11, color: "rgba(176,189,208,0.35)", letterSpacing: "0.06em" }}>
                By Nyo
              </span>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @media (min-width: 800px) {
          .login-hero-panel { display: block !important; }
          .login-form-panel { max-width: 460px !important; }
        }
      `}</style>
    </>
  );
}
