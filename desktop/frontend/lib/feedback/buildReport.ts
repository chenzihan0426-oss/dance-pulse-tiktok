import { boneLabel } from "./bones";
import { buildInsights } from "./insights";
import { cosineToScore100 } from "./scoreMap";
import type {
  FeedbackBoneStat,
  FeedbackJointStat,
  FeedbackReport,
  FeedbackSegmentReport,
} from "./types";
import type { SessionResult } from "@/lib/pose/sessionAccumulator";

const JOINT_LABELS: Record<string, string> = {
  leftElbow: "左肘",
  rightElbow: "右肘",
  leftShoulder: "左肩",
  rightShoulder: "右肩",
  leftKnee: "左膝",
  rightKnee: "右膝",
  leftHip: "左胯",
  rightHip: "右胯",
};

export type SegmentLabelLookup = Record<string, string>;

/**
 * 从扩展后的 SessionResult 构建 FeedbackReport。
 * 要求 session.segments[*] 带有 boneMeans（骨段平均余弦）。
 */
export function buildFeedbackReport(
  session: SessionResult,
  opts?: {
    lessonTitle?: string;
    segmentLabels?: SegmentLabelLookup;
    createdAt?: string;
  }
): FeedbackReport {
  const segmentLabels = opts?.segmentLabels ?? {};
  const segments: FeedbackSegmentReport[] = [];

  let boneWeighted = 0;
  let fusedWeighted = 0;
  let weight = 0;

  const globalBoneAcc = new Map<string, { sum: number; count: number }>();
  const globalJointAcc = new Map<string, { sum: number; count: number }>();

  for (const seg of session.segments) {
    const boneMeans = seg.boneMeans ?? {};
    const bones: FeedbackBoneStat[] = Object.entries(boneMeans).map(([id, meanCosine]) => ({
      id,
      label: boneLabel(id),
      meanCosine,
      score: cosineToScore100(meanCosine),
    }));
    bones.sort((a, b) => a.score - b.score);

    const joints: FeedbackJointStat[] = Object.entries(seg.jointErrors).map(([id, meanError]) => ({
      id,
      label: JOINT_LABELS[id] ?? id,
      meanError,
    }));
    joints.sort((a, b) => b.meanError - a.meanError);

    const meanCosineAll =
      bones.length > 0 ? bones.reduce((s, b) => s + b.meanCosine, 0) / bones.length : null;
    const boneScore = seg.boneScore ?? cosineToScore100(meanCosineAll);

    const worstBoneId = bones[0]?.id ?? null;
    const worstJointId = joints[0]?.id ?? null;

    segments.push({
      segmentId: seg.segmentId,
      label: segmentLabels[seg.segmentId] ?? seg.segmentId,
      boneScore,
      fusedScore: seg.score,
      frameCount: seg.frameCount,
      bones,
      joints,
      worstBoneId,
      worstJointId,
    });

    boneWeighted += boneScore * seg.frameCount;
    fusedWeighted += seg.score * seg.frameCount;
    weight += seg.frameCount;

    for (const [id, cos] of Object.entries(boneMeans)) {
      const acc = globalBoneAcc.get(id) ?? { sum: 0, count: 0 };
      acc.sum += cos * seg.frameCount;
      acc.count += seg.frameCount;
      globalBoneAcc.set(id, acc);
    }
    for (const [id, err] of Object.entries(seg.jointErrors)) {
      const acc = globalJointAcc.get(id) ?? { sum: 0, count: 0 };
      acc.sum += err * seg.frameCount;
      acc.count += seg.frameCount;
      globalJointAcc.set(id, acc);
    }
  }

  let worstBone: FeedbackBoneStat | null = null;
  for (const [id, acc] of globalBoneAcc.entries()) {
    if (acc.count <= 0) continue;
    const meanCosine = acc.sum / acc.count;
    const stat: FeedbackBoneStat = {
      id,
      label: boneLabel(id),
      meanCosine: Number(meanCosine.toFixed(4)),
      score: cosineToScore100(meanCosine),
    };
    if (!worstBone || stat.score < worstBone.score) worstBone = stat;
  }

  let worstJoint: FeedbackJointStat | null = null;
  for (const [id, acc] of globalJointAcc.entries()) {
    if (acc.count <= 0) continue;
    const meanError = Number((acc.sum / acc.count).toFixed(4));
    const stat: FeedbackJointStat = {
      id,
      label: JOINT_LABELS[id] ?? id,
      meanError,
    };
    if (!worstJoint || stat.meanError > worstJoint.meanError) worstJoint = stat;
  }

  const base = {
    version: 1 as const,
    lessonId: session.lessonId,
    lessonTitle: opts?.lessonTitle,
    createdAt: opts?.createdAt ?? new Date().toISOString(),
    poseSource: session.poseSource,
    frameCount: session.frameCount,
    overallBoneScore: weight > 0 ? Math.round(boneWeighted / weight) : 0,
    overallFusedScore: weight > 0 ? Math.round(fusedWeighted / weight) : session.overallScore,
    segments,
    worstBone,
    worstJoint,
  };

  const narrative = buildInsights(base);
  return { ...base, ...narrative };
}
