"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, KeyRound, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { loginWithAnyPassword } from "@/lib/auth";
import { useAuth } from "@/hooks/useAuth";

/** 演示登录：账号/密码填任意非空字符串即可。 */
export function DemoPasswordAuthCard({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (isAuthenticated) router.replace("/me");
  }, [isAuthenticated, router]);

  const handleSubmit = React.useCallback(
    (event: React.FormEvent) => {
      event.preventDefault();
      setError(null);
      const u = username.trim();
      const p = password.trim();
      if (!u || !p) {
        setError("账号和密码都随便填一段文字即可（不能为空）");
        return;
      }
      setBusy(true);
      try {
        loginWithAnyPassword(u, p);
        router.replace("/me");
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
    },
    [password, router, username],
  );

  const title = mode === "login" ? "登录" : "注册 / 登录";

  return (
    <main className="mx-auto min-h-screen max-w-md px-5 pb-10 pt-8 text-white">
      <Link
        href="/me"
        className="inline-flex items-center gap-2 text-sm text-white/45 transition hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" />
        返回我的
      </Link>

      <section className="mt-8 rounded-[32px] border border-white/10 bg-gradient-to-b from-white/[0.07] to-transparent px-6 py-7">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#ccff00]/15 text-[#ccff00]">
          <KeyRound className="h-7 w-7" />
        </div>

        <h1 className="mt-6 text-[30px] font-black tracking-tight text-white">{title}</h1>
        <p className="mt-3 text-[14px] leading-6 text-white/55">
          演示模式：账号、密码输入<strong className="text-white">任意字符串</strong>即可进入。无需真实验证码。
        </p>

        <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
          <label className="block">
            <span className="mb-2 block text-[13px] text-white/50">账号</span>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              placeholder="随便填，例如 dancer01"
              className="h-14 w-full rounded-[18px] border border-white/10 bg-white/[0.04] px-4 text-[15px] text-white outline-none transition focus:border-[#00f3ff]/50"
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-[13px] text-white/50">密码</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              placeholder="随便填，例如 123456"
              className="h-14 w-full rounded-[18px] border border-white/10 bg-white/[0.04] px-4 text-[15px] text-white outline-none transition focus:border-[#00f3ff]/50"
            />
          </label>

          {error ? (
            <div className="rounded-[18px] border border-red-400/30 bg-red-500/10 px-4 py-3 text-[13px] text-red-200">
              {error}
            </div>
          ) : null}

          <Button
            type="submit"
            variant="primary"
            className="h-14 w-full rounded-[18px] bg-gradient-to-r from-[#ff0055] via-[#9d4edd] to-[#00f3ff] text-[15px] font-semibold text-white"
            disabled={busy}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {mode === "login" ? "登录" : "注册并登录"}
          </Button>
        </form>

        <p className="mt-5 text-center text-[12px] text-white/35">
          仅本机演示会话，不会校验真实账号。
        </p>

        <div className="mt-6 text-center text-[13px] text-white/40">
          {mode === "login" ? (
            <>
              还没有账号？{" "}
              <Link href="/auth/signup" className="text-[#00f3ff]">
                去注册
              </Link>
            </>
          ) : (
            <>
              已有账号？{" "}
              <Link href="/auth/login" className="text-[#00f3ff]">
                去登录
              </Link>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
