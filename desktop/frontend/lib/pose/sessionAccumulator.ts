// 随拍挑战的评分累加器。
//
// 在挑战过程中,每检测到一帧用户姿态,就调用 pushFrame():
//   - 找到当前 segment(按 playhead 落在哪个 segment 区间)
//   - 用 DTW 对齐老师帧,算融合分 + 逐关节误差
//   - 按 segment、按拍、按关节累加
// 挑战结束调用 build() 得到一个紧凑的 SessionResult,POST 给后端。
//
// 这里只做累加,不碰 DOM、不碰网络。

import {
  type Kpt,
  type TeacherFrame,
  findNearestTeacherFrame,
  scoreFrameDetailed,
  scoreWithDTW,
} from "./scoring";

export interface SegmentAttemptResult {
  segmentId: string;
  // 0-100
  score: number;
  // 逐关节平均误差 [0,1],关节名 -> 误差
  jointErrors: Record<string, number>;
  // 逐拍分数组(0-100),长度 = beatCount;没有拍数据时为空数组
  beatScores: number[];
  // 最差关节名(误差最大);无数据为 null
  worstJoint: string | null;
  // 最差拍序号(分最低);无拍数据为 null
  worstBeat: number | null;
  // 参与统计的帧数
  frameCount: number;
}

export interface SessionResult {
  lessonId: string;
  // 0-100,各 segment 按帧数加权
  overallScore: number;
  poseSource: string;
  frameCount: number;
  segments: SegmentAttemptResult[];
}

interface SegmentMeta {
  id: string;
  start: number;
  end: number;
  beatCount: number;
  frames: TeacherFrame[]; // 该 segment 的老师帧(绝对 lesson 时间)
}

interface SegmentAcc {
  meta: SegmentMeta;
  scoreSum: number;
  frameCount: number;
  // 关节名 -> {sum, count}
  jointAcc: Map<string, { sum: number; count: number }>;
  // 每一拍 -> {sum, count}
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
      frameCount: 0,
      jointAcc: new Map(),
      beatAcc: Array.from({ length: Math.max(0, meta.beatCount) }, () => ({ sum: 0, count: 0 })),
    }));
  }

  private segmentAt(playheadSec: number): SegmentAcc | null {
    for (const s of this.segs) {
      if (playheadSec >= s.meta.start && playheadSec < s.meta.end) return s;
    }
    return null;
  }

  // playheadSec: 当前老师播放头(绝对 lesson 时间,秒)
  // userKpts: 本帧用户 33 关键点
  pushFrame(playheadSec: number, userKpts: Kpt[]): void {
    const seg = this.segmentAt(playheadSec);
    if (!seg || !seg.meta.frames.length) return;

    const frames = seg.meta.frames;
    const idx = findNearestTeacherFrame(frames, playheadSec);
    // DTW 对齐(±6 帧窗口)得融合分
    const dtwScore = scoreWithDTW(userKpts, frames, idx);
    // 逐关节误差用最近帧算(DTW 只用于总分容错)
    const detail = scoreFrameDetailed(userKpts, frames[idx].keypoints);

    seg.scoreSum += dtwScore;
    seg.frameCount += 1;
    this.totalFrames += 1;

    for (const [joint, err] of Object.entries(detail.jointErrors)) {
      const acc = seg.jointAcc.get(joint) ?? { sum: 0, count: 0 };
      acc.sum += err;
      acc.count += 1;
      seg.jointAcc.set(joint, acc);
    }

    // 落到哪一拍:segment 内等分 beatCount 份
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
    let weightTotal = 0;

    for (const s of this.segs) {
      if (s.frameCount === 0) continue;
      const score01 = s.scoreSum / s.frameCount;
      const score = Math.round(score01 * 100);

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
        jointErrors,
        beatScores,
        worstJoint,
        worstBeat,
        frameCount: s.frameCount,
      });

      weightedScoreSum += score * s.frameCount;
      weightTotal += s.frameCount;
    }

    return {
      lessonId: this.lessonId,
      overallScore: weightTotal > 0 ? Math.round(weightedScoreSum / weightTotal) : 0,
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
