import type { ReactNode } from "react";
import { BottomTabBar } from "@/components/BottomTabBar";

export default function TabsLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="relative min-h-screen pb-[104px] md:pb-8">
      <BottomTabBar />
      <div className="md:pt-[76px]">{children}</div>
    </div>
  );
}
