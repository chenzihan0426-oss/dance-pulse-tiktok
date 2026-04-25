"use client";

// 跟拍挑战(桌面版) · 整支为单位
//   主窗: 全屏用户摄像头 + 金色幽灵剪影(MatteOverlay) + 大动作烟火(FireworksOverlay)
//   小窗: 固定右上角 1/9 宽, 老师扣出来的原色前景(matte_rgb)+ 轩哥 33 点棍图骨架
//   评分: combo / 飘字 / 节奏判定 / 结算页,没有失败机制

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Camera, Pause, Play } from "lucide-react";

import MatteOverlay, { type MatteOverlayStatus } from "@/components/tracking/MatteOverlay";
import FireworksOverlay, { type FireworkTrigger } from "@/components/tracking/FireworksOverlay";
import GameHud from "@/components/tracking/GameHud";
import HitEffects, { useHitShakeClass, type HitLevel } from "@/components/tracking/HitEffects";
import CameraPicker from "@/components/tracking/CameraPicker";
import CameraControls from "@/components/tracking/CameraControls";
import FramingGuide, { type BodyBounds } from "@/components/tracking/FramingGuide";
import BackgroundPulseOverlay from "@/components/tracking/BackgroundPulseOverlay";
import SpeedLinesOverlay from "@/components/tracking/SpeedLinesOverlay";
import MotionTrailOverlay, { type WristFrame } from "@/components/tracking/MotionTrailOverlay";
import ResultSummary from "@/components/tracking/ResultSummary";
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

  // lesson video 作为整支挑战的"老师时间线"
  const teacherRef = React.useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = React.useState(false);
  const [teacherPlayhead, setTeacherPlayhead] = React.useState(0);
  const teacherPlayheadRef = React.useRef(0);
  React.useEffect(() => { teacherPlayheadRef.current = teacherPlayhead; }, [teacherPlayhead]);

  const [finished, setFinished] = React.useState(false);

  // 评分
  const teacherFramesRef = React.useRef<TeacherFrame[]>([]);
  const teacherFramesLoadedRef = React.useRef<Set<string>>(new Set());
  const smootherRef = React.useRef(new SmoothedScore(15));
  const [totalScore, setTotalScore] = React.useState(0);
  const totalScoreRef = React.useRef(0);
  const [combo, setCombo] = React.useState(0);
  const [maxCombo, setMaxCombo] = React.useState(0);
  const [tallies, setTallies] = React.useState<Record<Grade, number>>({ PERFECT: 0, GOOD: 0, OK: 0, MISS: 0 });
  const [scoreEvents, setScoreEvents] = React.useState<ScoreEvent[]>([]);
  const scoreEventSeq = React.useRef(0);
  // 分级命中震撼: 每次命中 +1, level 决定效果强度
  const [hitToken, setHitToken] = React.useState(0);
  const [hitLevel, setHitLevel] = React.useState<HitLevel>("strong");
  const shakeClass = useHitShakeClass(hitToken, hitLevel);
  // Motion Trail 手腕历史 (normalized)
  const wristHistoryRef = React.useRef<WristFrame[]>([]);
  // Framing Guide: 实时 body bbox
  const bodyBoundsRef = React.useRef<BodyBounds | null>(null);

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
      return;
    }
    if (teacherFramesLoadedRef.current.has(currentSegment.id)) return;
    const url = currentSegment.pose_full_url;
    const segStart = currentSegment.start;
    teacherFramesLoadedRef.current.add(currentSegment.id);
    fetch(url)
      .then((res) => res.json())
      .then((doc: { frames: Array<{ t: number; detected: boolean; keypoints: Array<{ x: number; y: number; z: number; visibility: number }> }> }) => {
        // 转成 TeacherFrame[],时间偏移到 lesson 级
        const frames: TeacherFrame[] = doc.frames
          .filter((f) => f.detected)
          .map((f) => ({
            t: f.t + segStart,
            keypoints: f.keypoints.map((kp) => ({ x: kp.x, y: kp.y, z: kp.z ?? 0, visibility: kp.visibility })),
          }));
        teacherFramesRef.current = frames;
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
      wristHistoryRef.current.push({
        lx: lw.x, ly: lw.y, lvis: lw.visibility,
        rx: rw.x, ry: rw.y, rvis: rw.visibility,
        t: now,
      });
      if (wristHistoryRef.current.length > 28) wristHistoryRef.current.shift();
    }
    // Body bounds (FramingGuide)
    {
      const ids = [0, 11, 12, 23, 24, 27, 28, 29, 30, 31, 32];
      const vis = ids.map((i) => kpts[i]).filter((k) => k && k.visibility > 0.4);
      if (vis.length >= 3) {
        let minY = 1, maxY = 0, minX = 1, maxX = 0, minV = 1;
        for (const k of vis) {
          if (k.y < minY) minY = k.y;
          if (k.y > maxY) maxY = k.y;
          if (k.x < minX) minX = k.x;
          if (k.x > maxX) maxX = k.x;
          if (k.visibility < minV) minV = k.visibility;
        }
        bodyBoundsRef.current = { topY: minY, botY: maxY, leftX: minX, rightX: maxX, vis: minV };
      } else {
        bodyBoundsRef.current = null;
      }
    }
    if (lw && rw && prev && now - prev.t > 0 && now - lastTriggerRef.current > 450) {
      const dt = (now - prev.t) / 1000;
      const vL = Math.hypot(lw.x - prev.lx, lw.y - prev.ly) / dt;
      const vR = Math.hypot(rw.x - prev.rx, rw.y - prev.ry) / dt;
      const vMax = Math.max(vL, vR);
      // 阈值降到 0.9(归一化/秒) —— 普通挥手就能触发
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
    if (playing) {
      void v.play().catch(() => setPlaying(false));
    } else {
      v.pause();
    }
  }, [playing]);

  React.useEffect(() => {
    if (!playing) return;
    let rafId = 0;
    const tick = () => {
      const v = teacherRef.current;
      if (v) setTeacherPlayhead(v.currentTime);
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
  const [facingMode, setFacingMode] = React.useState<"user" | "environment">("user");

  const openStream = React.useCallback(async (deviceId: string | null, facing?: "user" | "environment") => {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("当前浏览器不支持摄像头,请更换 Chrome / Edge 重试。");
    }
    const baseCon: MediaTrackConstraints = { width: { ideal: 1280 }, height: { ideal: 720 } };
    const video: MediaTrackConstraints = deviceId
      ? { ...baseCon, deviceId: { exact: deviceId } }
      : { ...baseCon, facingMode: facing ?? facingMode };
    return navigator.mediaDevices.getUserMedia({ video, audio: false });
  }, [facingMode]);

  const ensureCameraReady = React.useCallback(async () => {
    if (streamRef.current) return;
    const stream = await openStream(selectedDeviceId);
    streamRef.current = stream;
    setCameraReady(true);
    setCameraError(null);
  }, [openStream, selectedDeviceId]);

  React.useEffect(() => {
    if (!cameraRef.current || !streamRef.current) return;
    cameraRef.current.srcObject = streamRef.current;
    void cameraRef.current.play().catch(() => null);
  }, [cameraReady]);

  const stopCameraStream = React.useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraReady(false);
  }, []);

  React.useEffect(() => () => { stopCameraStream(); }, [stopCameraStream]);

  const reopenWithFacing = React.useCallback(async (facing: "user" | "environment") => {
    setFacingMode(facing);
    if (!streamRef.current) return;
    try {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      const stream = await openStream(null, facing);
      streamRef.current = stream;
      if (cameraRef.current) {
        cameraRef.current.srcObject = stream;
        void cameraRef.current.play().catch(() => null);
      }
      setCameraError(null);
    } catch (err) {
      setCameraError(err instanceof Error ? err.message : String(err));
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
      if (cameraRef.current) {
        cameraRef.current.srcObject = stream;
        void cameraRef.current.play().catch(() => null);
      }
      setCameraError(null);
    } catch (err) {
      setCameraError(err instanceof Error ? err.message : String(err));
      setCameraReady(false);
    }
  }, [openStream]);

  const [overlayStatus, setOverlayStatus] = React.useState<MatteOverlayStatus>("idle");

  const handleStart = async () => {
    try {
      await ensureCameraReady();
    } catch (err) {
      setCameraError(err instanceof Error ? err.message : String(err));
      return;
    }
    // 重置
    totalScoreRef.current = 0;
    setTotalScore(0);
    setCombo(0);
    setMaxCombo(0);
    setTallies({ PERFECT: 0, GOOD: 0, OK: 0, MISS: 0 });
    setFinished(false);
    lastBeatIdxRef.current = -1;
    smootherRef.current.reset();
    if (teacherRef.current) teacherRef.current.currentTime = 0;
    setTeacherPlayhead(0);
    setPlaying(true);
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
    <main className={`relative flex h-screen w-screen flex-col overflow-hidden bg-[radial-gradient(1200px_600px_at_50%_-10%,#2a1454_0%,#0a0414_55%)] text-white ${shakeClass}`}>
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
          src={lesson.video_url}
          crossOrigin="anonymous"
          muted
          playsInline
          className="pointer-events-none absolute left-0 top-0 h-1 w-1 opacity-0"
          onEnded={() => { setPlaying(false); setFinished(true); }}
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
          {cameraReady && currentSegment?.matte_rgb_url && currentSegment?.matte_mask_url ? (
            <MatteOverlay
              rgbUrl={currentSegment.matte_rgb_url}
              maskUrl={currentSegment.matte_mask_url}
              userMirror={userMirror}
              playing={playing}
              playbackRate={1}
              currentTimeSec={Math.max(0, teacherPlayhead - currentSegment.start)}
              onStatus={setOverlayStatus}
            />
          ) : cameraReady ? (
            <div className="pointer-events-none absolute bottom-20 left-1/2 -translate-x-1/2 rounded-full bg-black/55 px-3 py-1 text-[10px] text-white/60 backdrop-blur">
              幽灵剪影加载中...
            </div>
          ) : null}

          {/* 烟火 */}
          {cameraReady ? <FramingGuide boundsRef={bodyBoundsRef} cameraReady={cameraReady} /> : null}
          {cameraReady ? <FireworksOverlay triggers={fireworks} /> : null}
          {cameraReady ? <MotionTrailOverlay historyRef={wristHistoryRef} mirror /> : null}
          {cameraReady ? <BackgroundPulseOverlay hitToken={hitToken} level={hitLevel} /> : null}
          {cameraReady ? <SpeedLinesOverlay hitToken={hitToken} level={hitLevel} /> : null}

          {/* 命中震撼效果: flash / vignette / chroma + fever 持续光晕 */}
          {cameraReady ? <HitEffects hitToken={hitToken} combo={combo} level={hitLevel} /> : null}

          {/* ═════ 游戏化 HUD ═════ */}
          {cameraReady ? (
            <GameHud
              totalScore={totalScore}
              combo={combo}
              playing={playing}
              sectionLabel={currentSegment?.section_label}
              playhead={teacherPlayhead}
              duration={duration}
              events={scoreEvents}
            />
          ) : null}
        </div>

        {/* 结算页 */}
        {finished ? (
          <ResultSummary
            totalScore={totalScore}
            tallies={tallies}
            maxCombo={maxCombo}
            onReplay={() => {
              setFinished(false);
              void handleStart();
            }}
            lessonId={lessonId}
          />
        ) : null}
      </section>

      {/* Footer */}
      <footer className="flex items-center gap-4 border-t border-white/6 bg-black/40 px-6 py-3 backdrop-blur">
        <Button
          onClick={() => (playing ? setPlaying(false) : (cameraReady ? setPlaying(true) : handleStart()))}
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

        <CameraPicker currentDeviceId={selectedDeviceId} onChange={switchCamera} />
        <CameraControls
          stream={streamRef.current}
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
          {overlayStatus === "ready" ? "剪影已就位" : overlayStatus === "loading" ? "剪影加载中..." : ""}
        </span>
      </footer>
    </main>
  );
}
