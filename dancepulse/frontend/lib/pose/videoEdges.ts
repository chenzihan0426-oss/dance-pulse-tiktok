// 老师视频的精细边缘检测。
//
// 流程:
//   1. 把老师视频降采样到 mask 尺寸(256×256)
//   2. 灰度 + Sobel 算子算每像素梯度 → 所有可见的内部边缘(头发、衣纹、口袋、鞋边)
//   3. 用人像分割 mask 限定:只保留 person 范围内的边,背景全部丢掉
//   4. 再补上 mask 自身的外边界(body silhouette 的外轮廓)
//   5. 加一层时间驱动的 shimmer(正弦)让线条流动
//   6. 额外采样 N 个边缘点 → 返回粒子位置列表,调用方画闪亮小点
//
// 最终输出:
//   - edgeImage: 256×256 ImageData,白色像素 alpha 表达边强度 + shimmer
//   - sparklePoints: 随机抽取的若干边缘点(相对 0-1 坐标),调用方画 particle

let _videoOffscreen: HTMLCanvasElement | null = null;
function getVideoOffscreen(w: number, h: number): HTMLCanvasElement {
  if (!_videoOffscreen) _videoOffscreen = document.createElement("canvas");
  if (_videoOffscreen.width !== w || _videoOffscreen.height !== h) {
    _videoOffscreen.width = w;
    _videoOffscreen.height = h;
  }
  return _videoOffscreen;
}

export interface EdgeDetectResult {
  image: ImageData;           // w*h RGBA,白色 + 按边强度的 alpha
  sparklePoints: number[];    // 扁平 [x0,y0, x1,y1, ...],0-1 归一化坐标
}

export interface EdgeDetectOptions {
  // Sobel 梯度阈值(越高 → 边缘越少,抗噪;低 → 线条更多更细节)
  sobelThreshold?: number;
  // 基础 alpha 放大倍率(1 时直接用 Sobel 梯度作 alpha)
  strength?: number;
  // shimmer 相位(一般传 performance.now()/1000)
  shimmerPhase?: number;
  // 粒子数量(每帧随机采样的边缘点数)
  numSparkles?: number;
}

export function detectPersonEdges(
  video: HTMLVideoElement,
  maskBytes: Uint8Array | null,
  w: number,
  h: number,
  opts: EdgeDetectOptions = {},
): EdgeDetectResult {
  const {
    sobelThreshold = 22,
    strength = 2.4,
    shimmerPhase = 0,
    numSparkles = 40,
  } = opts;

  const off = getVideoOffscreen(w, h);
  const offCtx = off.getContext("2d", { willReadFrequently: true });
  if (!offCtx) {
    return { image: new ImageData(w, h), sparklePoints: [] };
  }

  // 1) 降采样视频到 w×h
  offCtx.drawImage(video, 0, 0, w, h);
  const videoData = offCtx.getImageData(0, 0, w, h).data;

  // 2) 灰度
  const gray = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    gray[i] = 0.299 * videoData[o] + 0.587 * videoData[o + 1] + 0.114 * videoData[o + 2];
  }

  // 3) Sobel + shimmer,只在 person 区域
  const out = new ImageData(w, h);
  const outData = out.data;

  // 收集边缘像素位置供采样粒子
  // Reservoir sampling 简化版:随机累积到一个定长数组
  const edgeBuffer = new Float32Array(numSparkles * 2);
  let edgeCount = 0;

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;

      // Person-only: Selfie Segmenter 约定 0 = person
      if (maskBytes && maskBytes[i] !== 0) continue;

      const i00 = (y - 1) * w + x - 1;
      const i01 = (y - 1) * w + x;
      const i02 = (y - 1) * w + x + 1;
      const i10 = y * w + x - 1;
      const i12 = y * w + x + 1;
      const i20 = (y + 1) * w + x - 1;
      const i21 = (y + 1) * w + x;
      const i22 = (y + 1) * w + x + 1;

      // Sobel kernels (gx: 横向梯度, gy: 纵向梯度)
      const gx =
        -gray[i00] + gray[i02] - 2 * gray[i10] + 2 * gray[i12] - gray[i20] + gray[i22];
      const gy =
        -gray[i00] - 2 * gray[i01] - gray[i02] + gray[i20] + 2 * gray[i21] + gray[i22];

      const mag = Math.sqrt(gx * gx + gy * gy);
      if (mag < sobelThreshold) continue;

      // shimmer:把 (x,y,time) 喂两个正交正弦 → 沿体表流动的亮度调制
      const s =
        0.65 +
        0.35 *
          Math.sin((x + y) * 0.18 + shimmerPhase * 4) *
          Math.cos((x - y) * 0.12 - shimmerPhase * 3);

      const rawA = (mag - sobelThreshold) * strength * s;
      const alpha = rawA > 255 ? 255 : rawA < 0 ? 0 : rawA;
      if (alpha < 18) continue; // 过暗的直接丢掉,保持线条锐利

      const o = i * 4;
      outData[o] = 255;
      outData[o + 1] = 255;
      outData[o + 2] = 255;
      outData[o + 3] = alpha;

      // Reservoir sampling 选粒子点
      if (edgeCount < numSparkles) {
        edgeBuffer[edgeCount * 2] = x / w;
        edgeBuffer[edgeCount * 2 + 1] = y / h;
        edgeCount++;
      } else if (Math.random() * (edgeCount + 1) < numSparkles) {
        const idx = Math.floor(Math.random() * numSparkles);
        edgeBuffer[idx * 2] = x / w;
        edgeBuffer[idx * 2 + 1] = y / h;
        edgeCount++;
      }
    }
  }

  // 4) Mask 自身边界:绝对保留,且亮度拉满 —— 人形外轮廓线
  if (maskBytes) {
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        if (maskBytes[i] !== 0) continue;
        const boundary =
          maskBytes[i - 1] !== 0 ||
          maskBytes[i + 1] !== 0 ||
          maskBytes[i - w] !== 0 ||
          maskBytes[i + w] !== 0;
        if (boundary) {
          const o = i * 4;
          outData[o] = 255;
          outData[o + 1] = 255;
          outData[o + 2] = 255;
          outData[o + 3] = 255;
        }
      }
    }
  }

  const sparklePoints = Array.from(
    edgeBuffer.subarray(0, Math.min(edgeCount, numSparkles) * 2),
  );

  return { image: out, sparklePoints };
}
