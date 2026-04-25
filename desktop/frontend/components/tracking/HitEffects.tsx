"use client";

// 跟拍挑战 · 分级命中效果
//
// 四档命中等级 (level):
//   soft   — OK              : 仅 shake-soft + flash 弱
//   mid    — GOOD            : shake-mid + flash + vignette
//   strong — PERFECT         : shake-strong + flash + vignette + chroma (当前默认)
//   mega   — COMBO milestone : shake-mega + flash 更强 + vignette + chroma
//
// 触发方式: 父组件每次命中时 setHitToken(prev+1) + setHitLevel(level)
// 本组件监听 token 变化, 重新挂载 overlay (用 key), CSS keyframe 自动播一次

import * as React from "react";

export type HitLevel = "soft" | "mid" | "strong" | "mega";

const SHAKE_CLASS: Record<HitLevel, string> = {
  soft: "hit-shake-soft",
  mid: "hit-shake-mid",
  strong: "hit-shake-strong",
  mega: "hit-shake-mega",
};

const SHAKE_MS: Record<HitLevel, number> = {
  soft: 200,
  mid: 240,
  strong: 300,
  mega: 400,
};

export function useHitShakeClass(hitToken: number, level: HitLevel): string {
  const [cls, setCls] = React.useState("");
  React.useEffect(() => {
    if (hitToken <= 0) return;
    const next = SHAKE_CLASS[level];
    setCls(next);
    const t = window.setTimeout(() => setCls(""), SHAKE_MS[level] + 20);
    return () => window.clearTimeout(t);
    // level 变化时不能重新触发 —— 只跟随 hitToken
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hitToken]);
  return cls;
}

export default function HitEffects({
  hitToken,
  combo,
  level = "strong",
}: {
  hitToken: number;
  combo: number;
  level?: HitLevel;
}) {
  const key = hitToken;

  const feverCls =
    combo >= 20 ? "fever-glow-fever"
    : combo >= 10 ? "fever-glow-hot"
    : "";

  // 各 overlay 的开关 + 强度, 按 level 调节
  const showFlash = true; // 全档都闪
  const showVignette = level === "mid" || level === "strong" || level === "mega";
  const showChroma = level === "strong" || level === "mega";

  const flashOpacityScale =
    level === "soft" ? 0.5 :
    level === "mid" ? 0.8 :
    level === "mega" ? 1.15 :
    1.0;

  return (
    <>
      {/* SVG filter: 色散 */}
      <svg className="absolute h-0 w-0" aria-hidden>
        <defs>
          <filter id="dp-chroma" x="-5%" y="-5%" width="110%" height="110%">
            <feColorMatrix in="SourceGraphic" type="matrix" result="R"
              values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" />
            <feOffset in="R" dx="6" dy="0" result="Roff" />
            <feColorMatrix in="SourceGraphic" type="matrix" result="G"
              values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" />
            <feColorMatrix in="SourceGraphic" type="matrix" result="B"
              values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" />
            <feOffset in="B" dx="-6" dy="0" result="Boff" />
            <feBlend in="Roff" in2="G" mode="screen" result="RG" />
            <feBlend in="RG" in2="Boff" mode="screen" />
          </filter>
        </defs>
      </svg>

      {hitToken > 0 && showFlash ? (
        <div
          key={`flash-${key}`}
          className="hit-flash pointer-events-none absolute inset-0 z-50"
          style={{
            background: `radial-gradient(ellipse at center, rgba(255,240,200,${0.95 * flashOpacityScale}) 0%, rgba(255,220,130,${0.6 * flashOpacityScale}) 35%, rgba(255,255,255,0) 75%)`,
          }}
          aria-hidden
        />
      ) : null}

      {hitToken > 0 && showVignette ? (
        <div
          key={`vig-${key}`}
          className="hit-vignette pointer-events-none absolute inset-0 z-50"
          style={{
            background: "radial-gradient(ellipse at center, transparent 35%, rgba(0,0,0,0.75) 100%)",
          }}
          aria-hidden
        />
      ) : null}

      {hitToken > 0 && showChroma ? (
        <div
          key={`chroma-${key}`}
          className="hit-chroma pointer-events-none absolute inset-0 z-50"
          style={{
            backdropFilter: "url(#dp-chroma)",
            WebkitBackdropFilter: "url(#dp-chroma)",
          }}
          aria-hidden
        />
      ) : null}

      {feverCls ? (
        <div
          className={`pointer-events-none absolute inset-0 z-40 ${feverCls}`}
          aria-hidden
        />
      ) : null}
    </>
  );
}
