import type { Segment } from "./types";

// 摘自 CUE_VOCABULARY.md 的高频口令，优先用于跟练 overlay 的短提示。
const CUE_VOCABULARY = [
  "八字胯",
  "侧顶胯",
  "前送胯",
  "波浪胯",
  "弹动胯",
  "顿点胯",
  "骨盆前倾",
  "骨盆回正",
  "骨盆侧移",
  "骨盆绕环",
  "单腿站",
  "换重心",
  "移重心",
  "压重心",
  "沉重心",
  "脊柱拉长",
  "脊柱延伸",
  "胸腔前送",
  "胸腔后收",
  "肩胛下沉",
  "肩胛上提",
  "肩前绕",
  "肩后绕",
  "锁骨展",
  "肩线平",
  "侧腰拉",
  "侧腰推",
  "身体前倾",
  "身体后仰",
  "身体侧倾",
  "身体回正",
  "脊椎卷起",
  "波浪身",
  "抬小腿",
  "前脚掌",
  "脚跟落",
  "脚尖点",
  "脚掌碾",
  "踝绕环",
  "大腿外开",
  "大腿内夹",
  "顶胯",
  "扭胯",
  "画胯",
  "坐胯",
  "提胯",
  "送胯",
  "摆胯",
  "颤胯",
  "开胯",
  "收胯",
  "绕胯",
  "压胯",
  "弹胯",
  "沉胯",
  "翻胯",
  "碾胯",
  "抖胯",
  "提臀",
  "夹臀",
  "顶臀",
  "抬腿",
  "踢腿",
  "吸腿",
  "落脚",
  "弯膝",
  "直膝",
  "蹬地",
  "踮脚",
  "勾脚",
  "绷脚",
  "开膝",
  "并膝",
  "提膝",
  "落膝",
  "顶膝",
  "收膝",
  "外开",
  "内扣",
  "外展",
  "内收",
  "踢脚",
  "跺脚",
  "点脚",
  "碾脚",
  "转脚",
  "勾踢",
  "弹踢",
  "侧踢",
  "前踢",
  "后踢",
  "控腿",
  "甩腿",
  "摆腿",
  "扫腿",
  "撩腿",
  "并腿",
  "收腹",
  "顶腹",
  "扭腰",
  "转腰",
  "送腰",
  "挺腰",
  "塌腰",
  "含胸",
  "挺胸",
  "开胸",
  "顶胸",
  "压胸",
  "扩肋",
  "收肋",
  "上身拔",
  "上身沉",
  "核心收",
  "核心稳",
  "中段紧",
  "中段松",
  "骨盆稳",
  "骨盆转",
  "上身反",
  "耸肩",
  "沉肩",
  "开肩",
  "绕肩",
  "送肩",
  "压肩",
  "挑肩",
  "掉肩",
  "提肩",
  "转肩",
  "后背夹",
  "后背开",
  "摊掌",
  "切掌",
  "刀手",
  "画圆",
  "甩手",
  "推手",
  "顶肘",
  "收肘",
  "绕腕",
  "弹指",
] as const;

const VOCABULARY_BY_LENGTH = [...CUE_VOCABULARY].sort(
  (left, right) => right.length - left.length
);

function fallbackCueWords(segment: Segment): string[] {
  const label = `${segment.section_label} ${segment.section}`.toLowerCase();

  if (label.includes("chorus")) {
    return ["卡拍", "顶胯", "摆腿", "换重心"];
  }

  if (label.includes("verse")) {
    return ["沉肩", "扭腰", "移重心", "上身拔"];
  }

  if (segment.difficulty >= 4) {
    return ["控腿", "核心稳", "卡拍", "换重心"];
  }

  return ["卡拍", "换重心", "沉肩", "上身拔"];
}

function collectCueWords(source: string, bucket: string[], seen: Set<string>) {
  const normalized = source.trim();
  if (!normalized) return;

  for (const cue of VOCABULARY_BY_LENGTH) {
    if (!normalized.includes(cue) || seen.has(cue)) continue;
    seen.add(cue);
    bucket.push(cue);
    if (bucket.length >= 4) return;
  }
}

export function cueWordsForSegment(segment: Segment): string[] {
  const results: string[] = [];
  const seen = new Set<string>();

  for (const step of segment.teaching?.steps ?? []) {
    collectCueWords(step.content, results, seen);
    if (results.length >= 4) return results;
  }

  collectCueWords(segment.teaching?.summary ?? "", results, seen);
  collectCueWords(segment.ai_description ?? "", results, seen);
  collectCueWords(segment.section_label ?? "", results, seen);

  if (results.length > 0) {
    return results.slice(0, 4);
  }

  return fallbackCueWords(segment);
}

export function cueWordForBeat(
  cueWords: string[],
  currentBeat: number,
  beatCount: number
): string {
  if (cueWords.length === 0) return "卡拍";
  if (cueWords.length === 1) return cueWords[0];

  const safeBeatCount = Math.max(beatCount, 1);
  const ratio = (Math.max(currentBeat, 1) - 1) / safeBeatCount;
  const cueIndex = Math.min(
    cueWords.length - 1,
    Math.floor(ratio * cueWords.length)
  );
  return cueWords[cueIndex] ?? cueWords[cueWords.length - 1];
}
