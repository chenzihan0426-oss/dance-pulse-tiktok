"use client";

import Link from "next/link";
import { Play, Trophy, Users, Zap } from "lucide-react";
import type { WeeklyChallenge } from "@/lib/communityShowcase";
import { resolveMediaUrl } from "@/lib/api";

export function ArenaHero({ challenge }: { challenge: WeeklyChallenge }) {
  const thumb = resolveMediaUrl(challenge.thumb);

  return (
    <section className="arena-hero relative isolate overflow-hidden border border-white/10 animate-[arenaIn_0.7s_ease-out_both]">
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url("${thumb}")` }}
      />
      <div className="absolute inset-0 bg-[linear-gradient(100deg,rgba(5,5,5,0.92)_0%,rgba(5,5,5,0.72)_42%,rgba(5,5,5,0.35)_100%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_70%_40%,rgba(255,0,85,0.22),transparent_55%)]" />
      <div className="pointer-events-none absolute inset-y-0 left-0 w-1 bg-[#ccff00]" />

      <div className="relative grid min-h-[420px] gap-8 px-7 py-8 md:grid-cols-[1.2fr_0.8fr] md:px-10 md:py-10">
        <div className="flex flex-col justify-end">
          <div className="flex flex-wrap items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.28em] text-[#ccff00]/90">
            <span className="inline-flex items-center gap-1.5">
              <Zap className="h-3.5 w-3.5" />
              Arena Live
            </span>
            <span className="text-white/35">/</span>
            <span className="text-[#ff0055]">剩余 {challenge.daysLeft} 天</span>
          </div>

          <h2
            className="mt-4 max-w-3xl text-[40px] font-black leading-[0.95] tracking-tight text-white md:text-[56px]"
            style={{ fontFamily: "'Black Han Sans', 'Noto Sans SC', sans-serif", transform: "skewX(-6deg)" }}
          >
            {challenge.lessonTitle.split(" - ")[0]}
            <span className="mt-2 block text-[18px] font-bold tracking-[0.08em] text-white/55 md:text-[22px]">
              本周同舞竞技场
            </span>
          </h2>

          <div className="mt-6 flex flex-wrap items-center gap-5 text-[13px] text-white/65">
            <span className="inline-flex items-center gap-1.5">
              <Users className="h-4 w-4 text-[#00f3ff]" />
              {challenge.participants.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")} 人在赛
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Trophy className="h-4 w-4 text-[#ccff00]" />
              现任周冠 {challenge.topDisplayName}
            </span>
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href={`/lesson/${challenge.lessonId}/tracking-desktop`}
              className="inline-flex items-center gap-2 bg-[#ccff00] px-6 py-3 text-[14px] font-bold uppercase tracking-wider text-black transition hover:bg-white"
              style={{ transform: "skewX(-8deg)" }}
            >
              <span className="inline-flex items-center gap-2" style={{ transform: "skewX(8deg)" }}>
                <Play className="h-4 w-4" fill="currentColor" />
                立即跟跳挑战
              </span>
            </Link>
            <Link
              href={`/community/result/${challenge.topResultId}`}
              className="inline-flex items-center gap-2 border border-white/25 bg-black/35 px-6 py-3 text-[14px] font-semibold text-white/90 backdrop-blur transition hover:border-[#00f3ff]/50 hover:text-white"
              style={{ transform: "skewX(-8deg)" }}
            >
              <span style={{ transform: "skewX(8deg)" }}>看周冠示范</span>
            </Link>
          </div>
        </div>

        <div className="flex items-end justify-start md:justify-end">
          <div className="relative w-full max-w-[280px] border border-[#ccff00]/35 bg-black/55 p-5 backdrop-blur-md">
            <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#ccff00]/80">
              Top Score
            </div>
            <div
              className="mt-2 font-mono text-[72px] font-black leading-none tracking-tighter text-white"
              style={{ textShadow: "0 0 28px rgba(204,255,0,0.35)" }}
            >
              {challenge.topScore}
            </div>
            <div className="mt-1 text-[12px] text-white/45">本周最高分 · 可被超越</div>
            <div className="mt-4 h-px w-full bg-gradient-to-r from-[#ccff00]/70 to-transparent" />
            <div className="mt-4 text-[13px] text-white/75">{challenge.topDisplayName}</div>
          </div>
        </div>
      </div>
    </section>
  );
}
