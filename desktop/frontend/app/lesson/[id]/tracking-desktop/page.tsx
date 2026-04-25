"use client";

// 跟拍挑战(桌面版) · 整支为单位
//   主窗: 全屏用户摄像头 + 金色幽灵剪影(MatteOverlay) + 大动作烟火(FireworksOverlay)
//   小窗: 固定右上角 1/9 宽, 老师扣出来的原色前景(matte_rgb)+ 轩哥 33 点棍图骨架
//   评分: combo / 飘字 / 节奏判定 / 结算页,没有失败机制

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Camera, Pause, Play, Maximize2, Minimize2, Volume2, VolumeX } from "lucide-react";

import AdaptiveSkeletonOverlay from "@/components/tracking/AdaptiveSkeletonOverlay";
import MatteOverlay, { type MatteOverlayStatus } from "@/components/tracking/MatteOverlay";
import { type FireworkTrigger } from "@/components/tracking/FireworksOverlay";
import { useHitShakeClass, type HitLevel } from "@/components/tracking/HitEffects";
import SegmentParticleLayer from "@/components/tracking/SegmentParticleLayer";
import { type WristFrame } from "@/components/tracking/MotionTrailOverlay";
import CameraPicker from "@/components/tracking/CameraPicker";
import CameraControls from "@/components/tracking/CameraControls";
import MatteTuningPanel, { type MatteTuning, type TrackingOverlayLayer } from "@/components/tracking/MatteTuningPanel";
import TeacherMiniWindow from "@/components/tracking/TeacherMiniWindow";
import { Button } from "@/components/ui/button";
import { getLesson } from "@/lib/api";
import {
  findNearestTeacherFrame,
  scoreWithDTW,
  SmoothedScore,
  toGrade,
  type Grade,
  type Kpt,
  type TeacherFrame,
} from "@/lib/pose/scoring";
import { useLivePose } from "@/lib/pose/useLivePose";
import type { Lesson, Segment } from "@/lib/types";
import { fmtTime } from "@/lib/utils";

type ScoreEvent = {
  id: number;
  grade: Grade;
  value: number;
  x: number;
  y: number;
};

const BP_LEFT_WRIST = 15;
const BP_RIGHT_WRIST = 16;
const BP_LEFT_ANKLE = 27;
const BP_RIGHT_ANKLE = 28;
const BP_LEFT_HIP = 23;
const BP_RIGHT_HIP = 24;

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

  const [finished, setFinished] = React.useState(false);

  // 评分
  const teacherFramesRef = React.useRef<TeacherFrame[]>([]);
  const teacherFramesLoadedRef = React.useRef<Set<string>>(new Set());
  const teacherFramesCacheRef = React.useRef<Map<string, TeacherFrame[]>>(new Map());
  const teacherPoseAspectCacheRef = React.useRef<Map<string, number>>(new Map());
  const [teacherPoseAspect, setTeacherPoseAspect] = React.useState(DEFAULT_POSE_ASPECT);
  const smootherRef = React.useRef(new SmoothedScore(15));
  const [totalScore, setTotalScore] = React.useState(0);
  const totalScoreRef = React.useRef(0);
  const [combo, setCombo] = React.useState(0);
  const [maxCombo, setMaxCombo] = React.useState(0);
  const [tallies, setTallies] = React.useState<Record<Grade, number>>({ PERFECT: 0, GOOD: 0, OK: 0, MISS: 0 });
  const [scoreEvents, setScoreEvents] = React.useState<ScoreEvent[]>([]);
  const scoreEventSeq = React.useRef(0);
  // 命中震撼: 每次命中 +1, 同时记录 level 决定强度
  const [hitToken, setHitToken] = React.useState(0);
  const [hitLevel, setHitLevel] = React.useState<HitLevel>("strong");
  const shakeClass = useHitShakeClass(hitToken, hitLevel);
  // Motion Trail: 左右手腕历史帧 (normalized 坐标)
  const wristHistoryRef = React.useRef<WristFrame[]>([]);

  // 节奏判定: 在 beat 点附近才发评分事件
  const beatsRef = React.useRef<number[]>([]);
  const lastBeatIdxRef = React.useRef(-1);
  const BEAT_WINDOW = 0.18; // ±180ms

  // 烟火触发
  const [fireworks, setFireworks] = React.useState<FireworkTrigger[]>([]);
  const lastTriggerRef = React.useRef(0);
  const prevWristsRef = React.useRef<{ lx: number; ly: number; rx: number; ry: number; t: number } | null>(null);

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
        beatsRef.current = detail.beats ?? [];
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

  // BlazePose 实时评分
  const handleUserPose = React.useCallback((kpts: Kpt[]) => {
    // ① 烟火触发 + 手腕轨迹历史(Motion Trail)
    const prev = prevWristsRef.current;
    const lw = kpts[BP_LEFT_WRIST], rw = kpts[BP_RIGHT_WRIST];
    const now = performance.now();
    if (lw && rw) {
      // Motion Trail: 推入最新帧, 最多 28 帧/约 1 秒
      wristHistoryRef.current.push({
        lx: lw.x, ly: lw.y, lvis: lw.visibility,
        rx: rw.x, ry: rw.y, rvis: rw.visibility,
        t: now,
      });
      if (wristHistoryRef.current.length > 28) {
        wristHistoryRef.current.shift();
      }
    }
    if (lw && rw && prev && now - prev.t > 0 && now - lastTriggerRef.current > 450) {
      const dt = (now - prev.t) / 1000;
      const vL = Math.hypot(lw.x - prev.lx, lw.y - prev.ly) / dt;
      const vR = Math.hypot(rw.x - prev.rx, rw.y - prev.ry) / dt;
      const vMax = Math.max(vL, vR);
      if (vMax > 0.9 && lw.visibility > 0.4 && rw.visibility > 0.4) {
        lastTriggerRef.current = now;
        const src = vL > vR ? lw : rw;
        const fx = (1 - src.x) * 100;
        const fy = src.y * 100;
        setFireworks((prev) => [...prev.slice(-4), { id: scoreEventSeq.current++, x: fx, y: fy, at: now }]);
      }
    }
    prevWristsRef.current = lw && rw
      ? { lx: lw.x, ly: lw.y, rx: rw.x, ry: rw.y, t: now }
      : prev;

    // ② 评分(必须要老师数据 + 正在播放)
    const teacherFrames = teacherFramesRef.current;
    const tNow = teacherPlayheadRef.current;
    if (!teacherFrames.length || tNow <= 0 || !playing) return;

    // 节奏判定: 命中 beat 附近才计分
    const beats = beatsRef.current;
    if (!beats.length) return;
    // 找最近的未消费 beat
    let nearIdx = -1;
    for (let i = lastBeatIdxRef.current + 1; i < beats.length; i++) {
      const dt = tNow - beats[i];
      if (dt > BEAT_WINDOW) { lastBeatIdxRef.current = i; continue; }
      if (Math.abs(dt) <= BEAT_WINDOW) { nearIdx = i; break; }
      break;
    }
    if (nearIdx < 0) return;
    if (nearIdx <= lastBeatIdxRef.current) return;
    lastBeatIdxRef.current = nearIdx;

    const frameIdx = findNearestTeacherFrame(teacherFrames, tNow);
    const instant = scoreWithDTW(kpts, teacherFrames, frameIdx, 6);
    const smoothed = smootherRef.current.push(instant);
    const grade = toGrade(smoothed);

    const gain = grade === "PERFECT" ? 100 : grade === "GOOD" ? 60 : grade === "OK" ? 30 : 0;
    totalScoreRef.current += gain;
    setTotalScore(totalScoreRef.current);

    setTallies((prev) => ({ ...prev, [grade]: prev[grade] + 1 }));
    let nextCombo = 0;
    if (grade === "MISS") {
      setCombo(0);
    } else {
      setCombo((c) => {
        nextCombo = c + 1;
        setMaxCombo((m) => Math.max(m, nextCombo));
        return nextCombo;
      });
    }
    // 分级触发屏幕震撼:
    //   OK     -> soft
    //   GOOD   -> mid
    //   PERFECT-> strong
    //   每 10 combo milestone -> mega (强 + 顶配特效)
    if (grade !== "MISS") {
      const isMilestone = nextCombo > 0 && nextCombo % 10 === 0;
      const lvl: HitLevel = isMilestone
        ? "mega"
        : grade === "PERFECT"
        ? "strong"
        : grade === "GOOD"
        ? "mid"
        : "soft";
      setHitLevel(lvl);
      setHitToken((t) => t + 1);
    }

    // 飘字: 用核心关键点附近的位置
    const hip = kpts[BP_LEFT_HIP] && kpts[BP_RIGHT_HIP]
      ? { x: (kpts[BP_LEFT_HIP].x + kpts[BP_RIGHT_HIP].x) / 2, y: (kpts[BP_LEFT_HIP].y + kpts[BP_RIGHT_HIP].y) / 2 - 0.2 }
      : { x: 0.5, y: 0.4 };
    const pct = { x: (1 - hip.x) * 100, y: hip.y * 100 };
    setScoreEvents((prev) => [
      ...prev.slice(-6),
      { id: scoreEventSeq.current++, grade, value: gain, x: pct.x, y: pct.y },
    ]);
  }, [playing]);

  useLivePose({
    videoRef: cameraRef,
    active: cameraReady,
    onPose: handleUserPose,
    mirror: true,
  });

  // 老师视频播放/暂停/进度同步
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
  // 镜像翻转 state, 同时作用于摄像头 <video> 的 CSS transform 和 MatteOverlay 的 userMirror
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
  // facingMode (前/后摄像头), 用于 openStream fallback
  const [facingMode, setFacingMode] = React.useState<"user" | "environment">("user");

  // 沉浸模式: 摄像头全屏 + 老师视频缩小到右上角小窗
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

  // 切换摄像头: 停掉当前流 -> 换 deviceId -> 起新流 (只在已开启时立即切, 否则只记住选择)
  const reopenWithFacing = React.useCallback(async (facing: "user" | "environment") => {
    setFacingMode(facing);
    setSelectedDeviceId(null);
    if (typeof window !== "undefined") window.localStorage.removeItem(CAMERA_STORAGE_KEY);
    if (!streamRef.current) return;
    try {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      // 切前后摄像头时, 不再用 deviceId 约束
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
    setFinished(true);
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
    totalScoreRef.current = 0;
    setTotalScore(0);
    setCombo(0);
    setMaxCombo(0);
    setTallies({ PERFECT: 0, GOOD: 0, OK: 0, MISS: 0 });
    setFinished(false);
    lastBeatIdxRef.current = -1;
    smootherRef.current.reset();
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
    <main ref={mainRef} className="relative flex h-screen w-screen flex-col overflow-hidden bg-black text-white">
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

      {/* Stage: 普通模式左右各 50% / Cinema 模式右栏全屏左栏隐藏 */}
      <section
        className={`relative grid flex-1 overflow-hidden bg-black transition-[grid-template-columns] duration-300 ${
          cinema ? "grid-cols-[0fr_1fr] gap-0" : "grid-cols-2 gap-[2px]"
        }`}
      >
        {/* ─── 左栏 50%: 老师原视频 + 粒子叠加 ─── */}
        <div className="relative h-full w-full overflow-hidden bg-black">
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
          {/* 粒子引导视频 (跟随 teacherPlayhead - segStart, screen blend) */}
          {currentSegment?.particle_url ? (
            <SegmentParticleLayer
              key={currentSegment.id}
              src={currentSegment.particle_url}
              segStart={currentSegment.start}
              teacherTime={teacherPlayhead}
              playing={playing}
            />
          ) : null}

          <div className="pointer-events-none absolute left-4 top-4 rounded-full bg-black/55 px-3 py-1 text-[11px] font-medium text-white/85 backdrop-blur">
            老师示范 · {currentSegment?.section_label ?? ""}
          </div>
        </div>

        {/* ─── 右栏 50%: 摄像头 + 幽灵剪影 + 全 HUD ─── */}
        <div className="relative h-full w-full overflow-hidden bg-black">
          {cameraReady ? (
            <video
              ref={cameraRef}
              className="absolute inset-0 h-full w-full object-cover"
              style={{ transform: userMirror ? "scaleX(-1)" : "none" }}
              muted
              playsInline
            />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 px-6 text-center text-white/60">
              <Camera className="h-14 w-14" />
              <div className="max-w-[380px] text-[15px] leading-7">
                开启摄像头,对照左侧老师,<br />
                幽灵剪影会叠在你身上。
              </div>
              {cameraError ? (
                <div className="max-w-[400px] rounded-xl bg-red-500/15 px-4 py-2 text-[13px] text-red-200">
                  {cameraError}
                </div>
              ) : null}
              <Button onClick={handleStart} className="rounded-full px-6 py-3 text-[15px]">
                <Camera className="h-4 w-4" />
                开启摄像头
              </Button>
            </div>
          )}

          {/* 幽灵剪影 (object-contain 和摄像头同容器,覆盖整个右栏) */}
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
              className="absolute bottom-10 left-4"
            />
          ) : null}

          {/* Cinema 模式: 右上角浮动老师小窗 (整支视频 + 当前 segment 粒子)
              纵横比 9:16 锁定, 宽度按视口缩放但有上下限 */}
          {cameraReady && cinema && currentSegment ? (
            <div className="pointer-events-none absolute right-4 top-4 z-50 aspect-[9/16] w-[10vw] min-w-[110px] max-w-[180px] overflow-hidden rounded-xl border border-white/15 shadow-[0_18px_40px_rgba(0,0,0,0.6)]">
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

        <button
          type="button"
          onClick={toggleCinema}
          className={`inline-flex items-center gap-2 rounded-full border border-white/15 px-3 py-1.5 text-[12px] font-medium backdrop-blur transition ${
            cinema ? "bg-amber-400/25 text-amber-100" : "bg-white/8 text-white/85 hover:bg-white/16"
          }`}
          title={cinema ? "退出沉浸 (Esc)" : "沉浸模式 (摄像头全屏 + 老师小窗)"}
        >
          {cinema ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          {cinema ? "退出沉浸" : "沉浸全屏"}
        </button>

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
