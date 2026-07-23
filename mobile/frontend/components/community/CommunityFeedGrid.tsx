"use client";

import Link from "next/link";
import { Heart, MessageCircle } from "lucide-react";
import type { CommunityFeedItem } from "@/lib/types";
import { SHOWCASE_WORK_META, type ShowcaseGrade } from "@/lib/communityShowcase";
import { resolveMediaUrl } from "@/lib/api";

const GRADE_ORDER: ShowcaseGrade[] = ["PERFECT", "GOOD", "OK", "MISS"];
const GRADE_COLOR: Record<ShowcaseGrade, string> = {
  PERFECT: "#ccff00",
  GOOD: "#00f3ff",
  OK: "#ffaa00",
  MISS: "#ff0055",
};

function MiniGradeBar({ tallies }: { tallies?: Record<ShowcaseGrade, number> }) {
  if (!tallies) return null;
  const total = Math.max(1, GRADE_ORDER.reduce((sum, g) => sum + tallies[g], 0));
  return (
    <div className="mt-2 flex h-1 w-full overflow-hidden bg-white/10">
      {GRADE_ORDER.map((grade) => {
        const pct = (tallies[grade] / total) * 100;
        if (pct <= 0) return null;
        return (
          <div key={grade} className="h-full" style={{ width: `${pct}%`, backgroundColor: GRADE_COLOR[grade] }} />
        );
      })}
    </div>
  );
}

function accentForScore(score: number) {
  if (score >= 94) return "#ccff00";
  if (score >= 88) return "#00f3ff";
  if (score >= 80) return "#ffaa00";
  return "rgba(255,255,255,0.25)";
}

function ArenaCard({
  item,
  variant,
  index,
}: {
  item: CommunityFeedItem;
  variant: "hero" | "tall" | "compact";
  index: number;
}) {
  const meta = SHOWCASE_WORK_META[item.result.id];
  const thumb = item.previewThumbnail ? resolveMediaUrl(item.previewThumbnail) : null;
  const accent = accentForScore(item.result.score);
  const tag = meta?.tags?.[0];
  const isHero = variant === "hero";

  return (
    <Link
      href={`/community/result/${item.result.id}`}
      className={`arena-card group relative block overflow-hidden bg-black/50 animate-[arenaCardIn_0.55s_ease-out_both] active:scale-[0.98] ${
        isHero ? "col-span-2" : variant === "tall" ? "row-span-2" : ""
      }`}
      style={{
        border: `1px solid ${item.result.score >= 90 ? `${accent}55` : "rgba(255,255,255,0.08)"}`,
        animationDelay: `${Math.min(index, 10) * 0.05}s`,
      }}
    >
      <div
        className={`relative w-full overflow-hidden bg-cover bg-center transition-transform duration-500 group-active:scale-[1.02] ${
          isHero ? "aspect-[16/10]" : variant === "tall" ? "aspect-[3/4]" : "aspect-[9/14]"
        }`}
        style={
          thumb
            ? { backgroundImage: `url("${thumb}")` }
            : { background: "linear-gradient(160deg,#1a1020,#050505)" }
        }
      />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.15)_0%,rgba(0,0,0,0.2)_40%,rgba(0,0,0,0.92)_100%)]" />

      <div className={`absolute left-3 top-3 ${isHero ? "left-4 top-4" : ""}`}>
        <div
          className={`font-mono font-black leading-none tracking-tighter text-white ${
            isHero ? "text-[52px]" : "text-[28px]"
          }`}
          style={{ color: accent, textShadow: `0 0 24px ${accent}55` }}
        >
          {item.result.score}
        </div>
        {tag ? (
          <div
            className="mt-2 inline-block px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.16em] text-black"
            style={{ backgroundColor: accent, transform: "skewX(-8deg)" }}
          >
            <span style={{ transform: "skewX(8deg)", display: "inline-block" }}>{tag}</span>
          </div>
        ) : null}
      </div>

      <div className={`absolute inset-x-0 bottom-0 ${isHero ? "p-4" : "p-3.5"}`}>
        <div className={`line-clamp-1 font-semibold text-white ${isHero ? "text-[18px]" : "text-[14px]"}`}>
          {item.lessonTitle}
        </div>
        {meta?.caption ? (
          <div className={`mt-1 text-white/55 ${isHero ? "line-clamp-2 text-[13px]" : "line-clamp-1 text-[11px]"}`}>
            {meta.caption}
          </div>
        ) : null}
        <MiniGradeBar tallies={meta?.gradeTallies} />
        <div className="mt-2 flex items-center justify-between text-[11px] text-white/50">
          <span className="truncate">@{item.user.displayName || item.user.username}</span>
          <span className="inline-flex items-center gap-3">
            <span className="inline-flex items-center gap-1">
              <Heart className="h-3 w-3" />
              {item.result.likeCount}
            </span>
            <span className="inline-flex items-center gap-1">
              <MessageCircle className="h-3 w-3" />
              {item.result.commentCount}
            </span>
          </span>
        </div>
      </div>
    </Link>
  );
}

export function CommunityFeedGrid({ items }: { items: CommunityFeedItem[] }) {
  if (!items.length) {
    return <div className="py-20 text-center text-white/40">暂无作品</div>;
  }

  const [hero, ...rest] = items;

  return (
    <div className="arena-feed grid grid-cols-2 gap-3">
      <ArenaCard item={hero} variant="hero" index={0} />
      {rest.map((item, index) => (
        <ArenaCard
          key={item.result.id}
          item={item}
          variant={index % 5 === 0 ? "tall" : "compact"}
          index={index + 1}
        />
      ))}
    </div>
  );
}
