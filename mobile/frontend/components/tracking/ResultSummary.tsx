"use client";

// 挑战结束的结算页
//   - 总分 + S/A/B/C 评级
//   - 最佳 combo
//   - 各档位计数
//   - 不出现失败态,哪怕 0 分也显示 "挑战完成"

import * as React from "react";
import Link from "next/link";
import type { Grade } from "@/lib/pose/scoring";

function toRank(score: number): { label: string; color: string } {
  if (score >= 8000) return { label: "S", color: "text-amber-300" };
  if (score >= 5000) return { label: "A", color: "text-emerald-300" };
  if (score >= 2500) return { label: "B", color: "text-sky-300" };
  return { label: "C", color: "text-violet-300" };
}

export function ResultSummary({
  totalScore,
  tallies,
  maxCombo,
  onReplay,
  lessonId,
}: {
  totalScore: number;
  tallies: Record<Grade, number>;
  maxCombo: number;
  onReplay: () => void;
  lessonId: string;
}) {
  const rank = toRank(totalScore);
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/72 backdrop-blur-md">
      <div className="w-full max-w-[480px] rounded-[32px] border border-white/10 bg-[linear-gradient(160deg,rgba(62,30,110,0.9)_0%,rgba(16,8,32,0.94)_65%)] p-8 text-white shadow-[0_20px_60px_rgba(0,0,0,0.55)]">
        <div className="text-center">
          <div className="text-[12px] uppercase tracking-[0.28em] text-white/50">挑战完成</div>
          <div className={`mt-2 text-[96px] font-bold leading-none ${rank.color} drop-shadow-[0_0_20px_currentColor]`}>
            {rank.label}
          </div>
          <div className="mt-4 font-mono text-[40px] font-semibold leading-none">
            {totalScore.toLocaleString()}
          </div>
          <div className="mt-1 text-[12px] text-white/45">总分</div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3">
          {(["PERFECT", "GOOD", "OK", "MISS"] as const).map((g) => (
            <div key={g} className="flex items-center justify-between rounded-xl bg-white/6 px-4 py-2">
              <span className="text-[12px] uppercase tracking-wider text-white/55">{g}</span>
              <span className="font-mono text-[18px]">{tallies[g]}</span>
            </div>
          ))}
          <div className="col-span-2 flex items-center justify-between rounded-xl border border-amber-300/30 bg-amber-500/10 px-4 py-2">
            <span className="text-[12px] uppercase tracking-wider text-amber-200/90">最佳 Combo</span>
            <span className="font-mono text-[22px] text-amber-300">{maxCombo}</span>
          </div>
        </div>

        <div className="mt-7 flex gap-3">
          <button
            type="button"
            onClick={onReplay}
            className="flex-1 rounded-full bg-gradient-to-r from-amber-400 to-fuchsia-500 px-4 py-3 text-[15px] font-semibold text-white transition hover:brightness-110"
          >
            再来一次
          </button>
          <Link
            href={`/lesson/${lessonId}`}
            className="flex-1 rounded-full border border-white/20 bg-white/5 px-4 py-3 text-center text-[15px] font-medium text-white/85 transition hover:bg-white/12"
          >
            返回课程
          </Link>
        </div>
      </div>
    </div>
  );
}

export default ResultSummary;
