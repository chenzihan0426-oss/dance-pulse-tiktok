"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Heart, Sparkles } from "lucide-react";
import { resolveMediaUrl, getLesson } from "@/lib/api";
import { loadDemoMedia, rotateFeedThumbs } from "@/lib/demoMedia";
import {
  getForYouRecommendations,
  type ForYouRecommendation,
} from "@/lib/communityShowcase";
import type { Lesson } from "@/lib/types";

export default function ForYouPage() {
  const params = useParams<{ id: string }>();
  const lessonId = params?.id ?? "";
  const [lesson, setLesson] = React.useState<Lesson | null>(null);
  const [recs, setRecs] = React.useState<ForYouRecommendation[]>([]);

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      const demo = await loadDemoMedia();
      const next = getForYouRecommendations(lessonId, 12).map((rec) => {
        const [rotated] = rotateFeedThumbs([rec.item], demo.thumbs);
        return { ...rec, item: rotated ?? rec.item };
      });
      if (!cancelled) setRecs(next);
    })();
    void getLesson(lessonId)
      .then((detail) => {
        if (!cancelled) setLesson(detail);
      })
      .catch(() => {
        if (!cancelled) setLesson(null);
      });
    return () => {
      cancelled = true;
    };
  }, [lessonId]);

  const title = lesson?.title?.split(" - ")[0] ?? "刚练完的曲子";

  return (
    <main className="relative mx-auto min-h-screen max-w-[1200px] px-5 pb-20 pt-8 text-white md:px-8">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(ellipse_at_top,rgba(255,0,85,0.14),transparent_55%)]" />

      <div className="relative flex flex-wrap items-center justify-between gap-3">
        <Link
          href={`/lesson/${lessonId}`}
          className="inline-flex items-center gap-1.5 text-[13px] text-white/60 transition hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          返回课程
        </Link>
        <div className="flex gap-2">
          <Link
            href={`/lesson/${lessonId}/tracking-desktop`}
            className="border border-white/15 px-3 py-1.5 text-[12px] text-white/70 transition hover:border-white/35 hover:text-white"
          >
            再练一次
          </Link>
          <Link
            href="/community?tab=hot"
            className="bg-[#ccff00] px-3 py-1.5 text-[12px] font-bold text-black transition hover:bg-white"
            style={{ transform: "skewX(-6deg)" }}
          >
            <span style={{ transform: "skewX(6deg)", display: "inline-block" }}>去社区</span>
          </Link>
        </div>
      </div>

      <div className="relative mt-8">
        <div className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.24em] text-[#ff0055]">
          <Sparkles className="h-3.5 w-3.5" />
          For You
        </div>
        <h1
          className="mt-3 text-[36px] font-black tracking-tight md:text-[48px]"
          style={{ fontFamily: "'Black Han Sans', 'Noto Sans SC', sans-serif", transform: "skewX(-4deg)" }}
        >
          猜你喜欢
        </h1>
        <p className="mt-3 max-w-2xl text-[14px] leading-6 text-white/50">
          刚练完「{title}」，这些也适合你。
        </p>
      </div>

      <div className="relative mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {recs.map((rec) => {
          const thumb = rec.item.previewThumbnail
            ? resolveMediaUrl(rec.item.previewThumbnail)
            : null;
          return (
            <Link
              key={rec.item.result.id}
              href={`/community/result/${rec.item.result.id}`}
              className="group relative overflow-hidden border border-white/10 bg-black/40 transition hover:border-white/30"
            >
              <div className="relative aspect-[3/4] overflow-hidden">
                <div
                  className="absolute inset-0 bg-cover bg-center transition duration-500 group-hover:scale-105"
                  style={
                    thumb
                      ? { backgroundImage: `url("${thumb}")` }
                      : { background: "linear-gradient(160deg,#1a1020,#050505)" }
                  }
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/25 to-transparent" />
                <div className="absolute bottom-0 inset-x-0 p-3">
                  <div className="font-mono text-[28px] font-black leading-none text-[#ccff00]">
                    {rec.item.result.score}
                  </div>
                  <div className="mt-2 line-clamp-2 text-[14px] font-semibold text-white">
                    {rec.item.lessonTitle}
                  </div>
                  <div className="mt-1 flex items-center justify-between text-[12px] text-white/55">
                    <span>@{rec.item.user.displayName}</span>
                    <span className="inline-flex items-center gap-1">
                      <Heart className="h-3 w-3 fill-[#ff0055] text-[#ff0055]" />
                      {rec.item.result.likeCount}
                    </span>
                  </div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      {recs.length === 0 ? (
        <div className="relative mt-10 border border-dashed border-white/15 px-4 py-12 text-center text-[13px] text-white/40">
          暂时没有推荐，先去社区逛逛吧。
        </div>
      ) : null}
    </main>
  );
}
