"use client";

// Tracking challenge: camera view with a selectable teacher skeleton or silhouette layer.

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Camera, Pause, Play, Maximize2, Minimize2, Volume2, VolumeX } from "lucide-react";

import AdaptiveSkeletonOverlay from "@/components/tracking/AdaptiveSkeletonOverlay";
import MatteOverlay, { type MatteOverlayStatus } from "@/components/tracking/MatteOverlay";
import SegmentParticleLayer from "@/components/tracking/SegmentParticleLayer";
import CameraPicker from "@/components/tracking/CameraPicker";
import CameraControls from "@/components/tracking/CameraControls";
import MatteTuningPanel, { type MatteTuning, type TrackingOverlayLayer } from "@/components/tracking/MatteTuningPanel";
import TeacherMiniWindow from "@/components/tracking/TeacherMiniWindow";
import { Button } from "@/components/ui/button";
import { getLesson } from "@/lib/api";
import type { Kpt, TeacherFrame } from "@/lib/pose/scoring";
import type { Lesson, Segment } from "@/lib/types";
import { fmtTime } from "@/lib/utils";

const DEFAULT_POSE_ASPECT = 9 / 16;
const MATTE_TUNING_KEY = "dp_tracking_matte_tuning_v2";
const TRACKING_OVERLAY_LAYER_KEY = "dp_tracking_overlay_layer_v1";
const TEACHER_PLAYHEAD_UI_FPS = 8;
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

function DotFieldBackground({ mouseRef }: { mouseRef: React.MutableRefObject<{ x: number; y: number }> }) {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let rafId = 0;
    let width = window.innerWidth;
    let height = window.innerHeight;
    const spacing = 28;
    const dots: Array<{ ox: number; oy: number; x: number; y: number; vx: number; vy: number }> = [];

    const reset = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width;
      canvas.height = height;
      dots.length = 0;
      for (let x = -spacing; x <= width + spacing; x += spacing) {
        for (let y = -spacing; y <= height + spacing; y += spacing) {
          dots.push({ ox: x, oy: y, x, y, vx: 0, vy: 0 });
        }
      }
    };

    let t = 0;
    const render = () => {
      t += 0.028;
      ctx.fillStyle = "#050505";
      ctx.fillRect(0, 0, width, height);

      const mx = mouseRef.current.x;
      const my = mouseRef.current.y;
      for (let i = 0; i < dots.length; i += 1) {
        const p = dots[i];
        const waveX = Math.sin(p.oy * 0.005 + t) * 9;
        const waveY = Math.cos(p.ox * 0.006 + t) * 10;
        const tx = p.ox + waveX;
        const ty = p.oy + waveY;
        const dx = mx - p.x;
        const dy = my - p.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 180) {
          const force = ((180 - dist) / 180) ** 2;
          const angle = Math.atan2(dy, dx);
          p.vx -= Math.cos(angle) * force * 2.8;
          p.vy -= Math.sin(angle) * force * 2.8;
        }

        p.vx += (tx - p.x) * 0.05;
        p.vy += (ty - p.y) * 0.05;
        p.vx *= 0.9;
        p.vy *= 0.9;
        p.x += p.vx;
        p.y += p.vy;

        const mag = Math.hypot(p.x - p.ox, p.y - p.oy);
        let r = 255;
        let g = 0;
        let b = 122;
        if (mag > 8) {
          const f = Math.min((mag - 8) / 24, 1);
          r = Math.round(255 - 55 * f);
          g = Math.round(243 * f);
          b = Math.round(122 + 133 * f);
        }
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.8, 0, Math.PI * 2);
        ctx.fill();
      }

      rafId = window.requestAnimationFrame(render);
    };

    reset();
    render();
    const onResize = () => reset();
    window.addEventListener("resize", onResize);
    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener("resize", onResize);
    };
  }, [mouseRef]);

  return <canvas ref={canvasRef} className="pointer-events-none fixed inset-0 z-0" aria-hidden />;
}

export default function TrackingDesktopPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const lessonId = params?.id ?? "";

  const [lesson, setLesson] = React.useState<Lesson | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [challengeDone, setChallengeDone] = React.useState(false);

  const [cameraReady, setCameraReady] = React.useState(false);
  const [cameraError, setCameraError] = React.useState<string | null>(null);
  const cameraRef = React.useRef<HTMLVideoElement>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const [cameraStream, setCameraStream] = React.useState<MediaStream | null>(null);
  const [showCustomCursor, setShowCustomCursor] = React.useState(false);
  const [mousePos, setMousePos] = React.useState({ x: -1000, y: -1000 });
  const mouseRef = React.useRef({ x: -1000, y: -1000 });

  // Lesson video is the main timeline driver for the teacher playback.
  const teacherRef = React.useRef<HTMLVideoElement>(null);
  const [teacherVideoIndex, setTeacherVideoIndex] = React.useState(0);
  const teacherVideoIndexRef = React.useRef(0);
  const teacherVideoSourcesRef = React.useRef<TeacherVideoSource[]>([]);
  const [playing, setPlaying] = React.useState(false);
  const [teacherMuted, setTeacherMuted] = React.useState(true);
  const [teacherPlayhead, setTeacherPlayhead] = React.useState(0);
  const teacherPlayheadRef = React.useRef(0);
  const setTeacherPlayheadNow = React.useCallback((next: number) => {
    teacherPlayheadRef.current = next;
    setTeacherPlayhead(next);
  }, []);

  // Scoring and teacher pose frame caches.
  const teacherFramesRef = React.useRef<TeacherFrame[]>([]);
  const teacherFramesLoadedRef = React.useRef<Set<string>>(new Set());
  const teacherFramesCacheRef = React.useRef<Map<string, TeacherFrame[]>>(new Map());
  const teacherPoseAspectCacheRef = React.useRef<Map<string, number>>(new Map());
  const [teacherPoseAspect, setTeacherPoseAspect] = React.useState(DEFAULT_POSE_ASPECT);

  // Preload matte and particle assets into the HTTP cache when a lesson loads.
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

  React.useEffect(() => {
    setShowCustomCursor(window.matchMedia("(pointer:fine)").matches);
    const onMove = (e: MouseEvent) => {
      const next = { x: e.clientX, y: e.clientY };
      setMousePos(next);
      mouseRef.current = next;
    };
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

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

  // Segment under the current teacher playhead.
  const currentSegment = React.useMemo<Segment | null>(() => {
    if (!lesson) return null;
    for (const seg of lesson.segments) {
      if (seg.deleted) continue;
      if (teacherPlayhead >= seg.start && teacherPlayhead < seg.end) return seg;
    }
    return lesson.segments.find((s) => !s.deleted) ?? null;
  }, [lesson, teacherPlayhead]);

  // Load the current segment pose_full data into TeacherFrame[].
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
        // Convert pose frames to absolute lesson time.
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
    let lastUiUpdateMs = 0;
    const tick = () => {
      const v = teacherRef.current;
      const source = teacherVideoSourcesRef.current[teacherVideoIndexRef.current];
      if (v) {
        const next = (source?.start ?? 0) + v.currentTime;
        teacherPlayheadRef.current = next;
        const now = performance.now();
        if (now - lastUiUpdateMs >= 1000 / TEACHER_PLAYHEAD_UI_FPS) {
          lastUiUpdateMs = now;
          setTeacherPlayhead(next);
        }
      }
      rafId = window.requestAnimationFrame(tick);
    };
    rafId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(rafId);
  }, [playing]);

  // Camera selection supports deviceId, including virtual cameras from Insta or OBS.
  const CAMERA_STORAGE_KEY = "dp_tracking_camera_device";
  const [selectedDeviceId, setSelectedDeviceId] = React.useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(CAMERA_STORAGE_KEY);
  });
  // Mirror state drives both the camera video transform and the matte overlay.
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
  // facingMode is used as an openStream fallback when no deviceId is selected.
  const [facingMode, setFacingMode] = React.useState<"user" | "environment">("user");

  // Cinema mode: full-screen camera with a smaller teacher preview window.
  const mainRef = React.useRef<HTMLElement>(null);
  const [cinema, setCinema] = React.useState(false);
  const toggleCinema = React.useCallback(() => {
    setCinema((cur) => {
      const next = !cur;
      if (next) {
        mainRef.current?.requestFullscreen?.().catch(() => null);
      } else if (document.fullscreenElement) {
        document.exitFullscreen?.().catch(() => null);
      }
      return next;
    });
  }, []);
  React.useEffect(() => {
    const onFs = () => { if (!document.fullscreenElement) setCinema(false); };
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && cinema) setCinema(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cinema]);

  const openStream = React.useCallback(async (deviceId: string | null, facing?: "user" | "environment") => {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("当前浏览器不支持摄像头，请使用 Chrome / Edge 重试。");
    }

    const baseCon: MediaTrackConstraints = {
      width: { ideal: 960 },
      height: { ideal: 540 },
      frameRate: { ideal: 30, max: 30 },
    };
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

  // Switch front/back cameras by clearing deviceId and reopening the stream if active.
  const reopenWithFacing = React.useCallback(async (facing: "user" | "environment") => {
    setFacingMode(facing);
    setSelectedDeviceId(null);
    if (typeof window !== "undefined") window.localStorage.removeItem(CAMERA_STORAGE_KEY);
    if (!streamRef.current) return;
    try {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      // Do not constrain by deviceId when switching front/back cameras.
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
        setTeacherPlayheadNow(source.start + video.currentTime);
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
  }, [lesson?.duration, setTeacherPlayheadNow, teacherMuted]);

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
    setTeacherPlayheadNow(sources[nextIndex].start);
    if (playing) {
      window.setTimeout(() => {
        void startTeacherPlayback(false, teacherMuted).catch((err) => {
          setPlaying(false);
          setCameraError(err instanceof Error ? err.message : teacherVideoErrorMessage());
        });
      }, 0);
    }
  }, [playing, setTeacherPlayheadNow, startTeacherPlayback, teacherMuted]);

  const handleTeacherEnded = React.useCallback(() => {
    const sources = teacherVideoSourcesRef.current;
    const currentSource = sources[teacherVideoIndexRef.current];
    const nextSource = sources[teacherVideoIndexRef.current + 1];
    if (currentSource?.kind === "segment" && nextSource?.kind === "segment") {
      const nextIndex = teacherVideoIndexRef.current + 1;
      teacherVideoIndexRef.current = nextIndex;
      setTeacherVideoIndex(nextIndex);
      setTeacherPlayheadNow(nextSource.start);
      window.setTimeout(() => {
        void startTeacherPlayback(false, teacherMuted).catch((err) => {
          setPlaying(false);
          setCameraError(err instanceof Error ? err.message : teacherVideoErrorMessage());
        });
      }, 0);
      return;
    }
    setPlaying(false);
    setChallengeDone(true);
  }, [setTeacherPlayheadNow, startTeacherPlayback, teacherMuted]);

  React.useEffect(() => {
    if (!challengeDone || !lessonId) return;
    const timer = window.setTimeout(() => {
      router.push(`/lesson/${lessonId}/for-you`);
    }, 1600);
    return () => window.clearTimeout(timer);
  }, [challengeDone, lessonId, router]);

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
    setTeacherPlayheadNow(0);
    setChallengeDone(false);
  }, [setTeacherPlayheadNow]);

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
    return <main className="flex min-h-screen items-center justify-center bg-[#050505] text-white/65">加载课程...</main>;
  }
  if (loadError || !lesson) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#050505] text-white/65">
        <div className="rounded-2xl border border-red-500/40 bg-red-500/10 px-6 py-4 text-red-200">
          {loadError ?? "课程不存在"}
        </div>
      </main>
    );
  }

  const duration = lesson.duration;
  const progressPct = duration > 0 ? Math.min(100, (teacherPlayhead / duration) * 100) : 0;

  return (
    <main
      ref={mainRef}
      className="relative flex h-screen w-screen flex-col overflow-hidden bg-[#050505] text-white selection:bg-[#ff0055] selection:text-white"
    >
      <DotFieldBackground mouseRef={mouseRef} />

      {challengeDone ? (
        <div className="absolute inset-0 z-[60] flex items-center justify-center bg-black/75 px-6 backdrop-blur-sm">
          <div className="max-w-md border border-white/15 bg-[#0a0a0a] px-6 py-7 text-center">
            <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#ccff00]">Challenge Complete</div>
            <h2
              className="mt-3 text-[32px] font-black tracking-tight"
              style={{ fontFamily: "'Black Han Sans', 'Noto Sans SC', sans-serif" }}
            >
              跟练完成
            </h2>
            <p className="mt-2 text-[13px] text-white/50">即将进入猜你喜欢…</p>
            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
              <Link
                href={`/lesson/${lessonId}/for-you`}
                className="bg-[#ccff00] px-5 py-2.5 text-[13px] font-bold text-black transition hover:bg-white"
                style={{ transform: "skewX(-6deg)" }}
              >
                <span style={{ transform: "skewX(6deg)", display: "inline-block" }}>立即查看推荐</span>
              </Link>
              <button
                type="button"
                onClick={() => {
                  setChallengeDone(false);
                  void handleStart();
                }}
                className="border border-white/20 px-5 py-2.5 text-[13px] text-white/75 transition hover:border-white/40 hover:text-white"
              >
                再练一次
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <style jsx global>{`
        @import url("https://fonts.googleapis.com/css2?family=Black+Han+Sans&family=Michroma&family=Noto+Sans+SC:wght@500;700;900&display=swap");
        body {
          font-family: "Michroma", "Noto Sans SC", sans-serif;
          background: #050505;
          cursor: ${showCustomCursor ? "none" : "auto"};
        }
        .tracking-neon {
          font-family: "Black Han Sans", "Noto Sans SC", sans-serif;
          background: linear-gradient(90deg, #ff0055, #ffaa00, #ccff00, #00f3ff, #9d4edd, #ff0055);
          background-size: 200% auto;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          animation: tracking-shine 3s linear infinite;
        }
        @keyframes tracking-shine {
          to {
            background-position: 200% center;
          }
        }
      `}</style>

      {showCustomCursor ? (
        <>
          <div
            className="pointer-events-none fixed left-0 top-0 z-[120] h-3 w-3 rounded-full bg-[#ccff00] mix-blend-difference"
            style={{ transform: `translate(${mousePos.x - 6}px, ${mousePos.y - 6}px)` }}
          />
          <div
            className="pointer-events-none fixed left-0 top-0 z-[119] h-10 w-10 rounded-full border border-[#00f3ff]/70"
            style={{ transform: `translate(${mousePos.x - 20}px, ${mousePos.y - 20}px)` }}
          />
        </>
      ) : null}

      <div className="relative z-10 flex h-full w-full flex-col">
        <header className="mx-auto mt-3 flex w-[calc(100%-16px)] max-w-[1480px] items-center justify-between rounded-2xl border border-white/12 bg-black/30 px-3.5 py-2 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <Link
              href={`/lesson/${lessonId}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/12 bg-black/40 px-2.5 py-1 text-[11px] text-white/85 transition hover:bg-black/60 hover:text-white"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              返回课程
            </Link>
            <div className="flex flex-col leading-tight">
              <span className="text-[10px] uppercase tracking-[0.2em] text-white/45">Tracking · 整支挑战</span>
              <span className="tracking-neon text-[15px]">{lesson.title}</span>
            </div>
          </div>
        </header>

        <section
          className={`relative mx-auto my-2 grid min-h-0 w-[calc(100%-16px)] max-w-[1480px] flex-1 overflow-hidden rounded-[22px] border border-white/10 bg-transparent p-1 shadow-none transition-[grid-template-columns] duration-300 ${
            cinema ? "grid-cols-[0fr_1fr] gap-0" : "grid-cols-2 gap-1.5"
          }`}
        >
          <div className="relative h-full w-full overflow-hidden rounded-[18px] border border-white/12 bg-transparent">
            <video
              ref={teacherRef}
              src={teacherVideoSrc}
              poster={lesson.thumbnail}
              crossOrigin="anonymous"
              playsInline
              preload="auto"
              className="absolute inset-0 h-full w-full object-contain"
              onError={handleTeacherVideoError}
              onEnded={handleTeacherEnded}
            />
            {currentSegment?.particle_url ? (
              <SegmentParticleLayer
                key={currentSegment.id}
                src={currentSegment.particle_url}
                segStart={currentSegment.start}
                teacherTime={teacherPlayhead}
                playing={playing}
              />
            ) : null}

            <div className="pointer-events-none absolute left-3 top-3 rounded-full border border-white/15 bg-black/45 px-2.5 py-0.5 text-[10px] font-medium text-white/90 backdrop-blur">
              老师示范 · {currentSegment?.section_label ?? ""}
            </div>
          </div>

          <div className="relative h-full w-full overflow-hidden rounded-[18px] border border-white/12 bg-transparent">
            {cameraReady ? (
              <video
                ref={cameraRef}
                className="absolute inset-0 h-full w-full object-cover"
                style={{ transform: userMirror ? "scaleX(-1)" : "none" }}
                muted
                playsInline
              />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-4 text-center text-white/70">
                <Camera className="h-10 w-10 text-[#00f3ff]" />
                <div className="max-w-[340px] text-[12px] leading-5">
                  开启摄像头，对照左侧老师，
                  <br />
                  骨架或剪影会叠加在你身上。
                </div>
                {cameraError ? (
                  <div className="max-w-[400px] rounded-xl bg-red-500/15 px-4 py-2 text-[13px] text-red-200">
                    {cameraError}
                  </div>
                ) : null}
                <Button
                  onClick={handleStart}
                  className="rounded-full bg-gradient-to-r from-[#ff0055] via-[#9d4edd] to-[#00f3ff] px-4 py-2 text-[12px] text-white hover:brightness-110"
                >
                  <Camera className="h-3.5 w-3.5" />
                  开启摄像头
                </Button>
              </div>
            )}

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
                剪影加载中...
              </div>
            ) : null}

            {cameraReady && trackingOverlayLayer === "skeleton" ? (
              <AdaptiveSkeletonOverlay
                framesRef={teacherFramesRef}
                currentTimeSec={teacherPlayhead}
                currentTimeRef={teacherPlayheadRef}
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
                className="absolute bottom-4 left-3 scale-90 origin-bottom-left"
              />
            ) : null}

            {cameraReady && cinema && currentSegment ? (
              <div className="pointer-events-none absolute right-3 top-3 z-50 aspect-[9/16] w-[9vw] min-w-[96px] max-w-[150px] overflow-hidden rounded-xl border border-white/15 shadow-[0_12px_30px_rgba(0,0,0,0.5)]">
                <TeacherMiniWindow
                  lessonVideoUrl={teacherVideoSrc}
                  particleUrl={currentSegment.particle_url}
                  segStart={currentSegment.start}
                  lessonPlayhead={teacherPlayhead}
                  playing={playing}
                />
              </div>
            ) : null}
          </div>
        </section>

        <footer className="mx-auto mb-3 flex w-[calc(100%-16px)] max-w-[1480px] items-center gap-2 rounded-2xl border border-white/12 bg-black/30 px-2.5 py-1.5 backdrop-blur-md">
          <Button
            onClick={() => {
              if (playing) {
                setPlaying(false);
                return;
              }
              if (cameraReady) {
                void startTeacherPlayback(false, teacherMuted);
                return;
              }
              void handleStart();
            }}
            className="rounded-full bg-gradient-to-r from-[#ff0055] via-[#9d4edd] to-[#00f3ff] px-3.5 py-1.5 text-[12px] text-white hover:brightness-110"
          >
            {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            {playing ? "暂停" : cameraReady ? "继续" : "开始挑战"}
          </Button>

          <div className="flex min-w-0 flex-1 items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#ff0055] via-[#9d4edd] to-[#00f3ff] transition-[width] duration-100"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <span className="w-24 text-right font-mono text-[10px] text-white/55">
              {fmtTime(teacherPlayhead)} / {fmtTime(duration)}
            </span>
          </div>

          <button
            type="button"
            onClick={() => void toggleTeacherSound()}
            className={`inline-flex items-center gap-1 rounded-full border border-white/15 px-2 py-0.5 text-[10px] font-medium backdrop-blur transition ${
              teacherMuted ? "bg-white/8 text-white/85 hover:bg-white/16" : "bg-amber-400/25 text-amber-100"
            }`}
            title={teacherMuted ? "打开老师声音" : "关闭老师声音"}
          >
            {teacherMuted ? <VolumeX className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}
            {teacherMuted ? "开声音" : "有声音"}
          </button>

          <div className="scale-[0.84] origin-center">
            <CameraPicker currentDeviceId={selectedDeviceId} onChange={switchCamera} />
          </div>
          <div className="scale-[0.84] origin-center">
            <CameraControls
              stream={cameraStream}
              mirror={userMirror}
              onMirrorChange={setUserMirror}
              onReopenWithFacing={reopenWithFacing}
            />
          </div>

          <button
            type="button"
            onClick={toggleCinema}
            className={`inline-flex items-center gap-1 rounded-full border border-white/15 px-2 py-0.5 text-[10px] font-medium backdrop-blur transition ${
              cinema ? "bg-amber-400/25 text-amber-100" : "bg-white/8 text-white/85 hover:bg-white/16"
            }`}
            title={cinema ? "退出沉浸 (Esc)" : "沉浸模式 (摄像头全屏 + 老师小窗)"}
          >
            {cinema ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
            {cinema ? "退出沉浸" : "沉浸全屏"}
          </button>

          {cameraReady ? (
            <Button variant="ghost" onClick={stopCameraStream} className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] hover:bg-white/10">
              关闭摄像头
            </Button>
          ) : null}

          <span className="text-[10px] text-white/35">
            {trackingOverlayLayer === "silhouette"
              ? overlayStatus === "ready"
                ? "剪影已就位"
                : overlayStatus === "loading"
                  ? "剪影加载中..."
                  : ""
              : ""}
          </span>
        </footer>
      </div>
    </main>
  );
}
