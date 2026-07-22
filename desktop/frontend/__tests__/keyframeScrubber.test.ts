import { describe, expect, it } from "vitest";

import { extractKeyframeNodes } from "@/components/player/KeyframeScrubber";
import type { TeachingStep } from "@/lib/types";

describe("extractKeyframeNodes", () => {
  it("优先使用 beat_cues 的非空项", () => {
    const cues = ["起手", null, "推胯", null, "下沉", null, "定点", null];
    const nodes = extractKeyframeNodes(cues, [], 8, 4.0);
    expect(nodes).toHaveLength(4);
    expect(nodes.map((n) => n.name)).toEqual(["起手", "推胯", "下沉", "定点"]);
    // 第1拍在 0,第3拍在 2/8
    expect(nodes[0].ratio).toBeCloseTo(0);
    expect(nodes[1].ratio).toBeCloseTo(2 / 8);
    // t = ratio * duration
    expect(nodes[1].t).toBeCloseTo((2 / 8) * 4.0);
  });

  it("beat_cues 全空时回退到 teaching.steps 的起始拍", () => {
    const steps: TeachingStep[] = [
      { beats: "1-2", content: "身体微下沉，重心转到左脚" },
      { beats: "3-4", content: "右手从腰部上举至头顶划圆" },
      { beats: "5-6", content: "左手下沉配合点胯" },
      { beats: "7-8", content: "回到起始位准备下一 count" },
    ];
    const nodes = extractKeyframeNodes([null, null, null, null, null, null, null, null], steps, 8, 4.0);
    expect(nodes).toHaveLength(4);
    // 起始拍 1/3/5/7 -> ratio (b-1)/8
    expect(nodes.map((n) => n.beat)).toEqual([1, 3, 5, 7]);
    expect(nodes[1].ratio).toBeCloseTo(2 / 8);
    expect(nodes[0].name).toContain("身体微下沉");
  });

  it("两个数据源都空时返回空数组", () => {
    expect(extractKeyframeNodes([], [], 8, 4.0)).toEqual([]);
    expect(extractKeyframeNodes([null, null], [], 8, 4.0)).toEqual([]);
  });

  it("steps 起始拍相同不重复,且按位置排序", () => {
    const steps: TeachingStep[] = [
      { beats: "5-6", content: "后动作" },
      { beats: "1-2", content: "先动作" },
      { beats: "1", content: "重复起始拍应被忽略" },
    ];
    const nodes = extractKeyframeNodes([], steps, 8, 4.0);
    expect(nodes.map((n) => n.beat)).toEqual([1, 5]);
    expect(nodes[0].name).toBe("先动作");
  });
});
