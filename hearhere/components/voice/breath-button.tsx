"use client";

import { motion } from "framer-motion";
import { Mic, Square } from "lucide-react";
import { cn } from "@/lib/utils";

interface BreathButtonProps {
  isRecording: boolean;
  disabled?: boolean;
  onStart: () => void;
  onStop: () => void;
}

export function BreathButton({
  isRecording,
  disabled,
  onStart,
  onStop,
}: BreathButtonProps) {
  return (
    <motion.div className="relative flex items-center justify-center">
      {[1, 2, 3].map((ring) => (
        <motion.span
          key={ring}
          className="absolute rounded-full border border-vibe-sea/30"
          style={{
            width: 120 + ring * 36,
            height: 120 + ring * 36,
          }}
          animate={{
            scale: isRecording ? [1, 1.08, 1] : [1, 1.04, 1],
            opacity: isRecording ? [0.5, 0.2, 0.5] : [0.35, 0.15, 0.35],
          }}
          transition={{
            duration: 2 + ring * 0.3,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      ))}
      <motion.button
        type="button"
        disabled={disabled}
        onClick={isRecording ? onStop : onStart}
        className={cn(
          "relative z-10 flex h-28 w-28 items-center justify-center rounded-full",
          "bg-charcoal text-parchment shadow-glass transition-transform",
          "hover:scale-105 active:scale-95 disabled:opacity-50"
        )}
        whileTap={{ scale: 0.95 }}
        aria-label={isRecording ? "停止录音" : "开始录音"}
      >
        {isRecording ? (
          <Square className="h-8 w-8" />
        ) : (
          <Mic className="h-10 w-10" />
        )}
      </motion.button>
    </motion.div>
  );
}
