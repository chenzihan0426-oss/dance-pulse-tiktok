"use client";

import {
  SHOWCASE_FEED,
  SHOWCASE_WORK_META,
} from "@/lib/communityShowcase";
import type { CommunityFeedItem } from "@/lib/types";

export type SimilarTagKind =
  | "similarity"
  | "friends"
  | "genre"
  | "tempo"
  | "difficulty"
  | "hot"
  | "sync"
  | "mood"
  | "crew";

export interface SimilarTag {
  kind: SimilarTagKind;
  label: string;
}

export interface SimilarLessonRec {
  item: CommunityFeedItem;
  similarity: number;
  stars: number;
  friendsLearning: number;
  genre: string;
  tags: SimilarTag[];
  hook: string;
}

const GENRE_BY_LESSON: Record<string, string> = {
  antifragile_dp: "女团副歌",
  les_122ea874306b: "夜练街舞",
  harry_dp: "流行同舞",
  qlx_dp: "编舞挑战",
};

const HOOKS_SAME = [
  "同曲换皮跳法，骨架几乎贴合",
  "主歌到副歌的发力顺序高度同频",
  "换了服装，动作轨迹仍像双胞胎",
];

const HOOKS_GENRE = [
  "同门舞种的下沉与弹跳节奏接近",
  "手臂线条训练位与当前课互补",
  "适合当作「热身续杯」的下一支",
];

const HOOKS_OTHER = [
  "拍点咬合感很像，适合交叉练",
  "段落起伏曲线接近，可无缝衔接",
  "身体重心迁移方式与本课同源",
];

const SIM_LABELS = [
  "动作镜像度拉满",
  "骨架重合预警",
  "几乎同轨翻跳",
  "路径贴合度爆表",
  "关节时序高度同调",
];

const FRIEND_LABELS = [
  (n: number) => (n === 1 ? "你的好友刚点开" : `${n} 位好友正在啃`),
  (n: number) => (n === 1 ? "圈子里有人在练" : `${n} 人同频开练`),
  (n: number) => `好友圈 · ${n} 人在刷`,
];

const GENRE_SAME = [
  (g: string) => `同源舞种 · ${g}`,
  (g: string) => `${g} 同门课`,
  (g: string) => `风格连线 · ${g}`,
];

const GENRE_CROSS = [
  (g: string) => `跨界尝鲜 · ${g}`,
  (g: string) => `新风味 · ${g}`,
  (g: string) => `旁支舞种 · ${g}`,
];

const TEMPO_LABELS = [
  "BPM 咬得很紧",
  "拍感几乎同频",
  "节奏锁死预警",
  "鼓点对位友好",
];

const DIFF_LABELS = ["难度无缝衔接", "强度落差很小", "可直接加练", "坡度几乎持平"];

const HOT_LABELS = ["热练雷达命中", "本周流量尖兵", "广场正在刷", "连击区热门"];

const SYNC_LABELS = ["Perfect Sync 候选", "跟跳同步率高", "镜面练习友好"];

const MOOD_LABELS = ["夜练气氛对味", "副歌杀气同款", "燃脂情绪匹配", "冷感霓虹同频"];

const CREW_LABELS = ["社团周练推荐", "双人对照友好", "训练营加练单"];

function hash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function pick<T>(list: T[], seed: number): T {
  return list[seed % list.length];
}

function genreOf(lessonId: string): string {
  return GENRE_BY_LESSON[lessonId] ?? "流行编舞";
}

/** 相似度 → 1~5 星 */
export function similarityToStars(similarity: number): number {
  if (similarity >= 94) return 5;
  if (similarity >= 88) return 4;
  if (similarity >= 80) return 3;
  if (similarity >= 72) return 2;
  return 1;
}

/**
 * 课程详情「相似推荐」：基于假社区作品混排，带动作相似度 / 好友 / 舞种等标签。
 */
export function getSimilarLessonRecommendations(
  fromLessonId: string,
  limit = 8
): SimilarLessonRec[] {
  const fromGenre = genreOf(fromLessonId);
  const ranked = SHOWCASE_FEED.map((item) => {
    const h = hash(item.result.id + fromLessonId);
    const sameSong = item.result.lessonId === fromLessonId;
    const sameGenre = genreOf(item.result.lessonId) === fromGenre;
    const metaTags = SHOWCASE_WORK_META[item.result.id]?.tags ?? [];

    let similarity = 62 + (h % 28);
    if (sameSong) similarity = Math.min(98, similarity + 18);
    else if (sameGenre) similarity = Math.min(94, similarity + 10);
    similarity = Math.max(68, Math.min(97, similarity));

    const friendsLearning = 1 + (h % 6);
    const genre = genreOf(item.result.lessonId);
    const tempoFit = 70 + (h % 25);
    const difficultyClose = Math.abs(item.result.score - 88) < 12;
    const stars = similarityToStars(similarity);

    const tags: SimilarTag[] = [
      { kind: "similarity", label: pick(SIM_LABELS, h) },
      { kind: "friends", label: pick(FRIEND_LABELS, h >> 3)(friendsLearning) },
      {
        kind: "genre",
        label: sameGenre ? pick(GENRE_SAME, h >> 5)(genre) : pick(GENRE_CROSS, h >> 5)(genre),
      },
    ];

    if (tempoFit >= 82) {
      tags.push({ kind: "tempo", label: pick(TEMPO_LABELS, h >> 7) });
    }
    if (difficultyClose) {
      tags.push({ kind: "difficulty", label: pick(DIFF_LABELS, h >> 9) });
    }
    if (item.result.likeCount >= 400 || metaTags.some((t) => /周冠|热/.test(t))) {
      tags.push({ kind: "hot", label: pick(HOT_LABELS, h >> 11) });
    }
    if (sameSong || similarity >= 90) {
      tags.push({ kind: "sync", label: pick(SYNC_LABELS, h >> 13) });
    }
    if (h % 3 === 0) {
      tags.push({ kind: "mood", label: pick(MOOD_LABELS, h >> 15) });
    }
    if (h % 4 === 1) {
      tags.push({ kind: "crew", label: pick(CREW_LABELS, h >> 17) });
    }

    const hook = sameSong
      ? pick(HOOKS_SAME, h)
      : sameGenre
        ? pick(HOOKS_GENRE, h)
        : pick(HOOKS_OTHER, h);

    let score = similarity * 12 + friendsLearning * 40 + item.result.likeCount * 0.2;
    if (sameSong) score += 800;
    if (sameGenre) score += 320;

    return {
      item: {
        ...item,
        result: { ...item.result },
        user: { ...item.user, stats: { ...item.user.stats } },
      },
      similarity,
      stars,
      friendsLearning,
      genre,
      tags: tags.slice(0, 4),
      hook,
      score,
    };
  })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return ranked.map(({ score: _s, ...rest }) => rest);
}
