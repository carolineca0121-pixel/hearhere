"use client";

import { motion } from "framer-motion";
import type { VibeTheme } from "@/lib/types";
import { VIBE_COLORS } from "@/lib/vibe";

interface MeshBackgroundProps {
  theme?: VibeTheme;
}

export function MeshBackground({ theme = "dusk" }: MeshBackgroundProps) {
  const accent = VIBE_COLORS[theme];

  return (
    <motion.div
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-parchment"
      aria-hidden
    >
      <motion.div
        className="absolute -left-1/4 top-0 h-[60vh] w-[60vw] rounded-full opacity-40 blur-3xl"
        style={{ background: accent }}
        animate={{ x: [0, 40, 0], y: [0, 30, 0] }}
        transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute -right-1/4 bottom-0 h-[50vh] w-[50vw] rounded-full opacity-30 blur-3xl"
        style={{ background: VIBE_COLORS.sea }}
        animate={{ x: [0, -30, 0], y: [0, -20, 0] }}
        transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute left-1/3 top-1/2 h-[40vh] w-[40vw] rounded-full opacity-20 blur-3xl"
        style={{ background: VIBE_COLORS.forest }}
        animate={{ scale: [1, 1.1, 1] }}
        transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
      />
    </motion.div>
  );
}
