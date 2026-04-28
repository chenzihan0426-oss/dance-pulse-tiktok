"use client";

// Tracking challenge: camera view with a selectable teacher skeleton or silhouette layer.

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Camera, Pause, Play, Volume2, VolumeX } from "lucide-react";

import AdaptiveSkeletonOverlay from "@/components/tracking/AdaptiveSkeletonOverlay";
import MatteOverlay, { type MatteOverlayStatus } from "@/components/tracking/MatteOverlay";
import CameraPicker from "@/components/tracking/CameraPicker";
import CameraControls from "@/components/tracking/CameraControls";
import MatteTuningPanel, { type MatteTuning, type TrackingOverlayLayer } from "@/components/tracking/MatteTuningPanel";
import { Button } from "@/components/ui/button";
import { getLesson } from "@/lib/api";
import type { Kpt, TeacherFrame } from "@/lib/pose/scoring";
import type { Lesson, Segment } from "@/lib/types";
import { fmtTime } from "@/lib/utils";

const DEFAULT_POSE_ASPECT = 9 / 16;
const MATTE_TUNING_KEY = "dp_tracking_matte_tuning_v2";
const TRACKING_OVERLAY_LAYER_KEY = "dp_tracking_overlay_layer_v1";
const DEFAULT_MATTE_TUNING: MatteTuning = {
  scale: 1.5,
  offsetX: 0,
  offsetY: 0,
  intensity: 0.96,
  opacity: 0.88,
  skeletonScale: 1.08,
  skeletonOffsetX: 0,
  skeletonOffsetY: 0,
  skeletonIntensity: 1.2,
};

function clampValue(value: unknown, min: number, max: number, fallback: number): number {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, num));
}

function sanitizeMatteTuning(value: Partial<MatteTuning> | null | undefined): MatteTuning {
  return {
    scale: clampValue(value?.scale, 0.85, 1.9, DEFAULT_MATTE_TUNING.scale),
    offsetX: clampValue(value?.offsetX, -0.45, 0.45, DEFAULT_MATTE_TUNING.offsetX),
    offsetY: clampValue(value?.offsetY, -0.45, 0.45, DEFAULT_MATTE_TUNING.offsetY),
    intensity: clampValue(value?.intensity, 0.45, 1.45, DEFAULT_MATTE_TUNING.intensity),
    opacity: clampValue(value?.opacity, 0.35, 1, DEFAULT_MATTE_TUNING.opacity),
    skeletonScale: clampValue(value?.skeletonScale, 0.75, 1.6, DEFAULT_MATTE_TUNING.skeletonScale),
    skeletonOffsetX: clampValue(value?.skeletonOffsetX, -0.35, 0.35, DEFAULT_MATTE_TUNING.skeletonOffsetX),
    skeletonOffsetY: clampValue(value?.skeletonOffsetY, -0.35, 0.35, DEFAULT_MATTE_TUNING.skeletonOffsetY),
    skeletonIntensity: clampValue(value?.skeletonIntensity, 0.55, 1.65, DEFAULT_MATTE_TUNING.skeletonIntensity),
  };
}

function readMatteTuning(): MatteTuning {
  if (typeof window === "undefined") return DEFAULT_MATTE_TUNING;
  try {
    const raw = window.localStorage.getItem(MATTE_TUNING_KEY);
    return raw ? sanitizeMatteTuning(JSON.parse(raw) as Partial<MatteTuning>) : DEFAULT_MATTE_TUNING;
  } catch {
    return DEFAULT_MATTE_TUNING;
  }
}

function readTrackingOverlayLayer(): TrackingOverlayLayer {
  if (typeof window === "undefined") return "skeleton";
  const raw = window.localStorage.getItem(TRACKING_OVERLAY_LAYER_KEY);
  return raw === "silhouette" || raw === "skeleton" ? raw : "skeleton";
}

type PoseJsonKeypoint = { x: number; y: number; z?: number; visibility?: number };
type PoseJsonFrame = {
  t: number;
  detected?: boolean;
  keypoints?: PoseJsonKeypoint[];
  kp?: Array<[number, number, number?]> | null;
};
type PoseJsonDoc = {
  width?: number;
  height?: number;
  frames?: PoseJsonFrame[];
};

function poseDocAspect(doc: PoseJsonDoc): number {
  if (doc.width && doc.height && doc.width > 0 && doc.height > 0) {
    return doc.width / doc.height;
  }
  return DEFAULT_POSE_ASPECT;
}

function poseFrameToKeypoints(frame: PoseJsonFrame): Kpt[] {
  if (Array.isArray(frame.keypoints) && frame.keypoints.length) {
    return frame.keypoints.map((kp) => ({
      x: kp.x,
      y: kp.y,
      z: kp.z ?? 0,
      visibility: kp.visibility ?? 1,
    }));
  }
  if (Array.isArray(frame.kp) && frame.kp.length) {
    return frame.kp.map((kp) => ({
      x: kp[0],
      y: kp[1],
      z: 0,
      visibility: kp[2] ?? 1,
    }));
  }
  return [];
}

type TeacherVideoSource = {
  url: string;
  start: number;
  kind: "lesson" | "segment";
};

function buildTeacherVideoSources(lesson: Lesson | null): TeacherVideoSource[] {
  if (!lesson) return [];
  const sources: TeacherVideoSource[] = [];
  const seen = new Set<string>();
  const add = (source: TeacherVideoSource) => {
    const rawUrl = source.url.trim();
    if (!rawUrl || seen.has(rawUrl)) return;
    seen.add(rawUrl);
    sources.push({ ...source, url: withTeacherMediaCacheBust(rawUrl) });
  };

  add({ url: lesson.video_url, start: 0, kind: "lesson" });
  for (const segment of [...lesson.segments].sort((a, b) => a.start - b.start)) {
    if (segment.deleted) continue;
    add({ url: segment.clip_url, start: segment.start, kind: "segment" });
  }
  return sources;
}

function withTeacherMediaCacheBust(url: string): string {
  if (!url) return url;
  return `${url}${url.includes("?") ? "&" : "?"}dpv=tracking-video-20260425`;
}

function teacherVideoErrorMessage(): string {
  return "老师视频源无法播放，已尝试整课视频和分段视频。请换一节课或重新导入视频。";
}

function waitForVideoMetadata(video: HTMLVideoElement): Promise<void> {
  if (video.readyState >= 1) return Promise.resolve();
  return new Promise((resolve, reject) => {
    let timeoutId = 0;
    const cleanup = () => {
      window.clearTimeout(timeoutId);
      video.removeEventListener("loadedmetadata", onLoaded);
      video.removeEventListener("error", onError);
    };
    const onLoaded = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error(teacherVideoErrorMessage()));
    };
    timeoutId = window.setTimeout(onError, 4000);
    video.addEventListener("loadedmetadata", onLoaded);
    video.addEventListener("error", onError);
  });
}

function shouldSkipTeacherSource(
  source: TeacherVideoSource,
  sourceIndex: number,
  sources: TeacherVideoSource[],
  mediaDuration: number,
  lessonDuration?: number
): boolean {
  if (source.kind !== "lesson") return false;
  if (!lessonDuration || lessonDuration < 8 || !Number.isFinite(mediaDuration) || mediaDuration <= 0) return false;
  const hasSegmentFallback = sources.some((item, index) => index > sourceIndex && item.kind === "segment");
  return hasSegmentFallback && mediaDuration + 1 < lessonDuration * 0.6;
}

export default function TrackingDesktopPage() {
  const params = useParams<{ id: string }>();
  const lessonId = params?.id ?? "";

  const [lesson, setLesson] = React.useState<Lesson | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  const [cameraReady, setCameraReady] = React.useState(false);
  const [cameraError, setCameraError] = React.useState<string | null>(null);
  const cameraRef = React.useRef<HTMLVideoElement>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const [cameraStream, setCameraStream] = React.useState<MediaStream | null>(null);

  // lesson video 作为整支挑战的"老师时间线"
  const teacherRef = React.useRef<HTMLVideoElement>(null);
  const [teacherVideoIndex, setTeacherVideoIndex] = React.useState(0);
  const teacherVideoIndexRef = React.useRef(0);
  const teacherVideoSourcesRef = React.useRef<TeacherVideoSource[]>([]);
  const [playing, setPlaying] = React.useState(false);
  const [teacherMuted, setTeacherMuted] = React.useState(true);
  const [teacherPlayhead, setTeacherPlayhead] = React.useState(0);
  const teacherPlayheadRef = React.useRef(0);
  React.useEffect(() => { teacherPlayheadRef.current = teacherPlayhead; }, [teacherPlayhead]);

  // 评分
  const teacherFramesRef = React.useRef<TeacherFrame[]>([]);
  const teacherFramesLoadedRef = React.useRef<Set<string>>(new Set());
  const teacherFramesCacheRef = React.useRef<Map<string, TeacherFrame[]>>(new Map());
  const teacherPoseAspectCacheRef = React.useRef<Map<string, number>>(new Map());
  const [teacherPoseAspect, setTeacherPoseAspect] = React.useState(DEFAULT_POSE_ASPECT);

  // 预加载剪影素材到 HTTP 缓存 (lesson 一加载就开始)
  React.useEffect(() => {
    if (!lesson) return;
    const urls = lesson.segments
      .filter((s) => !s.deleted)
      .flatMap((s) => [s.matte_rgb_url, s.matte_mask_url, s.particle_url].filter(Boolean) as string[]);
    const controllers: AbortController[] = [];
    for (const u of urls) {
      const ctrl = new AbortController();
      controllers.push(ctrl);
      fetch(u, { mode: "cors", credentials: "omit", signal: ctrl.signal }).catch(() => null);
    }
    return () => { controllers.forEach((c) => c.abort()); };
  }, [lesson]);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getLesson(lessonId)
      .then((detail) => {
        if (cancelled) return;
        setLesson(detail);
        setLoadError(null);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [lessonId]);

  const teacherVideoSources = React.useMemo(() => buildTeacherVideoSources(lesson), [lesson]);
  const teacherVideoSource =
    teacherVideoSources[Math.min(teacherVideoIndex, Math.max(teacherVideoSources.length - 1, 0))];
  const teacherVideoSrc = teacherVideoSource?.url ?? lesson?.video_url ?? "";

  React.useEffect(() => {
    teacherVideoSourcesRef.current = teacherVideoSources;
  }, [teacherVideoSources]);

  React.useEffect(() => {
    teacherVideoIndexRef.current = teacherVideoIndex;
  }, [teacherVideoIndex]);

  React.useEffect(() => {
    teacherVideoIndexRef.current = 0;
    setTeacherVideoIndex(0);
  }, [lesson?.id]);

  // 当前时间所在 segment
  const currentSegment = React.useMemo<Segment | null>(() => {
    if (!lesson) return null;
    for (const seg of lesson.segments) {
      if (seg.deleted) continue;
      if (teacherPlayhead >= seg.start && teacherPlayhead < seg.end) return seg;
    }
    return lesson.segments.find((s) => !s.deleted) ?? null;
  }, [lesson, teacherPlayhead]);

  // 懒加载当前 segment 的 pose_full → TeacherFrame[]
  React.useEffect(() => {
    if (!currentSegment?.pose_full_url) {
      teacherFramesRef.current = [];
      setTeacherPoseAspect(DEFAULT_POSE_ASPECT);
      return;
    }
    const cachedFrames = teacherFramesCacheRef.current.get(currentSegment.id);
    if (cachedFrames) {
      teacherFramesRef.current = cachedFrames;
      setTeacherPoseAspect(teacherPoseAspectCacheRef.current.get(currentSegment.id) ?? DEFAULT_POSE_ASPECT);
      return;
    }
    if (teacherFramesLoadedRef.current.has(currentSegment.id)) return;
    const url = currentSegment.pose_full_url;
    const segStart = currentSegment.start;
    teacherFramesLoadedRef.current.add(currentSegment.id);
    fetch(url)
      .then((res) => res.json())
      .then((doc: PoseJsonDoc) => {
        // 转成 TeacherFrame[],时间偏移到 lesson 级
        const frames: TeacherFrame[] = (doc.frames ?? [])
          .filter((f) => f.detected !== false)
          .map((f) => ({
            t: f.t + segStart,
            keypoints: poseFrameToKeypoints(f),
          }))
          .filter((frame) => frame.keypoints.length >= 17);
        const aspect = poseDocAspect(doc);
        teacherPoseAspectCacheRef.current.set(currentSegment.id, aspect);
        teacherFramesCacheRef.current.set(currentSegment.id, frames);
        teacherFramesRef.current = frames;
        setTeacherPoseAspect(aspect);
      })
      .catch(() => {
        teacherFramesLoadedRef.current.delete(currentSegment.id);
      });
  }, [currentSegment]);

  React.useEffect(() => {
    const v = teacherRef.current;
    if (!v) return;
    v.muted = teacherMuted;
    if (!teacherMuted) v.volume = 1;
    if (playing) {
      void v.play().catch(() => setPlaying(false));
    } else {
      v.pause();
    }
  }, [playing, teacherMuted]);

  React.useEffect(() => {
    if (!playing) return;
    let rafId = 0;
    const tick = () => {
      const v = teacherRef.current;
      const source = teacherVideoSourcesRef.current[teacherVideoIndexRef.current];
      if (v) setTeacherPlayhead((source?.start ?? 0) + v.currentTime);
      rafId = window.requestAnimationFrame(tick);
    };
    rafId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(rafId);
  }, [playing]);

  // 摄像头 (支持选择 deviceId, 外接 Insta / OBS 虚拟机也能用)
  const CAMERA_STORAGE_KEY = "dp_tracking_camera_device";
  const [selectedDeviceId, setSelectedDeviceId] = React.useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(CAMERA_STORAGE_KEY);
  });
  const [userMirror, setUserMirror] = React.useState(true);
  const [matteTuning, setMatteTuning] = React.useState<MatteTuning>(() => readMatteTuning());
  const [trackingOverlayLayer, setTrackingOverlayLayer] = React.useState<TrackingOverlayLayer>(() => readTrackingOverlayLayer());
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(MATTE_TUNING_KEY, JSON.stringify(matteTuning));
  }, [matteTuning]);
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(TRACKING_OVERLAY_LAYER_KEY, trackingOverlayLayer);
  }, [trackingOverlayLayer]);
  const resetMatteTuning = React.useCallback(() => {
    setMatteTuning(DEFAULT_MATTE_TUNING);
  }, []);
  const [facingMode, setFacingMode] = React.useState<"user" | "environment">("user");

  const openStream = React.useCallback(async (deviceId: string | null, facing?: "user" | "environment") => {
    if (typeof window !== "undefined" && !window.isSecureContext) {
      throw new Error("手机浏览器需要 HTTPS 才能开启摄像头，请用 start-mobile-phone.bat 打开的 https 地址访问。");
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("当前浏览器不支持摄像头，请使用 Chrome / Edge 重试。");
    }

    const baseCon: MediaTrackConstraints = { width: { ideal: 1280 }, height: { ideal: 720 } };
    const buildVideo = (nextDeviceId: string | null): MediaTrackConstraints => (
      nextDeviceId
        ? { ...baseCon, deviceId: { exact: nextDeviceId } }
        : { ...baseCon, facingMode: facing ?? facingMode }
    );

    try {
      return await navigator.mediaDevices.getUserMedia({ video: buildVideo(deviceId), audio: false });
    } catch (err) {
      if (!deviceId) throw err;
      setSelectedDeviceId(null);
      if (typeof window !== "undefined") window.localStorage.removeItem(CAMERA_STORAGE_KEY);
      return navigator.mediaDevices.getUserMedia({ video: buildVideo(null), audio: false });
    }
  }, [facingMode]);
  const ensureCameraReady = React.useCallback(async () => {
    if (streamRef.current) {
      setCameraReady(true);
      return streamRef.current;
    }
    const stream = await openStream(selectedDeviceId);
    streamRef.current = stream;
    setCameraStream(stream);
    setCameraReady(true);
    setCameraError(null);
    return stream;
  }, [openStream, selectedDeviceId]);
  React.useEffect(() => {
    const video = cameraRef.current;
    if (!video) return;
    video.srcObject = cameraStream;
    if (cameraStream) void video.play().catch(() => null);
  }, [cameraStream, cameraReady]);
  const stopCameraStream = React.useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraStream(null);
    setCameraReady(false);
    teacherRef.current?.pause();
    setPlaying(false);
  }, []);

  React.useEffect(() => () => { stopCameraStream(); }, [stopCameraStream]);

  const reopenWithFacing = React.useCallback(async (facing: "user" | "environment") => {
    setFacingMode(facing);
    setSelectedDeviceId(null);
    if (typeof window !== "undefined") window.localStorage.removeItem(CAMERA_STORAGE_KEY);
    if (!streamRef.current) return;
    try {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      const stream = await openStream(null, facing);
      streamRef.current = stream;
      setCameraStream(stream);
      setCameraReady(true);
      if (cameraRef.current) {
        cameraRef.current.srcObject = stream;
        void cameraRef.current.play().catch(() => null);
      }
      setCameraError(null);
    } catch (err) {
      setCameraError(err instanceof Error ? err.message : String(err));
      setCameraStream(null);
      setCameraReady(false);
    }
  }, [openStream]);

  const switchCamera = React.useCallback(async (deviceId: string) => {
    setSelectedDeviceId(deviceId);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(CAMERA_STORAGE_KEY, deviceId);
    }
    if (!streamRef.current) return;
    try {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      const stream = await openStream(deviceId);
      streamRef.current = stream;
      setCameraStream(stream);
      setCameraReady(true);
      if (cameraRef.current) {
        cameraRef.current.srcObject = stream;
        void cameraRef.current.play().catch(() => null);
      }
      setCameraError(null);
    } catch (err) {
      setCameraError(err instanceof Error ? err.message : String(err));
      setCameraStream(null);
      setCameraReady(false);
    }
  }, [openStream]);

  const [overlayStatus, setOverlayStatus] = React.useState<MatteOverlayStatus>("idle");

  const startTeacherPlayback = React.useCallback(async (reset = false, muted = teacherMuted) => {
    const video = teacherRef.current;
    if (!video) return;
    const sources = teacherVideoSourcesRef.current;
    if (!sources.length) {
      setPlaying(false);
      throw new Error(teacherVideoErrorMessage());
    }

    const requestedIndex = reset ? 0 : Math.min(teacherVideoIndexRef.current, sources.length - 1);
    for (let index = requestedIndex; index < sources.length; index += 1) {
      const source = sources[index];
      const sourceChanged = video.src !== source.url;
      try {
        if (sourceChanged) {
          video.src = source.url;
          video.load();
        }
        video.muted = muted;
        if (!muted) video.volume = 1;
        video.loop = false;
        if (reset || sourceChanged) {
          try { video.currentTime = 0; } catch { /* ignore seek failures before metadata */ }
        }
        await waitForVideoMetadata(video);
        if (shouldSkipTeacherSource(source, index, sources, video.duration, lesson?.duration)) {
          video.pause();
          continue;
        }
        teacherVideoIndexRef.current = index;
        setTeacherVideoIndex(index);
        setTeacherPlayhead(source.start + video.currentTime);
        await video.play();
        setTeacherMuted(muted);
        setPlaying(true);
        setCameraError(null);
        return;
      } catch {
        video.pause();
      }
    }
    setPlaying(false);
    throw new Error(teacherVideoErrorMessage());
  }, [lesson?.duration, teacherMuted]);

  const handleTeacherVideoError = React.useCallback(() => {
    const sources = teacherVideoSourcesRef.current;
    const nextIndex = teacherVideoIndexRef.current + 1;
    if (nextIndex >= sources.length) {
      setPlaying(false);
      setCameraError(teacherVideoErrorMessage());
      return;
    }
    teacherVideoIndexRef.current = nextIndex;
    setTeacherVideoIndex(nextIndex);
    setTeacherPlayhead(sources[nextIndex].start);
    if (playing) {
      window.setTimeout(() => {
        void startTeacherPlayback(false, teacherMuted).catch((err) => {
          setPlaying(false);
          setCameraError(err instanceof Error ? err.message : teacherVideoErrorMessage());
        });
      }, 0);
    }
  }, [playing, startTeacherPlayback, teacherMuted]);

  const handleTeacherEnded = React.useCallback(() => {
    const sources = teacherVideoSourcesRef.current;
    const currentSource = sources[teacherVideoIndexRef.current];
    const nextSource = sources[teacherVideoIndexRef.current + 1];
    if (currentSource?.kind === "segment" && nextSource?.kind === "segment") {
      const nextIndex = teacherVideoIndexRef.current + 1;
      teacherVideoIndexRef.current = nextIndex;
      setTeacherVideoIndex(nextIndex);
      setTeacherPlayhead(nextSource.start);
      window.setTimeout(() => {
        void startTeacherPlayback(false, teacherMuted).catch((err) => {
          setPlaying(false);
          setCameraError(err instanceof Error ? err.message : teacherVideoErrorMessage());
        });
      }, 0);
      return;
    }
    setPlaying(false);
  }, [startTeacherPlayback, teacherMuted]);

  const toggleTeacherSound = React.useCallback(async () => {
    const nextMuted = !teacherMuted;
    const video = teacherRef.current;
    setTeacherMuted(nextMuted);
    setCameraError(null);
    if (!video) return;
    video.muted = nextMuted;
    if (!nextMuted) video.volume = 1;
    if (playing) {
      try {
        await video.play();
      } catch (err) {
        video.muted = true;
        setTeacherMuted(true);
        setCameraError(err instanceof Error ? err.message : String(err));
      }
    }
  }, [playing, teacherMuted]);

  const resetChallengeState = React.useCallback(() => {
    teacherVideoIndexRef.current = 0;
    setTeacherVideoIndex(0);
    setTeacherPlayhead(0);
  }, []);

  const handleStart = async () => {
    resetChallengeState();
    try {
      await startTeacherPlayback(true, true);
      await ensureCameraReady();
      setCameraError(null);
    } catch (err) {
      setCameraError(err instanceof Error ? err.message : String(err));
    }
  };
  if (loading) {
    return <main className="flex min-h-screen items-center justify-center bg-[#0a0414] text-white/65">加载课程...</main>;
  }
  if (loadError || !lesson) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0a0414] text-white/65">
        <div className="rounded-2xl border border-red-500/40 bg-red-500/10 px-6 py-4 text-red-200">
          {loadError ?? "课程不存在"}
        </div>
      </main>
    );
  }

  const duration = lesson.duration;
  const progressPct = duration > 0 ? Math.min(100, (teacherPlayhead / duration) * 100) : 0;

  return (
    <main className="relative flex h-screen w-screen flex-col overflow-hidden bg-black text-white">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-white/6 px-6 py-3">
        <div className="flex items-center gap-4">
          <Link
            href={`/lesson/${lessonId}`}
            className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white/75 hover:bg-white/10"
          >
            <ArrowLeft className="h-4 w-4" />
            返回课程
          </Link>
          <div className="flex flex-col leading-tight">
            <span className="text-xs uppercase tracking-[0.18em] text-white/45">Tracking · 整支挑战</span>
            <span className="text-lg font-semibold">{lesson.title}</span>
          </div>
        </div>
      </header>

      {/* Stage: 全身镜(真实比例 44:74) 居中摆放 */}
      <section className="relative flex flex-1 items-center justify-center overflow-hidden bg-black">
        {/* 隐藏的老师时间线 video (同步源) */}
        <video
          ref={teacherRef}
          src={teacherVideoSrc}
          crossOrigin="anonymous"
          playsInline
          preload="auto"
          className="pointer-events-none absolute left-0 top-0 h-1 w-1 opacity-0"
          onError={handleTeacherVideoError}
          onEnded={handleTeacherEnded}
        />

        {/* 预加载素材使用 fetch 下到 HTTP 缓存 (不挂 video 元素, 不占解码通道) */}

        {/* 镜子本体: aspect 44/74 居中,最高铺满 */}
        <div
          className="relative h-full overflow-hidden bg-black"
          style={{ aspectRatio: "44 / 74" }}
        >
          {/* 用户摄像头 */}
          {cameraReady ? (
            <video
              ref={cameraRef}
              className="absolute inset-0 h-full w-full object-cover"
              style={{ transform: userMirror ? "scaleX(-1)" : "none" }}
              muted
              playsInline
            />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 text-center text-white/60">
              <Camera className="h-14 w-14" />
              <div className="max-w-[380px] px-6 text-[15px] leading-7">
                开启摄像头 = 把屏幕当全身镜,<br />
                跟着幽灵剪影起舞就行。
              </div>
              {cameraError ? (
                <div className="mx-6 max-w-[420px] rounded-xl bg-red-500/15 px-4 py-2 text-[13px] text-red-200">
                  {cameraError}
                </div>
              ) : null}
              <Button onClick={handleStart} className="rounded-full px-6 py-3 text-[15px]">
                <Camera className="h-4 w-4" />
                开启摄像头
              </Button>
            </div>
          )}

          {/* 幽灵剪影: 铺满整个镜子,大尺寸便于用户跟跳
              不用 key={segment.id},让 MatteOverlay 内部换 src 避免 Three.js 场景重建 */}
          {cameraReady && trackingOverlayLayer === "silhouette" && currentSegment?.matte_rgb_url && currentSegment?.matte_mask_url ? (
            <MatteOverlay
              rgbUrl={currentSegment.matte_rgb_url}
              maskUrl={currentSegment.matte_mask_url}
              userMirror={userMirror}
              playing={playing}
              playbackRate={1}
              currentTimeSec={Math.max(0, teacherPlayhead - currentSegment.start)}
              silhouetteScale={matteTuning.scale}
              silhouetteOffsetX={matteTuning.offsetX}
              silhouetteOffsetY={matteTuning.offsetY}
              edgeBoost={3.4 * matteTuning.intensity}
              detailBoost={2.6 * matteTuning.intensity}
              overlayOpacity={matteTuning.opacity}
              onStatus={setOverlayStatus}
            />
          ) : cameraReady && trackingOverlayLayer === "silhouette" ? (
            <div className="pointer-events-none absolute bottom-20 left-1/2 -translate-x-1/2 rounded-full bg-black/55 px-3 py-1 text-[10px] text-white/60 backdrop-blur">
              幽灵剪影加载中...
            </div>
          ) : null}

          {cameraReady && trackingOverlayLayer === "skeleton" ? (
            <AdaptiveSkeletonOverlay
              framesRef={teacherFramesRef}
              currentTimeSec={teacherPlayhead}
              tuning={matteTuning}
              mirror={userMirror}
              active={cameraReady && trackingOverlayLayer === "skeleton"}
              sourceAspect={teacherPoseAspect}
            />
          ) : null}


          {cameraReady ? (
            <MatteTuningPanel
              value={matteTuning}
              layer={trackingOverlayLayer}
              onChange={setMatteTuning}
              onLayerChange={setTrackingOverlayLayer}
              onReset={resetMatteTuning}
              className="absolute bottom-12 left-1/2 -translate-x-1/2"
            />
          ) : null}
        </div>

      </section>

      {/* Footer */}
      <footer className="flex items-center gap-4 border-t border-white/6 bg-black/40 px-6 py-3 backdrop-blur">
        <Button
          onClick={() => {
            if (playing) { setPlaying(false); return; }
            if (cameraReady) { void startTeacherPlayback(false, teacherMuted); return; }
            void handleStart();
          }}
          className="rounded-full"
        >
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          {playing ? "暂停" : cameraReady ? "继续" : "开始挑战"}
        </Button>

        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-amber-400 to-fuchsia-500 transition-[width] duration-100"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <span className="w-24 text-right font-mono text-[12px] text-white/55">
            {fmtTime(teacherPlayhead)} / {fmtTime(duration)}
          </span>
        </div>

        <button
          type="button"
          onClick={() => void toggleTeacherSound()}
          className={`inline-flex items-center gap-2 rounded-full border border-white/15 px-3 py-1.5 text-[12px] font-medium backdrop-blur transition ${
            teacherMuted ? "bg-white/8 text-white/85 hover:bg-white/16" : "bg-amber-400/25 text-amber-100"
          }`}
          title={teacherMuted ? "打开老师视频声音" : "关闭老师视频声音"}
        >
          {teacherMuted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
          {teacherMuted ? "开声音" : "有声音"}
        </button>
        <CameraPicker currentDeviceId={selectedDeviceId} onChange={switchCamera} />
        <CameraControls
          stream={cameraStream}
          mirror={userMirror}
          onMirrorChange={setUserMirror}
          onReopenWithFacing={reopenWithFacing}
        />

        {cameraReady ? (
          <Button variant="ghost" onClick={stopCameraStream} className="rounded-full">
            关闭摄像头
          </Button>
        ) : null}

        <span className="text-[11px] text-white/35">
          {trackingOverlayLayer === "silhouette"
            ? overlayStatus === "ready"
              ? "剪影已就位"
              : overlayStatus === "loading"
                ? "剪影加载中..."
                : ""
            : ""}
        </span>
      </footer>
    </main>
  );
}
