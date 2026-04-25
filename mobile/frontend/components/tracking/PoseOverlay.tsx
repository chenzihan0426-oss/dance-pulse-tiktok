"use client";

// 摄像头上的骨架叠加层。
// 同时画两套骨架:
//   1) 用户实时骨架       —— 亮色,从摄像头 <video> 拉流,浏览器端 MediaPipe 推理
//   2) 老师半透明幽灵骨架 —— 灰白,从 segment 的 pose JSON 读,按时间播放
//
// 本组件只管画图,不管录制 / 评分。父组件传 videoElement 和 teacherPoseUrl 即可。

import * as React from "react";

import {
  getPoseLandmarker,
  landmarksToKeypoints,
} from "@/lib/pose/mediapipeClient";
import { drawSkeleton } from "@/lib/pose/skeleton";
import { loadPoseDoc, sampleFrame, type PoseDoc } from "@/lib/pose/types";

interface Props {
  // 用 ref 而非 current,防止父组件挂载时 ref 还没 populated 导致 null prop
  videoRef: React.RefObject<HTMLVideoElement>;
  teacherPoseUrl?: string;
  // 老师骨架相对自身开始播放的秒数。不传则走内部自动循环播放。
  playheadSec?: number;
  // 摄像头采用的镜像方向:前置摄像头习惯左右翻转,此时 userMirror=true
  userMirror?: boolean;
  // 关闭组件时父组件设成 false,内部的 RAF 会停
  active?: boolean;
  // 老师面板专用:只画预计算的 ghost,跳过 MediaPipe 实时推理。
  // 原因:PoseLandmarker 是单例 + VIDEO 模式,不能同时吃两个不同 video 源。
  teacherOnly?: boolean;
  className?: string;
  onStatus?: (status: OverlayStatus) => void;
}

export type OverlayStatus =
  | "loading-model"
  | "loading-teacher"
  | "ready"
  | "error";

export default function PoseOverlay({
  videoRef,
  teacherPoseUrl,
  playheadSec,
  userMirror = true,
  active = true,
  teacherOnly = false,
  className,
  onStatus,
}: Props) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = React.useState<OverlayStatus>("loading-model");
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
  const teacherDocRef = React.useRef<PoseDoc | null>(null);
  const landmarkerReadyRef = React.useRef(false);
  // RAF 闭包里每帧读 ref,父组件换值时即时生效
  const userMirrorRef = React.useRef(userMirror);
  const playheadRef = React.useRef<number | undefined>(playheadSec);
  React.useEffect(() => { userMirrorRef.current = userMirror; }, [userMirror]);
  React.useEffect(() => { playheadRef.current = playheadSec; }, [playheadSec]);

  React.useEffect(() => {
    onStatus?.(status);
  }, [status, onStatus]);

  // 加载老师骨架
  React.useEffect(() => {
    let cancelled = false;
    if (!teacherPoseUrl) {
      teacherDocRef.current = null;
      return;
    }
    setStatus((s) => (s === "ready" || s === "loading-teacher" ? "loading-teacher" : s));
    loadPoseDoc(teacherPoseUrl)
      .then((doc) => {
        if (cancelled) return;
        teacherDocRef.current = doc;
        if (landmarkerReadyRef.current) setStatus("ready");
      })
      .catch((err) => {
        if (cancelled) return;
        console.warn("[PoseOverlay] 老师骨架加载失败:", err);
        teacherDocRef.current = null;
      });
    return () => {
      cancelled = true;
    };
  }, [teacherPoseUrl]);

  // 加载 MediaPipe + 起 RAF
  // 注意:深度依赖 videoRef(RefObject),而不是 videoElement(DOM 节点),
  // 因为父组件挂载后 ref.current 才 populated,但组件 effect 已经跑过了。
  // 因此我们只依赖 active,effect 只跑一次,在 RAF 内部每帧重新读 ref.current。
  React.useEffect(() => {
    if (!active) return;

    let rafId: number | null = null;
    let disposed = false;
    const autoLoopStart = performance.now();
    let lastMpTs = -1;

    const run = async () => {
      let landmarker: Awaited<ReturnType<typeof getPoseLandmarker>> | null = null;
      if (!teacherOnly) {
        try {
          landmarker = await getPoseLandmarker();
        } catch (err) {
          if (disposed) return;
          console.warn("[PoseOverlay] MediaPipe 初始化失败:", err);
          setErrorMsg(err instanceof Error ? err.message : String(err));
          setStatus("error");
          return;
        }
      }
      landmarkerReadyRef.current = true;
      if (disposed) return;
      setStatus(teacherDocRef.current || !teacherPoseUrl ? "ready" : "loading-teacher");

      const tick = () => {
        if (disposed) return;
        const canvas = canvasRef.current;
        const videoElement = videoRef.current;
        if (!canvas || !videoElement || videoElement.readyState < 2) {
          rafId = requestAnimationFrame(tick);
          return;
        }

        // canvas 大小跟随 video 显示大小
        const vw = videoElement.videoWidth || videoElement.clientWidth;
        const vh = videoElement.videoHeight || videoElement.clientHeight;
        if (!vw || !vh) {
          rafId = requestAnimationFrame(tick);
          return;
        }
        if (canvas.width !== vw || canvas.height !== vh) {
          canvas.width = vw;
          canvas.height = vh;
        }
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          rafId = requestAnimationFrame(tick);
          return;
        }

        // 清屏(canvas 本身透明,盖在 video 上)
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // ① 老师幽灵骨架
        const teacher = teacherDocRef.current;
        if (teacher) {
          const head = playheadRef.current;
          const t =
            typeof head === "number"
              ? head
              : ((performance.now() - autoLoopStart) / 1000) %
                (teacher.end - teacher.start || 1);
          const frame = sampleFrame(teacher, t);
          if (frame?.kp) {
            drawSkeleton(ctx, frame.kp, canvas.width, canvas.height, {
              color: "#ffffff",
              width: 4,
              pointRadius: 5,
              alpha: 0.55,
              mirror: false, // 老师视频未镜像,保持原样
            });
          }
        }

        // ② 用户实时骨架 —— teacherOnly 模式下跳过,老师面板不跑 MediaPipe
        if (landmarker) {
          const nowMs = performance.now();
          const mpTs = Math.max(lastMpTs + 1, Math.floor(nowMs));
          lastMpTs = mpTs;
          try {
            const result = landmarker.detectForVideo(videoElement, mpTs);
            if (result.landmarks && result.landmarks.length > 0) {
              const kp = landmarksToKeypoints(result.landmarks[0] as any);
              drawSkeleton(ctx, kp, canvas.width, canvas.height, {
                color: "#a855f7", // violet-500 与产品主色一致
                width: 5,
                pointRadius: 6,
                alpha: 0.9,
                mirror: userMirrorRef.current,
              });
            }
          } catch (err) {
            // 单帧失败不中断 RAF,只吃掉错误
          }
        }

        rafId = requestAnimationFrame(tick);
      };

      rafId = requestAnimationFrame(tick);
    };

    run();

    return () => {
      disposed = true;
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
    // 故意不依赖 videoRef(它稳定) / userMirror / playheadSec / teacherPoseUrl:
    // 前者稳定不变,后三者变化时我们在 RAF 内部每帧重新读 ref / prop,不需要重建 effect
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  return (
    <>
      <canvas
        ref={canvasRef}
        className={className ?? "pointer-events-none absolute inset-0 h-full w-full"}
        aria-hidden
      />
      {status === "error" && errorMsg ? (
        <div className="absolute inset-x-3 top-3 rounded-xl bg-red-600/80 px-3 py-2 text-[12px] text-white">
          骨架引擎加载失败: {errorMsg}
        </div>
      ) : null}
    </>
  );
}
