/**
 * 把老师骨架刚体对齐到用户骨架：缩放 + 平移（以胯中点为锚、肩宽/躯干高估尺度）。
 * 用于跟拍叠层，使老师幽灵骨架尽量与用户黄绿骨架重合。
 */

import { BP, type Kpt } from "@/lib/pose/scoring";

const DEFAULT_MIN_VIS = 0.35;

type TorsoFrame = {
  hipX: number;
  hipY: number;
  shoulderW: number;
  torsoH: number;
};

function mid(
  a: Kpt | undefined,
  b: Kpt | undefined,
  minVis: number,
): { x: number; y: number } | null {
  if (!a || !b) return null;
  if ((a.visibility ?? 0) < minVis || (b.visibility ?? 0) < minVis) return null;
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function torsoFrame(kpts: Kpt[], minVis: number): TorsoFrame | null {
  if (!kpts || kpts.length < 33) return null;
  const ls = kpts[BP.LEFT_SHOULDER];
  const rs = kpts[BP.RIGHT_SHOULDER];
  const lh = kpts[BP.LEFT_HIP];
  const rh = kpts[BP.RIGHT_HIP];
  const hip = mid(lh, rh, minVis);
  const sh = mid(ls, rs, minVis);
  if (!hip || !sh || !ls || !rs) return null;
  const shoulderW = Math.hypot(rs.x - ls.x, rs.y - ls.y);
  const torsoH = Math.hypot(sh.x - hip.x, sh.y - hip.y);
  if (shoulderW < 1e-4 || torsoH < 1e-4) return null;
  return { hipX: hip.x, hipY: hip.y, shoulderW, torsoH };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

export type AlignResult = {
  points: Kpt[];
  scale: number;
};

/**
 * 将 teacher 关键点变换到 user 的画面坐标系（仍为 0–1 归一化）。
 * 失败时返回 null（调用方回退到未对齐绘制）。
 */
export function alignTeacherToUser(
  teacher: Kpt[],
  user: Kpt[],
  opts?: { minVis?: number; flipX?: boolean },
): AlignResult | null {
  const minVis = opts?.minVis ?? DEFAULT_MIN_VIS;
  const u = torsoFrame(user, minVis);
  let tKpts = teacher;
  // 可选：先水平翻转老师再对齐（自拍左右与老师视频不一致时）
  if (opts?.flipX) {
    tKpts = teacher.map((p) => ({ ...p, x: 1 - p.x }));
  }
  const t = torsoFrame(tKpts, minVis);
  if (!u || !t) return null;

  const scaleW = u.shoulderW / t.shoulderW;
  const scaleH = u.torsoH / t.torsoH;
  const scale = clamp(0.55 * scaleW + 0.45 * scaleH, 0.5, 2.4);

  const points = tKpts.map((p) => ({
    x: (p.x - t.hipX) * scale + u.hipX,
    y: (p.y - t.hipY) * scale + u.hipY,
    z: p.z,
    visibility: p.visibility ?? 0,
  }));

  return { points, scale };
}

/** 选翻转或不翻转中，对齐后肩线更接近用户的一侧 */
export function alignTeacherToUserAuto(
  teacher: Kpt[],
  user: Kpt[],
  opts?: { minVis?: number },
): AlignResult | null {
  const a = alignTeacherToUser(teacher, user, { ...opts, flipX: false });
  const b = alignTeacherToUser(teacher, user, { ...opts, flipX: true });
  if (!a && !b) return null;
  if (!a) return b;
  if (!b) return a;

  const score = (aligned: Kpt[]) => {
    const ls = aligned[BP.LEFT_SHOULDER];
    const rs = aligned[BP.RIGHT_SHOULDER];
    const uls = user[BP.LEFT_SHOULDER];
    const urs = user[BP.RIGHT_SHOULDER];
    if (!ls || !rs || !uls || !urs) return Number.POSITIVE_INFINITY;
    return (
      Math.hypot(ls.x - uls.x, ls.y - uls.y) + Math.hypot(rs.x - urs.x, rs.y - urs.y)
    );
  };
  return score(a.points) <= score(b.points) ? a : b;
}
