import { createContext, useContext, useEffect, useState } from "react";
import { useRouter } from "next/router";
import type { User } from "@/types";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  refresh: () => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  refresh: () => {},
  logout: async () => {},
});

const PUBLIC_ROUTES = ["/login"];

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const fetchMe = async () => {
    try {
      const res = await fetch("/api/auth/me");
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMe();
  }, []);

  useEffect(() => {
    if (loading) return;
    const isPublic = PUBLIC_ROUTES.includes(router.pathname);
    if (!user && !isPublic) {
      router.push("/login");
    }
    if (user && isPublic) {
      router.push("/dashboard");
    }
  }, [user, loading, router.pathname]);

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null); // clear state first — prevents the redirect-back effect
    router.push("/login");
  };

  return (
    <AuthContext.Provider value={{ user, loading, refresh: fetchMe, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
