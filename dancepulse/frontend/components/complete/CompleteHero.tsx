"use client";

import { Sparkles } from "lucide-react";
import { motion } from "framer-motion";

export function CompleteHero() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.36, ease: "easeOut" }}
      className="text-center"
    >
      <div className="inline-flex items-center gap-2 rounded-full border border-[rgba(168,85,247,0.3)] bg-[rgba(168,85,247,0.14)] px-[14px] py-[6px] text-[12px] font-medium text-[#d8b4fe]">
        <Sparkles className="h-3.5 w-3.5" />
        恭喜完成本课
      </div>

      <h1 className="mt-[18px] text-[30px] font-semibold leading-[1.2] text-white">
        <span className="block">这支舞</span>
        <span className="block">你拿下了</span>
      </h1>
    </motion.div>
  );
}
