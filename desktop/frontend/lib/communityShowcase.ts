/**
 * 社区 Showcase 数据层（前端演示种子）。
 * 封面用差异化主题色板，不依赖后端缩略图是否齐全。
 */

import type {
  CommunityComment,
  CommunityFeedItem,
  CommunityTrackingDetailResponse,
  CommunityUserProfileResponse,
  PublicUserProfile,
  TrackingResult,
  TrackingSegmentScore,
} from "@/lib/types";

export const SHOWCASE_ID_PREFIX = "sc_trk_";
export const SHOWCASE_USER_PREFIX = "sc_user_";

export type CommunityHubTab = "hot" | "recommend" | "following" | "arena";
export type PlazaFilter = "hot" | "recommend" | "following" | "new" | "same";

/** 演示用「我关注的人」 */
export const FOLLOWING_USERNAMES = [
  "mira_flow",
  "pulse_nova",
  "campus_jay",
  "night_lin",
  "prep_yuna",
] as const;

export type ShowcaseGrade = "PERFECT" | "GOOD" | "OK" | "MISS";

export interface ShowcaseWorkMeta {
  tags: string[];
  caption: string;
  gradeTallies: Record<ShowcaseGrade, number>;
  deltaRank?: number;
  cover: WorkCoverTheme;
}

export interface WorkCoverTheme {
  from: string;
  via: string;
  to: string;
  accent: string;
  motif: "bars" | "rings" | "grid" | "shards";
}

export interface ShowcaseProfileMeta {
  badges: string[];
  streakDays: number;
  thisWeekCheckins: boolean[];
  camp?: { name: string; done: number; total: number };
  role: string;
  coverThumb: string;
  city: string;
  school?: string;
  premiumActive: boolean;
  premiumTier: string;
  likedResultIds: string[];
  moments: Array<{ id: string; text: string; timeLabel: string }>;
  facts: Array<{ label: string; value: string }>;
}

export interface ProfileRecentRecord {
  id: string;
  title: string;
  score: number;
  timeLabel: string;
  resultId: string;
  thumb: string | null;
}

export interface ProfilePageModel {
  user: PublicUserProfile;
  works: CommunityFeedItem[];
  meta: ShowcaseProfileMeta;
  medals: Array<{ name: string; tone: "gold" | "cyan" | "rose" | "lime"; icon: string }>;
  recent: ProfileRecentRecord[];
  liked: CommunityFeedItem[];
  premium: {
    active: boolean;
    tier: string;
    expiresLabel: string;
    perks: string[];
  };
}

export interface LeaderboardRow {
  rank: number;
  username: string;
  displayName: string;
  score: number;
  lessonTitle: string;
  resultId: string;
  delta: number;
  worksThisWeek: number;
}

export interface SongChallengeBoard {
  lessonId: string;
  lessonTitle: string;
  participants: number;
  topScore: number;
  rows: LeaderboardRow[];
}

export interface ActivityPulseItem {
  id: string;
  kind: "checkin" | "streak" | "camp" | "highlight";
  username: string;
  displayName: string;
  text: string;
  timeLabel: string;
  streakDays?: number;
  campDone?: number;
  campTotal?: number;
  resultId?: string;
}

export interface WeeklyChallenge {
  lessonId: string;
  lessonTitle: string;
  participants: number;
  topScore: number;
  topDisplayName: string;
  topResultId: string;
  headline: string;
  subline: string;
  thumb: string;
  video: string;
  daysLeft: number;
}

export interface ScoreDuelSide {
  resultId: string;
  username: string;
  displayName: string;
  score: number;
  rank: number;
  label: string;
  delta: number;
  tallies: Record<ShowcaseGrade, number>;
  thumb: string | null;
}

export interface WeeklyScoreDuel {
  lessonTitle: string;
  gap: number;
  champion: ScoreDuelSide;
  challenger: ScoreDuelSide;
}

// ---------------------------------------------------------------------------
// 真实课程表:全部对应本机 data/lessons 里真实存在的课(视频/封面可播可点)。
// danceKey 标记"同一支舞":跟拍完成后的猜你喜欢、相似推荐都按它分组优先。
// ---------------------------------------------------------------------------

const LESSON_WIL_A = {
  id: "les_1309562bc052",
  title: "What is Love? · 练习室版",
  thumb: "/thumbs/les_1309562bc052_seg_000.jpg",
  video: "/videos/les_1309562bc052.mp4",
  danceKey: "whatislove",
} as const;

const LESSON_WIL_B = {
  id: "les_05f402625586",
  title: "What is Love? · 户外露营版",
  thumb: "/thumbs/les_05f402625586_seg_000.jpg",
  video: "/videos/les_05f402625586.mp4",
  danceKey: "whatislove",
} as const;

const LESSON_NNN_A = {
  id: "les_447df39da659",
  title: "NoNoNo · 舞室版",
  thumb: "/thumbs/les_447df39da659_seg_000.jpg",
  video: "/videos/les_447df39da659.mp4",
  danceKey: "nonono",
} as const;

const LESSON_NNN_B = {
  id: "les_acda7a42aa76",
  title: "NoNoNo · 翻跳版",
  thumb: "/thumbs/les_acda7a42aa76_seg_000.jpg",
  video: "/videos/les_acda7a42aa76.mp4",
  danceKey: "nonono",
} as const;

const LESSON_NNN_C = {
  id: "les_5e65433a824b",
  title: "NoNoNo · 完整版",
  thumb: "/thumbs/les_5e65433a824b_seg_000.jpg",
  video: "/videos/les_5e65433a824b.mp4",
  danceKey: "nonono",
} as const;

const LESSON_RED_A = {
  id: "les_9f8a23a5e49f",
  title: "因为红 · 完整版",
  thumb: "/thumbs/les_9f8a23a5e49f_seg_000.jpg",
  video: "/videos/les_9f8a23a5e49f.mp4",
  danceKey: "yinweihong",
} as const;

const LESSON_RED_B = {
  id: "les_05b3ba7ffbb5",
  title: "因为红 · 精选段",
  thumb: "/thumbs/les_05b3ba7ffbb5_seg_000.jpg",
  video: "/videos/les_05b3ba7ffbb5.mp4",
  danceKey: "yinweihong",
} as const;

const LESSON_GIRL = {
  id: "les_d298f2568a8b",
  title: "女团编舞 · 走廊版",
  thumb: "/thumbs/les_d298f2568a8b_seg_000.jpg",
  video: "/videos/les_d298f2568a8b.mp4",
  danceKey: "girlgroup",
} as const;

const LESSON_KPOP = {
  id: "les_a92d53971b39",
  title: "Kpop 随跳 · 公园版",
  thumb: "/thumbs/les_a92d53971b39_seg_000.jpg",
  video: "/videos/les_a92d53971b39.mp4",
  danceKey: "kpop_mix",
} as const;

const LESSON_TWICE = {
  id: "les_41e26df37e17",
  title: "TWICE 翻跳",
  thumb: "/thumbs/les_41e26df37e17_seg_000.jpg",
  video: "/videos/les_41e26df37e17.mp4",
  danceKey: "kpop_mix",
} as const;

const LESSON_KPOP2 = {
  id: "les_99b6f2be27a0",
  title: "Kpop 舞室练习",
  thumb: "/thumbs/les_99b6f2be27a0_seg_000.jpg",
  video: "/videos/les_99b6f2be27a0.mp4",
  danceKey: "kpop_mix",
} as const;

const LESSON_HARRY = {
  id: "harry_dp",
  title: "HARRY · Demo 同舞",
  thumb: "/thumbs/harry_dp_seg_000.jpg",
  video: "/videos/harry_dp.mp4",
  danceKey: "harry",
} as const;

type ShowcaseLesson =
  | typeof LESSON_WIL_A
  | typeof LESSON_WIL_B
  | typeof LESSON_NNN_A
  | typeof LESSON_NNN_B
  | typeof LESSON_NNN_C
  | typeof LESSON_RED_A
  | typeof LESSON_RED_B
  | typeof LESSON_GIRL
  | typeof LESSON_KPOP
  | typeof LESSON_TWICE
  | typeof LESSON_KPOP2
  | typeof LESSON_HARRY;

/** lessonId -> danceKey(同一支舞的分组键),推荐系统用 */
export const DANCE_KEY_BY_LESSON: Record<string, string> = {
  [LESSON_WIL_A.id]: LESSON_WIL_A.danceKey,
  [LESSON_WIL_B.id]: LESSON_WIL_B.danceKey,
  [LESSON_NNN_A.id]: LESSON_NNN_A.danceKey,
  [LESSON_NNN_B.id]: LESSON_NNN_B.danceKey,
  [LESSON_NNN_C.id]: LESSON_NNN_C.danceKey,
  [LESSON_RED_A.id]: LESSON_RED_A.danceKey,
  [LESSON_RED_B.id]: LESSON_RED_B.danceKey,
  [LESSON_GIRL.id]: LESSON_GIRL.danceKey,
  [LESSON_KPOP.id]: LESSON_KPOP.danceKey,
  [LESSON_TWICE.id]: LESSON_TWICE.danceKey,
  [LESSON_KPOP2.id]: LESSON_KPOP2.danceKey,
  [LESSON_HARRY.id]: LESSON_HARRY.danceKey,
};

export function danceKeyOf(lessonId: string): string | null {
  return DANCE_KEY_BY_LESSON[lessonId] ?? null;
}

function daysAgo(n: number): string {
  // 固定锚点，避免 SSR/CSR 因 Date.now() 不一致导致 hydration 报错
  const d = new Date(Date.UTC(2026, 6, 22, 12, 0, 0));
  d.setUTCDate(d.getUTCDate() - n);
  d.setUTCHours(20 - (n % 5), 12 + (n % 40), 0, 0);
  return d.toISOString();
}

function segs(scores: number[]): TrackingSegmentScore[] {
  return scores.map((score, i) => ({
    segmentId: `seg_${String(i).padStart(3, "0")}`,
    score,
    timingMs: Math.round(Math.abs(50 - score) * 2.4 + (i % 3) * 18),
  }));
}

function talliesFromScores(scores: number[]): Record<ShowcaseGrade, number> {
  const t: Record<ShowcaseGrade, number> = { PERFECT: 0, GOOD: 0, OK: 0, MISS: 0 };
  for (const s of scores) {
    if (s >= 85) t.PERFECT += 1;
    else if (s >= 70) t.GOOD += 1;
    else if (s >= 50) t.OK += 1;
    else t.MISS += 1;
  }
  return t;
}

function profile(
  id: string,
  username: string,
  displayName: string,
  bio: string,
  verified: boolean,
  followers: number,
  following: number,
  works: number,
  likes: number
): PublicUserProfile {
  return {
    id,
    username,
    displayName,
    avatar: null,
    bio,
    isVerified: verified,
    createdAt: daysAgo(90),
    isFollowing: false,
    stats: {
      userId: id,
      followerCount: followers,
      followingCount: following,
      publishedTrackingCount: works,
      totalLikesReceived: likes,
    },
  };
}

// 展示名参考抖音：约 70% 随意日常向，约 30% 与舞蹈弱相关
const USERS: PublicUserProfile[] = [
  profile(`${SHOWCASE_USER_PREFIX}01`, "mira_flow", "米拉Mir", "教了 6 年女团编舞。相信拍子比天赋重要。", true, 12840, 86, 42, 56120),
  profile(`${SHOWCASE_USER_PREFIX}02`, "campus_jay", "阿杰不写作业", "每周扒一支。考试周也不停。", false, 932, 210, 18, 4102),
  profile(`${SHOWCASE_USER_PREFIX}03`, "night_lin", "晚到十分钟", "下班 11 点开练。镜子是唯一观众。", false, 2401, 144, 27, 8900),
  profile(`${SHOWCASE_USER_PREFIX}04`, "prep_yuna", "Yuna练功中", "省赛倒计时 38 天。只发能过 90 的。", true, 5602, 55, 31, 22100),
  profile(`${SHOWCASE_USER_PREFIX}05`, "urban_kai", "街舞Kai", "Hip-hop 出身，最近沉迷 K-pop 干净度。", false, 3108, 301, 22, 12004),
  profile(`${SHOWCASE_USER_PREFIX}06`, "rook_annie", "小安想睡觉", "第 3 周。手还跟不上，但拍子找到了。", false, 418, 88, 9, 960),
  profile(`${SHOWCASE_USER_PREFIX}07`, "studio_rex", "Rex不加班", "负责纠胯。评论区比较严，见谅。", true, 8700, 120, 36, 33400),
  profile(`${SHOWCASE_USER_PREFIX}08`, "pulse_nova", "Nova233", "连续打卡 21 天中。训练营周冠军候选。", false, 1550, 190, 15, 6200),
  profile(`${SHOWCASE_USER_PREFIX}09`, "soft_haze", "今天吃了吗", "喜欢副歌爆发段。副业剪视频。", false, 720, 260, 11, 2800),
  profile(`${SHOWCASE_USER_PREFIX}10`, "beat_owen", "有点想摸鱼", "BPM 对不准就重录。洁癖患者。", false, 1980, 97, 20, 7600),
];

export const SHOWCASE_PROFILE_META: Record<string, ShowcaseProfileMeta> = {
  mira_flow: {
    badges: ["认证教练", "周冠 ×3", "高分导师", "训练营高光"],
    streakDays: 14,
    thisWeekCheckins: [true, true, true, true, true, false, true],
    camp: { name: "女团副歌特训营", done: 6, total: 7 },
    role: "舞室教练",
    coverThumb: LESSON_WIL_A.thumb,
    city: "上海",
    school: "Pulse 舞室",
    premiumActive: true,
    premiumTier: "Premium Pro",
    likedResultIds: [`${SHOWCASE_ID_PREFIX}14`, `${SHOWCASE_ID_PREFIX}06`, `${SHOWCASE_ID_PREFIX}04`],
    moments: [
      { id: "m1", text: "本周示范课已更新，学员记得对标。", timeLabel: "2 小时前" },
      { id: "m2", text: "副歌特训营进度 6/7。", timeLabel: "昨天" },
      { id: "m3", text: "发了条 97 分存档当周作业。", timeLabel: "3 天前" },
    ],
    facts: [
      { label: "身份", value: "认证教练" },
      { label: "常练曲风", value: "女团 / 副歌" },
      { label: "所在地", value: "上海" },
      { label: "加入", value: "2024.03" },
    ],
  },
  campus_jay: {
    badges: ["社团主理", "七天连练", "节奏控"],
    streakDays: 7,
    thisWeekCheckins: [true, true, true, true, true, true, true],
    camp: { name: "校园同舞周", done: 5, total: 7 },
    role: "社团成员",
    coverThumb: LESSON_NNN_A.thumb,
    city: "杭州",
    school: "浙大舞蹈社",
    premiumActive: false,
    premiumTier: "Premium",
    likedResultIds: [`${SHOWCASE_ID_PREFIX}21`, `${SHOWCASE_ID_PREFIX}01`, `${SHOWCASE_ID_PREFIX}08`],
    moments: [
      { id: "m1", text: "社团周练公开课报名中。", timeLabel: "今天" },
      { id: "m2", text: "七天连练打卡完成。", timeLabel: "昨天" },
    ],
    facts: [
      { label: "身份", value: "社团主理" },
      { label: "常练曲风", value: "校园同舞" },
      { label: "所在地", value: "杭州" },
      { label: "加入", value: "2025.01" },
    ],
  },
  night_lin: {
    badges: ["夜猫子", "连续 21 天"],
    streakDays: 21,
    thisWeekCheckins: [true, true, true, true, true, true, false],
    camp: { name: "深夜 30 分钟营", done: 5, total: 7 },
    role: "上班族夜练",
    coverThumb: LESSON_NNN_A.thumb,
    city: "北京",
    premiumActive: true,
    premiumTier: "Premium",
    likedResultIds: [`${SHOWCASE_ID_PREFIX}07`, `${SHOWCASE_ID_PREFIX}03`, `${SHOWCASE_ID_PREFIX}16`],
    moments: [
      { id: "m1", text: "23:40 练完，邻居还没投诉。", timeLabel: "38 分钟前" },
      { id: "m2", text: "连续夜练第 21 天。", timeLabel: "昨天" },
    ],
    facts: [
      { label: "身份", value: "上班族" },
      { label: "常练时段", value: "22:00–24:00" },
      { label: "所在地", value: "北京" },
      { label: "加入", value: "2024.11" },
    ],
  },
  prep_yuna: {
    badges: ["备赛选手", "90+ 俱乐部"],
    streakDays: 12,
    thisWeekCheckins: [true, true, false, true, true, true, true],
    camp: { name: "省赛冲刺营", done: 6, total: 7 },
    role: "备赛选手",
    coverThumb: LESSON_WIL_A.thumb,
    city: "广州",
    school: "省赛集训队",
    premiumActive: true,
    premiumTier: "Premium Pro",
    likedResultIds: [`${SHOWCASE_ID_PREFIX}21`, `${SHOWCASE_ID_PREFIX}02`, `${SHOWCASE_ID_PREFIX}22`],
    moments: [
      { id: "m1", text: "省赛倒计时，只发能过 90 的。", timeLabel: "5 小时前" },
      { id: "m2", text: "肩线第二版干净多了。", timeLabel: "2 天前" },
    ],
    facts: [
      { label: "身份", value: "备赛选手" },
      { label: "目标", value: "省赛入围" },
      { label: "所在地", value: "广州" },
      { label: "加入", value: "2024.08" },
    ],
  },
  urban_kai: {
    badges: ["街舞跨界", "节奏控"],
    streakDays: 5,
    thisWeekCheckins: [true, false, true, true, true, false, true],
    role: "街舞舞者",
    coverThumb: LESSON_WIL_A.thumb,
    city: "成都",
    premiumActive: false,
    premiumTier: "Premium",
    likedResultIds: [`${SHOWCASE_ID_PREFIX}04`, `${SHOWCASE_ID_PREFIX}15`, `${SHOWCASE_ID_PREFIX}08`],
    moments: [{ id: "m1", text: "今天偏干净，弹性下次再加。", timeLabel: "昨天" }],
    facts: [
      { label: "身份", value: "街舞跨界" },
      { label: "常练曲风", value: "Hip-hop × K-pop" },
      { label: "所在地", value: "成都" },
      { label: "加入", value: "2025.02" },
    ],
  },
  rook_annie: {
    badges: ["新人成长", "首次破 80"],
    streakDays: 3,
    thisWeekCheckins: [true, true, true, false, false, false, false],
    camp: { name: "零基础入门营", done: 3, total: 7 },
    role: "入门学员",
    coverThumb: LESSON_WIL_A.thumb,
    city: "南京",
    premiumActive: false,
    premiumTier: "Premium",
    likedResultIds: [`${SHOWCASE_ID_PREFIX}10`, `${SHOWCASE_ID_PREFIX}19`, `${SHOWCASE_ID_PREFIX}05`],
    moments: [{ id: "m1", text: "第一次公开作品，求轻喷。", timeLabel: "3 小时前" }],
    facts: [
      { label: "身份", value: "入门学员" },
      { label: "学习周数", value: "第 3 周" },
      { label: "所在地", value: "南京" },
      { label: "加入", value: "2026.06" },
    ],
  },
  studio_rex: {
    badges: ["认证助教", "纠错达人"],
    streakDays: 9,
    thisWeekCheckins: [true, true, true, true, false, true, true],
    camp: { name: "助教陪练营", done: 4, total: 7 },
    role: "编舞助教",
    coverThumb: LESSON_WIL_A.thumb,
    city: "深圳",
    school: "Pulse 舞室",
    premiumActive: true,
    premiumTier: "Premium Pro",
    likedResultIds: [`${SHOWCASE_ID_PREFIX}08`, `${SHOWCASE_ID_PREFIX}18`, `${SHOWCASE_ID_PREFIX}01`],
    moments: [{ id: "m1", text: "发布纠错示范：第 3 段右胯时机。", timeLabel: "昨天" }],
    facts: [
      { label: "身份", value: "编舞助教" },
      { label: "擅长", value: "纠胯 / 时序" },
      { label: "所在地", value: "深圳" },
      { label: "加入", value: "2023.12" },
    ],
  },
  pulse_nova: {
    badges: ["训练营高光", "连击破纪录"],
    streakDays: 21,
    thisWeekCheckins: [true, true, true, true, true, true, true],
    camp: { name: "本周 7 日挑战", done: 7, total: 7 },
    role: "训练营常驻",
    coverThumb: LESSON_NNN_A.thumb,
    city: "武汉",
    premiumActive: true,
    premiumTier: "Premium",
    likedResultIds: [`${SHOWCASE_ID_PREFIX}03`, `${SHOWCASE_ID_PREFIX}14`, `${SHOWCASE_ID_PREFIX}21`],
    moments: [
      { id: "m1", text: "连续打卡第 21 天，训练营 7/7。", timeLabel: "12 分钟前" },
      { id: "m2", text: "今天状态最好，冲周冠候选。", timeLabel: "昨天" },
    ],
    facts: [
      { label: "身份", value: "训练营常驻" },
      { label: "连打", value: "21 天" },
      { label: "所在地", value: "武汉" },
      { label: "加入", value: "2025.04" },
    ],
  },
  soft_haze: {
    badges: ["副歌杀手", "剪辑眼"],
    streakDays: 4,
    thisWeekCheckins: [false, true, true, true, true, false, false],
    role: "内容创作者",
    coverThumb: LESSON_NNN_A.thumb,
    city: "重庆",
    premiumActive: false,
    premiumTier: "Premium",
    likedResultIds: [`${SHOWCASE_ID_PREFIX}09`, `${SHOWCASE_ID_PREFIX}20`, `${SHOWCASE_ID_PREFIX}11`],
    moments: [{ id: "m1", text: "副歌成片调了对比度。", timeLabel: "昨天" }],
    facts: [
      { label: "身份", value: "内容创作者" },
      { label: "擅长", value: "副歌 / 剪辑" },
      { label: "所在地", value: "重庆" },
      { label: "加入", value: "2025.09" },
    ],
  },
  beat_owen: {
    badges: ["拍感洁癖", "重录王"],
    streakDays: 8,
    thisWeekCheckins: [true, true, true, true, true, true, false],
    camp: { name: "节拍对齐营", done: 5, total: 7 },
    role: "节奏训练者",
    coverThumb: LESSON_WIL_A.thumb,
    city: "西安",
    premiumActive: true,
    premiumTier: "Premium",
    likedResultIds: [`${SHOWCASE_ID_PREFIX}06`, `${SHOWCASE_ID_PREFIX}17`, `${SHOWCASE_ID_PREFIX}21`],
    moments: [{ id: "m1", text: "对轨到 ±40ms 才敢发。", timeLabel: "2 天前" }],
    facts: [
      { label: "身份", value: "节奏训练者" },
      { label: "洁癖阈值", value: "±40ms" },
      { label: "所在地", value: "西安" },
      { label: "加入", value: "2024.06" },
    ],
  },
};

type WorkSeed = {
  id: string;
  userIdx: number;
  lesson: ShowcaseLesson;
  score: number;
  segmentScores: number[];
  likes: number;
  days: number;
  tags: string[];
  caption: string;
  /** 可选：覆盖默认课封面，避免社区全是同一张图 */
  thumb?: string;
};

function pickThumb(lesson: ShowcaseLesson, _index: number, override?: string): string {
  // 每个作品直接用它挂的课程自己的封面(卡片=课程视频真实抽帧,点开即所见)
  if (override) return override;
  return lesson.thumb;
}

// 22 个演示作品,全部挂真实课程:同一支舞的不同视频互相构成"同舞挑战"。
// 分布:whatislove×2课、nonono×3课、因为红×2课、女团/kpop×4课、harry×1课。
const WORK_SEEDS: WorkSeed[] = [
  { id: "01", userIdx: 0, lesson: LESSON_WIL_A, score: 96, segmentScores: [94, 97, 95, 98, 96, 93], likes: 842, days: 0, tags: ["周冠", "What is Love"], caption: "TWICE 这段副歌手势终于顺了。录了 11 次。" },
  { id: "02", userIdx: 3, lesson: LESSON_WIL_B, score: 94, segmentScores: [92, 95, 93, 96, 94, 91], likes: 621, days: 0, tags: ["90+ 俱乐部", "What is Love"], caption: "露营地版 What is Love,草地跳起来是另一种感觉。" },
  { id: "03", userIdx: 7, lesson: LESSON_HARRY, score: 92, segmentScores: [88, 93, 95, 90, 94, 91], likes: 510, days: 1, tags: ["连击破纪录"], caption: "连续第 21 天。分数不是重点，不间断才是。" },
  { id: "04", userIdx: 4, lesson: LESSON_NNN_A, score: 89, segmentScores: [86, 90, 88, 91, 87, 85], likes: 388, days: 1, tags: ["NoNoNo", "舞室打卡"], caption: "NoNoNo 舞室版。指尖 wave 还在抠细节。" },
  { id: "05", userIdx: 1, lesson: LESSON_GIRL, score: 87, segmentScores: [84, 88, 90, 85, 86, 83], likes: 276, days: 1, tags: ["社团"], caption: "走廊随跳女团串烧。欢迎纠错。" },
  { id: "06", userIdx: 9, lesson: LESSON_WIL_A, score: 91, segmentScores: [90, 92, 89, 93, 91, 88], likes: 402, days: 2, tags: ["拍感洁癖", "What is Love"], caption: "对轨到 ±40ms 以内才敢发。强迫症发作。" },
  { id: "07", userIdx: 2, lesson: LESSON_KPOP2, score: 84, segmentScores: [80, 85, 86, 82, 84, 81], likes: 198, days: 2, tags: ["夜猫子"], caption: "23:40 录完。邻居还没投诉算赢。" },
  { id: "08", userIdx: 6, lesson: LESSON_NNN_C, score: 90, segmentScores: [88, 91, 92, 89, 90, 87], likes: 455, days: 2, tags: ["助教示范", "NoNoNo"], caption: "NoNoNo 完整版示范:注意第 3 段胯先于肩。" },
  { id: "09", userIdx: 8, lesson: LESSON_RED_A, score: 83, segmentScores: [79, 84, 86, 81, 82, 80], likes: 167, days: 3, tags: ["因为红"], caption: "只截了副歌。前奏下次再补。" },
  { id: "10", userIdx: 5, lesson: LESSON_TWICE, score: 78, segmentScores: [72, 80, 81, 76, 79, 74], likes: 124, days: 3, tags: ["新人成长"], caption: "第一次破 75！手还是慢半拍，但找到感觉了。" },
  { id: "11", userIdx: 0, lesson: LESSON_NNN_B, score: 93, segmentScores: [91, 94, 92, 95, 93, 90], likes: 590, days: 3, tags: ["教练速通", "NoNoNo"], caption: "NoNoNo 翻跳「可复制版」节奏。" },
  { id: "12", userIdx: 3, lesson: LESSON_KPOP, score: 88, segmentScores: [85, 89, 90, 86, 87, 84], likes: 301, days: 4, tags: ["备赛"], caption: "公园随跳测耐力。后半段掉速了。" },
  { id: "13", userIdx: 1, lesson: LESSON_WIL_B, score: 81, segmentScores: [78, 82, 84, 79, 80, 77], likes: 156, days: 4, tags: ["社团", "What is Love"], caption: "第一次公开 What is Love。笑场那段已剪掉。" },
  { id: "14", userIdx: 7, lesson: LESSON_RED_B, score: 95, segmentScores: [93, 96, 94, 97, 95, 92], likes: 720, days: 4, tags: ["周冠候选", "因为红"], caption: "因为红精选段日更。今天状态最好。" },
  { id: "15", userIdx: 4, lesson: LESSON_GIRL, score: 86, segmentScores: [83, 87, 88, 84, 85, 82], likes: 210, days: 5, tags: ["跨界"], caption: "脚法还在迁就编舞，下周重录。" },
  { id: "16", userIdx: 2, lesson: LESSON_NNN_A, score: 79, segmentScores: [75, 81, 80, 77, 78, 74], likes: 143, days: 5, tags: ["夜练", "NoNoNo"], caption: "周一加班后的 20 分钟。不完美但坚持发。" },
  { id: "17", userIdx: 9, lesson: LESSON_KPOP2, score: 85, segmentScores: [82, 86, 87, 83, 84, 81], likes: 188, days: 5, tags: ["节拍营"], caption: "BPM 比想象中难咬。" },
  { id: "18", userIdx: 6, lesson: LESSON_TWICE, score: 82, segmentScores: [80, 83, 84, 81, 82, 79], likes: 230, days: 6, tags: ["纠错示范"], caption: "故意放慢：看膝盖不要抢拍。" },
  { id: "19", userIdx: 5, lesson: LESSON_RED_A, score: 71, segmentScores: [66, 73, 74, 68, 72, 65], likes: 98, days: 6, tags: ["新人", "因为红"], caption: "跟丢两次。评论区求「手怎么记」。" },
  { id: "20", userIdx: 8, lesson: LESSON_KPOP, score: 87, segmentScores: [84, 88, 89, 85, 86, 83], likes: 245, days: 6, tags: ["剪辑眼"], caption: "成片调了对比度。动作本身 87。" },
  { id: "21", userIdx: 0, lesson: LESSON_WIL_A, score: 97, segmentScores: [95, 98, 96, 99, 97, 94], likes: 1102, days: 7, tags: ["周冠", "What is Love"], caption: "上周周冠存档。可当对标。" },
  { id: "22", userIdx: 3, lesson: LESSON_NNN_C, score: 92, segmentScores: [90, 93, 91, 94, 92, 89], likes: 480, days: 7, tags: ["备赛", "NoNoNo"], caption: "第二版。肩线比上一版干净。" },
];

function buildResult(seed: WorkSeed): TrackingResult {
  const segmentScores = segs(seed.segmentScores);
  return {
    id: `${SHOWCASE_ID_PREFIX}${seed.id}`,
    lessonId: seed.lesson.id,
    userId: USERS[seed.userIdx].id,
    createdAt: daysAgo(seed.days),
    score: seed.score,
    segmentScores,
    videoUrl: seed.lesson.video,
    isPublic: true,
    publishedAt: daysAgo(seed.days),
    likeCount: seed.likes,
    commentCount: 0,
    moderationStatus: "approved",
    moderationReason: null,
  };
}

function buildFeedItem(seed: WorkSeed, index: number): CommunityFeedItem {
  return {
    result: buildResult(seed),
    user: USERS[seed.userIdx],
    lessonTitle: seed.lesson.title,
    previewThumbnail: pickThumb(seed.lesson, index, seed.thumb),
    likedByMe: false,
  };
}

export const SHOWCASE_FEED: CommunityFeedItem[] = WORK_SEEDS.map((seed, index) => buildFeedItem(seed, index));

const COVER_PALETTES: WorkCoverTheme[] = [
  { from: "#2b0a3d", via: "#7a1f4a", to: "#12041a", accent: "#ff4d8d", motif: "bars" },
  { from: "#041a2e", via: "#0d5c63", to: "#020b12", accent: "#2ee6d6", motif: "rings" },
  { from: "#1a1204", via: "#8a5a00", to: "#0d0902", accent: "#ffc857", motif: "shards" },
  { from: "#0c1028", via: "#3d2a8a", to: "#05060f", accent: "#9d7bff", motif: "grid" },
  { from: "#1c0610", via: "#8f1d3f", to: "#0a0206", accent: "#ff6b6b", motif: "bars" },
  { from: "#041816", via: "#0f6b4c", to: "#02100c", accent: "#5dffb1", motif: "rings" },
  { from: "#180c28", via: "#5a1d8f", to: "#0a0414", accent: "#d96bff", motif: "shards" },
  { from: "#1a1408", via: "#b85c00", to: "#0c0802", accent: "#ff9f1c", motif: "grid" },
  { from: "#0a1624", via: "#1a4f8a", to: "#040a12", accent: "#4db8ff", motif: "bars" },
  { from: "#201008", via: "#8a3a18", to: "#100602", accent: "#ff7a45", motif: "rings" },
  { from: "#101820", via: "#2a5a40", to: "#060a0c", accent: "#b8ff5c", motif: "shards" },
  { from: "#220818", via: "#6a1848", to: "#10040c", accent: "#ff5cb8", motif: "grid" },
  { from: "#081820", via: "#186060", to: "#040c10", accent: "#5cfff0", motif: "bars" },
  { from: "#181008", via: "#705018", to: "#0c0804", accent: "#ffe05c", motif: "rings" },
  { from: "#140820", via: "#402080", to: "#080410", accent: "#8c5cff", motif: "shards" },
  { from: "#200810", via: "#801830", to: "#100408", accent: "#ff4060", motif: "grid" },
  { from: "#082018", via: "#186848", to: "#04100c", accent: "#40ff9c", motif: "bars" },
  { from: "#1c1008", via: "#884818", to: "#0c0602", accent: "#ffb040", motif: "rings" },
  { from: "#0c1428", via: "#284878", to: "#040810", accent: "#60a8ff", motif: "shards" },
  { from: "#241018", via: "#783050", to: "#10060a", accent: "#ff80a8", motif: "grid" },
  { from: "#102018", via: "#306050", to: "#060c0a", accent: "#80ffc0", motif: "bars" },
  { from: "#201810", via: "#706030", to: "#0c0a04", accent: "#ffe080", motif: "rings" },
];

export const SHOWCASE_WORK_META: Record<string, ShowcaseWorkMeta> = Object.fromEntries(
  WORK_SEEDS.map((seed, index) => [
    `${SHOWCASE_ID_PREFIX}${seed.id}`,
    {
      tags: seed.tags,
      caption: seed.caption,
      gradeTallies: talliesFromScores(seed.segmentScores),
      deltaRank: (seed.userIdx % 5) - 2,
      cover: COVER_PALETTES[index % COVER_PALETTES.length],
    } satisfies ShowcaseWorkMeta,
  ])
);

type CommentTier = "boring" | "mid" | "featured";

const COMMENT_BANK: Array<{ userIdx: number; text: string; hoursAgo: number; tier: CommentTier }> = [
  // —— 约 50%：普通无聊（抖音味）——
  { userIdx: 5, text: "好看", hoursAgo: 1, tier: "boring" },
  { userIdx: 1, text: "学了", hoursAgo: 2, tier: "boring" },
  { userIdx: 8, text: "哈哈哈", hoursAgo: 2, tier: "boring" },
  { userIdx: 2, text: "666", hoursAgo: 3, tier: "boring" },
  { userIdx: 9, text: "收藏了", hoursAgo: 3, tier: "boring" },
  { userIdx: 4, text: "真的假的", hoursAgo: 4, tier: "boring" },
  { userIdx: 6, text: "来了来了", hoursAgo: 4, tier: "boring" },
  { userIdx: 3, text: "跟着跳", hoursAgo: 5, tier: "boring" },
  { userIdx: 7, text: "好强", hoursAgo: 5, tier: "boring" },
  { userIdx: 5, text: "这是哪首歌", hoursAgo: 6, tier: "boring" },
  { userIdx: 1, text: "姐妹绝了", hoursAgo: 6, tier: "boring" },
  { userIdx: 8, text: "已三连", hoursAgo: 7, tier: "boring" },
  { userIdx: 2, text: "我也想学", hoursAgo: 8, tier: "boring" },
  { userIdx: 9, text: "背景音乐好听到模糊", hoursAgo: 8, tier: "boring" },
  { userIdx: 4, text: "第一", hoursAgo: 9, tier: "boring" },
  { userIdx: 6, text: "路过", hoursAgo: 10, tier: "boring" },
  { userIdx: 3, text: "支持一下", hoursAgo: 11, tier: "boring" },
  { userIdx: 7, text: "晚安", hoursAgo: 12, tier: "boring" },
  { userIdx: 5, text: "？？？", hoursAgo: 13, tier: "boring" },
  { userIdx: 1, text: "笑死", hoursAgo: 14, tier: "boring" },
  { userIdx: 8, text: "手机录的吗", hoursAgo: 15, tier: "boring" },
  { userIdx: 2, text: "蹲后续", hoursAgo: 16, tier: "boring" },
  { userIdx: 9, text: "火钳刘明", hoursAgo: 17, tier: "boring" },
  { userIdx: 4, text: "一般般吧", hoursAgo: 18, tier: "boring" },
  { userIdx: 6, text: "我不行了手跟不上", hoursAgo: 19, tier: "boring" },

  // —— 约 40%：正常闲聊（短、口语，不写小作文）——
  { userIdx: 3, text: "副歌那段我跟丢两次哈哈", hoursAgo: 2, tier: "mid" },
  { userIdx: 7, text: "镜面跳吗？看着有点反", hoursAgo: 3, tier: "mid" },
  { userIdx: 0, text: "手臂可以再收一点，整体挺顺", hoursAgo: 4, tier: "mid" },
  { userIdx: 5, text: "求个完整版链接", hoursAgo: 5, tier: "mid" },
  { userIdx: 1, text: "社团下周拿来练，先码住", hoursAgo: 6, tier: "mid" },
  { userIdx: 8, text: "这分数怎么打的我也好想试", hoursAgo: 7, tier: "mid" },
  { userIdx: 2, text: "晚上练不扰民吗兄弟", hoursAgo: 8, tier: "mid" },
  { userIdx: 9, text: "拍子很稳，表情再放松点更好看", hoursAgo: 9, tier: "mid" },
  { userIdx: 4, text: "hiphop出身路过，下沉有点意思", hoursAgo: 10, tier: "mid" },
  { userIdx: 6, text: "第3段我老是抢拍，看见你会了", hoursAgo: 11, tier: "mid" },
  { userIdx: 3, text: "镜头有点晃但不影响看动作", hoursAgo: 12, tier: "mid" },
  { userIdx: 7, text: "新人表示手已经打结了", hoursAgo: 13, tier: "mid" },
  { userIdx: 5, text: "这歌我刷到第三遍了还是学不会", hoursAgo: 14, tier: "mid" },
  { userIdx: 1, text: "同款裤子？好看", hoursAgo: 15, tier: "mid" },
  { userIdx: 8, text: "能不能出个慢速版", hoursAgo: 16, tier: "mid" },
  { userIdx: 2, text: "比我上周那版强多了羡慕", hoursAgo: 17, tier: "mid" },
  { userIdx: 9, text: "肩线好干净啊我靠", hoursAgo: 18, tier: "mid" },
  { userIdx: 4, text: "评论区好卷我先润", hoursAgo: 20, tier: "mid" },
  { userIdx: 6, text: "录了多久啊感觉很熟", hoursAgo: 21, tier: "mid" },
  { userIdx: 0, text: "可以，下周课堂示范就用你这条", hoursAgo: 22, tier: "mid" },

  // —— 约 10%：精选（有用/好笑/一句到位）——
  { userIdx: 6, text: "副歌举手别一起抬，右手先半拍，不然会显得乱", hoursAgo: 1, tier: "featured" },
  { userIdx: 9, text: "卡点不是听鼓，听那个「啪」的气声，跟住就不飘", hoursAgo: 3, tier: "featured" },
  { userIdx: 0, text: "下沉别靠膝盖软，重心先沉再走手，干净很多", hoursAgo: 5, tier: "featured" },
  { userIdx: 3, text: "备赛看过：表情别瞪，眼神放远一点更像舞台", hoursAgo: 7, tier: "featured" },
  { userIdx: 7, text: "连续打卡的人动作真的会变，不是玄学是肌肉记得住", hoursAgo: 9, tier: "featured" },
];

const COMMENT_POOLS: Record<CommentTier, typeof COMMENT_BANK> = {
  boring: COMMENT_BANK.filter((c) => c.tier === "boring"),
  mid: COMMENT_BANK.filter((c) => c.tier === "mid"),
  featured: COMMENT_BANK.filter((c) => c.tier === "featured"),
};

function pickFromPool(pool: typeof COMMENT_BANK, seed: number, offset: number) {
  return pool[(seed * 7 + offset * 3) % pool.length];
}

function commentsFor(resultId: string, count: number): CommunityComment[] {
  const seed = Number(resultId.replace(SHOWCASE_ID_PREFIX, "")) || 1;
  const featuredN = Math.max(0, Math.round(count * 0.1));
  const boringN = Math.max(0, Math.round(count * 0.5));
  const midN = Math.max(0, count - featuredN - boringN);

  const plan: CommentTier[] = [
    ...Array.from({ length: featuredN }, () => "featured" as const),
    ...Array.from({ length: boringN }, () => "boring" as const),
    ...Array.from({ length: midN }, () => "mid" as const),
  ];

  // 精选置顶，其余保持「时间倒序」的假象：先 featured，再按 hoursAgo 混排
  const raw = plan.map((tier, i) => {
    const bank = pickFromPool(COMMENT_POOLS[tier], seed, i);
    const u = USERS[bank.userIdx % USERS.length];
    const hours = bank.hoursAgo + i;
    const created = new Date(Date.UTC(2026, 6, 22, 12, 0, 0));
    created.setUTCHours(created.getUTCHours() - hours);
    return {
      id: `sc_cmt_${resultId}_${i}`,
      trackingResultId: resultId,
      userId: u.id,
      username: u.username,
      displayName: u.displayName,
      avatar: u.avatar,
      content: bank.text,
      createdAt: created.toISOString(),
      isFeatured: tier === "featured",
      _hours: hours,
    };
  });

  raw.sort((a, b) => {
    if (a.isFeatured !== b.isFeatured) return a.isFeatured ? -1 : 1;
    return a._hours - b._hours;
  });

  return raw.map(({ _hours: _, ...comment }) => comment);
}

export const SHOWCASE_COMMENTS: Record<string, CommunityComment[]> = Object.fromEntries(
  SHOWCASE_FEED.map((item, idx) => {
    // 多一点评论，比例才看得出来
    const n = 8 + (idx % 5);
    const comments = commentsFor(item.result.id, n);
    item.result.commentCount = comments.length;
    return [item.result.id, comments];
  })
);

export const WEEKLY_CHALLENGE: WeeklyChallenge = {
  lessonId: LESSON_WIL_A.id,
  lessonTitle: LESSON_WIL_A.title,
  participants: 1284,
  topScore: 97,
  topDisplayName: "米拉Mir",
  topResultId: `${SHOWCASE_ID_PREFIX}21`,
  headline: "本周同舞挑战 · ANTIFRAGILE",
  subline: "1,284 人参与 · 最高 97 分 · 跟跳即可上榜",
  thumb: LESSON_WIL_A.thumb,
  video: LESSON_WIL_A.video,
  daysLeft: 3,
};

export const WEEKLY_LEADERBOARD: LeaderboardRow[] = [
  { rank: 1, username: "mira_flow", displayName: "米拉Mir", score: 97, lessonTitle: LESSON_WIL_A.title, resultId: `${SHOWCASE_ID_PREFIX}21`, delta: 0, worksThisWeek: 3 },
  { rank: 2, username: "pulse_nova", displayName: "Nova233", score: 95, lessonTitle: LESSON_WIL_A.title, resultId: `${SHOWCASE_ID_PREFIX}14`, delta: 2, worksThisWeek: 4 },
  { rank: 3, username: "prep_yuna", displayName: "Yuna练功中", score: 94, lessonTitle: LESSON_WIL_A.title, resultId: `${SHOWCASE_ID_PREFIX}02`, delta: -1, worksThisWeek: 2 },
  { rank: 4, username: "mira_flow", displayName: "米拉Mir", score: 93, lessonTitle: LESSON_NNN_A.title, resultId: `${SHOWCASE_ID_PREFIX}11`, delta: 1, worksThisWeek: 3 },
  { rank: 5, username: "beat_owen", displayName: "有点想摸鱼", score: 91, lessonTitle: LESSON_WIL_A.title, resultId: `${SHOWCASE_ID_PREFIX}06`, delta: 3, worksThisWeek: 2 },
  { rank: 6, username: "studio_rex", displayName: "Rex不加班", score: 90, lessonTitle: LESSON_WIL_A.title, resultId: `${SHOWCASE_ID_PREFIX}08`, delta: 0, worksThisWeek: 2 },
  { rank: 7, username: "urban_kai", displayName: "街舞Kai", score: 89, lessonTitle: LESSON_WIL_A.title, resultId: `${SHOWCASE_ID_PREFIX}04`, delta: -2, worksThisWeek: 2 },
  { rank: 8, username: "prep_yuna", displayName: "Yuna练功中", score: 88, lessonTitle: LESSON_NNN_A.title, resultId: `${SHOWCASE_ID_PREFIX}12`, delta: 1, worksThisWeek: 2 },
  { rank: 9, username: "campus_jay", displayName: "阿杰不写作业", score: 87, lessonTitle: LESSON_NNN_A.title, resultId: `${SHOWCASE_ID_PREFIX}05`, delta: 4, worksThisWeek: 3 },
  { rank: 10, username: "soft_haze", displayName: "今天吃了吗", score: 87, lessonTitle: LESSON_WIL_A.title, resultId: `${SHOWCASE_ID_PREFIX}20`, delta: -1, worksThisWeek: 1 },
];

export const MY_LEADERBOARD_PLACEHOLDER: LeaderboardRow = {
  rank: 128,
  username: "you",
  displayName: "你（示例位）",
  score: 0,
  lessonTitle: "完成本周跟跳即可上榜",
  resultId: "",
  delta: 0,
  worksThisWeek: 0,
};

export const SONG_CHALLENGE_BOARDS: SongChallengeBoard[] = [
  {
    lessonId: LESSON_WIL_A.id,
    lessonTitle: LESSON_WIL_A.title,
    participants: 812,
    topScore: 97,
    rows: WEEKLY_LEADERBOARD.filter((r) => r.lessonTitle === LESSON_WIL_A.title).slice(0, 5),
  },
  {
    lessonId: LESSON_NNN_A.id,
    lessonTitle: LESSON_NNN_A.title,
    participants: 472,
    topScore: 93,
    rows: WEEKLY_LEADERBOARD.filter((r) => r.lessonTitle === LESSON_NNN_A.title).slice(0, 5),
  },
];

export const ACTIVITY_PULSE: ActivityPulseItem[] = [
  {
    id: "ap1",
    kind: "streak",
    username: "pulse_nova",
    displayName: "Nova233",
    text: "连续打卡第 21 天，训练营进度 7/7。",
    timeLabel: "12 分钟前",
    streakDays: 21,
    campDone: 7,
    campTotal: 7,
    resultId: `${SHOWCASE_ID_PREFIX}03`,
  },
  {
    id: "ap2",
    kind: "checkin",
    username: "night_lin",
    displayName: "晚到十分钟",
    text: "今日打卡完成 · 夜练 22 分钟 · 得分 84。",
    timeLabel: "38 分钟前",
    streakDays: 21,
    resultId: `${SHOWCASE_ID_PREFIX}07`,
  },
  {
    id: "ap3",
    kind: "highlight",
    username: "mira_flow",
    displayName: "米拉Mir",
    text: "本周挑战高光：ANTIFRAGILE 97 分示范已发布。",
    timeLabel: "1 小时前",
    resultId: `${SHOWCASE_ID_PREFIX}21`,
  },
  {
    id: "ap4",
    kind: "camp",
    username: "campus_jay",
    displayName: "阿杰不写作业",
    text: "校园同舞周进度 5/7。差两天拿社团徽章。",
    timeLabel: "2 小时前",
    campDone: 5,
    campTotal: 7,
    resultId: `${SHOWCASE_ID_PREFIX}05`,
  },
  {
    id: "ap5",
    kind: "checkin",
    username: "rook_annie",
    displayName: "小安想睡觉",
    text: "入门营第 3 天打卡。第一次公开作品求轻喷。",
    timeLabel: "3 小时前",
    streakDays: 3,
    campDone: 3,
    campTotal: 7,
    resultId: `${SHOWCASE_ID_PREFIX}10`,
  },
  {
    id: "ap6",
    kind: "streak",
    username: "prep_yuna",
    displayName: "Yuna练功中",
    text: "备赛连练 12 天。今日只发能过 90 的。",
    timeLabel: "5 小时前",
    streakDays: 12,
    resultId: `${SHOWCASE_ID_PREFIX}02`,
  },
  {
    id: "ap7",
    kind: "camp",
    username: "beat_owen",
    displayName: "有点想摸鱼",
    text: "节拍对齐营 5/7。对轨洁癖仍在发作。",
    timeLabel: "昨天",
    campDone: 5,
    campTotal: 7,
    resultId: `${SHOWCASE_ID_PREFIX}06`,
  },
  {
    id: "ap8",
    kind: "highlight",
    username: "studio_rex",
    displayName: "Rex不加班",
    text: "发布纠错示范：第 3 段右胯时机。",
    timeLabel: "昨天",
    resultId: `${SHOWCASE_ID_PREFIX}08`,
  },
];

export const WEEKLY_GOAL = {
  title: "本周目标",
  items: [
    { label: "完成 5 次跟跳发布", done: 3, total: 5 },
    { label: "任意曲目破 85 分", done: 1, total: 1 },
    { label: "连续打卡 7 天", done: 4, total: 7 },
  ],
};

function duelSideFromRow(row: LeaderboardRow, label: string): ScoreDuelSide {
  const item = SHOWCASE_FEED.find((entry) => entry.result.id === row.resultId);
  const meta = SHOWCASE_WORK_META[row.resultId];
  return {
    resultId: row.resultId,
    username: row.username,
    displayName: row.displayName,
    score: row.score,
    rank: row.rank,
    label,
    delta: row.delta,
    tallies: meta?.gradeTallies ?? { PERFECT: 0, GOOD: 0, OK: 0, MISS: 0 },
    thumb: item?.previewThumbnail ?? null,
  };
}

/** 周冠 vs 本周黑马（涨幅最大的非第一名） */
export function getWeeklyScoreDuel(): WeeklyScoreDuel {
  const championRow = WEEKLY_LEADERBOARD[0];
  const challengerRow = [...WEEKLY_LEADERBOARD]
    .slice(1)
    .sort((a, b) => b.delta - a.delta || b.score - a.score)[0] ?? WEEKLY_LEADERBOARD[1];

  const champion = duelSideFromRow(championRow, "周冠");
  const challenger = duelSideFromRow(challengerRow, "黑马");

  return {
    lessonTitle: WEEKLY_CHALLENGE.lessonTitle,
    gap: Math.max(0, champion.score - challenger.score),
    champion,
    challenger,
  };
}

export const WEEKLY_SCORE_DUEL: WeeklyScoreDuel = getWeeklyScoreDuel();

export function isShowcaseResultId(id: string): boolean {
  return id.startsWith(SHOWCASE_ID_PREFIX);
}

export function isShowcaseUsername(username: string): boolean {
  return USERS.some((u) => u.username === username);
}

export function getShowcaseFeedSorted(filter: PlazaFilter = "hot"): CommunityFeedItem[] {
  const items = SHOWCASE_FEED.map((item) => ({
    ...item,
    result: { ...item.result },
    user: { ...item.user, stats: { ...item.user.stats } },
  }));

  if (filter === "new") {
    return items.sort((a, b) => (a.result.createdAt < b.result.createdAt ? 1 : -1));
  }
  if (filter === "same") {
    return items
      .filter((item) => item.result.lessonId === WEEKLY_CHALLENGE.lessonId)
      .sort((a, b) => b.result.score - a.result.score);
  }
  if (filter === "recommend") {
    // 推荐：分数与互动混合，穿插中高分，更像「猜你喜欢」
    return items.sort((a, b) => {
      const scoreA = a.result.score * 8 + a.result.likeCount * 0.15 + (a.result.id.charCodeAt(a.result.id.length - 1) % 40);
      const scoreB = b.result.score * 8 + b.result.likeCount * 0.15 + (b.result.id.charCodeAt(b.result.id.length - 1) % 40);
      return scoreB - scoreA;
    });
  }
  if (filter === "following") {
    return items
      .filter((item) => (FOLLOWING_USERNAMES as readonly string[]).includes(item.user.username))
      .sort((a, b) => (a.result.createdAt < b.result.createdAt ? 1 : -1));
  }
  // 热门：赞 + 分
  return items.sort((a, b) => b.result.likeCount - a.result.likeCount || b.result.score - a.result.score);
}

export function getShowcaseDetail(resultId: string): CommunityTrackingDetailResponse | null {
  const item = SHOWCASE_FEED.find((entry) => entry.result.id === resultId);
  if (!item) return null;
  return {
    item: {
      ...item,
      result: { ...item.result },
      user: { ...item.user, stats: { ...item.user.stats } },
    },
    comments: [...(SHOWCASE_COMMENTS[resultId] ?? [])],
  };
}

export function getShowcaseSameSong(lessonId: string, excludeId?: string): CommunityFeedItem[] {
  return SHOWCASE_FEED.filter(
    (item) => item.result.lessonId === lessonId && item.result.id !== excludeId
  ).sort((a, b) => b.result.score - a.result.score);
}

export type ForYouReason = "同舞挑战" | "同曲挑战" | "相似风格" | "热门飙升" | "新人高光" | "猜你也喜欢";

export interface ForYouRecommendation {
  item: CommunityFeedItem;
  reason: ForYouReason;
  score: number;
}

/**
 * 抖音味「猜你喜欢」：同一支舞(danceKey)最优先 → 同课 → 标签/风格相近
 * → 热门 → 穿插探索。跳完 what is love 就优先推其他人跳 what is love 的。
 */
export function getForYouRecommendations(fromLessonId: string, limit = 12): ForYouRecommendation[] {
  const fromDanceKey = danceKeyOf(fromLessonId);
  const fromMetaTags = new Set(
    SHOWCASE_FEED.filter((item) => item.result.lessonId === fromLessonId)
      .flatMap((item) => SHOWCASE_WORK_META[item.result.id]?.tags ?? [])
  );

  const ranked = SHOWCASE_FEED.map((item) => {
    const meta = SHOWCASE_WORK_META[item.result.id];
    const tags = meta?.tags ?? [];
    const tagOverlap = tags.filter((t) => fromMetaTags.has(t)).length;
    const sameLesson = item.result.lessonId === fromLessonId;
    // 同一支舞(不同视频/不同课):whatislove 推 whatislove,nonono 推 nonono
    const sameDance =
      !sameLesson && fromDanceKey !== null && danceKeyOf(item.result.lessonId) === fromDanceKey;
    const isNewbie = tags.some((t) => /新人|入门/.test(t)) || item.result.likeCount < 160;
    const isHot = item.result.likeCount >= 400 || item.result.score >= 92;

    let score = item.result.likeCount * 0.35 + item.result.score * 8;
    let reason: ForYouReason = "猜你也喜欢";

    if (sameDance) {
      score += 5200;
      reason = "同舞挑战";
    } else if (sameLesson) {
      score += 4200;
      reason = "同曲挑战";
    } else if (tagOverlap > 0) {
      score += 1800 + tagOverlap * 220;
      reason = "相似风格";
    } else if (isHot) {
      score += 900;
      reason = "热门飙升";
    } else if (isNewbie) {
      score += 650;
      reason = "新人高光";
    }

    // 轻微扰动，避免每次顺序完全一样（抖音也会混排探索）
    score += (item.result.id.charCodeAt(item.result.id.length - 1) % 7) * 17;

    return { item, reason, score };
  })
    .sort((a, b) => b.score - a.score);

  // 前 60% 高相关，后段塞一些探索位
  const head = ranked
    .filter((r) => r.reason === "同舞挑战" || r.reason === "同曲挑战" || r.reason === "相似风格")
    .slice(0, Math.ceil(limit * 0.55));
  const explore = ranked
    .filter((r) => !head.some((h) => h.item.result.id === r.item.result.id))
    .slice(0, limit - head.length);

  return [...head, ...explore].slice(0, limit).map((entry) => ({
    item: {
      ...entry.item,
      result: { ...entry.item.result },
      user: { ...entry.item.user, stats: { ...entry.item.user.stats } },
    },
    reason: entry.reason,
    score: entry.score,
  }));
}

export function getShowcaseUserProfile(username: string): CommunityUserProfileResponse | null {
  const user = USERS.find((u) => u.username === username);
  if (!user) return null;
  const results = SHOWCASE_FEED.filter((item) => item.user.username === username).sort(
    (a, b) => (a.result.createdAt < b.result.createdAt ? 1 : -1)
  );
  return {
    user: { ...user, stats: { ...user.stats } },
    results: results.map((item) => ({
      ...item,
      result: { ...item.result },
      user: { ...user, stats: { ...user.stats } },
    })),
  };
}

const MEDAL_TONES = ["gold", "cyan", "rose", "lime"] as const;

export function medalIconKey(name: string): string {
  if (/教练|导师|助教/.test(name)) return "shield";
  if (/周冠|冠军|高光|纪录/.test(name)) return "trophy";
  if (/社团|主理/.test(name)) return "users";
  if (/连练|连打|连续|七天|21/.test(name)) return "flame";
  if (/夜猫|夜练/.test(name)) return "moon";
  if (/备赛|选手/.test(name)) return "target";
  if (/90\+|高分|破 80|破80/.test(name)) return "award";
  if (/街舞|跨界/.test(name)) return "music";
  if (/节奏|拍感|洁癖/.test(name)) return "audio";
  if (/新人|入门|上路/.test(name)) return "sparkles";
  if (/纠错|达人/.test(name)) return "wrench";
  if (/训练营|营/.test(name)) return "flag";
  if (/连击|破纪录/.test(name)) return "rocket";
  if (/副歌|杀手/.test(name)) return "mic";
  if (/剪辑/.test(name)) return "clapper";
  if (/重录/.test(name)) return "rotate";
  if (/演示|账号/.test(name)) return "user";
  if (/认证/.test(name)) return "badge";
  return "star";
}

export function getProfilePageModel(username: string): ProfilePageModel | null {
  const profile = getShowcaseUserProfile(username);
  const meta = SHOWCASE_PROFILE_META[username];
  if (!profile || !meta) return null;

  const recent: ProfileRecentRecord[] = profile.results.slice(0, 6).map((item, index) => ({
    id: `recent_${item.result.id}`,
    title: item.lessonTitle,
    score: item.result.score,
    timeLabel: index === 0 ? "今天" : index === 1 ? "昨天" : `${index + 1} 天前`,
    resultId: item.result.id,
    thumb: item.previewThumbnail,
  }));

  const liked = meta.likedResultIds
    .map((id) => SHOWCASE_FEED.find((item) => item.result.id === id))
    .filter((item): item is CommunityFeedItem => Boolean(item))
    .map((item) => ({
      ...item,
      result: { ...item.result },
      user: { ...item.user, stats: { ...item.user.stats } },
    }));

  const medals = meta.badges.map((name, index) => ({
    name,
    tone: MEDAL_TONES[index % MEDAL_TONES.length],
    icon: medalIconKey(name),
  }));

  return {
    user: profile.user,
    works: profile.results,
    meta,
    medals,
    recent,
    liked,
    premium: {
      active: meta.premiumActive,
      tier: meta.premiumTier,
      expiresLabel: meta.premiumActive ? "有效期至 2026.12.31" : "未开通",
      perks: meta.premiumActive
        ? ["无限跟跳存档", "分段精析回放", "训练营优先位"]
        : ["开通后解锁无限存档", "分段精析回放", "训练营优先位"],
    },
  };
}

/** 演示登录用户的个人页兜底模型 */
export function buildDemoProfilePageModel(input: {
  username: string;
  displayName: string;
  bio?: string | null;
  works?: CommunityFeedItem[];
}): ProfilePageModel {
  const works = input.works ?? [];
  const cover = works[0]?.previewThumbnail ?? LESSON_WIL_A.thumb;
  return {
    user: {
      id: `demo_${input.username}`,
      username: input.username,
      displayName: input.displayName,
      avatar: null,
      bio: input.bio ?? "随便跳跳，开心就好。",
      isVerified: false,
      createdAt: daysAgo(30),
      isFollowing: false,
      stats: {
        userId: `demo_${input.username}`,
        followerCount: 12,
        followingCount: 28,
        publishedTrackingCount: works.length,
        totalLikesReceived: works.reduce((sum, item) => sum + item.result.likeCount, 0),
      },
    },
    works,
    meta: {
      badges: ["新人上路", "演示账号", "首次破 80", "三天连练"],
      streakDays: 3,
      thisWeekCheckins: [true, true, true, false, false, false, false],
      role: "舞者",
      coverThumb: cover,
      city: "未设置",
      premiumActive: false,
      premiumTier: "Premium",
      likedResultIds: [`${SHOWCASE_ID_PREFIX}21`, `${SHOWCASE_ID_PREFIX}01`],
      moments: [{ id: "d1", text: "刚登录，准备发第一支。", timeLabel: "刚刚" }],
      facts: [
        { label: "身份", value: "演示账号" },
        { label: "所在地", value: "未设置" },
        { label: "加入", value: "最近" },
      ],
    },
    medals: [
      { name: "新人上路", tone: "lime", icon: medalIconKey("新人上路") },
      { name: "演示账号", tone: "cyan", icon: medalIconKey("演示账号") },
      { name: "首次破 80", tone: "rose", icon: medalIconKey("首次破 80") },
      { name: "三天连练", tone: "gold", icon: medalIconKey("三天连练") },
    ],
    recent: works.slice(0, 4).map((item, index) => ({
      id: `demo_recent_${item.result.id}`,
      title: item.lessonTitle,
      score: item.result.score,
      timeLabel: index === 0 ? "今天" : `${index} 天前`,
      resultId: item.result.id,
      thumb: item.previewThumbnail,
    })),
    liked: [`${SHOWCASE_ID_PREFIX}21`, `${SHOWCASE_ID_PREFIX}01`]
      .map((id) => SHOWCASE_FEED.find((item) => item.result.id === id))
      .filter((item): item is CommunityFeedItem => Boolean(item)),
    premium: {
      active: false,
      tier: "Premium",
      expiresLabel: "未开通",
      perks: ["开通后解锁无限存档", "分段精析回放", "训练营优先位"],
    },
  };
}

export function forceCommunityShowcase(): boolean {
  return process.env.NEXT_PUBLIC_COMMUNITY_SHOWCASE === "1";
}
