"use client";

// 随拍挑战实时评分 hook。
//
// 职责:挑战进行中,以约 15fps 对用户摄像头跑 MediaPipe 姿态识别,
// 把每帧喂给 SessionAccumulator(按 segment/关节/拍累加)。挑战结束
// 调用 finish() 拿 SessionResult。
//
// MediaPipe 推理走主线程(复用现有 getPoseLandmarker 单例)。配合阶段1
// 的主线程减负,15fps 足够;若后续仍卡,可迁到 Web Worker + OffscreenCanvas。

import * as React from "react";

import { getPoseLandmarker, landmarksToKeypoints } from "@/lib/pose/mediapipeClient";
import { scoreFrameFused, type Kpt, type TeacherFrame } from "@/lib/pose/scoring";
import {
  SessionAccumulator,
  type SegmentMeta,
  type SessionResult,
} from "@/lib/pose/sessionAccumulator";

const POSE_SOURCE = "browser_mediapipe_lite_v1";
const TARGET_FPS = 15;

// BlazePose 左右对称关节索引对(镜像时需交换)。
// 摄像头自拍是镜像画面:用户抬右手,识别落在画面右侧,与老师坐标系左右相反。
// 评分前必须把用户姿态翻转回与老师一致的手性,否则角度比对系统性偏低。
const MIRROR_PAIRS: Array<[number, number]> = [
  [1, 4], [2, 5], [3, 6], [7, 8], [9, 10],
  [11, 12], [13, 14], [15, 16], [17, 18], [19, 20],
  [21, 22], [23, 24], [25, 26], [27, 28], [29, 30], [31, 32],
];

// x 轴翻转 + 交换左右关节,得到与老师一致手性的姿态。
function mirrorKpts(kpts: Kpt[]): Kpt[] {
  const flipped = kpts.map((k) => ({ ...k, x: 1 - k.x }));
  const out = flipped.slice();
  for (const [a, b] of MIRROR_PAIRS) {
    const tmp = out[a];
    out[a] = flipped[b];
    out[b] = tmp;
  }
  return out;
}

interface Options {
  active: boolean; // 挑战进行中为 true
  lessonId: string;
  videoRef: React.RefObject<HTMLVideoElement>; // 用户摄像头
  playheadRef: React.MutableRefObject<number>; // 老师播放头(绝对 lesson 秒)
  segments: SegmentMeta[]; // 参与统计的动作(含老师帧)
  mirror: boolean; // 摄像头是否镜像显示(与 userMirror 一致);true 时评分前翻转回老师手性
}

export interface SessionScoringState {
  liveScore: number; // 0-100,当前段的平滑分,用于实时显示
  ready: boolean; // MediaPipe 是否就绪
  error: string | null;
}

// [x_norm, y_norm, visibility] -> Kpt
function toKpt(row: [number, number, number]): Kpt {
  return { x: row[0], y: row[1], z: 0, visibility: row[2] ?? 1 };
}

export function useSessionScoring(opts: Options): {
  state: SessionScoringState;
  finish: () => SessionResult | null;
  reset: () => void;
} {
  const { active, lessonId, videoRef, playheadRef, segments, mirror } = opts;

  const accRef = React.useRef<SessionAccumulator | null>(null);
  const segmentsRef = React.useRef<SegmentMeta[]>(segments);
  const mirrorRef = React.useRef(mirror);
  const [state, setState] = React.useState<SessionScoringState>({
    liveScore: 0,
    ready: false,
    error: null,
  });

  React.useEffect(() => {
    mirrorRef.current = mirror;
  }, [mirror]);

  React.useEffect(() => {
    segmentsRef.current = segments;
  }, [segments]);

  const reset = React.useCallback(() => {
    accRef.current = new SessionAccumulator({
      lessonId,
      poseSource: POSE_SOURCE,
      segments: segmentsRef.current,
    });
  }, [lessonId]);

  const finish = React.useCallback((): SessionResult | null => {
    return accRef.current ? accRef.current.build() : null;
  }, []);

  React.useEffect(() => {
    if (!active) return;

    // 每次开始挑战重建累加器(用最新的 segments 快照)
    accRef.current = new SessionAccumulator({
      lessonId,
      poseSource: POSE_SOURCE,
      segments: segmentsRef.current,
    });

    let rafId = 0;
    let disposed = false;
    let lastInferMs = 0;
    let lastMpTs = -1;
    // 滑动平均实时分(15 帧窗口)
    const scoreBuf: number[] = [];

    const run = async () => {
      let landmarker: Awaited<ReturnType<typeof getPoseLandmarker>>;
      try {
        landmarker = await getPoseLandmarker();
      } catch (err) {
        if (!disposed) {
          setState((s) => ({ ...s, error: err instanceof Error ? err.message : String(err) }));
        }
        return;
      }
      if (disposed) return;
      setState((s) => ({ ...s, ready: true, error: null }));

      const tick = () => {
        if (disposed) return;
        rafId = requestAnimationFrame(tick);

        const now = performance.now();
        if (now - lastInferMs < 1000 / TARGET_FPS) return;
        lastInferMs = now;

        const video = videoRef.current;
        if (!video || video.readyState < 2) return;

        const mpTs = Math.max(lastMpTs + 1, Math.floor(now));
        lastMpTs = mpTs;

        let kpts: Kpt[] | null = null;
        try {
          const result = landmarker.detectForVideo(video, mpTs);
          if (result.landmarks && result.landmarks.length > 0) {
            kpts = landmarksToKeypoints(result.landmarks[0] as never).map(toKpt);
          }
        } catch {
          return; // 单帧失败不中断
        }
        if (!kpts || kpts.length < 33) return;

        // 镜像画面下,评分前把用户姿态翻转回与老师一致的手性。
        if (mirrorRef.current) kpts = mirrorKpts(kpts);

        const playhead = playheadRef.current;
        const acc = accRef.current;
        if (!acc) return;
        acc.pushFrame(playhead, kpts);

        // 实时分:用当前帧对最近老师帧的融合分(近似,给 UI 用)
        // 直接从累加器最近一次 pushFrame 派生成本高,这里单独快速算一次
        const seg = segmentsRef.current.find(
          (sm) => playhead >= sm.start && playhead < sm.end && sm.frames.length
        );
        if (seg) {
          const nearest = nearestFrame(seg.frames, playhead);
          if (nearest) {
            // 轻量:直接用 scoreWithDTW 的最近帧融合分近似
            const s01 = quickScore(kpts, nearest.keypoints);
            scoreBuf.push(s01);
            if (scoreBuf.length > 15) scoreBuf.shift();
            const avg = scoreBuf.reduce((a, b) => a + b, 0) / scoreBuf.length;
            setState((prev) => {
              const next = Math.round(avg * 100);
              return prev.liveScore === next ? prev : { ...prev, liveScore: next };
            });
          }
        }
      };

      rafId = requestAnimationFrame(tick);
    };

    void run();
    return () => {
      disposed = true;
      if (rafId) cancelAnimationFrame(rafId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, lessonId]);

  return { state, finish, reset };
}

// —— 内部小工具(避免额外 import 造成的循环) ——

function nearestFrame(frames: TeacherFrame[], tSec: number): TeacherFrame | null {
  if (!frames.length) return null;
  let lo = 0;
  let hi = frames.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (frames[mid].t < tSec) lo = mid + 1;
    else hi = mid;
  }
  const cur = frames[lo];
  const prev = lo > 0 ? frames[lo - 1] : null;
  if (!prev) return cur;
  return Math.abs(prev.t - tSec) < Math.abs(cur.t - tSec) ? prev : cur;
}

// 只为实时 UI 用的轻量融合分
function quickScore(u: Kpt[], t: Kpt[]): number {
  return scoreFrameFused(u, t);
}
