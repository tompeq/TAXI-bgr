import { useMemo, useState, type ReactNode } from "react";
import { clearSession, logout as apiLogout, readSession } from "./api";
import { AuthContext, type AuthContextValue } from "./auth-context";
import type { SessionResponse } from "./types";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSessionState] = useState<SessionResponse | null>(() => {
    const stored = readSession();
    if (stored?.user.role !== "admin") {
      clearSession();
      return null;
    }
    return stored;
  });

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      setSession: setSessionState,
      logout: async () => {
        await apiLogout();
        setSessionState(null);
      },
    }),
    [session],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
