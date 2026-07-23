/**
 * Feedback 骨段方向余弦：对每条骨骼向量（from→to）比较用户 vs 老师的方向相似度。
 */

import { BP, normalize, type Kpt } from "@/lib/pose/scoring";

const MIN_VIS = 0.5;

export type BoneSpec = {
  /** 稳定 id，用于报告聚合 */
  id: string;
  label: string;
  from: number;
  to: number;
};

/** 跟拍 Feedback 使用的核心骨段（不含指尖等噪声边） */
export const FEEDBACK_BONES: BoneSpec[] = [
  { id: "leftUpperArm", label: "左上臂", from: BP.LEFT_SHOULDER, to: BP.LEFT_ELBOW },
  { id: "leftForearm", label: "左前臂", from: BP.LEFT_ELBOW, to: BP.LEFT_WRIST },
  { id: "rightUpperArm", label: "右上臂", from: BP.RIGHT_SHOULDER, to: BP.RIGHT_ELBOW },
  { id: "rightForearm", label: "右前臂", from: BP.RIGHT_ELBOW, to: BP.RIGHT_WRIST },
  { id: "leftThigh", label: "左大腿", from: BP.LEFT_HIP, to: BP.LEFT_KNEE },
  { id: "leftShin", label: "左小腿", from: BP.LEFT_KNEE, to: BP.LEFT_ANKLE },
  { id: "rightThigh", label: "右大腿", from: BP.RIGHT_HIP, to: BP.RIGHT_KNEE },
  { id: "rightShin", label: "右小腿", from: BP.RIGHT_KNEE, to: BP.RIGHT_ANKLE },
  { id: "leftTorsoSide", label: "左躯干侧", from: BP.LEFT_SHOULDER, to: BP.LEFT_HIP },
  { id: "rightTorsoSide", label: "右躯干侧", from: BP.RIGHT_SHOULDER, to: BP.RIGHT_HIP },
  { id: "shoulderLine", label: "肩线", from: BP.LEFT_SHOULDER, to: BP.RIGHT_SHOULDER },
  { id: "hipLine", label: "胯线", from: BP.LEFT_HIP, to: BP.RIGHT_HIP },
];

export type BoneFrameResult = {
  /** 骨段 id → 方向余弦 [-1, 1]；不可见的不出现 */
  boneCosines: Record<string, number>;
  /** 有效骨段平均余弦；无有效骨段时为 null */
  meanCosine: number | null;
};

function boneVector(kpts: Kpt[], from: number, to: number): [number, number, number] | null {
  const a = kpts[from];
  const b = kpts[to];
  if (!a || !b) return null;
  if ((a.visibility ?? 0) < MIN_VIS || (b.visibility ?? 0) < MIN_VIS) return null;
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const vz = b.z - a.z;
  const n = Math.hypot(vx, vy, vz);
  if (n < 1e-6) return null;
  return [vx / n, vy / n, vz / n];
}

/** 两单位向量点积 = 余弦（已归一化） */
export function cosineOfUnitVectors(a: [number, number, number], b: [number, number, number]): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/**
 * 对归一化后的骨架，逐骨段比较方向余弦。
 * 返回 meanCosine ∈ [-1,1]；越高越相似。
 */
export function scoreBonesByCosine(userKpts: Kpt[], teacherKpts: Kpt[]): BoneFrameResult {
  const u = normalize(userKpts);
  const t = normalize(teacherKpts);
  if (!u || !t) return { boneCosines: {}, meanCosine: null };

  const boneCosines: Record<string, number> = {};
  let sum = 0;
  let count = 0;

  for (const bone of FEEDBACK_BONES) {
    const uv = boneVector(u, bone.from, bone.to);
    const tv = boneVector(t, bone.from, bone.to);
    if (!uv || !tv) continue;
    const cos = Math.max(-1, Math.min(1, cosineOfUnitVectors(uv, tv)));
    boneCosines[bone.id] = Number(cos.toFixed(4));
    sum += cos;
    count += 1;
  }

  return {
    boneCosines,
    meanCosine: count > 0 ? sum / count : null,
  };
}

export function boneLabel(id: string): string {
  return FEEDBACK_BONES.find((b) => b.id === id)?.label ?? id;
}
