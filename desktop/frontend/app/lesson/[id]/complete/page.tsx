"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Music, X } from "lucide-react";
import { CompleteCTAs } from "@/components/complete/CompleteCTAs";
import { CompleteHero } from "@/components/complete/CompleteHero";
import { StatsRow } from "@/components/complete/StatsRow";
import { BadgeUnlockCard } from "@/components/complete/BadgeUnlockCard";
import { getLesson } from "@/lib/api";
import { getUnlockedBadges } from "@/lib/storage";
import { getBadgeDefinition } from "@/lib/badges";
import type { Lesson } from "@/lib/types";
import type { BadgeId } from "@/lib/m5-types";
import { useLearningStreak } from "@/hooks/useLearningStreak";

const TITLE_LOOKS_TIMESTAMP = /^\d{4}-\d{2}-\d{2}(?: \d{2}:\d{2})?$/;

export default function LessonCompletePage() {
  const params = useParams<{ id: string }>();
  const lessonId = params?.id ?? "";
  const [lesson, setLesson] = React.useState<Lesson | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const { currentStreak } = useLearningStreak();

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);

    void getLesson(lessonId)
      .then((detail) => {
        if (!cancelled) {
          setLesson(detail);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [lessonId]);

  const learnableSegments = React.useMemo(
    () => lesson?.segments.filter((segment) => !segment.deleted && !segment.is_still) ?? [],
    [lesson]
  );
  const firstSegment = learnableSegments[0] ?? null;

  const unlockedBadgeIds = React.useMemo(() => getUnlockedBadges(), []);
  const latestBadgeId = (unlockedBadgeIds.at(-1) ?? null) as BadgeId | null;
  const latestBadge = latestBadgeId ? getBadgeDefinition(latestBadgeId) : null;
  const badgeTitle = latestBadge?.title ?? "完课达人";

  if (loading) {
    return (
      <main className="min-h-[100dvh] bg-bg-root px-6 py-10 text-white animate-[fadeIn_0.3s_ease-out]">
        <div className="mx-auto h-64 max-w-[960px] animate-pulse rounded-[32px] bg-bg-raised" />
      </main>
    );
  }

  if (error || !lesson || !firstSegment) {
    return (
      <main className="min-h-[100dvh] bg-bg-root px-6 py-10 text-white animate-[fadeIn_0.3s_ease-out]">
        <div className="mx-auto max-w-[960px] rounded-[24px] border border-state-danger/20 bg-state-danger/10 px-5 py-5 text-sm text-red-200">
          {error ?? "完课页加载失败"}
        </div>
      </main>
    );
  }

  const trackTitle = TITLE_LOOKS_TIMESTAMP.test(lesson.title) ? "完整舞蹈练习" : lesson.title;
  const trackMeta = `DancePulse · ${Math.round(lesson.bpm)} BPM`;

  return (
    <main className="relative min-h-[100dvh] overflow-hidden bg-bg-root text-white animate-[fadeIn_0.3s_ease-out] flex flex-col">
      <div className="pointer-events-none absolute left-1/2 top-[-180px] h-[420px] w-[420px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(168,85,247,0.16)_0%,rgba(168,85,247,0.08)_35%,transparent_72%)] blur-[20px]" />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.02]"
        style={{
          backgroundImage: "radial-gradient(circle, rgba(255,255,255,1) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      />

      <div className="relative mx-auto flex w-full max-w-[960px] justify-end px-6 pt-6">
        <Link
          href={`/lesson/${lesson.id}`}
          className="inline-flex items-center gap-1.5 text-[13px] text-white/40 transition hover:text-white/68"
        >
          <X className="h-3.5 w-3.5" />
          关闭
        </Link>
      </div>

      <div className="relative flex-1 flex flex-col items-center justify-center px-6 py-8 gap-8">
        <CompleteHero />

        <div className="w-full max-w-[320px] rounded-[22px] border border-white/[0.08] bg-white/[0.04] px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-[14px] bg-[linear-gradient(135deg,#a855f7_0%,#d946ef_60%,#ec4899_100%)] text-white">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.26),transparent_55%)]" />
              <Music className="relative z-10 h-5 w-5" />
            </div>
            <div className="min-w-0 text-left">
              <div className="truncate text-[14px] font-medium text-white">{trackTitle}</div>
              <div className="mt-1 text-[11px] text-white/50">{trackMeta}</div>
            </div>
          </div>
        </div>

        <StatsRow
          items={[
            { value: `${learnableSegments.length}`, unit: "张", label: "动作已学会" },
            { value: "28", unit: "分", label: "本次用时" },
            { value: `${currentStreak}`, unit: "天", label: "连续学习" },
          ]}
        />

        <BadgeUnlockCard title={badgeTitle} />
      </div>

      <div className="relative px-6 pb-8 pt-4 space-y-3">
        <div className="mx-auto max-w-[960px]">
          <CompleteCTAs
            fullPlayHref={`/player/${firstSegment.id}?lesson=${lesson.id}&mode=fullplay`}
            trackingHref={`/lesson/${lesson.id}/tracking`}
            restartHref={`/player/${firstSegment.id}?lesson=${lesson.id}`}
            lessonHref={`/lesson/${lesson.id}`}
          />
        </div>
      </div>
    </main>
  );
}
