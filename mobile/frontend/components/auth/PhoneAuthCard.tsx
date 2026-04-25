"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, MessageSquareText, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { applyLocalProgressSnapshot, buildLocalProgressSnapshot, setAuthSession } from "@/lib/auth";
import { getMe, migrateLocalSnapshot, sendSmsCode, verifySmsCode } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";

export function PhoneAuthCard({
  mode,
}: {
  mode: "login" | "signup";
}) {
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const [phone, setPhone] = React.useState("");
  const [code, setCode] = React.useState("");
  const [devCode, setDevCode] = React.useState<string | null>(null);
  const [sent, setSent] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const [verifying, setVerifying] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const title = mode === "login" ? "手机号登录" : "创建账号";
  const subtitle =
    mode === "login"
      ? "登录后会同步你的学习进度、连续学习和徽章。"
      : "注册成功后会自动生成公开用户名，后续社区功能直接沿用。";

  React.useEffect(() => {
    if (isAuthenticated) {
      router.replace("/me");
    }
  }, [isAuthenticated, router]);

  const handleSendCode = React.useCallback(async () => {
    setSending(true);
    setError(null);
    try {
      const response = await sendSmsCode(phone);
      setSent(true);
      setDevCode(response.devCode);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  }, [phone]);

  const handleVerify = React.useCallback(async () => {
    setVerifying(true);
    setError(null);
    try {
      const verify = await verifySmsCode(phone, code);
      setAuthSession({ token: verify.token, user: verify.user });

      const snapshotResponse = await migrateLocalSnapshot(buildLocalProgressSnapshot());
      applyLocalProgressSnapshot(snapshotResponse.snapshot);

      const me = await getMe();
      setAuthSession({ token: verify.token, user: me.user });
      router.replace("/me");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setVerifying(false);
    }
  }, [code, phone, router]);

  return (
    <main className="mx-auto min-h-screen max-w-md px-5 pb-10 pt-8 text-white">
      <Link
        href="/me"
        className="inline-flex items-center gap-2 text-sm text-white/45 transition hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" />
        返回我的
      </Link>

      <section className="mt-8 rounded-[32px] border border-white/8 bg-bg-raised px-6 py-7">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand/16 text-brand-light">
          {mode === "login" ? (
            <ShieldCheck className="h-7 w-7" />
          ) : (
            <MessageSquareText className="h-7 w-7" />
          )}
        </div>

        <h1 className="mt-6 text-[30px] font-semibold tracking-tight text-white">{title}</h1>
        <p className="mt-3 text-[14px] leading-6 text-white/45">{subtitle}</p>

        <div className="mt-8 space-y-4">
          <label className="block">
            <span className="mb-2 block text-[13px] text-white/50">手机号</span>
            <input
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              inputMode="numeric"
              placeholder="请输入手机号"
              className="h-14 w-full rounded-[18px] border border-white/10 bg-white/[0.04] px-4 text-[15px] text-white outline-none transition focus:border-brand/50"
            />
          </label>

          {sent ? (
            <label className="block">
              <span className="mb-2 block text-[13px] text-white/50">验证码</span>
              <input
                value={code}
                onChange={(event) => setCode(event.target.value)}
                inputMode="numeric"
                placeholder="请输入 6 位验证码"
                className="h-14 w-full rounded-[18px] border border-white/10 bg-white/[0.04] px-4 text-[15px] text-white outline-none transition focus:border-brand/50"
              />
            </label>
          ) : null}
        </div>

        {devCode ? (
          <div className="mt-4 rounded-[18px] border border-brand/20 bg-brand/10 px-4 py-3 text-[13px] text-brand-light">
            开发验证码：<span className="font-semibold tracking-[0.18em]">{devCode}</span>
          </div>
        ) : null}

        {error ? (
          <div className="mt-4 rounded-[18px] border border-state-danger/20 bg-state-danger/10 px-4 py-3 text-[13px] text-red-200">
            {error}
          </div>
        ) : null}

        <div className="mt-6 flex flex-col gap-3">
          {!sent ? (
            <Button
              variant="primary"
              className="h-14 w-full rounded-[18px] text-[15px]"
              onClick={handleSendCode}
              disabled={sending || phone.trim().length < 6}
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              发送验证码
            </Button>
          ) : (
            <Button
              variant="primary"
              className="h-14 w-full rounded-[18px] text-[15px]"
              onClick={handleVerify}
              disabled={verifying || code.trim().length < 4}
            >
              {verifying ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              完成登录
            </Button>
          )}

          <Button
            variant="secondary"
            className="h-12 w-full rounded-[18px] text-[14px]"
            onClick={() => {
              setSent(false);
              setCode("");
              setDevCode(null);
            }}
          >
            {sent ? "重新填写手机号" : "稍后再说"}
          </Button>

          {sent ? (
            <button
              type="button"
              onClick={handleSendCode}
              disabled={sending}
              className="text-[13px] text-white/42 transition hover:text-white/78 disabled:opacity-40"
            >
              重新发送验证码
            </button>
          ) : null}
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
