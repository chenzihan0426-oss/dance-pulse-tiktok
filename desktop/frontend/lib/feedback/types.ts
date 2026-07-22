/** Feedback 报告数据结构（阶段 1 数字 + 阶段 2 文案） */

export type FeedbackBoneStat = {
  id: string;
  label: string;
  /** 平均方向余弦 [-1, 1] */
  meanCosine: number;
  /** 由余弦映射的 0–100 */
  score: number;
};

export type FeedbackJointStat = {
  id: string;
  label: string;
  /** 角度误差均值 [0, 1]，越大越差 */
  meanError: number;
};

export type FeedbackInsight = {
  id: string;
  severity: "high" | "medium" | "low";
  /** 短标题，如「左肩」 */
  title: string;
  /** 问题描述 */
  problem: string;
  /** 改进建议 */
  tip: string;
  relatedSegmentIds: string[];
};

export type FeedbackSegmentComment = {
  segmentId: string;
  label: string;
  comment: string;
};

export type FeedbackSegmentReport = {
  segmentId: string;
  label: string;
  /** Feedback 主分：骨段余弦映射 0–100 */
  boneScore: number;
  /** 兼容旧链路：角度+点云融合分 0–100 */
  fusedScore: number;
  frameCount: number;
  bones: FeedbackBoneStat[];
  joints: FeedbackJointStat[];
  worstBoneId: string | null;
  worstJointId: string | null;
};

export type FeedbackReport = {
  version: 1;
  lessonId: string;
  lessonTitle?: string;
  createdAt: string;
  poseSource: string;
  frameCount: number;
  /** 全课骨段主分 0–100（按帧加权） */
  overallBoneScore: number;
  /** 全课融合分 0–100（按帧加权，便于对照） */
  overallFusedScore: number;
  segments: FeedbackSegmentReport[];
  /** 全课最差骨段 */
  worstBone: FeedbackBoneStat | null;
  /** 全课最差关节（角度误差最大） */
  worstJoint: FeedbackJointStat | null;
  /** 阶段 2：总评一句话 */
  headline: string;
  /** 阶段 2：3–5 条问题/建议 */
  insights: FeedbackInsight[];
  /** 阶段 2：分段点评 */
  segmentComments: FeedbackSegmentComment[];
};
