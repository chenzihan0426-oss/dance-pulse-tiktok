"use client";

import * as React from "react";
import Link from "next/link";
import { Flame, Heart, Sparkles, Star, Users, Waves, Zap } from "lucide-react";
import { resolveMediaUrl } from "@/lib/api";
import { pickDemoThumb, useDemoCoverPool } from "@/lib/demoMedia";
import {
  getSimilarLessonRecommendations,
  type SimilarLessonRec,
  type SimilarTagKind,
} from "@/lib/lessonSimilar";

const TAG_STYLE: Record<SimilarTagKind, string> = {
  similarity: "border-[#ccff00]/45 bg-[#ccff00]/12 text-[#ccff00]",
  friends: "border-[#00f3ff]/40 bg-[#00f3ff]/10 text-[#00f3ff]",
  genre: "border-[#ff0055]/40 bg-[#ff0055]/10 text-[#ff7ab0]",
  tempo: "border-white/25 bg-white/8 text-white/80",
  difficulty: "border-[#9d4edd]/45 bg-[#9d4edd]/15 text-[#d8b4fe]",
  hot: "border-[#ffaa00]/45 bg-[#ffaa00]/12 text-[#ffcc66]",
  sync: "border-[#00f3ff]/50 bg-[#00f3ff]/12 text-[#7af0ff]",
  mood: "border-[#ff7ab0]/40 bg-[#ff0055]/10 text-[#ffb0d0]",
  crew: "border-white/30 bg-white/6 text-white/75",
};

function SimilarityRing({ value }: { value: number }) {
  const uid = React.useId().replace(/:/g, "");
  const gradId = `simGrad-${uid}`;
  const r = 18;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - value / 100);
  return (
    <div className="relative h-12 w-12 shrink-0">
      <svg viewBox="0 0 44 44" className="h-12 w-12 -rotate-90">
        <circle cx="22" cy="22" r={r} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="3" />
        <circle
          cx="22"
          cy="22"
          r={r}
          fill="none"
          stroke={`url(#${gradId})`}
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
        />
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ccff00" />
            <stop offset="100%" stopColor="#00f3ff" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex items-center justify-center font-mono text-[11px] font-black text-white">
        {value}
      </div>
    </div>
  );
}

function MatchStars({ count }: { count: number }) {
  const filled = Math.max(1, Math.min(5, count));
  return (
    <div className="flex items-center gap-0.5" aria-label={`匹配 ${filled} 星`}>
      {Array.from({ length: 5 }, (_, i) => {
        const on = i < filled;
        return (
          <Star
            key={i}
            className={`h-4 w-4 ${on ? "fill-[#ccff00] text-[#ccff00]" : "fill-transparent text-white/25"}`}
            strokeWidth={on ? 0 : 1.5}
            style={on ? { filter: "drop-shadow(0 0 6px rgba(204,255,0,0.65))" } : undefined}
          />
        );
      })}
    </div>
  );
}

function RecCard({
  rec,
  index,
  thumbs,
}: {
  rec: SimilarLessonRec;
  index: number;
  thumbs: string[];
}) {
  const thumbPath =
    pickDemoThumb(`similar-${rec.item.result.id}`, thumbs, rec.item.previewThumbnail) ??
    rec.item.previewThumbnail;
  const thumb = thumbPath ? resolveMediaUrl(thumbPath) : null;
  const accent = index % 2 === 0 ? "#ccff00" : "#00f3ff";

  return (
    <Link
      href={`/community/result/${rec.item.result.id}`}
      className="group relative overflow-hidden border border-white/10 bg-[#080808] transition hover:border-white/30"
      style={{
        boxShadow: `0 0 0 1px rgba(255,255,255,0.03), 0 24px 60px rgba(0,0,0,0.45)`,
      }}
    >
      <div
        className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full opacity-40 blur-2xl transition group-hover:opacity-70"
        style={{ background: accent }}
      />

      <div className="relative aspect-[3/4] overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center transition duration-700 group-hover:scale-105"
          style={
            thumb
              ? { backgroundImage: `url("${thumb}")` }
              : { background: "linear-gradient(160deg,#1a1020,#050505)" }
          }
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/35 to-transparent" />
        <div className="absolute left-3 top-3 inline-flex items-center gap-1.5 border border-white/15 bg-black/55 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-white/80 backdrop-blur-sm">
          <Sparkles className="h-3 w-3 text-[#ccff00]" />
          Match
        </div>
        <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between gap-2">
          <div className="min-w-0">
            <MatchStars count={rec.stars} />
            <div className="mt-2 line-clamp-2 text-[13px] font-semibold text-white">
              {rec.item.lessonTitle}
            </div>
            <div className="mt-1 flex items-center gap-2 text-[11px] text-white/50">
              <span>@{rec.item.user.displayName}</span>
              <span className="inline-flex items-center gap-0.5">
                <Heart className="h-3 w-3 fill-[#ff0055] text-[#ff0055]" />
                {rec.item.result.likeCount}
              </span>
            </div>
          </div>
          <SimilarityRing value={rec.similarity} />
        </div>
      </div>

      <div className="relative space-y-3 border-t border-white/8 px-3 py-3">
        <p className="text-[12px] leading-5 text-white/55">{rec.hook}</p>
        <div className="flex flex-wrap gap-1.5">
          {rec.tags.map((tag) => (
            <span
              key={`${rec.item.result.id}-${tag.label}`}
              className={`inline-flex items-center gap-1 border px-2 py-0.5 text-[10px] font-semibold tracking-wide ${TAG_STYLE[tag.kind]}`}
            >
              {tag.kind === "friends" || tag.kind === "crew" ? (
                <Users className="h-2.5 w-2.5" />
              ) : null}
              {tag.kind === "hot" ? <Flame className="h-2.5 w-2.5" /> : null}
              {tag.kind === "tempo" ? <Waves className="h-2.5 w-2.5" /> : null}
              {tag.kind === "sync" ? <Zap className="h-2.5 w-2.5" /> : null}
              {tag.label}
            </span>
          ))}
        </div>
      </div>
    </Link>
  );
}

export function SimilarRecommendPanel({ lessonId }: { lessonId: string }) {
  const { thumbs } = useDemoCoverPool();
  const recs = React.useMemo(() => getSimilarLessonRecommendations(lessonId, 8), [lessonId]);

  return (
    <div className="relative">
      <div className="pointer-events-none absolute -left-10 top-0 h-40 w-40 rounded-full bg-[#ff0055]/15 blur-3xl" />
      <div className="pointer-events-none absolute -right-6 top-20 h-36 w-36 rounded-full bg-[#00f3ff]/12 blur-3xl" />

      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.28em] text-[#ff0055]">
            <Sparkles className="h-3.5 w-3.5" />
            Similar Mix
          </div>
          <h2
            className="mt-2 text-[36px] font-black tracking-tight text-white md:text-[48px]"
            style={{
              fontFamily: "'Black Han Sans', 'Noto Sans SC', sans-serif",
              transform: "skewX(-4deg)",
            }}
          >
            相似推荐
          </h2>
          <p className="mt-2 max-w-xl text-[13px] leading-6 text-white/45">
            按动作路径、舞种与好友练习圈挑出的延伸曲目。
          </p>
        </div>
        <div className="border border-[#ccff00]/30 bg-[#ccff00]/8 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#ccff00]">
          {recs.length} matches
        </div>
      </div>

      {recs.length === 0 ? (
        <div className="border border-dashed border-white/15 px-4 py-16 text-center text-[13px] text-white/40">
          暂时没有相似推荐
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {recs.map((rec, index) => (
            <RecCard key={rec.item.result.id} rec={rec} index={index} thumbs={thumbs} />
          ))}
        </div>
      )}
    </div>
  );
}
