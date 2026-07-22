// 随拍挑战的评分累加器。
//
// 在挑战过程中,每检测到一帧用户姿态,就调用 pushFrame():
//   - 找到当前 segment(按 playhead 落在哪个 segment 区间)
//   - 用 DTW 对齐老师帧,算融合分 + 逐关节误差 + 骨段方向余弦
//   - 按 segment、按拍、按关节/骨段累加
// 挑战结束调用 build() 得到 SessionResult,供 Feedback 报告与后端提交。
//
// 这里只做累加,不碰 DOM、不碰网络。

import { scoreBonesByCosine } from "@/lib/feedback/bones";
import { cosineToScore100 } from "@/lib/feedback/scoreMap";
import {
  type Kpt,
  type TeacherFrame,
  findNearestTeacherFrame,
  scoreFrameDetailed,
  scoreWithDTW,
} from "./scoring";

export interface SegmentAttemptResult {
  segmentId: string;
  /** 0-100 —— 角度+点云融合分（旧链路 / 实时 HUD） */
  score: number;
  /** 0-100 —— Feedback 骨段余弦主分 */
  boneScore: number;
  /** 骨段 id → 平均方向余弦 [-1,1] */
  boneMeans: Record<string, number>;
  /** 逐关节平均误差 [0,1] */
  jointErrors: Record<string, number>;
  /** 逐拍分数组(0-100) */
  beatScores: number[];
  worstJoint: string | null;
  worstBeat: number | null;
  frameCount: number;
}

export interface SessionResult {
  lessonId: string;
  /** 0-100,融合分按帧加权 */
  overallScore: number;
  /** 0-100,骨段余弦主分按帧加权 */
  overallBoneScore: number;
  poseSource: string;
  frameCount: number;
  segments: SegmentAttemptResult[];
}

interface SegmentMeta {
  id: string;
  start: number;
  end: number;
  beatCount: number;
  frames: TeacherFrame[];
}

interface SegmentAcc {
  meta: SegmentMeta;
  scoreSum: number;
  boneScoreSum: number;
  frameCount: number;
  jointAcc: Map<string, { sum: number; count: number }>;
  boneAcc: Map<string, { sum: number; count: number }>;
  beatAcc: Array<{ sum: number; count: number }>;
}

export class SessionAccumulator {
  private readonly lessonId: string;
  private readonly poseSource: string;
  private readonly segs: SegmentAcc[];
  private totalFrames = 0;

  constructor(opts: { lessonId: string; poseSource: string; segments: SegmentMeta[] }) {
    this.lessonId = opts.lessonId;
    this.poseSource = opts.poseSource;
    this.segs = opts.segments.map((meta) => ({
      meta,
      scoreSum: 0,
      boneScoreSum: 0,
      frameCount: 0,
      jointAcc: new Map(),
      boneAcc: new Map(),
      beatAcc: Array.from({ length: Math.max(0, meta.beatCount) }, () => ({ sum: 0, count: 0 })),
    }));
  }

  private segmentAt(playheadSec: number): SegmentAcc | null {
    for (const s of this.segs) {
      if (playheadSec >= s.meta.start && playheadSec < s.meta.end && s.meta.frames.length) {
        return s;
      }
    }
    // 整支视频：落在间隙/首尾外时，归入时间最近的一段继续累加
    let best: SegmentAcc | null = null;
    let bestDist = Number.POSITIVE_INFINITY;
    for (const s of this.segs) {
      if (!s.meta.frames.length) continue;
      const { start, end } = s.meta;
      const dist = playheadSec < start ? start - playheadSec : playheadSec > end ? playheadSec - end : 0;
      if (dist < bestDist) {
        bestDist = dist;
        best = s;
      }
    }
    return best;
  }

  pushFrame(playheadSec: number, userKpts: Kpt[]): void {
    const seg = this.segmentAt(playheadSec);
    if (!seg || !seg.meta.frames.length) return;

    const frames = seg.meta.frames;
    const idx = findNearestTeacherFrame(frames, playheadSec);
    const teacher = frames[idx].keypoints;
    const dtwScore = scoreWithDTW(userKpts, frames, idx);
    const detail = scoreFrameDetailed(userKpts, teacher);
    const bones = scoreBonesByCosine(userKpts, teacher);
    const boneScore01 =
      bones.meanCosine == null ? 0 : cosineToScore100(bones.meanCosine) / 100;

    seg.scoreSum += dtwScore;
    seg.boneScoreSum += boneScore01;
    seg.frameCount += 1;
    this.totalFrames += 1;

    for (const [joint, err] of Object.entries(detail.jointErrors)) {
      const acc = seg.jointAcc.get(joint) ?? { sum: 0, count: 0 };
      acc.sum += err;
      acc.count += 1;
      seg.jointAcc.set(joint, acc);
    }

    for (const [boneId, cos] of Object.entries(bones.boneCosines)) {
      const acc = seg.boneAcc.get(boneId) ?? { sum: 0, count: 0 };
      acc.sum += cos;
      acc.count += 1;
      seg.boneAcc.set(boneId, acc);
    }

    if (seg.beatAcc.length > 0) {
      const rel = (playheadSec - seg.meta.start) / Math.max(1e-6, seg.meta.end - seg.meta.start);
      const beat = Math.min(seg.beatAcc.length - 1, Math.max(0, Math.floor(rel * seg.beatAcc.length)));
      seg.beatAcc[beat].sum += dtwScore;
      seg.beatAcc[beat].count += 1;
    }
  }

  build(): SessionResult {
    const segments: SegmentAttemptResult[] = [];
    let weightedScoreSum = 0;
    let weightedBoneSum = 0;
    let weightTotal = 0;

    for (const s of this.segs) {
      if (s.frameCount === 0) continue;
      const score = Math.round((s.scoreSum / s.frameCount) * 100);
      const boneScore = Math.round((s.boneScoreSum / s.frameCount) * 100);

      const jointErrors: Record<string, number> = {};
      let worstJoint: string | null = null;
      let worstErr = -1;
      for (const [joint, acc] of s.jointAcc.entries()) {
        const mean = acc.count > 0 ? acc.sum / acc.count : 0;
        jointErrors[joint] = Number(mean.toFixed(4));
        if (mean > worstErr) {
          worstErr = mean;
          worstJoint = joint;
        }
      }

      const boneMeans: Record<string, number> = {};
      for (const [boneId, acc] of s.boneAcc.entries()) {
        if (acc.count <= 0) continue;
        boneMeans[boneId] = Number((acc.sum / acc.count).toFixed(4));
      }

      const beatScores: number[] = [];
      let worstBeat: number | null = null;
      let worstBeatScore = Infinity;
      for (let i = 0; i < s.beatAcc.length; i++) {
        const b = s.beatAcc[i];
        const bs = b.count > 0 ? Math.round((b.sum / b.count) * 100) : 0;
        beatScores.push(bs);
        if (b.count > 0 && bs < worstBeatScore) {
          worstBeatScore = bs;
          worstBeat = i;
        }
      }

      segments.push({
        segmentId: s.meta.id,
        score,
        boneScore,
        boneMeans,
        jointErrors,
        beatScores,
        worstJoint,
        worstBeat,
        frameCount: s.frameCount,
      });

      weightedScoreSum += score * s.frameCount;
      weightedBoneSum += boneScore * s.frameCount;
      weightTotal += s.frameCount;
    }

    return {
      lessonId: this.lessonId,
      overallScore: weightTotal > 0 ? Math.round(weightedScoreSum / weightTotal) : 0,
      overallBoneScore: weightTotal > 0 ? Math.round(weightedBoneSum / weightTotal) : 0,
      poseSource: this.poseSource,
      frameCount: this.totalFrames,
      segments,
    };
  }

  get frames(): number {
    return this.totalFrames;
  }
}

export type { SegmentMeta };
