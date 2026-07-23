import { describe, expect, it } from "vitest";

import { cosineOfUnitVectors, scoreBonesByCosine } from "@/lib/feedback/bones";
import { cosineToScore100 } from "@/lib/feedback/scoreMap";
import { buildFeedbackReport } from "@/lib/feedback/buildReport";
import type { Kpt } from "@/lib/pose/scoring";
import type { SessionResult } from "@/lib/pose/sessionAccumulator";

function makePose(overrides: Partial<Record<number, [number, number]>> = {}): Kpt[] {
  const kpts: Kpt[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 1 }));
  kpts[11] = { x: 0.4, y: 0.4, z: 0, visibility: 1 };
  kpts[12] = { x: 0.6, y: 0.4, z: 0, visibility: 1 };
  kpts[13] = { x: 0.35, y: 0.55, z: 0, visibility: 1 };
  kpts[14] = { x: 0.65, y: 0.55, z: 0, visibility: 1 };
  kpts[15] = { x: 0.32, y: 0.7, z: 0, visibility: 1 };
  kpts[16] = { x: 0.68, y: 0.7, z: 0, visibility: 1 };
  kpts[23] = { x: 0.45, y: 0.7, z: 0, visibility: 1 };
  kpts[24] = { x: 0.55, y: 0.7, z: 0, visibility: 1 };
  kpts[25] = { x: 0.44, y: 0.85, z: 0, visibility: 1 };
  kpts[26] = { x: 0.56, y: 0.85, z: 0, visibility: 1 };
  kpts[27] = { x: 0.43, y: 0.98, z: 0, visibility: 1 };
  kpts[28] = { x: 0.57, y: 0.98, z: 0, visibility: 1 };
  for (const [idx, coord] of Object.entries(overrides)) {
    if (!coord) continue;
    kpts[Number(idx)] = { x: coord[0], y: coord[1], z: 0, visibility: 1 };
  }
  return kpts;
}

describe("feedback scoreMap", () => {
  it("maps cosine anchors to expected scores", () => {
    expect(cosineToScore100(0.9)).toBe(100);
    expect(cosineToScore100(0.72)).toBe(78);
    expect(cosineToScore100(0.5)).toBe(50);
    expect(cosineToScore100(0.2)).toBe(12);
    expect(cosineToScore100(null)).toBe(0);
  });

  it("interpolates between anchors", () => {
    const mid = cosineToScore100(0.81);
    expect(mid).toBeGreaterThan(78);
    expect(mid).toBeLessThan(100);
  });

  it("softens live scores upward in the low band", async () => {
    const { softenLiveScore01 } = await import("@/lib/feedback/scoreMap");
    expect(softenLiveScore01(0.2)).toBeGreaterThan(0.2);
    expect(softenLiveScore01(1)).toBeCloseTo(1, 1);
  });
});

describe("feedback bones", () => {
  it("identical poses yield near-1 mean cosine", () => {
    const pose = makePose();
    const { meanCosine, boneCosines } = scoreBonesByCosine(pose, pose);
    expect(meanCosine).not.toBeNull();
    expect(meanCosine!).toBeGreaterThan(0.98);
    expect(Object.keys(boneCosines).length).toBeGreaterThan(5);
  });

  it("divergent arm bones lower cosine", () => {
    const teacher = makePose();
    const user = makePose({ 14: [0.95, 0.2], 16: [0.98, 0.05] });
    const same = scoreBonesByCosine(teacher, teacher).meanCosine!;
    const diff = scoreBonesByCosine(user, teacher).meanCosine!;
    expect(diff).toBeLessThan(same);
  });

  it("unit vector cosine is 1 for same direction", () => {
    expect(cosineOfUnitVectors([1, 0, 0], [1, 0, 0])).toBeCloseTo(1);
    expect(cosineOfUnitVectors([1, 0, 0], [-1, 0, 0])).toBeCloseTo(-1);
  });
});

describe("buildFeedbackReport", () => {
  it("builds overall bone score from session segments", () => {
    const session: SessionResult = {
      lessonId: "demo",
      overallScore: 80,
      overallBoneScore: 72,
      poseSource: "test",
      frameCount: 30,
      segments: [
        {
          segmentId: "s1",
          score: 80,
          boneScore: 70,
          boneMeans: { leftUpperArm: 0.9, rightUpperArm: 0.8 },
          jointErrors: { leftElbow: 0.2, rightShoulder: 0.4 },
          beatScores: [70, 75],
          worstJoint: "rightShoulder",
          worstBeat: 0,
          frameCount: 30,
        },
      ],
    };
    const report = buildFeedbackReport(session, {
      lessonTitle: "Demo",
      segmentLabels: { s1: "前奏" },
    });
    expect(report.version).toBe(1);
    expect(report.overallBoneScore).toBe(70);
    expect(report.segments[0].label).toBe("前奏");
    expect(report.worstJoint?.id).toBe("rightShoulder");
    expect(report.worstBone).toBeTruthy();
    expect(report.headline.length).toBeGreaterThan(8);
    expect(report.insights.length).toBeGreaterThan(0);
    expect(report.segmentComments[0].comment).toContain("前奏");
  });
});

describe("buildInsights", () => {
  it("flags high shoulder error with tip", async () => {
    const { buildInsights } = await import("@/lib/feedback/insights");
    const narrative = buildInsights({
      version: 1,
      lessonId: "x",
      createdAt: new Date().toISOString(),
      poseSource: "t",
      frameCount: 10,
      overallBoneScore: 55,
      overallFusedScore: 60,
      segments: [
        {
          segmentId: "s1",
          label: "副歌",
          boneScore: 50,
          fusedScore: 55,
          frameCount: 10,
          bones: [{ id: "rightUpperArm", label: "右上臂", meanCosine: 0.55, score: 28 }],
          joints: [{ id: "rightShoulder", label: "右肩", meanError: 0.62 }],
          worstBoneId: "rightUpperArm",
          worstJointId: "rightShoulder",
        },
      ],
      worstBone: { id: "rightUpperArm", label: "右上臂", meanCosine: 0.55, score: 28 },
      worstJoint: { id: "rightShoulder", label: "右肩", meanError: 0.62 },
    });
    expect(narrative.headline).toMatch(/右肩|右上臂|短板|偏大|攻克/);
    expect(narrative.insights.some((i) => i.title.includes("右肩") || i.title.includes("右上臂"))).toBe(true);
    expect(narrative.insights[0].tip.length).toBeGreaterThan(6);
  });
});

describe("liveHotspot", () => {
  it("maps score tiers", async () => {
    const { scoreToTier, tierLabel } = await import("@/lib/feedback/liveHotspot");
    expect(scoreToTier(90)).toBe("great");
    expect(scoreToTier(75)).toBe("good");
    expect(scoreToTier(55)).toBe("ok");
    expect(scoreToTier(20)).toBe("miss");
    expect(tierLabel("great")).toBe("很棒");
  });

  it("picks worst joint when angle error is large", async () => {
    const { pickLiveHotspot } = await import("@/lib/feedback/liveHotspot");
    const teacher = makePose();
    // 右肘严重弯曲差异：挪动右腕
    const user = makePose({ 16: [0.9, 0.35] });
    const hot = pickLiveHotspot(user, teacher);
    expect(hot).toBeTruthy();
    expect(hot!.label.length).toBeGreaterThan(1);
    expect(hot!.error).toBeGreaterThan(0.28);
    expect(hot!.edges.length).toBeGreaterThan(0);
  });

  it("returns null when poses nearly match", async () => {
    const { pickLiveHotspot } = await import("@/lib/feedback/liveHotspot");
    const pose = makePose();
    expect(pickLiveHotspot(pose, pose)).toBeNull();
  });
});
