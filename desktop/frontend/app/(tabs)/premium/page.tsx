"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Check,
  Crown,
  Film,
  Infinity,
  Sparkles,
  Zap,
} from "lucide-react";
import {
  PREMIUM_CHANGED_EVENT,
  activatePremium,
  cancelPremium,
  getPremiumState,
  premiumTierLabel,
  type PremiumState,
  type PremiumTierId,
} from "@/lib/profileCustomization";

const PLANS: Array<{
  id: Exclude<PremiumTierId, "free">;
  name: string;
  price: string;
  period: string;
  highlight?: boolean;
  perks: string[];
}> = [
  {
    id: "premium",
    name: "Premium",
    price: "18",
    period: "/月",
    perks: ["无限跟跳存档", "分段精析回放", "去广告练舞页", "周报练习洞察"],
  },
  {
    id: "pro",
    name: "Premium Pro",
    price: "38",
    period: "/月",
    highlight: true,
    perks: ["含 Premium 全部权益", "训练营优先位", "专属霓虹勋章框", "一对一纠错排队加速"],
  },
];

export default function PremiumPage() {
  const [state, setState] = React.useState<PremiumState>({
    tier: "free",
    active: false,
    expiresLabel: "未开通",
  });
  const [toast, setToast] = React.useState<string | null>(null);

  React.useEffect(() => {
    const sync = () => setState(getPremiumState());
    sync();
    window.addEventListener(PREMIUM_CHANGED_EVENT, sync as EventListener);
    return () => window.removeEventListener(PREMIUM_CHANGED_EVENT, sync as EventListener);
  }, []);

  function flash(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 2200);
  }

  function onSubscribe(tier: Exclude<PremiumTierId, "free">) {
    const next = activatePremium(tier);
    setState(next);
    flash(`已开通 ${premiumTierLabel(tier)}`);
  }

  function onCancel() {
    const next = cancelPremium();
    setState(next);
    flash("已取消订阅，回到免费版");
  }

  return (
    <main className="relative mx-auto min-h-screen max-w-[960px] px-5 pb-20 pt-8 text-white md:px-8">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(ellipse_at_top,rgba(204,255,0,0.12),transparent_55%)]" />

      <Link
        href="/me"
        className="relative inline-flex items-center gap-1.5 text-[13px] text-white/60 transition hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" />
        返回我的
      </Link>

      <div className="relative mt-6">
        <div className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.24em] text-[#ccff00]">
          <Crown className="h-4 w-4" />
          DancePulse Premium
        </div>
        <h1
          className="mt-3 text-[36px] font-black tracking-tight md:text-[48px]"
          style={{ fontFamily: "'Black Han Sans', 'Noto Sans SC', sans-serif", transform: "skewX(-4deg)" }}
        >
          练得更狠一点
        </h1>
        <p className="mt-3 max-w-xl text-[14px] leading-6 text-white/50">
          开通后个人页勋章框与权益会同步更新。
        </p>
      </div>

      <div className="relative mt-6 border border-white/10 bg-black/45 px-4 py-4">
        <div className="text-[12px] text-white/45">当前状态</div>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
          <div className="text-[18px] font-bold">
            {state.active ? (
              <span className="text-[#ccff00]">{premiumTierLabel(state.tier)} · 已开通</span>
            ) : (
              <span className="text-white/80">免费版</span>
            )}
          </div>
          <div className="text-[12px] text-white/40">{state.expiresLabel}</div>
        </div>
        {state.active ? (
          <button
            type="button"
            onClick={onCancel}
            className="mt-3 text-[12px] text-white/45 underline underline-offset-2 hover:text-white"
          >
            取消订阅
          </button>
        ) : null}
      </div>

      <div className="relative mt-6 grid gap-4 md:grid-cols-2">
        {PLANS.map((plan) => {
          const selected = state.active && state.tier === plan.id;
          return (
            <div
              key={plan.id}
              className={`relative border px-5 py-5 ${
                plan.highlight
                  ? "border-[#ccff00]/45 bg-[linear-gradient(160deg,rgba(204,255,0,0.12),rgba(5,5,5,0.95))]"
                  : "border-white/10 bg-black/40"
              }`}
            >
              {plan.highlight ? (
                <span className="absolute right-4 top-4 bg-[#ccff00] px-2 py-0.5 text-[10px] font-bold text-black">
                  推荐
                </span>
              ) : null}
              <div className="text-[13px] font-semibold text-white/55">{plan.name}</div>
              <div className="mt-2 flex items-end gap-1">
                <span className="font-mono text-[42px] font-black leading-none text-white">¥{plan.price}</span>
                <span className="mb-1 text-[13px] text-white/40">{plan.period}</span>
              </div>
              <ul className="mt-4 space-y-2">
                {plan.perks.map((perk) => (
                  <li key={perk} className="flex items-start gap-2 text-[13px] text-white/70">
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#ccff00]" />
                    {perk}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => onSubscribe(plan.id)}
                className={`mt-5 w-full py-3 text-[13px] font-bold transition ${
                  selected
                    ? "border border-[#ccff00]/50 text-[#ccff00]"
                    : "bg-[#ccff00] text-black hover:bg-white"
                }`}
                style={{ transform: "skewX(-6deg)" }}
              >
                <span style={{ transform: "skewX(6deg)", display: "inline-block" }}>
                  {selected ? "当前套餐" : `开通 ${plan.name}`}
                </span>
              </button>
            </div>
          );
        })}
      </div>

      <div className="relative mt-8 grid gap-3 sm:grid-cols-3">
        {[
          { icon: Infinity, title: "无限存档", desc: "跟跳结果不再限次保存" },
          { icon: Film, title: "精析回放", desc: "分段对比与错拍定位" },
          { icon: Zap, title: "优先队列", desc: "训练营与纠错加速通道" },
        ].map((item) => (
          <div key={item.title} className="border border-white/10 bg-black/35 px-4 py-4">
            <item.icon className="h-5 w-5 text-[#00f3ff]" />
            <div className="mt-3 text-[14px] font-semibold text-white">{item.title}</div>
            <div className="mt-1 text-[12px] text-white/45">{item.desc}</div>
          </div>
        ))}
      </div>

      <div className="relative mt-6 flex items-center gap-2 text-[12px] text-white/35">
        <Sparkles className="h-3.5 w-3.5 text-[#ccff00]" />
        开通即可解锁完整权益，可随时取消。
      </div>

      {toast ? (
        <div className="fixed bottom-8 left-1/2 z-[90] -translate-x-1/2 border border-[#ccff00]/40 bg-black/90 px-4 py-2.5 text-[13px] text-[#ccff00] shadow-lg">
          {toast}
        </div>
      ) : null}
    </main>
  );
}
