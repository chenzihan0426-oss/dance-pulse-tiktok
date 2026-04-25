"use client";

import * as React from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import type { Lesson, RegeneratePayload, Segment } from "@/lib/types";
import {
  getLesson,
  regenerateLesson,
} from "@/lib/api";
import { useSegmentEditor } from "@/hooks/useSegmentEditor";
import { Timeline } from "@/components/Timeline";
import { SegmentList } from "@/components/SegmentList";
import { SegmentEditor } from "@/components/SegmentEditor";
import { RegenerateDialog } from "@/components/RegenerateDialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet } from "@/components/ui/sheet";
import { ArrowLeft, History, Loader2, RefreshCw, Undo2 } from "lucide-react";

const MIN_VIDEO_ZOOM = 1;
const MAX_VIDEO_ZOOM = 2.5;
const VIDEO_ZOOM_STEP = 0.25;
const VIDEO_TIME_SYNC_MIN_DELTA = 0.08;
const VIDEO_TIME_SYNC_MIN_INTERVAL_MS = 90;

function clampVideoZoom(value: number): number {
  return Math.min(
    MAX_VIDEO_ZOOM,
    Math.max(MIN_VIDEO_ZOOM, Number(value.toFixed(2)))
  );
}

export default function ConfirmPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const lessonId = params?.id ?? "antifragile_dp";
  const refreshToken = searchParams?.get("job") ?? "";

  const [initialLesson, setInitialLesson] = React.useState<Lesson | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [regenOpen, setRegenOpen] = React.useState(false);
  const [regenLoading, setRegenLoading] = React.useState(false);
  const [mobileEditorOpen, setMobileEditorOpen] = React.useState(false);

  // Load lesson once.
  React.useEffect(() => {
    let cancelled = false;
    setInitialLesson(null);
    setLoadError(null);
    (async () => {
      try {
        const l = await getLesson(lessonId);
        if (!cancelled) setInitialLesson(l);
      } catch (e) {
        if (!cancelled)
          setLoadError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [lessonId, refreshToken]);

  if (loadError) {
    return (
      <div className="mx-auto max-w-xl p-8 text-center">
        <h1 className="mb-2 text-lg font-semibold">加载失败</h1>
        <p className="text-sm text-neutral-600">{loadError}</p>
        <Button className="mt-4" onClick={() => location.reload()}>
          重试
        </Button>
      </div>
    );
  }

  if (!initialLesson) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex items-center gap-3 text-sm text-neutral-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          加载课程…
        </div>
      </div>
    );
  }

  return (
    <ConfirmPageInner
      key={`${initialLesson.id}:${refreshToken}`}
      lesson={initialLesson}
      regenOpen={regenOpen}
      setRegenOpen={setRegenOpen}
      regenLoading={regenLoading}
      setRegenLoading={setRegenLoading}
      setInitialLesson={setInitialLesson}
      mobileEditorOpen={mobileEditorOpen}
      setMobileEditorOpen={setMobileEditorOpen}
      onExit={() => router.push(`/lesson/${initialLesson.id}`)}
      onCommitted={(l) => router.push(`/lesson/${l.id}`)}
    />
  );
}

function ConfirmPageInner({
  lesson,
  regenOpen,
  setRegenOpen,
  regenLoading,
  setRegenLoading,
  setInitialLesson,
  mobileEditorOpen,
  setMobileEditorOpen,
  onExit,
  onCommitted,
}: {
  lesson: Lesson;
  regenOpen: boolean;
  setRegenOpen: (v: boolean) => void;
  regenLoading: boolean;
  setRegenLoading: (v: boolean) => void;
  setInitialLesson: (l: Lesson) => void;
  mobileEditorOpen: boolean;
  setMobileEditorOpen: (v: boolean) => void;
  onExit: () => void;
  onCommitted: (l: Lesson) => void;
}) {
  const editor = useSegmentEditor({
    lesson,
    onCommitted,
  });

  // ---- video preview wiring ----
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const [currentTime, setCurrentTime] = React.useState(0);
  const [previewSeg, setPreviewSeg] = React.useState<Segment | null>(null);
  const [videoZoom, setVideoZoom] = React.useState(1);
  const deferredCurrentTime = React.useDeferredValue(currentTime);
  const [, startTransition] = React.useTransition();
  const lastTimelineSyncRef = React.useRef({ at: 0, value: 0 });

  const syncCurrentTime = React.useCallback(
    (nextTime: number, force = false) => {
      const now =
        typeof performance !== "undefined" ? performance.now() : Date.now();
      const lastSync = lastTimelineSyncRef.current;
      const shouldSync =
        force ||
        Math.abs(nextTime - lastSync.value) >= VIDEO_TIME_SYNC_MIN_DELTA ||
        now - lastSync.at >= VIDEO_TIME_SYNC_MIN_INTERVAL_MS;

      if (!shouldSync) return;

      lastTimelineSyncRef.current = {
        at: now,
        value: nextTime,
      };
      startTransition(() => {
        setCurrentTime(nextTime);
      });
    },
    [startTransition]
  );

  // Sync currentTime from the video element.
  React.useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onTime = () => syncCurrentTime(v.currentTime);
    const onSeeking = () => syncCurrentTime(v.currentTime, true);
    const onLoadedMetadata = () => syncCurrentTime(v.currentTime, true);
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("seeking", onSeeking);
    v.addEventListener("seeked", onSeeking);
    v.addEventListener("loadedmetadata", onLoadedMetadata);
    return () => {
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("seeking", onSeeking);
      v.removeEventListener("seeked", onSeeking);
      v.removeEventListener("loadedmetadata", onLoadedMetadata);
    };
  }, [syncCurrentTime]);

  // While previewing a segment, loop back to its start when passing its end.
  React.useEffect(() => {
    if (!previewSeg) return;
    const v = videoRef.current;
    if (!v) return;
    const onTime = () => {
      if (v.currentTime >= previewSeg.end - 0.05) {
        v.currentTime = previewSeg.start;
        syncCurrentTime(previewSeg.start, true);
        void v.play();
      }
      if (v.currentTime < previewSeg.start - 0.05) {
        v.currentTime = previewSeg.start;
        syncCurrentTime(previewSeg.start, true);
      }
    };
    v.addEventListener("timeupdate", onTime);
    return () => v.removeEventListener("timeupdate", onTime);
  }, [previewSeg, syncCurrentTime]);

  const seek = (t: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = t;
    syncCurrentTime(t, true);
    setPreviewSeg(null); // seeking manually cancels preview loop
  };

  const startPreview = (seg: Segment) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = seg.start;
    syncCurrentTime(seg.start, true);
    v.play().catch(() => {});
    setPreviewSeg(seg);
  };

  // ---- regenerate ----
  const submitRegenerate = async (payload: RegeneratePayload) => {
    setRegenLoading(true);
    try {
      const next = await regenerateLesson(lesson.id, payload);
      setInitialLesson(next); // forces full hook reset via key/remount path
      setRegenOpen(false);
    } finally {
      setRegenLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
      {/* top bar */}
      <header className="sticky top-0 z-20 border-b border-neutral-200 bg-white/90 backdrop-blur dark:border-neutral-800 dark:bg-neutral-900/90">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-3 min-w-0">
            <Button variant="ghost" size="icon" onClick={onExit} aria-label="返回">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold">
                {lesson.title}
              </h1>
              <div className="flex items-center gap-2 text-xs text-neutral-500">
                <span>BPM {lesson.bpm}</span>
                <span>·</span>
                <span>{lesson.sections.length} 段</span>
                {!lesson.confirmed && (
                  <>
                    <span>·</span>
                    <Badge variant="warn">未确认</Badge>
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {editor.isDirty && (
              <Badge variant="brand" className="hidden sm:inline-flex">
                <History className="mr-1 h-3 w-3" />
                已修改 {editor.pendingOps.length} 处
              </Badge>
            )}
            <Button
              variant="ghost"
              size="sm"
              disabled={!editor.isDirty || editor.commitState === "committing"}
              onClick={editor.undo}
              title="撤销最近一步"
            >
              <Undo2 className="h-4 w-4" />
              撤销
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={!editor.isDirty || editor.commitState === "committing"}
              onClick={editor.reset}
            >
              放弃修改
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-[1400px] gap-4 px-4 py-4 lg:grid-cols-[1fr_400px]">
        {/* left column: video + timeline + list */}
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3 px-1 text-xs text-neutral-500">
            <span>视频预览</span>
            <div className="flex flex-wrap items-center gap-2">
              <span>视频缩放</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-3"
                onClick={() =>
                  setVideoZoom((value) => clampVideoZoom(value - VIDEO_ZOOM_STEP))
                }
                disabled={videoZoom <= MIN_VIDEO_ZOOM}
              >
                -
              </Button>
              <span className="min-w-[52px] text-center font-mono tabular-nums text-neutral-700 dark:text-neutral-200">
                {videoZoom.toFixed(2)}x
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-3"
                onClick={() =>
                  setVideoZoom((value) => clampVideoZoom(value + VIDEO_ZOOM_STEP))
                }
                disabled={videoZoom >= MAX_VIDEO_ZOOM}
              >
                +
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-3"
                onClick={() => setVideoZoom(1)}
                disabled={videoZoom === 1}
              >
                重置
              </Button>
            </div>
          </div>

          <div className="overflow-hidden rounded-lg border border-neutral-200 bg-black dark:border-neutral-800">
            <div className="aspect-video overflow-hidden bg-black">
              <video
                ref={videoRef}
                src={lesson.video_url}
                controls
                playsInline
                className="h-full w-full object-contain bg-black transition-transform duration-200 ease-out"
                style={{
                  transform: `scale(${videoZoom})`,
                  transformOrigin: "center center",
                }}
              />
            </div>
          </div>

          <Timeline
            lesson={lesson}
            segments={editor.workingSegments}
            selectedSegId={editor.selectedSegId}
            currentTime={deferredCurrentTime}
            onSelect={(id) => {
              editor.selectSegment(id);
              if (id && typeof window !== "undefined" && window.innerWidth < 1024) {
                setMobileEditorOpen(true);
              }
            }}
            onUpdateBounds={editor.updateBounds}
            onSeek={seek}
            onCreate={editor.createSegment}
          />

          <div className="hidden lg:block">
            <SegmentList
              segments={editor.workingSegments}
              selectedId={editor.selectedSegId}
              onSelect={editor.selectSegment}
            />
          </div>
        </div>

        {/* right column: editor — desktop only. Mobile uses a Sheet below. */}
        <aside className="hidden lg:block">
          <div className="sticky top-[80px]">
            <SegmentEditor
              segment={editor.selectedSegment}
              lesson={lesson}
              workingSegments={editor.workingSegments}
              playheadTime={deferredCurrentTime}
              onUpdateBounds={editor.updateBounds}
              onMergePrev={editor.mergePrev}
              onMergeNext={editor.mergeNext}
              onSplitAt={editor.splitAt}
              onDelete={editor.deleteSegment}
              onPreview={startPreview}
            />
          </div>
        </aside>

        {/* mobile: list below timeline */}
        <div className="lg:hidden">
          <SegmentList
            segments={editor.workingSegments}
            selectedId={editor.selectedSegId}
            onSelect={(id) => {
              editor.selectSegment(id);
              setMobileEditorOpen(true);
            }}
          />
        </div>
      </main>

      {/* bottom action bar */}
      <footer className="sticky bottom-0 z-20 border-t border-neutral-200 bg-white/95 backdrop-blur dark:border-neutral-800 dark:bg-neutral-900/95">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-3 px-4 py-3">
          <Button
            variant="outline"
            onClick={() => setRegenOpen(true)}
            disabled={editor.commitState === "committing"}
          >
            <RefreshCw className="h-4 w-4" />
            重新切分
          </Button>

          <div className="flex items-center gap-3">
            {editor.commitState === "error" && (
              <span className="text-xs text-red-600">
                提交失败：{editor.commitError}
              </span>
            )}
            {editor.isDirty && (
              <span className="text-xs text-neutral-500 sm:hidden">
                已修改 {editor.pendingOps.length} 处
              </span>
            )}
            <Button
              variant="primary"
              size="lg"
              onClick={editor.commit}
              disabled={editor.commitState === "committing"}
            >
              {editor.commitState === "committing" ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {editor.isDirty ? "保存并确认中…" : "确认中…"}
                </>
              ) : editor.isDirty ? (
                `保存并确认 (${editor.pendingOps.length})`
              ) : (
                "全部通过 · 确认完成"
              )}
            </Button>
          </div>
        </div>
      </footer>

      {/* mobile editor drawer */}
      <Sheet
        open={mobileEditorOpen}
        onOpenChange={setMobileEditorOpen}
        side="bottom"
        title={
          editor.selectedSegment
            ? `编辑 ${editor.selectedSegment.id}`
            : "切片编辑"
        }
      >
        <SegmentEditor
              segment={editor.selectedSegment}
              lesson={lesson}
              workingSegments={editor.workingSegments}
              playheadTime={deferredCurrentTime}
          onUpdateBounds={editor.updateBounds}
          onMergePrev={editor.mergePrev}
          onMergeNext={editor.mergeNext}
          onSplitAt={editor.splitAt}
          onDelete={editor.deleteSegment}
          onPreview={startPreview}
        />
      </Sheet>

      <RegenerateDialog
        open={regenOpen}
        onOpenChange={setRegenOpen}
        onSubmit={submitRegenerate}
        submitting={regenLoading}
      />
    </div>
  );
}
