import type { ReactNode } from "react";
import { DesktopNavbar } from "@/components/DesktopNavbar";

export default function TabsLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="relative min-h-screen bg-black pt-16 text-white">
      <DesktopNavbar />
      {children}
    </div>
  );
}
