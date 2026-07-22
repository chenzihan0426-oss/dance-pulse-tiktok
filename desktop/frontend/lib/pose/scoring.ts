// 动作评分核心算法。
//
// 按照 dance_overlay_implementation_guide.md 模块 5 实现:
//   1. normalize()        —— 以双胯中点为原点、肩宽为单位归一化 33 关键点
//   2. scoreFrameByAngles —— 8 核心关节的角度差加权得分(主指标)
//   3. scoreFrameByCosine —— 归一化关键点的余弦相似度(备用 / 融合)
//   4. scoreWithDTW       —— ±6 帧滑动窗口取最大分,吸收 200ms 时序偏差
//   5. toGrade            —— 得分 → Perfect / Good / OK / Miss
//   6. SmoothedScore 类   —— 15 帧滑动平均,避免档位抖动
//
// 输入: BlazePose 33 关键点约定,每个点 { x, y, z, visibility } 都在 [0,1] 域。

// BlazePose 索引常量(仅列我们用到的)
export const BP = {
  NOSE: 0,
  LEFT_SHOULDER: 11, RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13, RIGHT_ELBOW: 14,
  LEFT_WRIST: 15, RIGHT_WRIST: 16,
  LEFT_HIP: 23, RIGHT_HIP: 24,
  LEFT_KNEE: 25, RIGHT_KNEE: 26,
  LEFT_ANKLE: 27, RIGHT_ANKLE: 28,
} as const;

export interface Kpt {
  x: number;
  y: number;
  z: number;
  visibility: number;
}

// ---------------------------------------------------------------------------
// 归一化:以 hip 中点为原点,肩宽为单位长度。去掉位置/大小依赖。
// ---------------------------------------------------------------------------
export function normalize(kpts: Kpt[]): Kpt[] | null {
  if (!kpts || kpts.length < 33) return null;
  const lh = kpts[BP.LEFT_HIP], rh = kpts[BP.RIGHT_HIP];
  const ls = kpts[BP.LEFT_SHOULDER], rs = kpts[BP.RIGHT_SHOULDER];
  if (!lh || !rh || !ls || !rs) return null;

  const cx = (lh.x + rh.x) / 2;
  const cy = (lh.y + rh.y) / 2;
  const cz = (lh.z + rh.z) / 2;
  const dx = rs.x - ls.x;
  const dy = rs.y - ls.y;
  const shoulderWidth = Math.hypot(dx, dy);
  if (shoulderWidth < 1e-4) return null;

  return kpts.map((k) => ({
    x: (k.x - cx) / shoulderWidth,
    y: (k.y - cy) / shoulderWidth,
    z: (k.z - cz) / shoulderWidth,
    visibility: k.visibility ?? 0,
  }));
}

// ---------------------------------------------------------------------------
// 8 个核心关节的角度(a-b-c,b 为关节点)
// ---------------------------------------------------------------------------
export interface JointSpec {
  abc: [number, number, number];
  weight: number;
  name: string;
}

export const JOINTS: JointSpec[] = [
  { abc: [BP.LEFT_SHOULDER, BP.LEFT_ELBOW, BP.LEFT_WRIST], weight: 1.5, name: "leftElbow" },
  { abc: [BP.RIGHT_SHOULDER, BP.RIGHT_ELBOW, BP.RIGHT_WRIST], weight: 1.5, name: "rightElbow" },
  { abc: [BP.LEFT_ELBOW, BP.LEFT_SHOULDER, BP.LEFT_HIP], weight: 1.2, name: "leftShoulder" },
  { abc: [BP.RIGHT_ELBOW, BP.RIGHT_SHOULDER, BP.RIGHT_HIP], weight: 1.2, name: "rightShoulder" },
  { abc: [BP.LEFT_HIP, BP.LEFT_KNEE, BP.LEFT_ANKLE], weight: 1.3, name: "leftKnee" },
  { abc: [BP.RIGHT_HIP, BP.RIGHT_KNEE, BP.RIGHT_ANKLE], weight: 1.3, name: "rightKnee" },
  { abc: [BP.LEFT_SHOULDER, BP.LEFT_HIP, BP.LEFT_KNEE], weight: 1.0, name: "leftHip" },
  { abc: [BP.RIGHT_SHOULDER, BP.RIGHT_HIP, BP.RIGHT_KNEE], weight: 1.0, name: "rightHip" },
];

function jointAngle(a: Kpt, b: Kpt, c: Kpt): number {
  const v1x = a.x - b.x, v1y = a.y - b.y, v1z = a.z - b.z;
  const v2x = c.x - b.x, v2y = c.y - b.y, v2z = c.z - b.z;
  const dot = v1x * v2x + v1y * v2y + v1z * v2z;
  const n1 = Math.hypot(v1x, v1y, v1z);
  const n2 = Math.hypot(v2x, v2y, v2z);
  const cos = dot / (n1 * n2 + 1e-9);
  return Math.acos(Math.max(-1, Math.min(1, cos)));
}

// ---------------------------------------------------------------------------
// 主指标:加权的角度差评分,[0, 1]
// visibility < MIN_VIS 的关节整组跳过
// ---------------------------------------------------------------------------
const MIN_VIS = 0.5;
const HALF_PI = Math.PI / 2;

export function scoreFrameByAngles(userKpts: Kpt[], teacherKpts: Kpt[]): number {
  const u = normalize(userKpts);
  const t = normalize(teacherKpts);
  if (!u || !t) return 0;

  let total = 0;
  let wSum = 0;
  for (const { abc, weight } of JOINTS) {
    const [a, b, c] = abc;
    if (
      u[a].visibility < MIN_VIS ||
      u[b].visibility < MIN_VIS ||
      u[c].visibility < MIN_VIS
    )
      continue;
    const aU = jointAngle(u[a], u[b], u[c]);
    const aT = jointAngle(t[a], t[b], t[c]);
    const diff = Math.abs(aU - aT);
    const s = Math.max(0, 1 - diff / HALF_PI);
    total += s * weight;
    wSum += weight;
  }
  return wSum > 0 ? total / wSum : 0;
}

// ---------------------------------------------------------------------------
// 备用:归一化关键点的余弦相似度。角度法在某些极端姿势(手臂抬至胸前)
// 区分度不高,可作为补充信号(线性融合或加权)。
// ---------------------------------------------------------------------------
export function scoreFrameByCosine(userKpts: Kpt[], teacherKpts: Kpt[]): number {
  const u = normalize(userKpts);
  const t = normalize(teacherKpts);
  if (!u || !t) return 0;

  const pick = [
    BP.LEFT_SHOULDER, BP.RIGHT_SHOULDER,
    BP.LEFT_ELBOW, BP.RIGHT_ELBOW,
    BP.LEFT_WRIST, BP.RIGHT_WRIST,
    BP.LEFT_HIP, BP.RIGHT_HIP,
    BP.LEFT_KNEE, BP.RIGHT_KNEE,
    BP.LEFT_ANKLE, BP.RIGHT_ANKLE,
  ];

  const uv: number[] = [];
  const tv: number[] = [];
  for (const i of pick) {
    if (u[i].visibility < MIN_VIS || t[i].visibility < MIN_VIS) continue;
    uv.push(u[i].x, u[i].y, u[i].z);
    tv.push(t[i].x, t[i].y, t[i].z);
  }
  if (uv.length < 6) return 0;

  let dot = 0, nu = 0, nt = 0;
  for (let i = 0; i < uv.length; i++) {
    dot += uv[i] * tv[i];
    nu += uv[i] * uv[i];
    nt += tv[i] * tv[i];
  }
  const sim = dot / (Math.sqrt(nu) * Math.sqrt(nt) + 1e-9);
  return (sim + 1) / 2;
}

// 融合:0.65 * 角度 + 0.35 * 余弦(guide 原话是"建议先用角度,余弦作补充")
export function scoreFrameFused(userKpts: Kpt[], teacherKpts: Kpt[]): number {
  const a = scoreFrameByAngles(userKpts, teacherKpts);
  const c = scoreFrameByCosine(userKpts, teacherKpts);
  return 0.65 * a + 0.35 * c;
}

// ---------------------------------------------------------------------------
// 逐关节误差:返回每个核心关节的角度差归一化误差 [0,1](0=完美,1=最差)。
// 难点检测需要知道"哪个关节错",而不仅是一个总分。
// 关节不可见时该关节返回 null(不参与聚合)。
// ---------------------------------------------------------------------------
export interface FrameDetail {
  // 关节名 -> 误差 [0,1];不可见的关节不出现在 map 里
  jointErrors: Record<string, number>;
  // 该帧融合分 [0,1]
  score: number;
}

export function scoreFrameDetailed(userKpts: Kpt[], teacherKpts: Kpt[]): FrameDetail {
  const u = normalize(userKpts);
  const t = normalize(teacherKpts);
  if (!u || !t) return { jointErrors: {}, score: 0 };

  const jointErrors: Record<string, number> = {};
  for (const { abc, name } of JOINTS) {
    const [a, b, c] = abc;
    if (
      u[a].visibility < MIN_VIS ||
      u[b].visibility < MIN_VIS ||
      u[c].visibility < MIN_VIS
    )
      continue;
    const aU = jointAngle(u[a], u[b], u[c]);
    const aT = jointAngle(t[a], t[b], t[c]);
    // 误差归一到 [0,1]:角度差 / (π/2) 截断
    jointErrors[name] = Math.min(1, Math.abs(aU - aT) / HALF_PI);
  }
  return { jointErrors, score: scoreFrameFused(userKpts, teacherKpts) };
}

// ---------------------------------------------------------------------------
// 滑动窗口 DTW(简化版):在 [current - W, current + W] 帧范围取最大分。
// 吸收 ±200ms 时序偏差(W = 6 帧 @ 30fps)。
// ---------------------------------------------------------------------------
export interface TeacherFrame {
  t: number;        // 时间(秒,相对 clip 起点)
  keypoints: Kpt[];
}

export function scoreWithDTW(
  userKpts: Kpt[],
  teacherFrames: TeacherFrame[],
  currentFrameIdx: number,
  windowFrames = 6,
  scorer: (u: Kpt[], t: Kpt[]) => number = scoreFrameFused,
): number {
  if (!teacherFrames.length) return 0;
  const lo = Math.max(0, currentFrameIdx - windowFrames);
  const hi = Math.min(teacherFrames.length - 1, currentFrameIdx + windowFrames);
  let best = 0;
  for (let f = lo; f <= hi; f++) {
    const s = scorer(userKpts, teacherFrames[f].keypoints);
    if (s > best) best = s;
  }
  return best;
}

// 在老师 poses 数组里按时间二分查找最近帧
export function findNearestTeacherFrame(teacherFrames: TeacherFrame[], tSec: number): number {
  if (!teacherFrames.length) return 0;
  let lo = 0, hi = teacherFrames.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (teacherFrames[mid].t < tSec) lo = mid + 1;
    else hi = mid;
  }
  const cur = teacherFrames[lo];
  const prev = lo > 0 ? teacherFrames[lo - 1] : null;
  if (!prev) return lo;
  return Math.abs(prev.t - tSec) < Math.abs(cur.t - tSec) ? lo - 1 : lo;
}

// ---------------------------------------------------------------------------
// 档位映射
// ---------------------------------------------------------------------------
export type Grade = "PERFECT" | "GOOD" | "OK" | "MISS";

export function toGrade(score: number): Grade {
  if (score >= 0.85) return "PERFECT";
  if (score >= 0.70) return "GOOD";
  if (score >= 0.50) return "OK";
  return "MISS";
}

// ---------------------------------------------------------------------------
// 15 帧滑动平均 —— 防止档位抖动
// ---------------------------------------------------------------------------
export class SmoothedScore {
  private buf: number[] = [];
  constructor(private readonly size = 15) {}

  push(s: number): number {
    this.buf.push(s);
    if (this.buf.length > this.size) this.buf.shift();
    return this.value;
  }

  get value(): number {
    if (!this.buf.length) return 0;
    let sum = 0;
    for (const v of this.buf) sum += v;
    return sum / this.buf.length;
  }

  reset() {
    this.buf.length = 0;
  }
}

// ---------------------------------------------------------------------------
// 从现有 pipeline/pose_export.py 生成的 PoseDoc 转成 TeacherFrame[]
// 我们旧格式 frames[i].kp 是 [[x, y, visibility], ...] 3 列,没有 z。
// 给 z 填 0,对角度/余弦评分都不致命(大多数舞蹈动作在 2D 够看)。
// ---------------------------------------------------------------------------
import type { PoseDoc } from "./types";

export function poseDocToTeacherFrames(doc: PoseDoc): TeacherFrame[] {
  return doc.frames.map((f) => {
    if (!f.kp) return { t: f.t, keypoints: [] };
    const keypoints: Kpt[] = f.kp.map((row) => ({
      x: row[0],
      y: row[1],
      z: 0,
      visibility: row[2] ?? 1,
    }));
    return { t: f.t, keypoints };
  });
}
