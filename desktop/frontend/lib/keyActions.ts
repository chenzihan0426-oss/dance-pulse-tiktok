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

/** 路演写死：指标句式刻意多样化(全部对应真实课程,动作描述贴合视频) */
export const DEMO_KEY_ACTIONS: Record<string, KeyActionMarker[]> = {
  les_1309562bc052: [
    {
      id: "demo_wil_a_point",
      segmentId: "seg_001",
      timeSec: 4.2,
      label: "侧点手",
      hoverTitle: "只有 21% 的人这里能拿到「完美」",
      hoverDetail: "双手交替侧点时肘部易掉,拍子常抢半拍",
      perfectRatePct: 21,
      metricKind: "perfect_rate",
      kind: "demo",
      source: "demo",
    },
    {
      id: "demo_wil_a_reach",
      segmentId: "seg_002",
      timeSec: 7.1,
      label: "斜上伸展",
      hoverTitle: "本段全站均分仅 63 / 100",
      hoverDetail: "单臂斜上撑开时躯干跟着歪是最高发错误",
      perfectRatePct: 12,
      metricKind: "avg_score",
      kind: "demo",
      source: "demo",
    },
    {
      id: "demo_wil_a_open",
      segmentId: "seg_004",
      timeSec: 12.6,
      label: "双臂平开",
      hoverTitle: "约 44% 的跟练在此处失误",
      hoverDetail: "双臂两侧平开的高度不一致,右臂普遍偏低",
      perfectRatePct: 16,
      metricKind: "miss_rate",
      kind: "demo",
      source: "demo",
    },
    {
      id: "demo_wil_a_up",
      segmentId: "seg_007",
      timeSec: 20.9,
      label: "欢呼上举",
      hoverTitle: "平均要重练 2.8 次才能过关",
      hoverDetail: "双手高举摆动时重心上浮,脚步跟不上节拍",
      perfectRatePct: 18,
      metricKind: "retry",
      kind: "demo",
      source: "demo",
    },
  ],
  les_05f402625586: [
    {
      id: "demo_wil_b_cheek",
      segmentId: "seg_002",
      timeSec: 6.8,
      label: "托腮心动",
      hoverTitle: "只有 19% 的人托腮定格卡上拍点",
      hoverDetail: "经典托腮「?」造型,手到脸颊的时机普遍晚半拍",
      perfectRatePct: 19,
      metricKind: "perfect_rate",
      kind: "demo",
      source: "demo",
    },
    {
      id: "demo_wil_b_step",
      segmentId: "seg_004",
      timeSec: 12.4,
      label: "垫步转身",
      hoverTitle: "58% 的失误集中在「左脚」落点",
      hoverDetail: "草地垫步转身时左脚落点偏内,身体晃动明显",
      perfectRatePct: 11,
      metricKind: "joint_focus",
      kind: "demo",
      source: "demo",
    },
    {
      id: "demo_wil_b_swing",
      segmentId: "seg_008",
      timeSec: 23.5,
      label: "甩发回眸",
      hoverTitle: "本段节奏平均滞后 160ms",
      hoverDetail: "甩发接回眸的连贯动作,普遍比原速慢一档",
      perfectRatePct: 14,
      metricKind: "timing_lag",
      kind: "demo",
      source: "demo",
    },
    {
      id: "demo_wil_b_end",
      segmentId: "seg_010",
      timeSec: 30.2,
      label: "收尾定格",
      hoverTitle: "完成度两极分化:52% 完美 / 31% 失误",
      hoverDetail: "最后定格 pose 要么很稳要么彻底散架",
      perfectRatePct: 52,
      metricKind: "grade_split",
      kind: "demo",
      source: "demo",
    },
  ],
  les_447df39da659: [
    {
      id: "demo_nnn_a_wave",
      segmentId: "seg_001",
      timeSec: 6.9,
      label: "摆手 NoNoNo",
      hoverTitle: "只有 23% 能把三连摆手全打在拍上",
      hoverDetail: "标志性 no-no-no 摆手,第三下普遍抢拍",
      perfectRatePct: 23,
      metricKind: "perfect_rate",
      kind: "demo",
      source: "demo",
    },
    {
      id: "demo_nnn_a_updown",
      segmentId: "seg_002",
      timeSec: 11.5,
      label: "上举下压",
      hoverTitle: "约 41% 的跟练此处明显失误",
      hoverDetail: "双手上举接下压,手肘轨迹外扩是通病",
      perfectRatePct: 15,
      metricKind: "miss_rate",
      kind: "demo",
      source: "demo",
    },
    {
      id: "demo_nnn_a_kick",
      segmentId: "seg_004",
      timeSec: 20.7,
      label: "踢步扭胯",
      hoverTitle: "平均重练 3.1 次才能过",
      hoverDetail: "踢步与扭胯同时进行,下半身普遍慢半拍",
      perfectRatePct: 13,
      metricKind: "retry",
      kind: "demo",
      source: "demo",
    },
  ],
  les_acda7a42aa76: [
    {
      id: "demo_nnn_b_intro",
      segmentId: "seg_000",
      timeSec: 3.6,
      label: "起手摆臂",
      hoverTitle: "本段全站均分 61 / 100",
      hoverDetail: "起手双臂交叉摆开,速度快容易糊成一团",
      perfectRatePct: 10,
      metricKind: "avg_score",
      kind: "demo",
      source: "demo",
    },
    {
      id: "demo_nnn_b_wave",
      segmentId: "seg_001",
      timeSec: 8.7,
      label: "摆手 NoNoNo",
      hoverTitle: "只有 26% 打满三连拍",
      hoverDetail: "同款 no-no-no 摆手,楼梯间版本空间小更考验幅度控制",
      perfectRatePct: 26,
      metricKind: "perfect_rate",
      kind: "demo",
      source: "demo",
    },
    {
      id: "demo_nnn_b_turn",
      segmentId: "seg_003",
      timeSec: 17.4,
      label: "转身收尾",
      hoverTitle: "39% 的失误集中在「转身重心」",
      hoverDetail: "单脚转身接定格,重心不稳直接摇晃出画",
      perfectRatePct: 17,
      metricKind: "joint_focus",
      kind: "demo",
      source: "demo",
    },
  ],
  les_5e65433a824b: [
    {
      id: "demo_nnn_c_jump",
      segmentId: "seg_002",
      timeSec: 11.8,
      label: "弹跳点手",
      hoverTitle: "节奏平均滞后 190ms",
      hoverDetail: "弹跳同时侧点手,落地时机比原版普遍慢",
      perfectRatePct: 15,
      metricKind: "timing_lag",
      kind: "demo",
      source: "demo",
    },
    {
      id: "demo_nnn_c_wave",
      segmentId: "seg_003",
      timeSec: 16.5,
      label: "摆手 NoNoNo",
      hoverTitle: "只有 24% 的人全程打在拍上",
      hoverDetail: "完整版三组摆手连做,第二组开始普遍脱拍",
      perfectRatePct: 24,
      metricKind: "perfect_rate",
      kind: "demo",
      source: "demo",
    },
    {
      id: "demo_nnn_c_kick",
      segmentId: "seg_005",
      timeSec: 25.6,
      label: "单脚踢步",
      hoverTitle: "52% 的失误集中在「支撑腿」",
      hoverDetail: "单脚踢步时支撑腿膝盖内扣,平衡感是关键",
      perfectRatePct: 12,
      metricKind: "joint_focus",
      kind: "demo",
      source: "demo",
    },
    {
      id: "demo_nnn_c_end",
      segmentId: "seg_006",
      timeSec: 30.9,
      label: "收尾组合",
      hoverTitle: "平均要重练 3.6 次",
      hoverDetail: "最后 8 拍连续换位,记忆点最密",
      perfectRatePct: 9,
      metricKind: "retry",
      kind: "demo",
      source: "demo",
    },
  ],
  les_9f8a23a5e49f: [
    {
      id: "demo_red_a_clap",
      segmentId: "seg_001",
      timeSec: 6.8,
      label: "胸前拍打",
      hoverTitle: "只有 22% 拍点全中",
      hoverDetail: "双手胸前拍打接脚点地,手脚同步是难点",
      perfectRatePct: 22,
      metricKind: "perfect_rate",
      kind: "demo",
      source: "demo",
    },
    {
      id: "demo_red_a_lift",
      segmentId: "seg_003",
      timeSec: 16.2,
      label: "过头上举",
      hoverTitle: "本段全站均分 60 / 100",
      hoverDetail: "双手举过头顶掌心相对,手臂直度普遍不够",
      perfectRatePct: 11,
      metricKind: "avg_score",
      kind: "demo",
      source: "demo",
    },
    {
      id: "demo_red_a_hip",
      segmentId: "seg_005",
      timeSec: 25.7,
      label: "扭胯下沉",
      hoverTitle: "47% 的失误集中在「胯部」",
      hoverDetail: "低位扭胯,幅度不敢做大导致视觉上不到位",
      perfectRatePct: 13,
      metricKind: "joint_focus",
      kind: "demo",
      source: "demo",
    },
    {
      id: "demo_red_a_spin",
      segmentId: "seg_007",
      timeSec: 35.1,
      label: "转体甩臂",
      hoverTitle: "平均重练 2.9 次",
      hoverDetail: "快速转体接甩臂,头部先行是过关秘诀",
      perfectRatePct: 16,
      metricKind: "retry",
      kind: "demo",
      source: "demo",
    },
  ],
  les_05b3ba7ffbb5: [
    {
      id: "demo_red_b_clap",
      segmentId: "seg_000",
      timeSec: 2.5,
      label: "胸前拍打",
      hoverTitle: "只有 25% 的人手脚完全同步",
      hoverDetail: "双手胸前拍打+右脚点地,脚点常被手带跑",
      perfectRatePct: 25,
      metricKind: "perfect_rate",
      kind: "demo",
      source: "demo",
    },
    {
      id: "demo_red_b_palm",
      segmentId: "seg_001",
      timeSec: 7.2,
      label: "掌心相对上举",
      hoverTitle: "本段均分 64 / 100",
      hoverDetail: "双手举过头顶掌心相对,下落到胸前的轨迹易散",
      perfectRatePct: 14,
      metricKind: "avg_score",
      kind: "demo",
      source: "demo",
    },
    {
      id: "demo_red_b_point",
      segmentId: "seg_002",
      timeSec: 11.9,
      label: "食指前指",
      hoverTitle: "43% 在这里节奏脱拍",
      hoverDetail: "双臂前伸食指指向前方,两侧打开再交叉的三连动作",
      perfectRatePct: 15,
      metricKind: "miss_rate",
      kind: "demo",
      source: "demo",
    },
    {
      id: "demo_red_b_lean",
      segmentId: "seg_003",
      timeSec: 16.6,
      label: "上举后仰",
      hoverTitle: "重心失误率最高的一段",
      hoverDetail: "双臂上举身体微仰+左脚点地,后仰幅度要靠核心控制",
      perfectRatePct: 12,
      metricKind: "dropoff",
      kind: "demo",
      source: "demo",
    },
  ],
  les_d298f2568a8b: [
    {
      id: "demo_girl_pose",
      segmentId: "seg_002",
      timeSec: 11.5,
      label: "侧身定点",
      hoverTitle: "只有 20% 定点稳住不晃",
      hoverDetail: "走廊侧身定点 pose,裙摆动作大更考验急停",
      perfectRatePct: 20,
      metricKind: "perfect_rate",
      kind: "demo",
      source: "demo",
    },
    {
      id: "demo_girl_walk",
      segmentId: "seg_004",
      timeSec: 20.5,
      label: "台步前进",
      hoverTitle: "节奏平均滞后 140ms",
      hoverDetail: "踩拍台步,步幅普遍偏小导致后段赶拍",
      perfectRatePct: 18,
      metricKind: "timing_lag",
      kind: "demo",
      source: "demo",
    },
    {
      id: "demo_girl_turn",
      segmentId: "seg_005",
      timeSec: 25.0,
      label: "回身甩发",
      hoverTitle: "38% 的失误集中在「颈部时机」",
      hoverDetail: "回身甩发要头发跟着拍点走,早了显得着急",
      perfectRatePct: 16,
      metricKind: "joint_focus",
      kind: "demo",
      source: "demo",
    },
  ],
  les_a92d53971b39: [
    {
      id: "demo_kpop_a_arm",
      segmentId: "seg_001",
      timeSec: 4.6,
      label: "单臂划圈",
      hoverTitle: "本段均分 65 / 100",
      hoverDetail: "单臂大划圈,肩膀跟着抬起来是最常见问题",
      perfectRatePct: 15,
      metricKind: "avg_score",
      kind: "demo",
      source: "demo",
    },
    {
      id: "demo_kpop_a_hip",
      segmentId: "seg_003",
      timeSec: 10.2,
      label: "叉腰顶胯",
      hoverTitle: "只有 27% 顶在正拍上",
      hoverDetail: "叉腰顶胯的顿感,大部分人做成了平滑摆动",
      perfectRatePct: 27,
      metricKind: "perfect_rate",
      kind: "demo",
      source: "demo",
    },
    {
      id: "demo_kpop_a_end",
      segmentId: "seg_005",
      timeSec: 15.8,
      label: "收尾比心",
      hoverTitle: "完成度分化:55% 完美 / 28% 失误",
      hoverDetail: "结尾比心定格,手型和角度出戏率最高",
      perfectRatePct: 55,
      metricKind: "grade_split",
      kind: "demo",
      source: "demo",
    },
  ],
  les_41e26df37e17: [
    {
      id: "demo_twice_point",
      segmentId: "seg_001",
      timeSec: 4.5,
      label: "双指前点",
      hoverTitle: "只有 24% 的人指向卡上拍",
      hoverDetail: "双手食指前点的标志动作,肘部高度决定完成度",
      perfectRatePct: 24,
      metricKind: "perfect_rate",
      kind: "demo",
      source: "demo",
    },
    {
      id: "demo_twice_knee",
      segmentId: "seg_004",
      timeSec: 13.0,
      label: "屈膝弹动",
      hoverTitle: "51% 的失误集中在「膝盖」",
      hoverDetail: "连续屈膝弹动,幅度忽大忽小是通病",
      perfectRatePct: 13,
      metricKind: "joint_focus",
      kind: "demo",
      source: "demo",
    },
    {
      id: "demo_twice_sway",
      segmentId: "seg_006",
      timeSec: 18.6,
      label: "左右摇摆",
      hoverTitle: "平均重练 2.6 次",
      hoverDetail: "上身左右摇摆+脚步交叉,顺拐高发段",
      perfectRatePct: 19,
      metricKind: "retry",
      kind: "demo",
      source: "demo",
    },
  ],
  les_99b6f2be27a0: [
    {
      id: "demo_kpop_b_drop",
      segmentId: "seg_001",
      timeSec: 7.4,
      label: "下沉发力",
      hoverTitle: "本段全站均分 59 / 100",
      hoverDetail: "重心快速下沉,大部分人蹲得不够低",
      perfectRatePct: 10,
      metricKind: "avg_score",
      kind: "demo",
      source: "demo",
    },
    {
      id: "demo_kpop_b_snap",
      segmentId: "seg_002",
      timeSec: 12.0,
      label: "手臂急停",
      hoverTitle: "节奏平均提前 120ms",
      hoverDetail: "手臂大开大合接急停,普遍收得太早",
      perfectRatePct: 17,
      metricKind: "timing_lag",
      kind: "demo",
      source: "demo",
    },
    {
      id: "demo_kpop_b_combo",
      segmentId: "seg_004",
      timeSec: 21.4,
      label: "连招段落",
      hoverTitle: "平均要重练 3.3 次",
      hoverDetail: "连续三个八拍不重复,全课记忆量最大的一段",
      perfectRatePct: 12,
      metricKind: "retry",
      kind: "demo",
      source: "demo",
    },
  ],
  harry_dp: [
    {
      id: "demo_harry_arms",
      segmentId: "seg_001",
      timeSec: 7.2,
      label: "上举下压",
      hoverTitle: "约 47% 的跟练在此处出现明显失误",
      hoverDetail: "双臂上举后下压时肩线易塌、节奏常拖半拍",
      perfectRatePct: 13,
      metricKind: "miss_rate",
      kind: "demo",
      source: "demo",
    },
    {
      id: "demo_harry_cross",
      segmentId: "seg_003",
      timeSec: 16.8,
      label: "交叉转身",
      hoverTitle: "本段全站均分仅 58 / 100",
      hoverDetail: "双手交叉接转身摆胯:重心与胯位不同步是最高发错误",
      perfectRatePct: 9,
      metricKind: "avg_score",
      kind: "demo",
      source: "demo",
    },
    {
      id: "demo_harry_wave",
      segmentId: "seg_005",
      timeSec: 25.9,
      label: "波浪甩头",
      hoverTitle: "平均要重练 3.4 次才能过关",
      hoverDetail: "快速波浪+甩头:上半身幅度过大导致下半身失衡",
      perfectRatePct: 17,
      metricKind: "retry",
      kind: "demo",
      source: "demo",
    },
    {
      id: "demo_harry_kneel",
      segmentId: "seg_006",
      timeSec: 30.6,
      label: "跪地甩衣",
      hoverTitle: "61% 的失误集中在「右膝」落地时机",
      hoverDetail: "单膝跪地甩外套时,落地与甩臂时序错位最常见",
      perfectRatePct: 11,
      metricKind: "joint_focus",
      kind: "demo",
      source: "demo",
    },
  ],
};

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
