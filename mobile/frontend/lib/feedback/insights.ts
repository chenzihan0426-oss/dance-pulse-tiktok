/**
 * Feedback 阶段 2：规则化诊断文案（不接 LLM）。
 * 根据骨段余弦分 / 关节角度误差生成总评 + 问题/建议 + 分段点评。
 */

import type {
  FeedbackBoneStat,
  FeedbackInsight,
  FeedbackJointStat,
  FeedbackReport,
  FeedbackSegmentReport,
} from "./types";

const JOINT_INSIGHTS: Record<
  string,
  { problem: string; tip: string; severityBoost?: number }
> = {
  leftShoulder: {
    problem: "左侧手臂与躯干的夹角经常偏小或开合时机不准",
    tip: "练习时刻意把左臂抬高、打开，对照老师肩线，避免手臂贴身发力",
  },
  rightShoulder: {
    problem: "右侧手臂与躯干的夹角经常偏小或开合时机不准",
    tip: "把右臂打开到与老师相近的幅度，可用镜子确认肩肘是否在一条舒展线上",
  },
  leftElbow: {
    problem: "左肘弯曲角度与老师差异较大，手臂线条容易「折」或「僵」",
    tip: "放慢到 0.5x，单独练左臂：肘的开合要跟拍点走，不要提前锁死",
  },
  rightElbow: {
    problem: "右肘弯曲角度与老师差异较大，手臂线条容易「折」或「僵」",
    tip: "盯住右腕轨迹，让肘作为中间环节跟随，而不是主动甩肘",
  },
  leftKnee: {
    problem: "左膝屈伸幅度或时机不准，下半身支撑不够稳",
    tip: "注意膝盖与脚尖同向，下沉时重心落在脚掌中部，避免跪跪软塌",
  },
  rightKnee: {
    problem: "右膝屈伸幅度或时机不准，下半身支撑不够稳",
    tip: "副歌爆发前先稳住右腿支撑，再发力，减少膝盖内外晃",
  },
  leftHip: {
    problem: "左胯发力或位移与老师不一致，重心容易偏",
    tip: "胯主动「推/收」时上身少跟着晃，先慢速对胯位再提速",
  },
  rightHip: {
    problem: "右胯发力或位移与老师不一致，重心容易偏",
    tip: "用骨盆中线想象一条竖轴，右胯动作绕轴转，而不是整个人歪过去",
  },
};

const BONE_INSIGHTS: Record<string, { problem: string; tip: string }> = {
  leftUpperArm: {
    problem: "左上臂方向与老师偏差大，肩到肘的「杆」没有摆正",
    tip: "把左上臂当成指针，先对齐肩→肘方向，再管小臂",
  },
  rightUpperArm: {
    problem: "右上臂方向与老师偏差大，肩到肘的「杆」没有摆正",
    tip: "先定右肩高度，再伸肘，避免上臂过早内收",
  },
  leftForearm: {
    problem: "左前臂朝向不准，手部结束位容易飘",
    tip: "看老师手腕落点，用前臂把腕「送到」目标点再定格",
  },
  rightForearm: {
    problem: "右前臂朝向不准，手部结束位容易飘",
    tip: "右手造型时前臂与上臂夹角要稳定，可对着镜头练定格 2 秒",
  },
  leftThigh: {
    problem: "左大腿朝向偏差大，步伐/站位容易拧",
    tip: "侧步或下沉时先摆正左大腿朝向，再落脚",
  },
  rightThigh: {
    problem: "右大腿朝向偏差大，步伐/站位容易拧",
    tip: "注意右膝不要内扣，大腿外侧略微外展更贴老师",
  },
  leftShin: {
    problem: "左小腿方向不稳，落地缓冲或踢腿线条打折",
    tip: "落地时小腿竖直感要够，避免脚尖先「刨」地",
  },
  rightShin: {
    problem: "右小腿方向不稳，落地缓冲或踢腿线条打折",
    tip: "踢腿或点地时想象小腿沿老师轨迹扫过，幅度可略收一点求稳",
  },
  leftTorsoSide: {
    problem: "左侧躯干线条（肩到胯）塌或拧，上身框架松",
    tip: "收紧左侧腰腹，保持肩胯反向延展，像一根有弹性的弹簧",
  },
  rightTorsoSide: {
    problem: "右侧躯干线条（肩到胯）塌或拧，上身框架松",
    tip: "右侧肋骨略上提，避免塌腰或耸肩代偿",
  },
  shoulderLine: {
    problem: "双肩连线倾斜或扭转偏大，上身「架子」不正",
    tip: "开场与定格时先摆平肩线，再做手臂花样",
  },
  hipLine: {
    problem: "双胯连线偏斜，重心左右不均",
    tip: "胯保持水平再做推胯，左右脚承重交替要干净",
  },
};

function jointSeverity(err: number): FeedbackInsight["severity"] {
  if (err >= 0.55) return "high";
  if (err >= 0.35) return "medium";
  return "low";
}

function boneSeverity(score: number): FeedbackInsight["severity"] {
  if (score < 45) return "high";
  if (score < 65) return "medium";
  return "low";
}

function severityRank(s: FeedbackInsight["severity"]): number {
  return s === "high" ? 3 : s === "medium" ? 2 : 1;
}

function headlineForScore(score: number, top?: FeedbackInsight | null): string {
  if (score >= 88) {
    return "整体贴合度很高，骨段方向与老师基本同频，细节打磨即可冲 Perfect。";
  }
  if (score >= 75) {
    return top
      ? `表现稳定，仍有提升空间：优先盯紧「${top.title}」。`
      : "表现稳定偏上，继续巩固峰值姿态与拍点同步。";
  }
  if (score >= 58) {
    return top
      ? `中等完成度。最大短板在「${top.title}」，建议拆拍慢练后再提速。`
      : "中等完成度，建议先稳住躯干与下肢支撑，再追求手臂花样。";
  }
  if (score >= 40) {
    return top
      ? `跟拍偏差偏大，请先攻克「${top.title}」，其余动作可暂时降速。`
      : "跟拍偏差偏大，建议 0.5x 分段跟练，每段过关再串联。";
  }
  return "当前与老师骨架差异明显。请确认摄像头取景完整、全身入镜，并先慢速对齐基础站位。";
}

function segmentBlurb(seg: FeedbackSegmentReport): string {
  if (seg.boneScore >= 85) {
    return `「${seg.label}」完成度高，骨段方向稳定。`;
  }
  const worstBone = seg.bones[0];
  const worstJoint = seg.joints[0];
  if (seg.boneScore >= 70) {
    if (worstBone && worstBone.score < 75) {
      return `「${seg.label}」整体尚可，留意${worstBone.label}的朝向。`;
    }
    return `「${seg.label}」中上水平，保持节奏即可。`;
  }
  if (worstJoint && worstJoint.meanError >= 0.35) {
    return `「${seg.label}」偏弱，${worstJoint.label}角度误差偏大，建议单独回放该段。`;
  }
  if (worstBone) {
    return `「${seg.label}」偏弱，${worstBone.label}与老师方向差较多。`;
  }
  return `「${seg.label}」采样不足或姿态不稳定，可再挑战一次补帧。`;
}

/**
 * 基于已聚合的报告数字，生成中文诊断（纯规则）。
 */
export function buildInsights(report: Omit<FeedbackReport, "headline" | "insights" | "segmentComments"> & {
  headline?: string;
  insights?: FeedbackInsight[];
  segmentComments?: FeedbackReport["segmentComments"];
}): Pick<FeedbackReport, "headline" | "insights" | "segmentComments"> {
  const candidates: FeedbackInsight[] = [];

  const joints = collectGlobalJoints(report);
  for (const j of joints) {
    if (j.meanError < 0.28) continue;
    const tpl = JOINT_INSIGHTS[j.id];
    if (!tpl) continue;
    candidates.push({
      id: `joint_${j.id}`,
      severity: jointSeverity(j.meanError),
      title: j.label,
      problem: tpl.problem,
      tip: tpl.tip,
      relatedSegmentIds: segmentsTouchingJoint(report.segments, j.id),
    });
  }

  const bones = collectGlobalBones(report);
  for (const b of bones) {
    if (b.score >= 68) continue;
    const tpl = BONE_INSIGHTS[b.id];
    if (!tpl) continue;
    candidates.push({
      id: `bone_${b.id}`,
      severity: boneSeverity(b.score),
      title: b.label,
      problem: tpl.problem,
      tip: tpl.tip,
      relatedSegmentIds: segmentsTouchingBone(report.segments, b.id),
    });
  }

  // 去重：同名 title 留 severity 更高者
  const byTitle = new Map<string, FeedbackInsight>();
  for (const c of candidates) {
    const prev = byTitle.get(c.title);
    if (!prev || severityRank(c.severity) > severityRank(prev.severity)) {
      byTitle.set(c.title, c);
    }
  }

  const insights = Array.from(byTitle.values())
    .sort((a, b) => severityRank(b.severity) - severityRank(a.severity))
    .slice(0, 5);

  const segmentComments = report.segments.map((seg) => ({
    segmentId: seg.segmentId,
    label: seg.label,
    comment: segmentBlurb(seg),
  }));

  return {
    headline: headlineForScore(report.overallBoneScore, insights[0] ?? null),
    insights,
    segmentComments,
  };
}

function collectGlobalJoints(report: {
  worstJoint: FeedbackJointStat | null;
  segments: FeedbackSegmentReport[];
}): FeedbackJointStat[] {
  const map = new Map<string, FeedbackJointStat>();
  for (const seg of report.segments) {
    for (const j of seg.joints) {
      const prev = map.get(j.id);
      if (!prev || j.meanError > prev.meanError) map.set(j.id, j);
    }
  }
  if (report.worstJoint) map.set(report.worstJoint.id, report.worstJoint);
  return Array.from(map.values()).sort((a, b) => b.meanError - a.meanError);
}

function collectGlobalBones(report: {
  worstBone: FeedbackBoneStat | null;
  segments: FeedbackSegmentReport[];
}): FeedbackBoneStat[] {
  const map = new Map<string, FeedbackBoneStat>();
  for (const seg of report.segments) {
    for (const b of seg.bones) {
      const prev = map.get(b.id);
      if (!prev || b.score < prev.score) map.set(b.id, b);
    }
  }
  if (report.worstBone) map.set(report.worstBone.id, report.worstBone);
  return Array.from(map.values()).sort((a, b) => a.score - b.score);
}

function segmentsTouchingJoint(segments: FeedbackSegmentReport[], jointId: string): string[] {
  return segments
    .filter((s) => s.joints.some((j) => j.id === jointId && j.meanError >= 0.28))
    .map((s) => s.segmentId)
    .slice(0, 3);
}

function segmentsTouchingBone(segments: FeedbackSegmentReport[], boneId: string): string[] {
  return segments
    .filter((s) => s.bones.some((b) => b.id === boneId && b.score < 68))
    .map((s) => s.segmentId)
    .slice(0, 3);
}
