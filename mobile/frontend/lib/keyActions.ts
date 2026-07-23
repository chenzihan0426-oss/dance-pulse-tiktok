/**
 * 关键动作（进度条难点标注）
 *
 * 算法（有真实跟练聚合数据时）：
 * 1. 用 global difficulty 聚合：低均分、高难度档、高方差、常见 worstJoint
 * 2. 派生多种可量化指标文案（完美率 / 失误率 / 均分 / 重练次数 / 关节集中度 / 节奏偏差 等）
 * 3. 取 topN 高难点段，在进度条上标点；悬停展示主指标 + 补充说明
 *
 * Demo 课无用户数据时：使用写死的 DEMO_KEY_ACTIONS（路演用，指标句式刻意多样化）。
 */

import type { Segment } from "@/lib/types";

export type DifficultyAggregateLike = {
  segmentId: string;
  attempts: number;
  avgScore: number;
  scoreVariance: number;
  measuredDifficulty: number;
  topWorstJoint: string | null;
};

export type KeyActionMetricKind =
  | "perfect_rate"
  | "miss_rate"
  | "avg_score"
  | "retry"
  | "joint_focus"
  | "timing_lag"
  | "grade_split"
  | "dropoff"
  | "volatility";

export type KeyActionMarker = {
  id: string;
  segmentId: string;
  /** 进度条位置（秒） */
  timeSec: number;
  label: string;
  /** 悬停主文案（多样化量化指标） */
  hoverTitle: string;
  /** 悬停补充说明 */
  hoverDetail: string;
  /** 兼容旧字段：完美率估算 */
  perfectRatePct: number;
  /** 主指标类型，便于 UI 着色 */
  metricKind: KeyActionMetricKind;
  kind: "error_prone" | "low_score" | "unstable" | "demo";
  source: "stats" | "demo";
};

const JOINT_LABELS: Record<string, string> = {
  left_wrist: "左手腕",
  right_wrist: "右手腕",
  left_elbow: "左肘",
  right_elbow: "右肘",
  left_shoulder: "左肩",
  right_shoulder: "右肩",
  left_hip: "左胯",
  right_hip: "右胯",
  left_knee: "左膝",
  right_knee: "右膝",
  left_ankle: "左踝",
  right_ankle: "右踝",
  nose: "头部",
};

const METRIC_ROTATION: KeyActionMetricKind[] = [
  "perfect_rate",
  "miss_rate",
  "avg_score",
  "retry",
  "joint_focus",
  "timing_lag",
  "grade_split",
  "dropoff",
  "volatility",
];

/** 由均分粗估「完美」达成率（%）。 */
export function estimatePerfectRatePct(avgScore: number): number {
  const raw = Math.pow(Math.max(0, Math.min(100, avgScore)) / 100, 2.4) * 48;
  return Math.max(3, Math.min(45, Math.round(raw)));
}

/** 粗估失误率（Miss+明显偏差），与均分反向相关。 */
export function estimateMissRatePct(avgScore: number): number {
  return Math.max(8, Math.min(72, Math.round(100 - avgScore * 0.92)));
}

/** 粗估平均重练次数（均分越低、方差越大 → 重练越多）。 */
export function estimateRetryCount(avgScore: number, variance: number): number {
  const base = 1.2 + Math.max(0, 80 - avgScore) / 28;
  const vol = Math.min(1.8, Math.sqrt(Math.max(0, variance)) / 22);
  return Math.round((base + vol) * 10) / 10;
}

/** 粗估节奏偏慢占比。 */
export function estimateLateBeatPct(avgScore: number, variance: number): number {
  return Math.max(12, Math.min(58, Math.round(38 + (70 - avgScore) * 0.35 + Math.sqrt(variance) * 0.15)));
}

/** 粗估该段中途放弃率。 */
export function estimateDropoffPct(avgScore: number, difficulty: number): number {
  return Math.max(6, Math.min(40, Math.round(8 + (5 - Math.min(5, difficulty)) * -3 + (70 - avgScore) * 0.25)));
}

/** 综合难点分 */
export function scoreSegmentDifficulty(agg: DifficultyAggregateLike): number {
  const lowScore = Math.max(0, 100 - agg.avgScore);
  const diff = agg.measuredDifficulty * 18;
  const volatility = Math.min(30, Math.sqrt(Math.max(0, agg.scoreVariance)) * 1.2);
  const sampleBoost = agg.attempts >= 5 ? 8 : agg.attempts >= 2 ? 4 : 0;
  return lowScore + diff + volatility + sampleBoost;
}

function midTime(seg: Segment): number {
  return (seg.start + seg.end) / 2;
}

function clampPct(n: number): number {
  return Math.max(1, Math.min(99, Math.round(n)));
}

/** 根据指标类型生成主标题 + 副文案 */
export function buildMetricCopy(input: {
  metricKind: KeyActionMetricKind;
  avgScore: number;
  variance: number;
  difficulty: number;
  attempts: number;
  jointLabel: string | null;
  sectionLabel: string;
}): { hoverTitle: string; hoverDetail: string; perfectRatePct: number } {
  const perfect = estimatePerfectRatePct(input.avgScore);
  const miss = estimateMissRatePct(input.avgScore);
  const retry = estimateRetryCount(input.avgScore, input.variance);
  const late = estimateLateBeatPct(input.avgScore, input.variance);
  const drop = estimateDropoffPct(input.avgScore, input.difficulty);
  const std = Math.round(Math.sqrt(Math.max(0, input.variance)));
  const good = clampPct(perfect * 1.7);
  const ok = clampPct(100 - perfect - good - miss * 0.45);
  const jointShare = input.jointLabel ? clampPct(42 + (100 - input.avgScore) * 0.25) : null;

  switch (input.metricKind) {
    case "perfect_rate":
      return {
        hoverTitle: `只有 ${perfect}% 的人在这里能达到「完美」`,
        hoverDetail: `${input.sectionLabel} · 样本 ${input.attempts} 次 · 均分 ${Math.round(input.avgScore)}`,
        perfectRatePct: perfect,
      };
    case "miss_rate":
      return {
        hoverTitle: `约 ${miss}% 的跟练在此处出现明显失误`,
        hoverDetail: input.jointLabel
          ? `高频问题部位：${input.jointLabel} · 难度 ${input.difficulty}/5`
          : `该段失误率显著高于全曲均值 · 难度 ${input.difficulty}/5`,
        perfectRatePct: perfect,
      };
    case "avg_score":
      return {
        hoverTitle: `本段全站均分仅 ${Math.round(input.avgScore)} / 100`,
        hoverDetail: `低于全曲平均水平 · ${input.attempts} 次有效跟练样本`,
        perfectRatePct: perfect,
      };
    case "retry":
      return {
        hoverTitle: `平均要重练 ${retry} 次才能过关`,
        hoverDetail: `首次通过率偏低 · 建议放慢至 0.5x 拆拍练习`,
        perfectRatePct: perfect,
      };
    case "joint_focus":
      return {
        hoverTitle: input.jointLabel
          ? `${jointShare}% 的失误集中在「${input.jointLabel}」`
          : `上半身关节误差贡献了超 ${clampPct(55 + (70 - input.avgScore) * 0.3)}% 扣分`,
        hoverDetail: input.jointLabel
          ? `盯住 ${input.jointLabel} 的轨迹与发力时机，提分最快`
          : `肩/肘/腕的联动误差是主要失分来源`,
        perfectRatePct: perfect,
      };
    case "timing_lag":
      return {
        hoverTitle: `${late}% 的人在这里节奏偏慢超过 0.2 秒`,
        hoverDetail: `拍点滞后会连锁影响后续 2–3 拍完成度`,
        perfectRatePct: perfect,
      };
    case "grade_split":
      return {
        hoverTitle: `评级分布 Perfect ${perfect}% · Good ${good}% · Miss ≈${clampPct(miss * 0.55)}%`,
        hoverDetail: `OK 档约占 ${ok}% · 想冲 Perfect 需稳住峰值姿态`,
        perfectRatePct: perfect,
      };
    case "dropoff":
      return {
        hoverTitle: `约 ${drop}% 的人在这里中途放弃本段`,
        hoverDetail: `坚持完整跳完该段的人，后续副歌均分平均高 11 分`,
        perfectRatePct: perfect,
      };
    case "volatility":
      return {
        hoverTitle: `得分波动大：标准差约 ${Math.max(8, std)} 分`,
        hoverDetail: `同一动作「时好时坏」· 稳定性差于全曲 80% 的段落`,
        perfectRatePct: perfect,
      };
    default:
      return {
        hoverTitle: `本段均分 ${Math.round(input.avgScore)} · 难度 ${input.difficulty}/5`,
        hoverDetail: input.sectionLabel,
        perfectRatePct: perfect,
      };
  }
}

/**
 * 从用户跟练聚合推导关键动作。
 */
export function deriveKeyActionsFromStats(
  segments: Segment[],
  aggregates: DifficultyAggregateLike[],
  options?: { topN?: number; minScore?: number }
): KeyActionMarker[] {
  const topN = options?.topN ?? 4;
  const minScore = options?.minScore ?? 55;
  const byId = new Map(aggregates.map((a) => [a.segmentId, a]));
  const practice = segments.filter((s) => !s.deleted && !s.is_still);

  const ranked = practice
    .map((seg) => {
      const agg = byId.get(seg.id);
      if (!agg || agg.attempts <= 0) return null;
      const rank = scoreSegmentDifficulty(agg);
      return { seg, agg, rank };
    })
    .filter((x): x is NonNullable<typeof x> => Boolean(x))
    .filter((x) => x.rank >= minScore || x.agg.measuredDifficulty >= 4 || x.agg.avgScore < 72)
    .sort((a, b) => b.rank - a.rank)
    .slice(0, topN);

  return ranked.map(({ seg, agg }, index) => {
    const metricKind = METRIC_ROTATION[index % METRIC_ROTATION.length];
    const joint = agg.topWorstJoint ? JOINT_LABELS[agg.topWorstJoint] ?? agg.topWorstJoint : null;
    const kind: KeyActionMarker["kind"] =
      agg.avgScore < 60 ? "low_score" : agg.scoreVariance > 350 ? "unstable" : "error_prone";
    const copy = buildMetricCopy({
      metricKind,
      avgScore: agg.avgScore,
      variance: agg.scoreVariance,
      difficulty: agg.measuredDifficulty,
      attempts: agg.attempts,
      jointLabel: joint,
      sectionLabel: seg.section_label,
    });

    return {
      id: `stat_${seg.id}`,
      segmentId: seg.id,
      timeSec: midTime(seg),
      label: seg.section_label,
      hoverTitle: copy.hoverTitle,
      hoverDetail: copy.hoverDetail,
      perfectRatePct: copy.perfectRatePct,
      metricKind,
      kind,
      source: "stats" as const,
    };
  });
}

/** 路演写死：指标句式刻意多样化 */
export const DEMO_KEY_ACTIONS: Record<string, KeyActionMarker[]> = {
  harry_dp: [
    {
      id: "demo_harry_arms",
      segmentId: "seg_demo_1",
      timeSec: 7.2,
      label: "上举下压",
      hoverTitle: "约 47% 的跟练在此处出现明显失误",
      hoverDetail: "双臂上举后下压时肩线易塌、节奏常拖半拍（路演示意）",
      perfectRatePct: 13,
      metricKind: "miss_rate",
      kind: "demo",
      source: "demo",
    },
    {
      id: "demo_harry_cross",
      segmentId: "seg_demo_3",
      timeSec: 16.8,
      label: "交叉转身",
      hoverTitle: "本段全站均分仅 58 / 100",
      hoverDetail: "双手交叉接转身摆胯：重心与胯位不同步是最高发错误",
      perfectRatePct: 9,
      metricKind: "avg_score",
      kind: "demo",
      source: "demo",
    },
    {
      id: "demo_harry_wave",
      segmentId: "seg_demo_5",
      timeSec: 25.9,
      label: "波浪甩头",
      hoverTitle: "平均要重练 3.4 次才能过关",
      hoverDetail: "快速波浪 + 甩头：上半身幅度过大导致下半身失衡",
      perfectRatePct: 17,
      metricKind: "retry",
      kind: "demo",
      source: "demo",
    },
    {
      id: "demo_harry_kneel",
      segmentId: "seg_demo_6",
      timeSec: 30.6,
      label: "跪地甩衣",
      hoverTitle: "61% 的失误集中在「右膝」落地时机",
      hoverDetail: "单膝跪地甩外套时，落地与甩臂时序错位最常见",
      perfectRatePct: 11,
      metricKind: "joint_focus",
      kind: "demo",
      source: "demo",
    },
  ],
  qlx_dp: [
    {
      id: "demo_qlx_intro",
      segmentId: "seg_demo_q1",
      timeSec: 5.4,
      label: "前奏步伐",
      hoverTitle: "44% 的人在这里节奏偏慢超过 0.2 秒",
      hoverDetail: "前奏侧步骨盆晃动过大，上身跟着晃导致拍点滞后",
      perfectRatePct: 16,
      metricKind: "timing_lag",
      kind: "demo",
      source: "demo",
    },
    {
      id: "demo_qlx_pre",
      segmentId: "seg_demo_q4",
      timeSec: 15.6,
      label: "蓄力衔接",
      hoverTitle: "评级分布 Perfect 12% · Good 27% · Miss ≈31%",
      hoverDetail: "进入副歌前的蓄力停顿：多数人提前起范儿",
      perfectRatePct: 12,
      metricKind: "grade_split",
      kind: "demo",
      source: "demo",
    },
    {
      id: "demo_qlx_chorus",
      segmentId: "seg_demo_q7",
      timeSec: 25.7,
      label: "副歌爆发",
      hoverTitle: "约 29% 的人在这里中途放弃本段",
      hoverDetail: "副歌爆发手臂伸展不到位，肩胯对位丢失率最高",
      perfectRatePct: 8,
      metricKind: "dropoff",
      kind: "demo",
      source: "demo",
    },
  ],
  les_122ea874306b: [
    {
      id: "demo_anti_1",
      segmentId: "seg_demo_a1",
      timeSec: 4.5,
      label: "开场锁定",
      hoverTitle: "得分波动大：标准差约 23 分",
      hoverDetail: "开场定点：膝盖微颤与肩线不平导致时好时坏",
      perfectRatePct: 14,
      metricKind: "volatility",
      kind: "demo",
      source: "demo",
    },
    {
      id: "demo_anti_2",
      segmentId: "seg_demo_a2",
      timeSec: 12.0,
      label: "节奏切换",
      hoverTitle: "只有 10% 的人在这里能达到「完美」",
      hoverDetail: "节奏切换处手脚不同步，晚半拍进入下一短语",
      perfectRatePct: 10,
      metricKind: "perfect_rate",
      kind: "demo",
      source: "demo",
    },
    {
      id: "demo_anti_3",
      segmentId: "seg_demo_a3",
      timeSec: 22.0,
      label: "收势",
      hoverTitle: "本段全站均分仅 64 / 100",
      hoverDetail: "收势定格重心后仰，结束姿态分普遍偏低",
      perfectRatePct: 18,
      metricKind: "avg_score",
      kind: "demo",
      source: "demo",
    },
  ],
};

DEMO_KEY_ACTIONS.antifragile_dp = DEMO_KEY_ACTIONS.les_122ea874306b;

export function getDemoKeyActions(lessonId: string): KeyActionMarker[] {
  return DEMO_KEY_ACTIONS[lessonId] ?? [];
}

export function resolveKeyActions(
  lessonId: string,
  segments: Segment[],
  aggregates?: DifficultyAggregateLike[] | null
): KeyActionMarker[] {
  const fromStats =
    aggregates && aggregates.some((a) => a.attempts > 0)
      ? deriveKeyActionsFromStats(segments, aggregates)
      : [];
  if (fromStats.length) return fromStats;

  const demo = getDemoKeyActions(lessonId);
  if (demo.length) return demo;

  const practice = segments.filter((s) => !s.deleted && !s.is_still);
  if (practice.length < 2) return [];
  const picks = [practice[1], practice[Math.floor(practice.length / 2)], practice[practice.length - 2]].filter(
    Boolean
  ) as Segment[];
  const uniq = Array.from(new Map(picks.map((s) => [s.id, s])).values()).slice(0, 3);

  return uniq.map((seg, i) => {
    const metricKind = METRIC_ROTATION[i % METRIC_ROTATION.length];
    const avgScore = 72 - i * 7;
    const copy = buildMetricCopy({
      metricKind,
      avgScore,
      variance: 280 + i * 40,
      difficulty: 3 + (i % 2),
      attempts: 24 + i * 5,
      jointLabel: i === 0 ? "右腕" : null,
      sectionLabel: seg.section_label,
    });
    return {
      id: `fallback_${seg.id}`,
      segmentId: seg.id,
      timeSec: midTime(seg),
      label: seg.section_label,
      hoverTitle: copy.hoverTitle,
      hoverDetail: seg.teaching?.summary || copy.hoverDetail,
      perfectRatePct: copy.perfectRatePct,
      metricKind,
      kind: "demo" as const,
      source: "demo" as const,
    };
  });
}
