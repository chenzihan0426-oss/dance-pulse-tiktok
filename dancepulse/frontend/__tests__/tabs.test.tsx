import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BottomTabBar } from "@/components/BottomTabBar";

const mockUsePathname = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => mockUsePathname(),
}));

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

describe("BottomTabBar", () => {
  it("marks the active tab based on pathname", () => {
    mockUsePathname.mockReturnValue("/me");

    render(<BottomTabBar />);

    expect(screen.getByRole("link", { name: /我的/i }).getAttribute("aria-current")).toBe(
      "page"
    );
    expect(screen.getByRole("link", { name: /首页/i }).getAttribute("aria-current")).toBeNull();
  });
});
