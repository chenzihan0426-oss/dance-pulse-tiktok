import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FeaturedLessonCard } from "@/components/FeaturedLessonCard";
import { GreetingHeader } from "@/components/GreetingHeader";

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

describe("GreetingHeader", () => {
  it("renders nickname and streak", () => {
    render(
      <GreetingHeader nickname="Nova" subtitle="今天练 20 分钟吧" streakDays={7} />
    );

    expect(screen.getByText("嗨, Nova")).toBeTruthy();
    expect(screen.getByText("今天练 20 分钟吧")).toBeTruthy();
    expect(screen.getByText("7 天")).toBeTruthy();
  });
});

describe("FeaturedLessonCard", () => {
  it("renders an empty state when there is no lesson", () => {
    render(
      <FeaturedLessonCard
        lesson={null}
        loading={false}
        error={null}
      />
    );

    expect(screen.getByText("暂时还没有可继续学习的课程。")).toBeTruthy();
  });

  it("renders lesson details and progress", () => {
    render(
      <FeaturedLessonCard
        lesson={{
          id: "les_1",
          title: "ANTIFRAGILE",
          thumbnail: "/thumbs/demo.jpg",
          duration: 62,
          bpm: 126,
          confirmed: true,
        }}
        progress={{ learned: 5, total: 14 }}
        loading={false}
        error={null}
      />
    );

    expect(screen.getByText("正在学")).toBeTruthy();
    expect(screen.getByText("ANTIFRAGILE")).toBeTruthy();
    expect(screen.getByText("126 BPM")).toBeTruthy();
    expect(screen.getByText("已学 5/14")).toBeTruthy();
    expect(screen.getByText("36%")).toBeTruthy();
  });
});
