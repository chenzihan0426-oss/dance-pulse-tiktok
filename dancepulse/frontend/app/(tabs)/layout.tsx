import type { ReactNode } from "react";
import { BottomTabBar } from "@/components/BottomTabBar";

export default function TabsLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="relative min-h-screen pb-[104px]">
      {children}
      <BottomTabBar />
    </div>
  );
}
