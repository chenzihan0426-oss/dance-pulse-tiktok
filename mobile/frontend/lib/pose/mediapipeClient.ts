// 浏览器端 MediaPipe Pose Landmarker + Image Segmenter 单例封装。
// 优先从本地 /mediapipe/ 加载 WASM + 模型（放入 public/mediapipe/）。
// 本地文件不存在时回退 CDN；加载超过时限会失败并允许重试。

import {
  FilesetResolver,
  ImageSegmenter,
  PoseLandmarker,
} from "@mediapipe/tasks-vision";

import type { Keypoint } from "./types";

const WASM_CDN = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.34/wasm";
const WASM_LOCAL = "/mediapipe/wasm";
const POSE_MODEL_LOCAL = "/mediapipe/pose_landmarker_lite.task";
const POSE_MODEL_CDN =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task";
/** 部分网络访问 Google Storage 极慢，用 jsDelivr 镜像作第二回退 */
const POSE_MODEL_MIRROR =
  "https://cdn.jsdelivr.net/gh/google-ai-edge/mediapipe-samples@main/examples/pose_landmarker/js/pose_landmarker.task";
const SEG_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite";

const INIT_TIMEOUT_MS = 45000;

let filesetPromise: Promise<Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>> | null = null;
let landmarkerPromise: Promise<PoseLandmarker> | null = null;
let segmenterPromise: Promise<ImageSegmenter> | null = null;
let resolvedUseLocal: boolean | null = null;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} 超时（${Math.round(ms / 1000)}s）。请刷新页面重试；若持续失败，检查网络或本机 /mediapipe 资源。`));
    }, ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/** 本地 WASM + 模型是否齐全 */
async function probeLocalAssets(): Promise<boolean> {
  const check = async (url: string): Promise<boolean> => {
    try {
      const head = await fetch(url, { method: "HEAD", cache: "no-cache" });
      if (head.ok) return true;
    } catch {
      /* fall through */
    }
    try {
      const res = await fetch(url, {
        method: "GET",
        headers: { Range: "bytes=0-15" },
        cache: "no-cache",
      });
      return res.ok || res.status === 206;
    } catch {
      return false;
    }
  };
  const [wasmOk, modelOk] = await Promise.all([
    check(`${WASM_LOCAL}/vision_wasm_internal.wasm`),
    check(POSE_MODEL_LOCAL),
  ]);
  return wasmOk && modelOk;
}

async function shouldUseLocal(): Promise<boolean> {
  if (resolvedUseLocal != null) return resolvedUseLocal;
  resolvedUseLocal = await probeLocalAssets();
  return resolvedUseLocal;
}

async function getFileset() {
  if (!filesetPromise) {
    filesetPromise = (async () => {
      const useLocal = await shouldUseLocal();
      console.info("[mediapipe] WASM from", useLocal ? "local" : "cdn");
      return FilesetResolver.forVisionTasks(useLocal ? WASM_LOCAL : WASM_CDN);
    })();
  }
  return filesetPromise;
}

async function createLandmarker(
  fileset: Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>,
  modelAssetPath: string,
  delegate: "GPU" | "CPU",
): Promise<PoseLandmarker> {
  return PoseLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath, delegate },
    runningMode: "VIDEO",
    numPoses: 1,
    minPoseDetectionConfidence: 0.4,
    minPosePresenceConfidence: 0.4,
    minTrackingConfidence: 0.4,
  });
}

export async function getPoseLandmarker(): Promise<PoseLandmarker> {
  if (landmarkerPromise) return landmarkerPromise;

  landmarkerPromise = (async () => {
    const fileset = await withTimeout(getFileset(), INIT_TIMEOUT_MS, "MediaPipe WASM");
    const useLocal = await shouldUseLocal();

    const modelCandidates = useLocal
      ? [POSE_MODEL_LOCAL]
      : [POSE_MODEL_CDN, POSE_MODEL_MIRROR];

    let lastErr: unknown = null;
    for (const modelAssetPath of modelCandidates) {
      for (const delegate of ["GPU", "CPU"] as const) {
        try {
          console.info("[mediapipe] creating PoseLandmarker", { modelAssetPath, delegate });
          return await withTimeout(
            createLandmarker(fileset, modelAssetPath, delegate),
            INIT_TIMEOUT_MS,
            `姿态模型(${delegate})`,
          );
        } catch (err) {
          lastErr = err;
          console.warn("[mediapipe] create failed:", modelAssetPath, delegate, err);
        }
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr ?? "PoseLandmarker 初始化失败"));
  })();

  try {
    return await landmarkerPromise;
  } catch (err) {
    landmarkerPromise = null;
    // 允许下次重试时重新探测本地资源（刚下载完后刷新前也可能走到这里）
    filesetPromise = null;
    resolvedUseLocal = null;
    throw err;
  }
}

export async function getImageSegmenter(): Promise<ImageSegmenter> {
  if (segmenterPromise) return segmenterPromise;
  segmenterPromise = (async () => {
    const fileset = await getFileset();
    return ImageSegmenter.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: SEG_MODEL_URL, delegate: "GPU" },
      runningMode: "VIDEO",
      outputCategoryMask: true,
      outputConfidenceMasks: false,
    });
  })();
  try {
    return await segmenterPromise;
  } catch (err) {
    segmenterPromise = null;
    throw err;
  }
}

export function landmarksToKeypoints(
  landmarks: Array<{ x: number; y: number; visibility?: number }>,
): Keypoint[] {
  return landmarks.map((lm) => [lm.x, lm.y, lm.visibility ?? 1]);
}

/** 测试/排障：清空单例，强制下次重新初始化 */
export function resetPoseLandmarkerForDebug(): void {
  landmarkerPromise = null;
  filesetPromise = null;
  resolvedUseLocal = null;
}
