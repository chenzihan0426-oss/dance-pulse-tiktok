"use client";

import * as React from "react";
import type { AuthSession, User } from "@/lib/types";
import { AUTH_CHANGED_EVENT, clearAuthSession, getAuthSession, hasAuthSession } from "@/lib/auth";

export function useAuth() {
  const [session, setSession] = React.useState<AuthSession | null>(null);

  React.useEffect(() => {
    const sync = () => setSession(getAuthSession());
    sync();
    window.addEventListener(AUTH_CHANGED_EVENT, sync as EventListener);
    window.addEventListener("focus", sync);
    return () => {
      window.removeEventListener(AUTH_CHANGED_EVENT, sync as EventListener);
      window.removeEventListener("focus", sync);
    };
  }, []);

  React.useEffect(() => {
    if (!session?.token && !hasAuthSession()) return;
    let active = true;
    const syncRemote = () => {
      void import("@/lib/api").then((mod) => {
        if (!active) return;
        mod.requestLocalSnapshotSync();
      });
    };

    syncRemote();
    window.addEventListener("focus", syncRemote);

    return () => {
      active = false;
      window.removeEventListener("focus", syncRemote);
    };
  }, [session?.token]);

  const logout = React.useCallback(() => {
    clearAuthSession();
  }, []);

  return {
    session,
    user: session?.user ?? null,
    token: session?.token ?? null,
    isAuthenticated: Boolean(session?.token),
    logout,
    setSession,
  } as {
    session: AuthSession | null;
    user: User | null;
    token: string | null;
    isAuthenticated: boolean;
    logout: () => void;
    setSession: React.Dispatch<React.SetStateAction<AuthSession | null>>;
  };
}
