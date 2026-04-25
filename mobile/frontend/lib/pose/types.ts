// 单帧 33 关键点: [x_norm, y_norm, visibility],x/y 归一化到 [0,1]
export type Keypoint = [number, number, number];

// pipeline/pose_export.py 落盘的 JSON 结构
export interface PoseFrame {
  t: number;             // clip 内相对时间(秒),从 0 开始
  kp: Keypoint[] | null; // 33 个 keypoint,或 null(该帧未检出)
}

export interface PoseDoc {
  seg_id: string;
  lesson_id: string;
  fps: number;
  start: number;  // 在整支 lesson 内的起点(秒)
  end: number;
  frames: PoseFrame[];
}

export async function loadPoseDoc(url: string): Promise<PoseDoc> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`pose 加载失败 HTTP ${res.status}`);
  return (await res.json()) as PoseDoc;
}

// 给定 clip 内秒数,返回最近的帧(做"吸附最近"而非插值)
export function sampleFrame(doc: PoseDoc, tSec: number): PoseFrame | null {
  if (!doc.frames.length) return null;
  // frames 已按时间升序,二分
  let lo = 0, hi = doc.frames.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (doc.frames[mid].t < tSec) lo = mid + 1;
    else hi = mid;
  }
  const cand = doc.frames[lo];
  const prev = lo > 0 ? doc.frames[lo - 1] : null;
  if (!prev) return cand;
  return Math.abs(prev.t - tSec) < Math.abs(cand.t - tSec) ? prev : cand;
}
