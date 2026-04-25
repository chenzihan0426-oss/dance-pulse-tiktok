"use client";

import React from "react";
import { animate, motion, useMotionValue, useTransform } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Sparkles, X } from "lucide-react";
import type { Lesson, Segment } from "@/lib/types";
import { BeatCounterBadge } from "@/components/player/BeatCounterBadge";
import { BeatCueOverlay } from "@/components/player/BeatCueOverlay";
import { PlayerSideControls } from "@/components/player/PlayerSideControls";
import { SegmentStripFooter } from "@/components/player/SegmentStripFooter";
import { SectionProgressBar } from "@/components/player/SectionProgressBar";
import { XuangeGuideOverlay } from "@/components/player/XuangeGuideOverlay";

const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5] as const;
const PLAYER_PREFS_KEY = "dp_player_prefs";
const GUIDE_MODE_CYCLE = ["beat", "all", "cue", "off"] as const;

type GuideMode = (typeof GUIDE_MODE_CYCLE)[number];

function nextSpeed(current: number) {
  const index = SPEED_OPTIONS.indexOf(current as (typeof SPEED_OPTIONS)[number]);
  return SPEED_OPTIONS[(index + 1) % SPEED_OPTIONS.length] ?? 1;
}

function nextGuideMode(current: GuideMode): GuideMode {
  const index = GUIDE_MODE_CYCLE.indexOf(current);
  return GUIDE_MODE_CYCLE[(index + 1) % GUIDE_MODE_CYCLE.length] ?? "all";
}

export function VerticalPlayer({
  lesson,
  segment,
  practiceSegments,
  learnedIds,
  mode = "study",
  onNavigate,
  onMarkLearned,
  onOpenTeaching,
}: {
  lesson: Lesson;
  segment: Segment;
  practiceSegments: Segment[];
  learnedIds: Set<string>;
  mode?: "study" | "fullplay";
  onNavigate: (segmentId: string) => void;
  onMarkLearned: (segmentId: string) => void;
  onOpenTeaching: () => void;
}) {
  const router = useRouter();
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const stageRef = React.useRef<HTMLDivElement>(null);
  const dragX = useMotionValue(0);
  const dragY = useMotionValue(0);
  const [speed, setSpeed] = React.useState(1);
  const [mirror, setMirror] = React.useState(false);
  const loop = true; // 学习页强制循环,不给开关
  const [guideMode, setGuideMode] = React.useState<GuideMode>("all");
  const [prefsReady, setPrefsReady] = React.useState(false);
  const [playing, setPlaying] = React.useState(true);
  const [videoReady, setVideoReady] = React.useState(false);
  const [videoWaiting, setVideoWaiting] = React.useState(false);
  const [currentBeat, setCurrentBeat] = React.useState(1);
  const [currentTime, setCurrentTime] = React.useState(0);
  const [frameHeight, setFrameHeight] = React.useState(0);
  const fullPlay = mode === "fullplay";

  const prevY = useTransform(dragY, (value) => value - frameHeight);
  const nextY = useTransform(dragY, (value) => value + frameHeight);

  const practiceIndex = React.useMemo(
    () => practiceSegments.findIndex((item) => item.id === segment.id),
    [practiceSegments, segment.id]
  );
  const learnedCount = React.useMemo(
    () => practiceSegments.filter((item) => learnedIds.has(item.id)).length,
    [learnedIds, practiceSegments]
  );
  const prevSegment = practiceIndex > 0 ? practiceSegments[practiceIndex - 1] : null;
  const nextSegment =
    practiceIndex >= 0 && practiceIndex < practiceSegments.length - 1
      ? practiceSegments[practiceIndex + 1]
      : null;
  const currentSummary =
    segment.teaching?.summary?.trim() ||
    segment.ai_description?.trim() ||
    `${segment.section_label} 当前动作`;
  const effectiveBeatCues = React.useMemo(() => buildEffectiveBeatCues(segment), [segment]);
  const showBeatBadge = guideMode === "beat" || guideMode === "all";
  const showCueOverlay = guideMode === "cue" || guideMode === "all";

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(PLAYER_PREFS_KEY);
      if (!raw) {
        setPrefsReady(true);
        return;
      }
      const parsed = JSON.parse(raw) as {
        speed?: number;
        mirror?: boolean;
        loop?: boolean;
      };
      if (parsed.speed && SPEED_OPTIONS.includes(parsed.speed as (typeof SPEED_OPTIONS)[number])) {
        setSpeed(parsed.speed);
      }
      if (typeof parsed.mirror === "boolean") setMirror(parsed.mirror);
      // loop 写死 true,不再从 localStorage 读
    } catch {
      // ignore broken local storage
    } finally {
      setPrefsReady(true);
    }
  }, []);

  React.useEffect(() => {
    if (!prefsReady || typeof window === "undefined") return;
    window.localStorage.setItem(PLAYER_PREFS_KEY, JSON.stringify({ speed, mirror }));
  }, [mirror, prefsReady, speed]);

  React.useEffect(() => {
    if (!prefsReady) return;
    const video = videoRef.current;
    if (!video) return;

    setVideoReady(false);
    setVideoWaiting(false);
    setCurrentTime(0);
    video.currentTime = 0;
    video.playbackRate = speed;
    video.loop = loop;
    video.play().then(
      () => setPlaying(true),
      () => setPlaying(false)
    );
  }, [loop, prefsReady, segment.id, speed, fullPlay]);

  React.useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onLoadedData = () => {
      setVideoReady(true);
      setVideoWaiting(false);
    };
    const onCanPlay = () => {
      setVideoReady(true);
      setVideoWaiting(false);
    };
    const onTimeUpdate = () => setCurrentTime(video.currentTime);
    const onWaiting = () => {
      if (video.readyState < 3) setVideoWaiting(true);
    };
    const onSeeking = () => setVideoWaiting(true);
    const onPlaying = () => {
      setPlaying(true);
      setVideoReady(true);
      setVideoWaiting(false);
    };

    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("loadeddata", onLoadedData);
    video.addEventListener("canplay", onCanPlay);
    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("waiting", onWaiting);
    video.addEventListener("seeking", onSeeking);
    video.addEventListener("playing", onPlaying);

    return () => {
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("loadeddata", onLoadedData);
      video.removeEventListener("canplay", onCanPlay);
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("waiting", onWaiting);
      video.removeEventListener("seeking", onSeeking);
      video.removeEventListener("playing", onPlaying);
    };
  }, []);

  React.useEffect(() => {
    let frame = 0;
    const beatDuration =
      lesson.bpm > 0 ? 60 / lesson.bpm : segment.duration / Math.max(segment.beat_count, 1);

    const tick = () => {
      const video = videoRef.current;
      if (video && !video.paused && beatDuration > 0) {
        const beatCount = fullPlay ? 8 : Math.max(segment.beat_count, 1);
        const beat = (Math.floor(video.currentTime / beatDuration) % beatCount) + 1;
        setCurrentBeat((prev) => (prev === beat ? prev : beat));
      }
      frame = window.requestAnimationFrame(tick);
    };

    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [fullPlay, lesson.bpm, segment.beat_count, segment.duration, segment.id]);

  React.useEffect(() => {
    const node = stageRef.current;
    if (!node) return;

    const update = () => setFrameHeight(node.clientHeight);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  React.useEffect(() => {
    dragX.set(0);
    dragY.set(0);
  }, [dragX, dragY, segment.id, fullPlay]);

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.key.toLowerCase() !== "b") return;
      setGuideMode((value) => nextGuideMode(value));
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleNavigate = React.useCallback(
    (target: Segment | null) => {
      if (!target) return;
      onNavigate(target.id);
    },
    [onNavigate]
  );

  const handleSelectSegment = React.useCallback(
    (segmentId: string) => {
      if (segmentId === segment.id) return;
      onNavigate(segmentId);
    },
    [onNavigate, segment.id]
  );

  const handleMarkLearned = React.useCallback(() => {
    onMarkLearned(segment.id);

    if (nextSegment) {
      onNavigate(nextSegment.id);
      return;
    }

    window.setTimeout(() => {
      router.push(`/lesson/${lesson.id}/complete`);
    }, 300);
  }, [lesson.id, nextSegment, onMarkLearned, onNavigate, router, segment.id]);

  const handleFullPlayEnded = React.useCallback(() => {
    router.push(`/lesson/${lesson.id}/complete`);
  }, [lesson.id, router]);

  const handleTogglePlay = React.useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().catch(() => null);
      return;
    }
    video.pause();
  }, []);

  const resetDragPosition = React.useCallback(() => {
    animate(dragX, 0, { type: "spring", stiffness: 420, damping: 34 });
    animate(dragY, 0, { type: "spring", stiffness: 420, damping: 34 });
  }, [dragX, dragY]);

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#0b0a14] text-white">
      <div className="relative mx-auto h-full w-full max-w-[430px] overflow-hidden bg-[#0b0a14] md:border-x md:border-white/6">
        <div className="pointer-events-none absolute inset-x-0 top-0 z-[1] h-32 bg-gradient-to-b from-black/68 via-black/26 to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[1] h-40 bg-gradient-to-t from-black/74 via-black/24 to-transparent" />

        <div className="absolute inset-x-0 top-0 z-20 px-5 pt-10">
          <div className="flex items-start justify-between">
            <Link
              href={`/lesson/${lesson.id}`}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-black/20 text-white/92"
              aria-label="返回课程页"
            >
              <ArrowLeft className="h-6 w-6" />
            </Link>

            <div className="text-center">
              <div className="text-[18px] font-semibold tracking-tight text-white">{lesson.title}</div>
              <div className="mt-1 text-[15px] text-white/48">
                {fullPlay ? "完整播放" : `${segment.section_label} · 第 ${practiceIndex + 1} / ${practiceSegments.length} 张`}
              </div>
              {!fullPlay ? (
                <div className="mt-2 inline-flex rounded-full bg-white/10 px-3 py-1 text-[12px] text-white/72">
                  已学 {learnedCount}/{practiceSegments.length}
                </div>
              ) : null}
            </div>

            {fullPlay ? (
              <div className="h-11 w-11" />
            ) : (
              <button
                type="button"
                onClick={onOpenTeaching}
                className="inline-flex h-11 items-center justify-center gap-1.5 rounded-full bg-black/20 px-4 text-[13px] font-medium text-white/92"
                aria-label="打开动作解析"
              >
                <Sparkles className="h-4 w-4" />
                解析
              </button>
            )}
          </div>
        </div>

        <div className="absolute right-5 top-[42%] z-20">
          <PlayerSideControls
            speedLabel={`${speed}x`}
            mirror={mirror}
            guideMode={guideMode}
            onCycleGuideMode={() => setGuideMode((value) => nextGuideMode(value))}
            onToggleMirror={() => setMirror((value) => !value)}
            onCycleSpeed={() => setSpeed((value) => nextSpeed(value))}
          />
        </div>

        <div className="absolute inset-x-0 top-[18%] bottom-[18%] flex items-center justify-center px-5">
          <div ref={stageRef} className="relative h-full w-full overflow-hidden">
            <div className="pointer-events-none absolute inset-x-0 top-4 z-30 flex justify-center px-4">
              <BeatCounterBadge
                currentBeat={currentBeat}
                beatCount={fullPlay ? 8 : segment.beat_count}
                visible={showBeatBadge}
              />
            </div>
            <BeatCueOverlay
              cues={fullPlay ? [] : effectiveBeatCues}
              currentBeat={currentBeat}
              visible={showCueOverlay && !fullPlay}
            />

            {!fullPlay && prevSegment && frameHeight > 0 ? (
              <motion.div className="absolute inset-0" style={{ y: prevY }}>
                <PlayerVideoCard segment={prevSegment} mirror={mirror} />
              </motion.div>
            ) : null}

            {!fullPlay && nextSegment && frameHeight > 0 ? (
              <motion.div className="absolute inset-0" style={{ y: nextY }}>
                <PlayerVideoCard segment={nextSegment} mirror={mirror} />
              </motion.div>
            ) : null}

            <motion.div
              key={`${mode}-${segment.id}`}
              drag={!fullPlay}
              dragDirectionLock
              dragElastic={0.08}
              dragMomentum={false}
              whileDrag={{ scale: 0.985 }}
              style={{ x: dragX, y: dragY }}
              onDragEnd={(_, info) => {
                if (fullPlay) return;
                const horizontalThreshold = Math.min(100, window.innerWidth * 0.18);
                const verticalThreshold = Math.min(120, window.innerHeight * 0.16);

                if (
                  Math.abs(info.offset.x) > Math.abs(info.offset.y) &&
                  Math.abs(info.offset.x) >= horizontalThreshold
                ) {
                  handleMarkLearned();
                  resetDragPosition();
                  return;
                }

                if (info.offset.y <= -verticalThreshold) {
                  if (nextSegment) {
                    handleNavigate(nextSegment);
                  } else {
                    router.push(`/lesson/${lesson.id}/complete`);
                  }
                  return;
                }

                if (info.offset.y >= verticalThreshold) {
                  handleNavigate(prevSegment);
                  return;
                }

                resetDragPosition();
              }}
              className="absolute inset-0 z-10"
            >
              <PlayerVideoCard
                segment={segment}
                mirror={mirror}
                loop={loop}
                interactive
                fullPlay={fullPlay}
                playing={playing}
                loading={!videoReady || videoWaiting}
                videoSrc={fullPlay ? lesson.video_url : segment.clip_url}
                posterSrc={fullPlay ? lesson.thumbnail : segment.thumbnail}
                onEnded={fullPlay ? handleFullPlayEnded : undefined}
                onTogglePlay={handleTogglePlay}
                videoRef={videoRef}
              />
            </motion.div>
          </div>
        </div>

        {fullPlay ? (
          <div className="absolute inset-x-0 bottom-8 z-20 px-5">
            <div className="space-y-3">
              <SectionProgressBar lesson={lesson} currentTime={currentTime} />
              <div className="flex justify-center">
                <Link
                  href={`/lesson/${lesson.id}`}
                  className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/28 px-4 py-2 text-[13px] text-white/72 backdrop-blur-sm transition hover:bg-black/36"
                >
                  <X className="h-3.5 w-3.5" />
                  退出完整播放
                </Link>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="absolute inset-x-0 bottom-[142px] z-20 flex justify-center px-8">
              <button
                type="button"
                onClick={onOpenTeaching}
                className="max-w-[320px] rounded-full bg-black/26 px-4 py-2 text-center text-[13px] leading-5 text-white/74 backdrop-blur-sm transition hover:bg-black/34"
                aria-label="打开当前动作教学摘要"
              >
                {currentSummary}
              </button>
            </div>

            <div className="absolute inset-x-0 bottom-8 z-20 px-5">
              <SegmentStripFooter
                currentId={segment.id}
                segments={practiceSegments}
                learnedSet={learnedIds}
                onSelect={handleSelectSegment}
              />
            </div>
          </>
        )}

        {!fullPlay ? (
          <div className="hidden">
            {prevSegment ? (
              <video key={`preload-prev-${prevSegment.id}`} src={prevSegment.clip_url} preload="metadata" muted playsInline />
            ) : null}
            {nextSegment ? (
              <video key={`preload-next-${nextSegment.id}`} src={nextSegment.clip_url} preload="metadata" muted playsInline />
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function PlayerVideoCard({
  segment,
  mirror,
  loop = false,
  interactive = false,
  fullPlay = false,
  playing = true,
  loading = false,
  videoSrc,
  posterSrc,
  onEnded,
  onTogglePlay,
  videoRef,
}: {
  segment: Segment;
  mirror: boolean;
  loop?: boolean;
  interactive?: boolean;
  fullPlay?: boolean;
  playing?: boolean;
  loading?: boolean;
  videoSrc?: string;
  posterSrc?: string;
  onEnded?: () => void;
  onTogglePlay?: () => void;
  videoRef?: React.RefObject<HTMLVideoElement>;
}) {
  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-[34px] bg-[#0f0d19]">
      <div
        className="absolute inset-0 scale-[1.12] bg-cover bg-center opacity-52 blur-3xl"
        style={{
          backgroundImage: `url("${posterSrc ?? segment.thumbnail}")`,
          transform: mirror ? "scaleX(-1) scale(1.12)" : "scale(1.12)",
        }}
      />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(8,7,14,0.26)_0%,rgba(8,7,14,0.08)_40%,rgba(8,7,14,0.52)_100%)]" />

      <video
        ref={interactive ? videoRef : undefined}
        src={videoSrc ?? segment.clip_url}
        poster={posterSrc ?? segment.thumbnail}
        playsInline
        {...(interactive ? { "webkit-playsinline": "true" as const } : {})}
        muted={!interactive}
        autoPlay={!interactive}
        loop={interactive ? loop : true}
        preload="metadata"
        className="relative z-10 h-full w-full object-contain"
        style={{ transform: mirror ? "scaleX(-1)" : "none" }}
        onEnded={interactive ? onEnded : undefined}
        onClick={interactive ? onTogglePlay : undefined}
      />

      {interactive && videoRef ? (
        <XuangeGuideOverlay
          videoRef={videoRef}
          particleUrl={segment.particle_url}
          mirror={mirror}
        />
      ) : null}

      {!interactive ? <div className="absolute inset-0 bg-black/12" /> : null}

      {interactive && loading ? (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
          <div className="flex items-center gap-2 rounded-full bg-black/45 px-4 py-2 text-[13px] text-white/90 backdrop-blur-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            {fullPlay ? "正在载入完整视频" : "正在载入动作"}
          </div>
        </div>
      ) : null}

      {interactive && !playing ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="rounded-full bg-black/35 px-6 py-3 text-[15px] text-white/90 backdrop-blur-sm">
            点击继续播放
          </div>
        </div>
      ) : null}
    </div>
  );
}

function buildEffectiveBeatCues(segment: Segment): (string | null)[] {
  const beatCount = Math.max(segment.beat_count, 0);
  const cues = Array.from({ length: beatCount }, (_, index) => segment.teaching?.beat_cues?.[index] ?? null);

  if (cues.some((cue) => typeof cue === "string" && cue.trim().length > 0)) {
    return cues;
  }

  for (const step of segment.teaching?.steps ?? []) {
    const cue = compactCueText(step.content);
    const [startBeat] = parseBeatRange(step.beats, beatCount);
    if (!cue || !startBeat) continue;
    cues[startBeat - 1] = cue;
  }

  if (!cues.some(Boolean)) {
    const fallback = compactCueText(segment.ai_description);
    if (fallback && beatCount > 0) {
      cues[0] = fallback;
    }
  }

  return cues;
}

function parseBeatRange(value: string, beatCount: number): number[] {
  const match = value.match(/(\d+)(?:\s*-\s*(\d+))?/);
  if (!match) return [];
  const start = Number(match[1]);
  const end = Number(match[2] ?? match[1]);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return [];
  const safeStart = Math.max(1, Math.min(start, beatCount));
  const safeEnd = Math.max(safeStart, Math.min(end, beatCount));
  return Array.from({ length: safeEnd - safeStart + 1 }, (_, index) => safeStart + index);
}

function compactCueText(value: string | null | undefined): string | null {
  if (!value) return null;
  const cleaned = value.replace(/[^\u3400-\u4DBF\u4E00-\u9FFF]/g, "").trim();
  if (!cleaned) return null;
  return cleaned.slice(0, 6);
}
