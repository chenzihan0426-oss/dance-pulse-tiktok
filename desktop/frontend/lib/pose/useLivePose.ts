"use client";

// 浏览器端实时 pose 检测 hook。
//
// 每 RAF 在摄像头 <video> 上跑 MediaPipe PoseLandmarker(底层是 BlazePose),
// 把检测到的 33 关键点通过 onPose 回调扔给调用方。调用方负责评分/画图。
//
// 单独封装成 hook 的好处:
//   - 可视化组件(MatteOverlay 等)专注渲染,评分组件专注打分,互不干扰
//   - PoseLandmarker 已经是 mediapipeClient 的单例,可以多组件共享

import * as React from "react";

import { getPoseLandmarker, landmarksToKeypoints } from "./mediapipeClient";
import type { Kpt } from "./scoring";

export interface UseLivePoseOpts {
  videoRef: React.RefObject<HTMLVideoElement>;
  active: boolean;
  // 每次检测到新 pose 时调用。注意:高频(接近 RAF 频率),内部不要做重活。
  onPose: (kpts: Kpt[]) => void;
  onError?: (err: unknown) => void;
  // 镜像:如果 video 是 CSS-mirrored 的,传 true,内部会把 x 翻成 1-x,
  // 这样关键点坐标和"用户看到自己的画面"对齐,评分也才和老师 raw 坐标可比。
  mirror?: boolean;
}

export function useLivePose({
  videoRef,
  active,
  onPose,
  onError,
  mirror = true,
}: UseLivePoseOpts): { ready: boolean } {
  const [ready, setReady] = React.useState(false);
  const onPoseRef = React.useRef(onPose);
  const onErrRef = React.useRef(onError);
  const mirrorRef = React.useRef(mirror);
  React.useEffect(() => {
    onPoseRef.current = onPose;
  }, [onPose]);
  React.useEffect(() => {
    onErrRef.current = onError;
  }, [onError]);
  React.useEffect(() => {
    mirrorRef.current = mirror;
  }, [mirror]);

  React.useEffect(() => {
    if (!active) return;
    let rafId: number | null = null;
    let disposed = false;
    let lastTs = -1;

    const run = async () => {
      let landmarker;
      try {
        landmarker = await getPoseLandmarker();
      } catch (err) {
        console.warn("[useLivePose] 模型加载失败:", err);
        onErrRef.current?.(err);
        return;
      }
      if (disposed) return;
      setReady(true);

      const tick = () => {
        if (disposed) return;
        const video = videoRef.current;
        if (!video || video.readyState < 2) {
          rafId = requestAnimationFrame(tick);
          return;
        }
        const nowMs = performance.now();
        const ts = Math.max(lastTs + 1, Math.floor(nowMs));
        lastTs = ts;
        try {
          const result = landmarker.detectForVideo(video, ts);
          if (result.landmarks && result.landmarks.length > 0) {
            const raw = landmarksToKeypoints(result.landmarks[0] as any);
            // landmarksToKeypoints 给的是 [x, y, v](3 元数组),评分模块需要 z
            // MediaPipe worldLandmarks 里有 z,这里先填 0 保持 2D 评分可用
            const kpts: Kpt[] = raw.map(([x, y, v]) => ({
              x: mirrorRef.current ? 1 - x : x,
              y,
              z: 0,
              visibility: v ?? 1,
            }));
            onPoseRef.current(kpts);
          }
        } catch (err) {
          // 单帧失败吞掉,别中断 RAF。错误只打一次。
          if (!(tick as any)._errLogged) {
            console.warn("[useLivePose] detectForVideo 单帧错误:", err);
            (tick as any)._errLogged = true;
          }
        }
        rafId = requestAnimationFrame(tick);
      };
      rafId = requestAnimationFrame(tick);
    };

    void run();
    return () => {
      disposed = true;
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [active, videoRef]);

  return { ready };
}
