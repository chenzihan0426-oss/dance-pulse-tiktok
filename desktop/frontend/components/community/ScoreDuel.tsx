"use client";

import Link from "next/link";
import { Swords } from "lucide-react";
import type { ShowcaseGrade, WeeklyScoreDuel } from "@/lib/communityShowcase";
import { resolveMediaUrl } from "@/lib/api";

const GRADE_ORDER: ShowcaseGrade[] = ["PERFECT", "GOOD", "OK", "MISS"];
const GRADE_COLOR: Record<ShowcaseGrade, string> = {
  PERFECT: "#ccff00",
  GOOD: "#00f3ff",
  OK: "#ffaa00",
  MISS: "#ff0055",
};

function GradeBar({ tallies }: { tallies: Record<ShowcaseGrade, number> }) {
  const total = Math.max(1, GRADE_ORDER.reduce((sum, g) => sum + tallies[g], 0));
  return (
    <div className="flex h-2 w-full overflow-hidden bg-white/10">
      {GRADE_ORDER.map((grade) => {
        const pct = (tallies[grade] / total) * 100;
        if (pct <= 0) return null;
        return (
          <div
            key={grade}
            className="h-full transition-all duration-700"
            style={{ width: `${pct}%`, backgroundColor: GRADE_COLOR[grade] }}
            title={`${grade} ${tallies[grade]}`}
          />
        );
      })}
    </div>
  );
}

function DuelFighter({
  side,
  align,
}: {
  side: WeeklyScoreDuel["champion"];
  align: "left" | "right";
}) {
  const thumb = side.thumb ? resolveMediaUrl(side.thumb) : null;
  return (
    <Link
      href={`/community/result/${side.resultId}`}
      className={`group flex min-w-0 flex-1 items-center gap-4 ${align === "right" ? "flex-row-reverse text-right" : ""}`}
    >
      <div
        className="h-16 w-16 shrink-0 border border-white/15 bg-cover bg-center transition group-hover:border-[#00f3ff]/50"
        style={
          thumb
            ? { backgroundImage: `url("${thumb}")` }
            : { background: "linear-gradient(135deg,#1a1a1a,#050505)" }
        }
      />
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#ccff00]/85">
          {side.label} · #{side.rank}
        </div>
        <div className="mt-1 truncate text-[16px] font-semibold text-white">{side.displayName}</div>
        <div className="mt-2">
          <GradeBar tallies={side.tallies} />
        </div>
        <div className="mt-1 text-[10px] text-white/40">
          {side.delta > 0 ? `↑${side.delta}` : side.delta < 0 ? `↓${Math.abs(side.delta)}` : "—"} 名次波动
        </div>
      </div>
      <div
        className="shrink-0 font-mono text-[42px] font-black leading-none text-white"
        style={{ textShadow: "0 0 18px rgba(0,243,255,0.25)" }}
      >
        {side.score}
      </div>
    </Link>
  );
}

export function ScoreDuel({ duel }: { duel: WeeklyScoreDuel }) {
  return (
    <section className="score-duel relative overflow-hidden border border-white/10 bg-black/40 px-5 py-5 backdrop-blur-sm animate-[duelIn_0.75s_ease-out_0.12s_both] md:px-7">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.22em] text-white/55">
          <Swords className="h-3.5 w-3.5 text-[#ff0055]" />
          本周对决
          <span className="text-white/25">/</span>
          <span className="normal-case tracking-normal text-white/40">{duel.lessonTitle}</span>
        </div>
        <div className="font-mono text-[12px] text-[#ff0055]">
          GAP <span className="text-[18px] font-black text-white">{duel.gap}</span>
        </div>
      </div>

      <div className="flex flex-col items-stretch gap-4 md:flex-row md:items-center">
        <DuelFighter side={duel.champion} align="left" />
        <div className="hidden shrink-0 px-2 text-[13px] font-black tracking-[0.3em] text-white/25 md:block">
          VS
        </div>
        <div className="text-center text-[13px] font-black tracking-[0.3em] text-white/25 md:hidden">VS</div>
        <DuelFighter side={duel.challenger} align="right" />
      </div>
    </section>
  );
}
