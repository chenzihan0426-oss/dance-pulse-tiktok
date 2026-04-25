"use client";

// 实时评分反馈 UI。
//  - 顶部:大档位牌(PERFECT / GOOD / OK / MISS),按平滑分自动切换
//  - 进度条:当前(平滑)得分 0-100
//  - 右下:本次 session 累计统计(各档位次数)

import * as React from "react";

import type { Grade } from "@/lib/pose/scoring";

interface Props {
  score: number;     // 0-1 平滑分
  grade: Grade | null;
  tallies?: Record<Grade, number>;  // Perfect/Good/OK/Miss 累积
  visible?: boolean;
  className?: string;
}

const GRADE_STYLE: Record<Grade, { text: string; color: string; shadow: string }> = {
  PERFECT: { text: "PERFECT", color: "#fde68a", shadow: "rgba(253,230,138,0.75)" },
  GOOD: { text: "GOOD", color: "#a7f3d0", shadow: "rgba(167,243,208,0.6)" },
  OK: { text: "OK", color: "#c4b5fd", shadow: "rgba(196,181,253,0.55)" },
  MISS: { text: "MISS", color: "#fca5a5", shadow: "rgba(252,165,165,0.55)" },
};

export default function ScoreFeedback({
  score,
  grade,
  tallies,
  visible = true,
  className,
}: Props) {
  if (!visible) return null;
  const pct = Math.round(Math.max(0, Math.min(1, score)) * 100);
  const style = grade ? GRADE_STYLE[grade] : null;

  return (
    <div
      className={
        className ??
        "pointer-events-none absolute inset-x-0 top-0 flex flex-col items-center gap-2 px-4 pt-4"
      }
    >
      {style ? (
        <div
          className="rounded-full px-5 py-1.5 text-[22px] font-bold tracking-[0.08em] backdrop-blur-sm"
          style={{
            color: style.color,
            background: "rgba(8,4,18,0.55)",
            textShadow: `0 0 12px ${style.shadow}, 0 0 24px ${style.shadow}`,
            boxShadow: `0 0 22px ${style.shadow}`,
            border: `1px solid ${style.color}44`,
          }}
        >
          {style.text}
        </div>
      ) : null}

      <div className="flex w-full max-w-[320px] items-center gap-3 rounded-full bg-black/40 px-3 py-1.5 backdrop-blur-sm">
        <span className="text-[11px] font-mono text-white/60">{pct}</span>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/15">
          <div
            className="h-full rounded-full transition-[width] duration-150"
            style={{
              width: `${pct}%`,
              background:
                "linear-gradient(90deg, rgba(192,132,252,0.9), rgba(253,230,138,0.95))",
              boxShadow: "0 0 10px rgba(253,230,138,0.6)",
            }}
          />
        </div>
      </div>

      {tallies ? (
        <div className="mt-2 flex items-center gap-2 text-[11px] font-medium">
          {(["PERFECT", "GOOD", "OK", "MISS"] as Grade[]).map((g) => (
            <span
              key={g}
              className="rounded-full bg-black/40 px-2.5 py-1 backdrop-blur-sm"
              style={{ color: GRADE_STYLE[g].color, border: `1px solid ${GRADE_STYLE[g].color}30` }}
            >
              {g} · {tallies[g] ?? 0}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
