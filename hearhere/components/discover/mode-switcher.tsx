"use client";

import { useRouter } from "next/navigation";
import { List, Map, Sparkles } from "lucide-react";
import { useSessionStore } from "@/stores/session";
import { motion } from "framer-motion";

const MODES = [
  { id: "feed" as const, label: "信息流", icon: List },
  { id: "map" as const, label: "地图", icon: Map },
  { id: "interests" as const, label: "兴趣", icon: Sparkles },
];

export function ModeSwitcher() {
  const router = useRouter();
  const { currentDiscoverMode, setCurrentDiscoverMode } = useSessionStore();

  const handleModeChange = (mode: "feed" | "map" | "interests") => {
    setCurrentDiscoverMode(mode);
    router.push(`/discover/${mode}`);
  };

  return (
    <div className="flex gap-2 p-1 bg-white/50 rounded-2xl">
      {MODES.map((mode) => {
        const Icon = mode.icon;
        const isActive = currentDiscoverMode === mode.id;

        return (
          <button
            key={mode.id}
            onClick={() => handleModeChange(mode.id)}
            className="relative flex-1 py-3 px-4 rounded-xl text-sm font-medium transition-all"
          >
            {isActive && (
              <motion.div
                layoutId="active-mode"
                className="absolute inset-0 bg-gradient-to-r from-blue-500 to-purple-500 rounded-xl shadow-lg"
                transition={{ type: "spring", stiffness: 500, damping: 30 }}
              />
            )}
            <div className="relative flex items-center justify-center gap-2">
              <Icon className={`w-4 h-4 ${isActive ? "text-white" : "text-gray-600"}`} />
              <span className={`${isActive ? "text-white" : "text-gray-600"}`}>
                {mode.label}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
