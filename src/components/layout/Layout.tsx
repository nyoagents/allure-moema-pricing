import Link from "next/link";
import { useRouter } from "next/router";
import {
  LayoutDashboard,
  CalendarDays,
  Settings,
  TrendingUp,
  LogOut,
  ChevronRight,
  Calculator,
  Sparkles,
  HelpCircle,
  BarChart3,
  Scale,
} from "lucide-react";
import { useState, useEffect } from "react";
import { AllureLogo } from "@/components/brand/AllureLogo";
import { useAuth } from "@/contexts/AuthContext";

interface LayoutProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  actions?: React.ReactNode;
  user?: { email: string; role: string } | null;
}

const navItems = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
  },
  {
    href: "/racional",
    label: "Racional",
    icon: HelpCircle,
  },
  {
    href: "/calculadora",
    label: "Calculadora",
    icon: Calculator,
  },
  {
    href: "/auditoria",
    label: "Auditoria",
    icon: BarChart3,
  },
  {
    href: "/eventos",
    label: "Eventos",
    icon: Sparkles,
  },
  {
    href: "/calendario",
    label: "Calendário",
    icon: CalendarDays,
  },
  {
    href: "/concorrentes",
    label: "Concorrentes",
    icon: TrendingUp,
  },
  {
    href: "/configuracoes",
    label: "Configurações",
    icon: Settings,
  },
];

export default function Layout({ children, title, subtitle, actions, user }: LayoutProps) {
  const router = useRouter();
  const { logout } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const isActive = (href: string) => router.pathname === href;

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await logout(); // clears user state before navigating — prevents redirect loop
    } catch {
      setLoggingOut(false);
    }
  };

  useEffect(() => {
    setMobileOpen(false);
  }, [router.pathname]);

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "var(--cream)" }}>
      {/* Sidebar */}
      <aside className="sidebar" style={{ display: mobileOpen ? "flex" : undefined }}>
        <div className="sidebar-logo">
          <div style={{ marginBottom: 6 }}>
            <AllureLogo variant="white" height={22} />
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              marginTop: 8,
            }}
          >
            <div
              style={{
                width: 4,
                height: 4,
                borderRadius: "50%",
                background: "rgba(168,144,112,0.6)",
              }}
            />
            <span
              style={{
                fontFamily: "var(--sans)",
                fontSize: 10,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                color: "rgba(168,144,112,0.7)",
              }}
            >
              Precificação
            </span>
          </div>
        </div>

        <nav className="sidebar-nav">
          <span className="nav-section-label">Menu</span>
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`nav-item ${isActive(item.href) ? "active" : ""}`}
              >
                <Icon size={16} />
                {item.label}
                {isActive(item.href) && (
                  <ChevronRight size={14} style={{ marginLeft: "auto", color: "var(--gold)" }} />
                )}
              </Link>
            );
          })}
        </nav>

        <div style={{ padding: "16px 16px 24px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          {user && (
            <div
              style={{
                padding: "10px 12px",
                background: "rgba(255,255,255,0.04)",
                borderRadius: "var(--r-sm)",
                marginBottom: 8,
                border: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              <div style={{ fontSize: 12, color: "rgba(245,242,236,0.5)", fontFamily: "var(--sans)", marginBottom: 2 }}>
                {user.role === "admin" ? "Administrador" : "Visualizador"}
              </div>
              <div style={{ fontSize: 13, color: "var(--cream)", fontFamily: "var(--sans)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {user.email}
              </div>
            </div>
          )}
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            className="nav-item"
            style={{ color: "rgba(245,242,236,0.4)", fontSize: 13 }}
          >
            <LogOut size={14} />
            {loggingOut ? "Saindo..." : "Sair"}
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="main-content">
        {/* Topbar */}
        <header className="topbar">
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            {title && (
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <h2
                    style={{
                      fontFamily: "var(--serif)",
                      fontSize: "1.2rem",
                      fontWeight: 300,
                      color: "var(--navy)",
                      margin: 0,
                      lineHeight: 1.2,
                    }}
                  >
                    {title}
                  </h2>
                </div>
                {subtitle && (
                  <p style={{ margin: 0, fontSize: 12, color: "var(--mid)", marginTop: 1, fontFamily: "var(--sans)" }}>
                    {subtitle}
                  </p>
                )}
              </div>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {actions}
            {/* Live indicator */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 12px", background: "var(--paper-2)", border: "1px solid var(--line)", borderRadius: "50px" }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#1f9d55", boxShadow: "0 0 0 2px rgba(31,157,85,0.2)" }} />
              <span style={{ fontFamily: "var(--sans)", fontSize: 11, color: "var(--mid)", letterSpacing: "0.06em" }}>ao vivo</span>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="page-body">{children}</main>
      </div>
    </div>
  );
}
