// 浏览器端 MediaPipe Pose Landmarker + Image Segmenter 单例封装。
// 模型走 Google CDN,不需要打进 bundle。首次加载会下 wasm + model,之后浏览器缓存。

import {
  FilesetResolver,
  ImageSegmenter,
  PoseLandmarker,
} from "@mediapipe/tasks-vision";

import type { Keypoint } from "./types";

const WASM_BASE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.34/wasm";
const POSE_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task";
// Selfie segmenter general: 256x256,类别 mask,人像 = 1,背景 = 0。
// 也可以换成 selfie_multiclass_256x256.tflite 拿到头发 / 皮肤 等多类别,体积稍大。
const SEG_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite";

let filesetPromise: ReturnType<typeof FilesetResolver.forVisionTasks> | null = null;
let landmarkerPromise: Promise<PoseLandmarker> | null = null;
let segmenterPromise: Promise<ImageSegmenter> | null = null;

function getFileset() {
  if (!filesetPromise) filesetPromise = FilesetResolver.forVisionTasks(WASM_BASE);
  return filesetPromise;
}

export async function getPoseLandmarker(): Promise<PoseLandmarker> {
  if (landmarkerPromise) return landmarkerPromise;
  landmarkerPromise = (async () => {
    const fileset = await getFileset();
    return PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: POSE_MODEL_URL, delegate: "GPU" },
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
