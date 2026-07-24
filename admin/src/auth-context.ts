import { createContext, useContext } from "react";
import type { SessionResponse } from "./types";

export interface AuthContextValue {
  session: SessionResponse | null;
  setSession: (session: SessionResponse) => void;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
