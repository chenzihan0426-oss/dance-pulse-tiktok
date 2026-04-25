"use client";

import * as React from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { DesktopPlayer } from "@/components/player/DesktopPlayer";
import { getSegmentContext } from "@/lib/api";
import { setLastViewedSegmentId, setUserLessonState } from "@/lib/storage";
import type { Lesson } from "@/lib/types";

export default function PlayerPage() {
  const params = useParams<{ segId: string }>();
  const searchParams = useSearchParams();
  const initialSegId = params?.segId ?? "";
  const lessonHint = searchParams?.get("lesson");

  const [lesson, setLesson] = React.useState<Lesson | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  // 只在首次 mount 时抓 lesson。后续切段通过 DesktopPlayer 内部 state + replaceState,
  // 组件不 unmount, 全屏状态保留。
  React.useEffect(() => {
    let cancelled = false;
    getSegmentContext(initialSegId, lessonHint)
      .then((data) => { if (!cancelled) { setLesson(data.lesson); setError(null); } })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : String(err)); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black px-5 text-white">
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-5 py-5 text-sm text-red-200">
          播放器加载失败: {error}
        </div>
      </main>
    );
  }
  if (!lesson) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black text-white/50">
        <div className="inline-flex items-center gap-2 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          加载中...
        </div>
      </main>
    );
  }

  const practiceSegments = lesson.segments.filter((s) => !s.deleted && !s.is_still);

  return (
    <DesktopPlayer
      lesson={lesson}
      initialSegmentId={initialSegId}
      practiceSegments={practiceSegments}
      onSegmentChange={(id) => {
        setLastViewedSegmentId(lesson.id, id);
        setUserLessonState(lesson.id, { lastStudiedAt: new Date().toISOString() });
      }}
    />
  );
}
