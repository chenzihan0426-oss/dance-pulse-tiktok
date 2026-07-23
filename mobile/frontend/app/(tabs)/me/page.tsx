"use client";

import * as React from "react";
import Link from "next/link";
import { KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { ProfileArenaPage } from "@/components/profile/ProfileArenaPage";
import { Button } from "@/components/ui/button";
import { getCommunityUserProfile } from "@/lib/api";
import { AUTH_CHANGED_EVENT, isDemoAuthSession, loginWithAnyPassword } from "@/lib/auth";
import {
  buildDemoProfilePageModel,
  getProfilePageModel,
  type ProfilePageModel,
} from "@/lib/communityShowcase";
import { PROGRESS_UPDATED_EVENT } from "@/lib/storage";
import { useAuth } from "@/hooks/useAuth";
import type { CommunityFeedItem } from "@/lib/types";

export default function MePage() {
  const { isAuthenticated, user, logout, session } = useAuth();
  const [model, setModel] = React.useState<ProfilePageModel | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // 页内演示登录（不必跳转）
  const [account, setAccount] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [loginBusy, setLoginBusy] = React.useState(false);
  const [loginError, setLoginError] = React.useState<string | null>(null);

  const handleDemoLogin = React.useCallback(
    (event: React.FormEvent) => {
      event.preventDefault();
      setLoginError(null);
      setLoginBusy(true);
      try {
        loginWithAnyPassword(account, password);
      } catch (err) {
        setLoginError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoginBusy(false);
      }
    },
    [account, password],
  );

  React.useEffect(() => {
    if (!isAuthenticated || !user) {
      setModel(null);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        // 演示账号：不打后端 /me，直接本地个人主页
        if (isDemoAuthSession(session)) {
          if (!cancelled) {
            setModel(
              buildDemoProfilePageModel({
                username: user.username,
                displayName: user.displayName,
                bio: user.bio,
              }),
            );
          }
          return;
        }

        const showcase = getProfilePageModel(user.username);
        if (showcase) {
          if (!cancelled) setModel(showcase);
          return;
        }

        let works: CommunityFeedItem[] = [];
        try {
          const profile = await getCommunityUserProfile(user.username);
          works = profile.results;
        } catch {
          // empty
        }
        if (!cancelled) {
          setModel(
            buildDemoProfilePageModel({
              username: user.username,
              displayName: user.displayName,
              bio: user.bio,
              works,
            }),
          );
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setModel(
            buildDemoProfilePageModel({
              username: user.username,
              displayName: user.displayName,
              bio: user.bio,
            }),
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();

    const reload = () => void load();
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    window.addEventListener(PROGRESS_UPDATED_EVENT, reload as EventListener);
    window.addEventListener(AUTH_CHANGED_EVENT, reload as EventListener);
    window.addEventListener("focus", reload);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      window.removeEventListener(PROGRESS_UPDATED_EVENT, reload as EventListener);
      window.removeEventListener(AUTH_CHANGED_EVENT, reload as EventListener);
      window.removeEventListener("focus", reload);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [isAuthenticated, session, user]);

  if (!isAuthenticated || !user) {
    return (
      <main className="mx-auto min-h-screen max-w-md px-5 pb-24 pt-10 text-white">
        <div className="rounded-[28px] border border-white/10 bg-black/45 px-6 py-7 backdrop-blur-md">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#ccff00]/15 text-[#ccff00]">
            <KeyRound className="h-7 w-7" />
          </div>
          <h1 className="mt-6 text-[30px] font-semibold tracking-tight text-white">演示登录</h1>
          <p className="mt-3 text-[14px] leading-6 text-white/55">
            账号、密码填<strong className="text-white">任意非空文字</strong>即可进入个人主页（本机会话，不校验后端）。
          </p>

          <form className="mt-8 space-y-4" onSubmit={handleDemoLogin}>
            <label className="block">
              <span className="mb-2 block text-[13px] text-white/50">账号</span>
              <input
                value={account}
                onChange={(e) => setAccount(e.target.value)}
                placeholder="例如 demo"
                className="h-14 w-full rounded-[18px] border border-white/10 bg-white/[0.04] px-4 text-[15px] text-white outline-none focus:border-[#00f3ff]/50"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-[13px] text-white/50">密码</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="例如 123"
                className="h-14 w-full rounded-[18px] border border-white/10 bg-white/[0.04] px-4 text-[15px] text-white outline-none focus:border-[#00f3ff]/50"
              />
            </label>
            {loginError ? (
              <div className="rounded-[16px] border border-red-400/30 bg-red-500/10 px-4 py-3 text-[13px] text-red-200">
                {loginError}
              </div>
            ) : null}
            <Button
              type="submit"
              variant="primary"
              className="h-14 w-full rounded-[18px] bg-gradient-to-r from-[#ff0055] via-[#9d4edd] to-[#00f3ff] text-[15px] font-semibold"
              disabled={loginBusy}
            >
              {loginBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              登录并进入主页
            </Button>
          </form>

          <div className="mt-5 text-center text-[13px] text-white/40">
            或打开{" "}
            <Link href="/auth/login" className="text-[#00f3ff]">
              独立登录页
            </Link>
          </div>
        </div>
      </main>
    );
  }

  if (loading || !model) {
    return (
      <main className="mx-auto flex min-h-[50vh] max-w-md items-center justify-center text-white/45">
        <Loader2 className="h-5 w-5 animate-spin" />
      </main>
    );
  }

  return (
    <>
      {error ? (
        <div className="mx-auto max-w-md px-5 pt-4 text-[12px] text-white/35">
          部分数据同步失败，已展示本地主页。
        </div>
      ) : null}
      <ProfileArenaPage model={model} isOwn onLogout={logout} backHref="/" />
    </>
  );
}
