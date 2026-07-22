"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, ShieldCheck, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { setAuthSession } from "@/lib/auth";
import type { User } from "@/lib/types";
import { useAuth } from "@/hooks/useAuth";

function buildDemoUser(phoneInput: string): User {
  const raw = phoneInput.trim() || "guest";
  const slug = raw.replace(/[^\w\u4e00-\u9fff]/g, "").slice(-8) || "guest";
  const suffix = slug.slice(-4) || "0000";
  return {
    id: `usr_demo_${slug}`,
    phone: raw,
    username: `u_${slug}`.toLowerCase().slice(0, 24),
    displayName: `舞者_${suffix}`,
    avatar: null,
    bio: "跳舞的人",
    isVerified: false,
    createdAt: new Date().toISOString(),
  };
}

export function PhoneAuthCard({
  mode,
}: {
  mode: "login" | "signup";
}) {
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const [phone, setPhone] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const title = mode === "login" ? "登录" : "注册";
  const subtitle =
    mode === "login" ? "登录后同步练习进度与社区身份。" : "注册后即可发布作品、关注舞者。";

  React.useEffect(() => {
    if (isAuthenticated) {
      router.replace("/me");
    }
  }, [isAuthenticated, router]);

  const handleSubmit = React.useCallback(async () => {
    if (!phone.trim() || !password.trim()) {
      setError("请填写手机号和密码。");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      // 演示登录：不校验后端，本地写入会话即可
      await new Promise((resolve) => setTimeout(resolve, 280));
      const user = buildDemoUser(phone);
      setAuthSession({
        token: `demo_token_${user.id}_${Date.now()}`,
        user,
      });
      router.replace("/me");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }, [password, phone, router]);

  return (
    <main className="mx-auto flex min-h-screen max-w-[480px] flex-col justify-center px-8 pb-12 pt-12 text-white">
      <Link
        href="/me"
        className="inline-flex items-center gap-2 text-sm text-white/45 transition hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" />
        返回我的
      </Link>

      <section className="mt-8 rounded-[32px] border border-white/8 bg-black/45 px-6 py-7 backdrop-blur-md">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand/16 text-brand-light">
          {mode === "login" ? <ShieldCheck className="h-7 w-7" /> : <UserPlus className="h-7 w-7" />}
        </div>

        <h1 className="mt-6 text-[30px] font-semibold tracking-tight text-white">{title}</h1>
        <p className="mt-3 text-[14px] leading-6 text-white/45">{subtitle}</p>

        <div className="mt-8 space-y-4">
          <label className="block">
            <span className="mb-2 block text-[13px] text-white/50">手机号</span>
            <input
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              autoComplete="username"
              placeholder="任意字符串"
              className="h-14 w-full rounded-[18px] border border-white/10 bg-white/[0.04] px-4 text-[15px] text-white outline-none transition focus:border-brand/50"
              onKeyDown={(event) => {
                if (event.key === "Enter") void handleSubmit();
              }}
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-[13px] text-white/50">密码</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              placeholder="任意字符串"
              className="h-14 w-full rounded-[18px] border border-white/10 bg-white/[0.04] px-4 text-[15px] text-white outline-none transition focus:border-brand/50"
              onKeyDown={(event) => {
                if (event.key === "Enter") void handleSubmit();
              }}
            />
          </label>
        </div>

        {error ? (
          <div className="mt-4 rounded-[18px] border border-state-danger/20 bg-state-danger/10 px-4 py-3 text-[13px] text-red-200">
            {error}
          </div>
        ) : null}

        <div className="mt-6 flex flex-col gap-3">
          <Button
            variant="primary"
            className="h-14 w-full rounded-[18px] text-[15px]"
            onClick={() => void handleSubmit()}
            disabled={submitting || !phone.trim() || !password.trim()}
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {mode === "login" ? "登录" : "注册并登录"}
          </Button>

          <Button
            variant="secondary"
            className="h-12 w-full rounded-[18px] text-[14px]"
            onClick={() => router.push("/me")}
          >
            稍后再说
          </Button>
        </div>

        <div className="mt-6 text-center text-[13px] text-white/40">
          {mode === "login" ? (
            <>
              还没有账号？{" "}
              <Link href="/auth/signup" className="text-brand-light">
                去注册
              </Link>
            </>
          ) : (
            <>
              已有账号？{" "}
              <Link href="/auth/login" className="text-brand-light">
                去登录
              </Link>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
