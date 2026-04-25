import type { Keypoint } from "./types";

// MediaPipe Pose 33 keypoint 索引:
// 0:nose  1-3:leftEye  4-6:rightEye  7:leftEar  8:rightEar
// 9:mouthL 10:mouthR
// 11:lShoulder 12:rShoulder 13:lElbow 14:rElbow 15:lWrist 16:rWrist
// 17-22:手指(忽略,误差大)
// 23:lHip 24:rHip 25:lKnee 26:rKnee 27:lAnkle 28:rAnkle
// 29-32:脚趾跟(忽略)
export const POSE_CONNECTIONS: Array<[number, number]> = [
  // 躯干
  [11, 12], [11, 23], [12, 24], [23, 24],
  // 左臂
  [11, 13], [13, 15],
  // 右臂
  [12, 14], [14, 16],
  // 左腿
  [23, 25], [25, 27],
  // 右腿
  [24, 26], [26, 28],
  // 头与肩
  [0, 11], [0, 12],
];

// 我们在叠加图上画的关键点索引(忽略手指/脚趾)
export const DRAWN_KEYPOINTS = [
  0,  // nose
  11, 12, 13, 14, 15, 16,  // 上肢
  23, 24, 25, 26, 27, 28,  // 下肢
];

export interface DrawOptions {
  color: string;
  width: number;
  pointRadius: number;
  alpha?: number;
  minVisibility?: number; // visibility 低于此值的点不画
  mirror?: boolean;       // true 表示画之前水平翻转(用户自拍镜像时用)
}

// ---------------------------------------------------------------------------
// drawGhostOutline —— 把老师 ghost 画成"半透明发光轮廓线",不做填实。
// 视觉参考:STEPIN 家的产品里老师轮廓套在学生身上那种荧光边。
//
// 做法:
//   1. 先在离屏 canvas 上画一个 outer 尺寸的 drawGhostBody(白色,实心)
//   2. globalCompositeOperation = "destination-out",再画一个 inner (thinner) 的 ghost
//      → 把内部挖空,离屏只剩一圈外轮廓
//   3. 把离屏搬到主 canvas,配合 shadowBlur 外发光,得到柔和的发光边
// ---------------------------------------------------------------------------

// 复用离屏 canvas,避免每帧 new
let _ghostOffscreen: HTMLCanvasElement | null = null;
function getGhostOffscreen(w: number, h: number): HTMLCanvasElement {
  if (!_ghostOffscreen) _ghostOffscreen = document.createElement("canvas");
  if (_ghostOffscreen.width !== w || _ghostOffscreen.height !== h) {
    _ghostOffscreen.width = w;
    _ghostOffscreen.height = h;
  }
  return _ghostOffscreen;
}

export interface GhostOutlineOptions {
  // 轮廓 + 发光颜色
  color: string;
  // 轮廓整体不透明度(CSS 里 0-1)
  alpha?: number;
  // 外发光模糊半径(px)
  glowBlur?: number;
  // outer / inner 的厚度比;0.88 表示轮廓宽度 ≈ 外尺寸的 12%,数值越小线越粗
  innerScale?: number;
  minVisibility?: number;
  mirror?: boolean;
}

export function drawGhostOutline(
  ctx: CanvasRenderingContext2D,
  kp: Keypoint[],
  canvasW: number,
  canvasH: number,
  opts: GhostOutlineOptions,
): void {
  const {
    color,
    alpha = 0.75,
    glowBlur = 22,
    innerScale = 0.88,
    minVisibility = 0.3,
    mirror = false,
  } = opts;

  const off = getGhostOffscreen(canvasW, canvasH);
  const offCtx = off.getContext("2d");
  if (!offCtx) return;

  // 清空离屏
  offCtx.clearRect(0, 0, canvasW, canvasH);

  // outer 实心(等下挖空用)—— 用白色保证不透明,颜色在主 canvas 上套
  drawGhostBody(offCtx, kp, canvasW, canvasH, {
    color: "#ffffff",
    alpha: 1,
    mirror,
    minVisibility,
    thicknessScale: 1,
  });

  // destination-out 挖内部
  offCtx.globalCompositeOperation = "destination-out";
  drawGhostBody(offCtx, kp, canvasW, canvasH, {
    color: "#ffffff",
    alpha: 1,
    mirror,
    minVisibility,
    thicknessScale: innerScale,
  });
  offCtx.globalCompositeOperation = "source-over";

  // 把离屏输出(白色描边图)搬到主 canvas,套指定颜色 + 外发光
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.shadowColor = color;
  ctx.shadowBlur = glowBlur;

  // 利用 source-in 把白色轮廓染成指定 color:先画上色矩形,再用 source-in 保留
  // 偏好简单做法:直接画离屏(白色)+ 彩色 shadow,白心 + 彩光,效果接近 STEPIN
  ctx.drawImage(off, 0, 0);

  // 再画一遍无 shadow 的白色核心,让线条本体更锐利
  ctx.shadowBlur = 0;
  ctx.globalAlpha = Math.min(1, alpha * 0.95);
  ctx.drawImage(off, 0, 0);
  ctx.restore();
}

// ---------------------------------------------------------------------------
// 填实的"舞者影子" —— 用关键点推出身体轮廓,填成一个半透明的人形剪影,
// 叠在用户画面上看起来像一个幽灵陪着自己跳舞。
// ---------------------------------------------------------------------------

export interface GhostBodyOptions {
  color: string;
  alpha?: number;
  minVisibility?: number;
  // true: 对 x 做 1-x 翻转(canvas 未 CSS 镜像时的场景)
  mirror?: boolean;
  // 额外缩放人体粗细,默认 1
  thicknessScale?: number;
}

export function drawGhostBody(
  ctx: CanvasRenderingContext2D,
  kp: Keypoint[],
  canvasW: number,
  canvasH: number,
  opts: GhostBodyOptions,
): void {
  const {
    color,
    alpha = 0.6,
    minVisibility = 0.3,
    mirror = false,
    thicknessScale = 1,
  } = opts;

  const fx = (k: Keypoint) => (mirror ? 1 - k[0] : k[0]) * canvasW;
  const fy = (k: Keypoint) => k[1] * canvasH;
  const visOk = (k: Keypoint | undefined): boolean =>
    !!k && (k[2] ?? 0) >= minVisibility;

  const NOSE = 0;
  const LS = 11, RS = 12;
  const LE = 13, RE = 14;
  const LW = 15, RW = 16;
  const LH = 23, RH = 24;
  const LK = 25, RK = 26;
  const LA = 27, RA = 28;

  const lS = kp[LS], rS = kp[RS], lH = kp[LH], rH = kp[RH];
  if (!visOk(lS) || !visOk(rS)) return;

  // 肩宽作为整体人体尺度
  const shoulderPx = Math.hypot(
    (rS![0] - lS![0]) * canvasW,
    (rS![1] - lS![1]) * canvasH,
  );
  const limbW = Math.max(14, shoulderPx * 0.45) * thicknessScale;
  const armW = Math.max(12, shoulderPx * 0.38) * thicknessScale;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // 1) 躯干(肩-肩-胯-胯)填充为四边形 —— 按 thicknessScale 相对质心做内缩,
  //    这样 outer+destination-out(inner) 的 trick 才能得到干净的轮廓
  if (visOk(lH) && visOk(rH)) {
    const cx = (fx(lS!) + fx(rS!) + fx(rH!) + fx(lH!)) / 4;
    const cy = (fy(lS!) + fy(rS!) + fy(rH!) + fy(lH!)) / 4;
    const inset = (p: number, c: number) => c + (p - c) * thicknessScale;
    ctx.beginPath();
    ctx.moveTo(inset(fx(lS!), cx), inset(fy(lS!), cy));
    ctx.lineTo(inset(fx(rS!), cx), inset(fy(rS!), cy));
    ctx.lineTo(inset(fx(rH!), cx), inset(fy(rH!), cy));
    ctx.lineTo(inset(fx(lH!), cx), inset(fy(lH!), cy));
    ctx.closePath();
    ctx.fill();
  }

  // 2) 头部:以双肩中点或鼻子为参考,椭圆半径也按 thicknessScale 缩放
  const sx = (fx(lS!) + fx(rS!)) / 2;
  const sy = (fy(lS!) + fy(rS!)) / 2;
  const headR = shoulderPx * 0.34 * thicknessScale;
  let headCx = sx, headCy = sy - shoulderPx * 0.34 * 1.4;
  if (visOk(kp[NOSE])) {
    headCx = fx(kp[NOSE]);
    headCy = fy(kp[NOSE]);
  }
  ctx.beginPath();
  ctx.ellipse(headCx, headCy, headR, headR * 1.15, 0, 0, Math.PI * 2);
  ctx.fill();
  // 脖子线宽也跟着 thicknessScale 缩
  ctx.lineWidth = shoulderPx * 0.4 * thicknessScale;
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(headCx, headCy);
  ctx.stroke();

  // 3) 四肢:以粗线 + 圆端替代 capsule
  const drawLimb = (a: number, b: number, w: number) => {
    const A = kp[a], B = kp[b];
    if (!visOk(A) || !visOk(B)) return;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(fx(A!), fy(A!));
    ctx.lineTo(fx(B!), fy(B!));
    ctx.stroke();
  };

  // 手臂
  drawLimb(LS, LE, armW);
  drawLimb(LE, LW, armW * 0.85);
  drawLimb(RS, RE, armW);
  drawLimb(RE, RW, armW * 0.85);

  // 腿
  drawLimb(LH, LK, limbW);
  drawLimb(LK, LA, limbW * 0.9);
  drawLimb(RH, RK, limbW);
  drawLimb(RK, RA, limbW * 0.9);

  ctx.restore();
}

export function drawSkeleton(
  ctx: CanvasRenderingContext2D,
  kp: Keypoint[],
  canvasW: number,
  canvasH: number,
  opts: DrawOptions,
): void {
  const { color, width, pointRadius, alpha = 1, minVisibility = 0.4, mirror = false } = opts;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  const px = (normX: number): number => (mirror ? (1 - normX) : normX) * canvasW;
  const py = (normY: number): number => normY * canvasH;
  const visOk = (i: number): boolean => (kp[i]?.[2] ?? 0) >= minVisibility;

  // 连线
  for (const [a, b] of POSE_CONNECTIONS) {
    if (!kp[a] || !kp[b]) continue;
    if (!visOk(a) || !visOk(b)) continue;
    ctx.beginPath();
    ctx.moveTo(px(kp[a][0]), py(kp[a][1]));
    ctx.lineTo(px(kp[b][0]), py(kp[b][1]));
    ctx.stroke();
  }

  // 关键点
  for (const i of DRAWN_KEYPOINTS) {
    if (!kp[i] || !visOk(i)) continue;
    ctx.beginPath();
    ctx.arc(px(kp[i][0]), py(kp[i][1]), pointRadius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
