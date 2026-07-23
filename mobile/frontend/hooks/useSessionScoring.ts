"use client";

// 随拍挑战实时评分 hook。
//
// - 摄像头就绪即识别（叠骨架）
// - 挑战中写入累加器
// - 整支视频全程计分：任意播放头取最近老师帧比对

import * as React from "react";

import {
  pickLiveHotspot,
  scoreToTier,
  type LiveHotspot,
  type LiveScoreTier,
} from "@/lib/feedback/liveHotspot";
import { softenLiveScore01 } from "@/lib/feedback/scoreMap";
import { getPoseLandmarker, landmarksToKeypoints } from "@/lib/pose/mediapipeClient";
import { scoreFrameFused, type Kpt, type TeacherFrame } from "@/lib/pose/scoring";
import {
  SessionAccumulator,
  type SegmentMeta,
  type SessionResult,
} from "@/lib/pose/sessionAccumulator";
import type { Keypoint } from "@/lib/pose/types";

const POSE_SOURCE = "browser_mediapipe_lite_v1";
const TARGET_FPS = 15;
const HUD_UI_FPS = 5;

const MIRROR_PAIRS: Array<[number, number]> = [
  [1, 4], [2, 5], [3, 6], [7, 8], [9, 10],
  [11, 12], [13, 14], [15, 16], [17, 18], [19, 20],
  [21, 22], [23, 24], [25, 26], [27, 28], [29, 30], [31, 32],
];

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

export type LiveScoreStatus =
  | "booting" // 模型加载中
  | "no_pose" // 未识别到人
  | "no_teacher" // 整课没有可用老师姿态
  | "live"; // 正在出分

interface Options {
  detectActive: boolean;
  scoringActive: boolean;
  lessonId: string;
  videoRef: React.RefObject<HTMLVideoElement>;
  playheadRef: React.MutableRefObject<number>;
  segments: SegmentMeta[];
  mirror: boolean;
}

export interface SessionScoringState {
  /** null = 当前未计分（不要显示成 0） */
  liveScore: number | null;
  liveTier: LiveScoreTier;
  scoreStatus: LiveScoreStatus;
  ready: boolean;
  detected: boolean;
  error: string | null;
  hotspotLabel: string | null;
  hotspotError: number;
}

function toKpt(row: [number, number, number]): Kpt {
  return { x: row[0], y: row[1], z: 0, visibility: row[2] ?? 1 };
}

function kptsToDrawKeypoints(kpts: Kpt[]): Keypoint[] {
  return kpts.map((k) => [k.x, k.y, k.visibility ?? 1]);
}

/** 整支视频：段内用该段；否则取时间最近段（无距离上限）。 */
function findScoringSegment(segments: SegmentMeta[], playhead: number): SegmentMeta | null {
  if (!segments.length) return null;
  const exact = segments.find(
    (sm) => playhead >= sm.start && playhead < sm.end && sm.frames.length > 0,
  );
  if (exact) return exact;

  let best: SegmentMeta | null = null;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const sm of segments) {
    if (!sm.frames.length) continue;
    const dist =
      playhead < sm.start ? sm.start - playhead : playhead > sm.end ? playhead - sm.end : 0;
    if (dist < bestDist) {
      bestDist = dist;
      best = sm;
    }
  }
  return best;
}

export function useSessionScoring(opts: Options): {
  state: SessionScoringState;
  latestKptsRef: React.MutableRefObject<Keypoint[] | null>;
  hotspotRef: React.MutableRefObject<LiveHotspot | null>;
  finish: () => SessionResult | null;
  reset: () => void;
} {
  const {
    detectActive,
    scoringActive,
    lessonId,
    videoRef,
    playheadRef,
    segments,
    mirror,
  } = opts;

  const accRef = React.useRef<SessionAccumulator | null>(null);
  const segmentsRef = React.useRef<SegmentMeta[]>(segments);
  const mirrorRef = React.useRef(mirror);
  const scoringActiveRef = React.useRef(scoringActive);
  const latestKptsRef = React.useRef<Keypoint[] | null>(null);
  const hotspotRef = React.useRef<LiveHotspot | null>(null);
  const [state, setState] = React.useState<SessionScoringState>({
    liveScore: null,
    liveTier: "miss",
    scoreStatus: "booting",
    ready: false,
    detected: false,
    error: null,
    hotspotLabel: null,
    hotspotError: 0,
  });

  React.useEffect(() => {
    mirrorRef.current = mirror;
  }, [mirror]);

  React.useEffect(() => {
    segmentsRef.current = segments;
  }, [segments]);

  React.useEffect(() => {
    scoringActiveRef.current = scoringActive;
  }, [scoringActive]);

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
    if (!scoringActive) return;
    accRef.current = new SessionAccumulator({
      lessonId,
      poseSource: POSE_SOURCE,
      segments: segmentsRef.current,
    });
  }, [scoringActive, lessonId]);

  React.useEffect(() => {
    if (!detectActive) {
      latestKptsRef.current = null;
      hotspotRef.current = null;
      setState((s) => ({
        ...s,
        ready: false,
        detected: false,
        liveScore: null,
        scoreStatus: "booting",
        hotspotLabel: null,
        hotspotError: 0,
      }));
      return;
    }

    let rafId = 0;
    let disposed = false;
    let lastInferMs = 0;
    let lastHudMs = 0;
    let lastMpTs = -1;
    const scoreBuf: number[] = [];

    const patchHud = ( partial: Partial<SessionScoringState>) => {
      setState((prev) => {
        const next = { ...prev, ...partial };
        if (
          prev.liveScore === next.liveScore &&
          prev.liveTier === next.liveTier &&
          prev.scoreStatus === next.scoreStatus &&
          prev.detected === next.detected &&
          prev.ready === next.ready &&
          prev.hotspotLabel === next.hotspotLabel &&
          Math.abs(prev.hotspotError - (next.hotspotError ?? 0)) < 0.04 &&
          prev.error === next.error
        ) {
          return prev;
        }
        return next;
      });
    };

    const run = async () => {
      let landmarker: Awaited<ReturnType<typeof getPoseLandmarker>>;
      try {
        landmarker = await getPoseLandmarker();
      } catch (err) {
        if (!disposed) {
          patchHud({
            error: err instanceof Error ? err.message : String(err),
            ready: false,
            scoreStatus: "booting",
            liveScore: null,
          });
        }
        return;
      }
      if (disposed) return;
      patchHud({ ready: true, error: null });

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
          return;
        }

        if (!kpts || kpts.length < 33) {
          latestKptsRef.current = null;
          hotspotRef.current = null;
          if (now - lastHudMs >= 1000 / HUD_UI_FPS) {
            lastHudMs = now;
            patchHud({
              detected: false,
              liveScore: null,
              scoreStatus: "no_pose",
              hotspotLabel: null,
              hotspotError: 0,
            });
          }
          return;
        }

        latestKptsRef.current = kptsToDrawKeypoints(kpts);

        let scoreKpts = kpts;
        if (mirrorRef.current) scoreKpts = mirrorKpts(kpts);

        const playhead = playheadRef.current;
        if (scoringActiveRef.current) {
          accRef.current?.pushFrame(playhead, scoreKpts);
        }

        const seg = findScoringSegment(segmentsRef.current, playhead);
        if (!seg) {
          hotspotRef.current = null;
          if (now - lastHudMs >= 1000 / HUD_UI_FPS) {
            lastHudMs = now;
            patchHud({
              detected: true,
              liveScore: null,
              scoreStatus: "no_teacher",
              hotspotLabel: null,
              hotspotError: 0,
            });
          }
          return;
        }

        const nearest = nearestFrame(seg.frames, playhead);
        if (!nearest) {
          hotspotRef.current = null;
          if (now - lastHudMs >= 1000 / HUD_UI_FPS) {
            lastHudMs = now;
            patchHud({
              detected: true,
              liveScore: null,
              scoreStatus: "no_teacher",
              hotspotLabel: null,
              hotspotError: 0,
            });
          }
          return;
        }

        const raw01 = scoreFrameFused(scoreKpts, nearest.keypoints);
        const soft01 = softenLiveScore01(raw01);
        scoreBuf.push(soft01);
        if (scoreBuf.length > 15) scoreBuf.shift();
        const avg = scoreBuf.reduce((a, b) => a + b, 0) / scoreBuf.length;
        const liveScore = Math.round(avg * 100);
        const liveTier = scoreToTier(liveScore);

        const hotspot = pickLiveHotspot(scoreKpts, nearest.keypoints);
        hotspotRef.current =
          hotspot && mirrorRef.current ? mirrorHotspotIndices(hotspot) : hotspot;

        if (now - lastHudMs >= 1000 / HUD_UI_FPS) {
          lastHudMs = now;
          patchHud({
            detected: true,
            liveScore,
            liveTier,
            scoreStatus: "live",
            hotspotLabel: hotspot?.label ?? null,
            hotspotError: hotspot?.error ?? 0,
          });
        }
      };

      rafId = requestAnimationFrame(tick);
    };

    void run();
    return () => {
      disposed = true;
      if (rafId) cancelAnimationFrame(rafId);
      latestKptsRef.current = null;
      hotspotRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detectActive, lessonId]);

  return { state, latestKptsRef, hotspotRef, finish, reset };
}

const INDEX_MIRROR: Record<number, number> = Object.fromEntries(
  MIRROR_PAIRS.flatMap(([a, b]) => [
    [a, b],
    [b, a],
  ]),
);

function mirrorIndex(i: number): number {
  return INDEX_MIRROR[i] ?? i;
}

function mirrorHotspotIndices(h: LiveHotspot): LiveHotspot {
  return {
    ...h,
    vertex: mirrorIndex(h.vertex),
    edges: h.edges.map(([a, b]) => [mirrorIndex(a), mirrorIndex(b)]),
  };
}

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
