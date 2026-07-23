/**
 * Feedback 阶段 3：实时 HUD / 骨架高亮用的热点映射。
 */

import { BP, JOINTS, scoreFrameDetailed, type Kpt } from "@/lib/pose/scoring";
import { scoreBonesByCosine, FEEDBACK_BONES } from "./bones";

export const JOINT_LABELS_ZH: Record<string, string> = {
  leftElbow: "左肘",
  rightElbow: "右肘",
  leftShoulder: "左肩",
  rightShoulder: "右肩",
  leftKnee: "左膝",
  rightKnee: "右膝",
  leftHip: "左胯",
  rightHip: "右胯",
};

/** 关节中心关键点（用于圆点高亮） */
export const JOINT_VERTEX: Record<string, number> = {
  leftElbow: BP.LEFT_ELBOW,
  rightElbow: BP.RIGHT_ELBOW,
  leftShoulder: BP.LEFT_SHOULDER,
  rightShoulder: BP.RIGHT_SHOULDER,
  leftKnee: BP.LEFT_KNEE,
  rightKnee: BP.RIGHT_KNEE,
  leftHip: BP.LEFT_HIP,
  rightHip: BP.RIGHT_HIP,
};

/** 与关节相关的骨架连线（用于描边高亮） */
export const JOINT_EDGES: Record<string, Array<[number, number]>> = {
  leftElbow: [
    [BP.LEFT_SHOULDER, BP.LEFT_ELBOW],
    [BP.LEFT_ELBOW, BP.LEFT_WRIST],
  ],
  rightElbow: [
    [BP.RIGHT_SHOULDER, BP.RIGHT_ELBOW],
    [BP.RIGHT_ELBOW, BP.RIGHT_WRIST],
  ],
  leftShoulder: [
    [BP.LEFT_SHOULDER, BP.RIGHT_SHOULDER],
    [BP.LEFT_SHOULDER, BP.LEFT_ELBOW],
    [BP.LEFT_SHOULDER, BP.LEFT_HIP],
  ],
  rightShoulder: [
    [BP.LEFT_SHOULDER, BP.RIGHT_SHOULDER],
    [BP.RIGHT_SHOULDER, BP.RIGHT_ELBOW],
    [BP.RIGHT_SHOULDER, BP.RIGHT_HIP],
  ],
  leftKnee: [
    [BP.LEFT_HIP, BP.LEFT_KNEE],
    [BP.LEFT_KNEE, BP.LEFT_ANKLE],
  ],
  rightKnee: [
    [BP.RIGHT_HIP, BP.RIGHT_KNEE],
    [BP.RIGHT_KNEE, BP.RIGHT_ANKLE],
  ],
  leftHip: [
    [BP.LEFT_SHOULDER, BP.LEFT_HIP],
    [BP.LEFT_HIP, BP.RIGHT_HIP],
    [BP.LEFT_HIP, BP.LEFT_KNEE],
  ],
  rightHip: [
    [BP.RIGHT_SHOULDER, BP.RIGHT_HIP],
    [BP.LEFT_HIP, BP.RIGHT_HIP],
    [BP.RIGHT_HIP, BP.RIGHT_KNEE],
  ],
};

export type LiveScoreTier = "great" | "good" | "ok" | "miss";

export function scoreToTier(score: number): LiveScoreTier {
  if (score >= 85) return "great";
  if (score >= 70) return "good";
  if (score >= 50) return "ok";
  return "miss";
}

export function tierLabel(tier: LiveScoreTier): string {
  switch (tier) {
    case "great":
      return "很棒";
    case "good":
      return "不错";
    case "ok":
      return "加油";
    default:
      return "跟紧";
  }
}

export type LiveHotspot = {
  jointId: string;
  label: string;
  /** 角度误差 0–1 */
  error: number;
  vertex: number;
  edges: Array<[number, number]>;
  /** 可选：同帧最差骨段 id */
  boneId?: string;
  boneLabel?: string;
};

const HOTSPOT_MIN_ERROR = 0.18;

/**
 * 根据当前帧 user vs teacher 选出最需纠正的关节。
 * 误差过低时返回 null（整体已经够好，不必高亮）。
 */
export function pickLiveHotspot(user: Kpt[], teacher: Kpt[]): LiveHotspot | null {
  const detail = scoreFrameDetailed(user, teacher);
  let worstId: string | null = null;
  let worstErr = 0;
  for (const j of JOINTS) {
    const e = detail.jointErrors[j.name];
    if (typeof e !== "number") continue;
    if (e > worstErr) {
      worstErr = e;
      worstId = j.name;
    }
  }
  if (!worstId || worstErr < HOTSPOT_MIN_ERROR) return null;

  const bone = scoreBonesByCosine(user, teacher);
  let boneId: string | undefined;
  let boneLab: string | undefined;
  let worstCos = 1;
  for (const [id, cos] of Object.entries(bone.boneCosines)) {
    if (cos < worstCos) {
      worstCos = cos;
      boneId = id;
      boneLab = FEEDBACK_BONES.find((b) => b.id === id)?.label;
    }
  }

  return {
    jointId: worstId,
    label: JOINT_LABELS_ZH[worstId] ?? worstId,
    error: worstErr,
    vertex: JOINT_VERTEX[worstId] ?? BP.NOSE,
    edges: JOINT_EDGES[worstId] ?? [],
    boneId,
    boneLabel: boneLab,
  };
}
