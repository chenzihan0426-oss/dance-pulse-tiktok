"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  Camera,
  Loader2,
  Send,
  Upload,
  Video,
  WandSparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import PoseOverlay, { type OverlayStatus } from "@/components/tracking/PoseOverlay";
import {
  getLesson,
  getTrackingResults,
  publishTrackingResult,
  submitTrackingVideo,
} from "@/lib/api";
import type { Lesson, TrackingResult } from "@/lib/types";
import { fmtTime } from "@/lib/utils";

type CaptureMode = "record" | "upload";

const MIME_CANDIDATES = [
  "video/mp4;codecs=h264",
  "video/webm;codecs=vp9",
  "video/webm;codecs=vp8",
  "video/webm",
];

export default function TrackingChallengePage() {
  const params = useParams<{ id: string }>();
  const lessonId = params?.id ?? "";

  const [lesson, setLesson] = React.useState<Lesson | null>(null);
  const [history, setHistory] = React.useState<TrackingResult[]>([]);
  const [result, setResult] = React.useState<TrackingResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [submitting, setSubmitting] = React.useState(false);
  const [publishing, setPublishing] = React.useState(false);
  const [mode, setMode] = React.useState<CaptureMode>("record");
  const [cameraReady, setCameraReady] = React.useState(false);
  const [cameraError, setCameraError] = React.useState<string | null>(null);
  const [countdown, setCountdown] = React.useState<number | null>(null);
  const [recording, setRecording] = React.useState(false);
  const [elapsed, setElapsed] = React.useState(0);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const [captureFile, setCaptureFile] = React.useState<File | null>(null);
  const cameraRef = React.useRef<HTMLVideoElement>(null);
  const previewRef = React.useRef<HTMLVideoElement>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const recorderRef = React.useRef<MediaRecorder | null>(null);
  const chunksRef = React.useRef<Blob[]>([]);
  const timerRef = React.useRef<number | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const beginRecordingRef = React.useRef<(() => Promise<void>) | null>(null);
  const [overlayEnabled, setOverlayEnabled] = React.useState(true);
  const [overlayStatus, setOverlayStatus] = React.useState<OverlayStatus>("loading-model");

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);

    Promise.all([getLesson(lessonId), getTrackingResults(lessonId)])
      .then(([detail, results]) => {
        if (cancelled) return;
        setLesson(detail);
        setHistory(results);
        setResult(results[0] ?? null);
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [lessonId]);

  React.useEffect(() => {
    if (!cameraRef.current || !streamRef.current) return;
    cameraRef.current.srcObject = streamRef.current;
    // muted playsInline 的 video 默认会自动起播,但部分浏览器在 srcObject 场景下仍需显式 play()
    void cameraRef.current.play().catch(() => null);
  }, [cameraReady]);

  React.useEffect(() => {
    if (!previewRef.current || !previewUrl) return;
    previewRef.current.load();
  }, [previewUrl]);

  React.useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) {
      setCountdown(null);
      void beginRecordingRef.current?.();
      return;
    }

    const timeout = window.setTimeout(() => setCountdown((value) => (value ?? 1) - 1), 1000);
    return () => window.clearTimeout(timeout);
  }, [countdown]);

  React.useEffect(() => {
    if (!recording) return;
    timerRef.current = window.setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => {
      if (timerRef.current !== null) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [recording]);

  React.useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      stopCameraStream();
    };
  }, [previewUrl]);

  const segmentMap = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const segment of lesson?.segments ?? []) {
      map.set(segment.id, `${segment.section_label} · 第 ${segment.index + 1} 张`);
    }
    return map;
  }, [lesson]);

  const practiceSegments = React.useMemo(
    () => lesson?.segments.filter((segment) => !segment.deleted && !segment.is_still) ?? [],
    [lesson]
  );

  // 取第一支非静止片段的老师骨架作为默认幽灵叠加
  const teacherPoseUrl = React.useMemo(() => {
    const seg = practiceSegments.find((s) => s.pose_url) ?? lesson?.segments.find((s) => s.pose_url);
    return seg?.pose_url ?? undefined;
  }, [practiceSegments, lesson]);

  const ensureCameraReady = React.useCallback(async () => {
    if (streamRef.current) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("当前浏览器不支持摄像头录制，请改用上传视频。");
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: "user",
        width: { ideal: 720 },
        height: { ideal: 1280 },
      },
      audio: false,
    });

    streamRef.current = stream;
    if (cameraRef.current) {
      cameraRef.current.srcObject = stream;
      await cameraRef.current.play().catch(() => null);
    }
    setCameraReady(true);
    setCameraError(null);
  }, []);

  const beginRecording = React.useCallback(async () => {
    try {
      await ensureCameraReady();
      const stream = streamRef.current;
      if (!stream) return;

      const mimeType = getSupportedMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);

      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "video/webm" });
        const nextPreviewUrl = URL.createObjectURL(blob);
        setPreviewUrl((current) => {
          if (current) URL.revokeObjectURL(current);
          return nextPreviewUrl;
        });
        setCaptureFile(makeCaptureFile(blob, recorder.mimeType));
        setRecording(false);
      };

      recorderRef.current = recorder;
      setElapsed(0);
      setRecording(true);
      recorder.start(250);
    } catch (err) {
      setCameraError(err instanceof Error ? err.message : String(err));
    }
  }, [ensureCameraReady]);

  React.useEffect(() => {
    beginRecordingRef.current = beginRecording;
  }, [beginRecording]);

  function handleStartRecording() {
    setCaptureFile(null);
    setPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
    setCountdown(3);
  }

  function handleStopRecording() {
    recorderRef.current?.stop();
  }

  function stopCameraStream() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraReady(false);
  }

  function handlePickedFile(file: File | null) {
    if (!file) return;
    setCaptureFile(file);
    const nextPreviewUrl = URL.createObjectURL(file);
    setPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return nextPreviewUrl;
    });
  }

  async function handleAnalyze() {
    if (!captureFile || !lesson) return;
    setSubmitting(true);
    try {
      const nextResult = await submitTrackingVideo(lesson.id, captureFile);
      const nextHistory = await getTrackingResults(lesson.id);
      setResult(nextResult);
      setHistory(nextHistory);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePublish() {
    if (!result) return;
    setPublishing(true);
    try {
      const nextResult = await publishTrackingResult(result.id);
      const nextHistory = await getTrackingResults(lessonId);
      setResult(nextResult);
      setHistory(nextHistory);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPublishing(false);
    }
  }

  if (loading) {
    return (
      <main className="mx-auto min-h-screen max-w-md px-5 py-8 text-white">
        <div className="h-[320px] animate-pulse rounded-[32px] bg-bg-raised" />
      </main>
    );
  }

  if (error && !lesson) {
    return (
      <main className="mx-auto min-h-screen max-w-md px-5 py-8 text-white">
        <div className="rounded-[24px] border border-state-danger/20 bg-state-danger/10 px-5 py-5 text-sm text-red-200">
          {error}
        </div>
      </main>
    );
  }

  if (!lesson) return null;

  return (
    <main className="mx-auto min-h-screen max-w-md px-5 pb-10 pt-8 text-white">
      <Link
        href={`/lesson/${lesson.id}`}
        className="inline-flex items-center gap-2 text-sm text-white/45 transition hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" />
        返回课程页
      </Link>

      <section className="mt-6 overflow-hidden rounded-[32px] border border-white/8 bg-bg-raised">
        <div className="bg-[linear-gradient(135deg,rgba(236,72,153,0.18)_0%,rgba(23,19,37,1)_58%)] px-6 py-6">
          <div className="inline-flex items-center gap-2 rounded-full bg-accent-pink/15 px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-accent-pinkSoft">
            <WandSparkles className="h-3.5 w-3.5" />
            Tracking
          </div>
          <h1 className="mt-4 text-[28px] font-semibold tracking-tight text-white">跟拍挑战</h1>
          <p className="mt-3 text-[14px] leading-6 text-white/55">
            看老师整段示范，录一遍你的版本；满意的话可以一键发布到社区。
          </p>
        </div>

        <div className="space-y-5 px-5 py-5">
          <section className="overflow-hidden rounded-[26px] border border-white/8 bg-black/20">
            <div className="border-b border-white/8 px-4 py-3 text-[13px] text-white/58">
              老师示范 · {lesson.title}
            </div>
            <div className="aspect-[9/16] bg-black">
              <video
                src={lesson.video_url}
                poster={lesson.thumbnail}
                className="h-full w-full object-contain"
                controls
                loop
                playsInline
              />
            </div>
          </section>

          <div className="grid grid-cols-2 gap-3 rounded-[22px] bg-white/[0.04] p-1">
            <button
              type="button"
              onClick={() => setMode("record")}
              className={[
                "rounded-[18px] px-4 py-3 text-sm font-medium transition",
                mode === "record" ? "bg-brand text-white" : "text-white/55 hover:bg-white/5",
              ].join(" ")}
            >
              直接录制
            </button>
            <button
              type="button"
              onClick={() => setMode("upload")}
              className={[
                "rounded-[18px] px-4 py-3 text-sm font-medium transition",
                mode === "upload" ? "bg-brand text-white" : "text-white/55 hover:bg-white/5",
              ].join(" ")}
            >
              上传视频
            </button>
          </div>

          {mode === "record" ? (
            <section className="overflow-hidden rounded-[26px] border border-white/8 bg-black/20">
              <div className="border-b border-white/8 px-4 py-3 text-[13px] text-white/58">
                你的画面
              </div>
              <div className="relative aspect-[9/16] bg-black">
                {cameraReady ? (
                  <video
                    ref={cameraRef}
                    className="h-full w-full object-cover"
                    style={{ transform: "scaleX(-1)" }}
                    muted
                    playsInline
                  />
                ) : (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-4 text-center text-white/45">
                    <Camera className="h-8 w-8" />
                    <div className="max-w-[220px] text-sm leading-6">
                      开启摄像头后可以直接跟拍录制。如果浏览器不支持，也可以切到上传视频。
                    </div>
                  </div>
                )}

                {cameraReady && overlayEnabled ? (
                  <PoseOverlay
                    videoRef={cameraRef}
                    teacherPoseUrl={teacherPoseUrl}
                    userMirror
                    active
                    onStatus={setOverlayStatus}
                  />
                ) : null}

                {cameraReady && overlayEnabled ? (
                  <div className="pointer-events-none absolute right-3 top-3 rounded-full bg-black/55 px-3 py-1 text-[11px] font-medium text-white/85 backdrop-blur">
                    {overlayStatus === "ready"
                      ? "骨架追踪已开启"
                      : overlayStatus === "error"
                      ? "骨架追踪加载失败"
                      : overlayStatus === "loading-teacher"
                      ? "加载老师动作..."
                      : "加载骨架引擎..."}
                  </div>
                ) : null}

                {countdown !== null ? (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/38 text-[72px] font-semibold text-white">
                    {countdown}
                  </div>
                ) : null}

                {recording ? (
                  <div className="absolute left-4 top-4 rounded-full bg-red-500/90 px-3 py-1 text-[12px] font-medium text-white">
                    REC · {fmtTime(elapsed)}
                  </div>
                ) : null}
              </div>

              <div className="flex flex-wrap gap-3 px-4 py-4">
                {!cameraReady ? (
                  <Button onClick={async () => {
                    try {
                      await ensureCameraReady();
                    } catch (err) {
                      setCameraError(err instanceof Error ? err.message : String(err));
                    }
                  }} className="rounded-[16px]">
                    <Camera className="h-4 w-4" />
                    开启摄像头
                  </Button>
                ) : null}
                {cameraReady && !recording ? (
                  <Button onClick={handleStartRecording} className="rounded-[16px]">
                    <Video className="h-4 w-4" />
                    开始倒计时
                  </Button>
                ) : null}
                {recording ? (
                  <Button variant="secondary" onClick={handleStopRecording} className="rounded-[16px]">
                    停止录制
                  </Button>
                ) : null}
                {cameraReady ? (
                  <Button
                    variant="ghost"
                    onClick={() => setOverlayEnabled((v) => !v)}
                    className="rounded-[16px]"
                    title="切换骨架叠加层"
                  >
                    {overlayEnabled ? "关闭骨架" : "打开骨架"}
                  </Button>
                ) : null}
                {cameraReady ? (
                  <Button variant="ghost" onClick={stopCameraStream} className="rounded-[16px]">
                    关闭摄像头
                  </Button>
                ) : null}
              </div>

              {cameraError ? <div className="px-4 pb-4 text-sm text-red-200">{cameraError}</div> : null}
            </section>
          ) : (
            <section className="rounded-[26px] border border-white/8 bg-white/[0.03] p-4">
              <div className="text-[14px] text-white/60">
                上传一段你已经拍好的跟拍视频，支持 `mp4 / mov / webm`。
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="video/mp4,video/quicktime,video/webm"
                className="hidden"
                onChange={(event) => handlePickedFile(event.target.files?.[0] ?? null)}
              />
              <Button
                variant="secondary"
                onClick={() => fileInputRef.current?.click()}
                className="mt-4 h-11 w-full rounded-[16px]"
              >
                <Upload className="h-4 w-4" />
                选择视频
              </Button>
            </section>
          )}

          {previewUrl ? (
            <section className="overflow-hidden rounded-[26px] border border-white/8 bg-black/20">
              <div className="border-b border-white/8 px-4 py-3 text-[13px] text-white/58">待处理预览</div>
              <div className="aspect-[9/16] bg-black">
                <video
                  ref={previewRef}
                  src={previewUrl}
                  className="h-full w-full object-contain"
                  controls
                  playsInline
                />
              </div>
              <div className="px-4 py-4">
                <Button
                  onClick={handleAnalyze}
                  disabled={!captureFile || submitting}
                  className="h-11 w-full rounded-[16px]"
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  生成结果
                </Button>
              </div>
            </section>
          ) : null}

          {error ? (
            <div className="rounded-[20px] border border-state-danger/20 bg-state-danger/10 px-4 py-4 text-sm text-red-200">
              {error}
            </div>
          ) : null}

          {result ? (
            <section className="rounded-[28px] border border-brand/20 bg-[linear-gradient(135deg,rgba(168,85,247,0.16)_0%,rgba(23,19,37,1)_68%)] p-5">
              <div className="text-[13px] uppercase tracking-[0.18em] text-brand-light/85">本次结果</div>
              <div className="mt-4 flex items-end justify-between gap-4">
                <div>
                  <div className="text-[48px] font-semibold leading-none text-white">{result.score}</div>
                  <div className="mt-2 text-[13px] text-white/50">总分 · 先按时长和动作能量给一版估分</div>
                </div>
                <div className="rounded-full bg-white/10 px-4 py-2 text-[13px] text-white/70">
                  {new Date(result.createdAt).toLocaleString("zh-CN", {
                    month: "2-digit",
                    day: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>
              </div>

              <div className="mt-5 flex flex-wrap gap-3">
                {!result.isPublic ? (
                  <Button onClick={handlePublish} disabled={publishing} className="rounded-[16px]">
                    {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <WandSparkles className="h-4 w-4" />}
                    发布到社区
                  </Button>
                ) : (
                  <Link href={`/community/result/${result.id}`}>
                    <Button className="rounded-[16px]">查看社区作品页</Button>
                  </Link>
                )}
                <Link href="/community">
                  <Button variant="secondary" className="rounded-[16px]">去逛社区</Button>
                </Link>
              </div>

              <div className="mt-5 space-y-3">
                {result.segmentScores.slice(0, 6).map((item) => (
                  <div key={item.segmentId} className="rounded-[18px] border border-white/8 bg-black/18 px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-[14px] font-medium text-white">
                          {segmentMap.get(item.segmentId) ?? item.segmentId}
                        </div>
                        <div className="mt-1 text-[12px] text-white/45">时序偏差约 {item.timingMs}ms</div>
                      </div>
                      <div className="text-[20px] font-semibold text-white">{item.score}</div>
                    </div>
                    <div className="mt-3 h-2 rounded-full bg-white/10">
                      <div className="h-full rounded-full bg-brand" style={{ width: `${item.score}%` }} />
                    </div>
                  </div>
                ))}
              </div>

              {practiceSegments[0] ? (
                <Link
                  href={`/player/${practiceSegments[0].id}?lesson=${lesson.id}`}
                  className="mt-5 inline-flex items-center text-sm text-brand-light transition hover:text-white"
                >
                  回到动作卡复习薄弱段落
                </Link>
              ) : null}
            </section>
          ) : null}

          <section className="rounded-[24px] border border-white/8 bg-white/[0.03] p-4">
            <div className="text-[15px] font-semibold text-white">最近挑战</div>
            <div className="mt-4 space-y-3">
              {history.length === 0 ? (
                <div className="rounded-[18px] bg-black/18 px-4 py-4 text-sm text-white/45">
                  还没有挑战记录，先录一遍生成你的第一份记录。
                </div>
              ) : (
                history.slice(0, 5).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setResult(item)}
                    className="flex w-full items-center justify-between rounded-[18px] border border-white/8 bg-black/18 px-4 py-3 text-left transition hover:bg-black/26"
                  >
                    <div>
                      <div className="text-[14px] font-medium text-white">
                        {item.score} 分 {item.isPublic ? "· 已发布" : ""}
                      </div>
                      <div className="mt-1 text-[12px] text-white/45">
                        {new Date(item.createdAt).toLocaleString("zh-CN", {
                          month: "2-digit",
                          day: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                    </div>
                    <div className="text-[12px] text-white/35">{item.segmentScores.length} 段</div>
                  </button>
                ))
              )}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}

function getSupportedMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return MIME_CANDIDATES.find((item) => MediaRecorder.isTypeSupported(item));
}

function makeCaptureFile(blob: Blob, mimeType: string): File {
  const extension = mimeType.includes("mp4")
    ? "mp4"
    : mimeType.includes("quicktime")
      ? "mov"
      : "webm";
  return new File([blob], `tracking-${Date.now()}.${extension}`, {
    type: mimeType || `video/${extension}`,
  });
}
