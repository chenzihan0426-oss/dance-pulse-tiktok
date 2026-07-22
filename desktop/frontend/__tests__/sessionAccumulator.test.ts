import { describe, expect, it } from "vitest";

import type { Kpt, TeacherFrame } from "@/lib/pose/scoring";
import { SessionAccumulator, type SegmentMeta } from "@/lib/pose/sessionAccumulator";

// 构造 33 关键点,给出 hip/shoulder 让 normalize() 通过,其余点可控。
function makePose(overrides: Partial<Record<number, [number, number]>> = {}): Kpt[] {
  const kpts: Kpt[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 1 }));
  // 双肩 / 双胯,保证 shoulderWidth > 0
  kpts[11] = { x: 0.4, y: 0.4, z: 0, visibility: 1 }; // left shoulder
  kpts[12] = { x: 0.6, y: 0.4, z: 0, visibility: 1 }; // right shoulder
  kpts[23] = { x: 0.45, y: 0.7, z: 0, visibility: 1 }; // left hip
  kpts[24] = { x: 0.55, y: 0.7, z: 0, visibility: 1 }; // right hip
  for (const [idx, coord] of Object.entries(overrides)) {
    if (!coord) continue;
    kpts[Number(idx)] = { x: coord[0], y: coord[1], z: 0, visibility: 1 };
  }
  return kpts;
}

function teacherFrames(start: number, count: number, pose: Kpt[]): TeacherFrame[] {
  return Array.from({ length: count }, (_, i) => ({
    t: start + i * 0.1,
    keypoints: pose,
  }));
}

describe("SessionAccumulator", () => {
  const teacherPose = makePose();
  const seg: SegmentMeta = {
    id: "s1",
    start: 0,
    end: 2,
    beatCount: 4,
    frames: teacherFrames(0, 20, teacherPose),
  };

  it("完美匹配时该 segment 分数接近满分", () => {
    const acc = new SessionAccumulator({ lessonId: "L1", poseSource: "test", segments: [seg] });
    // 用户与老师同一姿态 -> 高分
    for (let i = 0; i < 20; i++) {
      acc.pushFrame(i * 0.1, teacherPose);
    }
    const result = acc.build();
    expect(result.segments).toHaveLength(1);
    expect(result.segments[0].score).toBeGreaterThan(90);
    expect(result.overallScore).toBeGreaterThan(90);
    expect(result.frameCount).toBe(20);
  });

  it("差异姿态得分更低,并记录逐关节误差与最差关节", () => {
    const acc = new SessionAccumulator({ lessonId: "L1", poseSource: "test", segments: [seg] });
    // 把右肘(14)/右腕(16)挪开,制造右肘角度误差
    const wrongPose = makePose({ 14: [0.9, 0.1], 16: [0.95, 0.05] });
    for (let i = 0; i < 20; i++) {
      acc.pushFrame(i * 0.1, wrongPose);
    }
    const result = acc.build();
    const s = result.segments[0];
    expect(s.score).toBeLessThan(100);
    // 应记录到关节误差
    expect(Object.keys(s.jointErrors).length).toBeGreaterThan(0);
    // 最差关节应存在
    expect(s.worstJoint).toBeTruthy();
    // 逐拍分数组长度 == beatCount
    expect(s.beatScores).toHaveLength(4);
  });

  it("落在 segment 区间外的帧不计入", () => {
    const acc = new SessionAccumulator({ lessonId: "L1", poseSource: "test", segments: [seg] });
    acc.pushFrame(5.0, teacherPose); // 超出 [0,2)
    const result = acc.build();
    expect(result.frameCount).toBe(0);
    expect(result.segments).toHaveLength(0);
  });
});
