/**
 * 骨段平均余弦 → 0–100 分（已放宽，跟拍更友好）。
 *
 * 锚点（线性分段）：
 *   cos ≥ 0.90 → 100
 *   cos = 0.72 → 78
 *   cos = 0.50 → 50
 *   cos ≤ 0.20 → 12
 */

export const COSINE_SCORE_ANCHORS: Array<{ cos: number; score: number }> = [
  { cos: 0.9, score: 100 },
  { cos: 0.72, score: 78 },
  { cos: 0.5, score: 50 },
  { cos: 0.2, score: 12 },
];

/** 将单帧/聚合的骨段平均余弦映射为 0–100 整数分。 */
export function cosineToScore100(meanCosine: number | null | undefined): number {
  if (meanCosine == null || Number.isNaN(meanCosine)) return 0;
  const cos = Math.max(-1, Math.min(1, meanCosine));
  const anchors = COSINE_SCORE_ANCHORS;

  if (cos >= anchors[0].cos) return anchors[0].score;
  if (cos <= anchors[anchors.length - 1].cos) return anchors[anchors.length - 1].score;

  for (let i = 0; i < anchors.length - 1; i++) {
    const hi = anchors[i];
    const lo = anchors[i + 1];
    if (cos <= hi.cos && cos >= lo.cos) {
      const t = (cos - lo.cos) / Math.max(1e-9, hi.cos - lo.cos);
      return Math.round(lo.score + t * (hi.score - lo.score));
    }
  }
  return 0;
}

/**
 * 实时融合分友好曲线：压低「难拿高分」的陡峭区，避免长期贴地。
 * 输入/输出均在 [0,1]。
 */
export function softenLiveScore01(raw01: number): number {
  const x = Math.max(0, Math.min(1, raw01));
  // gamma < 1 → 抬高低分段；再加一点底分缓冲
  const curved = Math.pow(x, 0.72);
  return Math.max(0, Math.min(1, curved * 0.92 + 0.08 * curved));
}
