"use client";

import * as React from "react";

import { getPoseLandmarker, landmarksToKeypoints } from "./mediapipeClient";
import type { Kpt } from "./scoring";

const DEFAULT_MAX_FPS = 12;

export interface UseLivePoseOpts {
  videoRef: React.RefObject<HTMLVideoElement>;
  active: boolean;
  onPose: (kpts: Kpt[]) => void;
  onError?: (err: unknown) => void;
  mirror?: boolean;
  maxFps?: number;
}

export function useLivePose({
  videoRef,
  active,
  onPose,
  onError,
  mirror = true,
  maxFps = DEFAULT_MAX_FPS,
}: UseLivePoseOpts): { ready: boolean } {
  const [ready, setReady] = React.useState(false);
  const onPoseRef = React.useRef(onPose);
  const onErrRef = React.useRef(onError);
  const mirrorRef = React.useRef(mirror);
  const maxFpsRef = React.useRef(maxFps);

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
    maxFpsRef.current = maxFps;
  }, [maxFps]);

  React.useEffect(() => {
    if (!active) {
      setReady(false);
      return;
    }

    let rafId: number | null = null;
    let disposed = false;
    let lastDetectMs = 0;
    let lastTs = -1;
    let lastVideoTime = -1;

    const run = async () => {
      let landmarker;
      try {
        landmarker = await getPoseLandmarker();
      } catch (err) {
        console.warn("[useLivePose] model load failed:", err);
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
        const frameIntervalMs = 1000 / Math.max(1, maxFpsRef.current);
        if (nowMs - lastDetectMs < frameIntervalMs || video.currentTime === lastVideoTime) {
          rafId = requestAnimationFrame(tick);
          return;
        }

        lastDetectMs = nowMs;
        lastVideoTime = video.currentTime;

        const ts = Math.max(lastTs + 1, Math.floor(nowMs));
        lastTs = ts;

        try {
          const result = landmarker.detectForVideo(video, ts);
          if (result.landmarks && result.landmarks.length > 0) {
            const raw = landmarksToKeypoints(result.landmarks[0] as any);
            const kpts: Kpt[] = raw.map(([x, y, v]) => ({
              x: mirrorRef.current ? 1 - x : x,
              y,
              z: 0,
              visibility: v ?? 1,
            }));
            onPoseRef.current(kpts);
          }
        } catch (err) {
          if (!(tick as any)._errLogged) {
            console.warn("[useLivePose] detectForVideo frame failed:", err);
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
      setReady(false);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [active, videoRef]);

  return { ready };
}
