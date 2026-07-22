"use client";

import * as React from "react";
import Link from "next/link";
import { Loader2, ShieldCheck } from "lucide-react";
import { ProfileArenaPage } from "@/components/profile/ProfileArenaPage";
import { Button } from "@/components/ui/button";
import { getCommunityUserProfile, getMe } from "@/lib/api";
import { AUTH_CHANGED_EVENT } from "@/lib/auth";
import {
  buildDemoProfilePageModel,
  getProfilePageModel,
  type ProfilePageModel,
} from "@/lib/communityShowcase";
import { PROGRESS_UPDATED_EVENT } from "@/lib/storage";
import { useAuth } from "@/hooks/useAuth";
import type { CommunityFeedItem } from "@/lib/types";

export default function MePage() {
  const { isAuthenticated, user, logout } = useAuth();
  const [model, setModel] = React.useState<ProfilePageModel | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

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
        const showcase = getProfilePageModel(user.username);
        if (showcase) {
          if (!cancelled) setModel(showcase);
          return;
        }

        await getMe();
        let works: CommunityFeedItem[] = [];
        try {
          const profile = await getCommunityUserProfile(user.username);
          works = profile.results;
        } catch {
          // demo / empty
        }
        if (!cancelled) {
          setModel(
            buildDemoProfilePageModel({
              username: user.username,
              displayName: user.displayName,
              bio: user.bio,
              works,
            })
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
            })
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
  }, [isAuthenticated, user]);

  if (!isAuthenticated || !user) {
    return (
      <main className="mx-auto min-h-screen max-w-[960px] px-10 pb-12 pt-12 text-white">
        <div className="border border-white/10 bg-black/45 px-6 py-7 backdrop-blur-md">
          <div className="flex h-14 w-14 items-center justify-center bg-brand/16 text-brand-light">
            <ShieldCheck className="h-7 w-7" />
          </div>
          <h1 className="mt-6 text-[30px] font-semibold tracking-tight text-white">登录账号</h1>
          <p className="mt-3 text-[14px] leading-6 text-white/45">
            登录后可同步学习进度，查看粉丝、勋章、作品与 Premium 权益。
          </p>
          <div className="mt-8 flex flex-col gap-3">
            <Link href="/auth/login">
              <Button variant="primary" className="h-14 w-full rounded-none text-[15px]">
                手机号登录
              </Button>
            </Link>
            <Link href="/auth/signup">
              <Button variant="secondary" className="h-12 w-full rounded-none text-[14px]">
                创建账号
              </Button>
            </Link>
          </div>
        </div>
      </main>
    );
  }

  if (loading || !model) {
    return (
      <main className="mx-auto flex min-h-screen max-w-[1100px] items-center justify-center text-white/45">
        <Loader2 className="h-5 w-5 animate-spin" />
      </main>
    );
  }

  return (
    <>
      {error ? (
        <div className="mx-auto max-w-[1100px] px-5 pt-4 text-[12px] text-white/35 md:px-8">
          部分数据同步失败，已展示本地主页。
        </div>
      ) : null}
      <ProfileArenaPage
        model={model}
        isOwn
        onLogout={logout}
        backHref="/"
      />
    </>
  );
}
