// 浏览器端 MediaPipe Pose Landmarker + Image Segmenter 单例封装。
// 优先从本地 /mediapipe/ 加载 WASM + 模型（运行 scripts/download-mediapipe.sh 下载一次）。
// 本地文件不存在时自动回退到 jsDelivr CDN。

import {
  FilesetResolver,
  ImageSegmenter,
  PoseLandmarker,
} from "@mediapipe/tasks-vision";

import type { Keypoint } from "./types";

// 检测本地资源是否已下载
async function localWasmExists(): Promise<boolean> {
  try {
    const res = await fetch("/mediapipe/wasm/vision_wasm_internal.wasm", { method: "HEAD" });
    return res.ok;
  } catch {
    return false;
  }
}

const WASM_CDN = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.34/wasm";
const WASM_LOCAL = "/mediapipe/wasm";
const POSE_MODEL_LOCAL = "/mediapipe/pose_landmarker_lite.task";
const POSE_MODEL_CDN =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task";
const SEG_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite";

let filesetPromise: ReturnType<typeof FilesetResolver.forVisionTasks> | null = null;
let landmarkerPromise: Promise<PoseLandmarker> | null = null;
let segmenterPromise: Promise<ImageSegmenter> | null = null;

async function getFileset() {
  if (!filesetPromise) {
    const useLocal = await localWasmExists();
    filesetPromise = FilesetResolver.forVisionTasks(useLocal ? WASM_LOCAL : WASM_CDN);
  }
  return filesetPromise;
}

export async function getPoseLandmarker(): Promise<PoseLandmarker> {
  if (landmarkerPromise) return landmarkerPromise;
  landmarkerPromise = (async () => {
    const fileset = await getFileset();
    const useLocal = await localWasmExists();
    return PoseLandmarker.createFromOptions(fileset, {
      baseOptions: {
        modelAssetPath: useLocal ? POSE_MODEL_LOCAL : POSE_MODEL_CDN,
        delegate: "GPU",
      },
      runningMode: "VIDEO",
      numPoses: 1,
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
  })();
  try {
    return await landmarkerPromise;
  } catch (err) {
    landmarkerPromise = null;
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
