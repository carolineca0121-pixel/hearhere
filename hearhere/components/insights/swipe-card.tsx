"use client";

import { motion, useMotionValue, useTransform, PanInfo } from "framer-motion";
import type { InsightCard } from "@/lib/types";
import { Clock, Footprints, Heart, Sparkles, Sun } from "lucide-react";

interface SwipeCardProps {
  card: InsightCard;
  onSwipeLeft: () => void;
  onSwipeRight: () => void;
  isTop?: boolean;
}

function cardAccent(card: InsightCard): string {
  switch (card.category) {
    case "food":
      return "#E9A94A";
    case "street":
      return "#B4CBB7";
    case "experience":
      return "#D4A5A5";
    case "attraction":
    default:
      return "#7EA7C9";
  }
}

function categoryLabel(c?: string): string {
  switch (c) {
    case "food":
      return "美食灵感";
    case "street":
      return "街区";
    case "experience":
      return "体验";
    case "attraction":
    default:
      return "真实景点";
  }
}

export function SwipeCard({
  card,
  onSwipeLeft,
  onSwipeRight,
  isTop = true,
}: SwipeCardProps) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 200], [-12, 12]);
  const opacityLeft = useTransform(x, [-120, 0], [1, 0]);
  const opacityRight = useTransform(x, [0, 120], [0, 1]);
  const accent = cardAccent(card);

  const handleDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.x > 100) onSwipeRight();
    else if (info.offset.x < -100) onSwipeLeft();
  };

  if (!isTop) {
    return (
      <div className="absolute inset-0 scale-95 overflow-hidden rounded-[2rem] border border-white/50 bg-white/55 p-6 opacity-60 shadow-xl backdrop-blur-md">
        <div
          className="absolute inset-x-0 top-0 h-28"
          style={{ background: `linear-gradient(135deg, ${accent}44, transparent)` }}
        />
        <div className="relative flex h-full items-center justify-center text-center text-muted">
          {card.title}
        </div>
      </div>
    );
  }

  return (
    <motion.div
      className="absolute inset-0 cursor-grab active:cursor-grabbing"
      style={{ x, rotate }}
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      onDragEnd={handleDragEnd}
    >
      <div className="relative flex h-full flex-col overflow-hidden rounded-[2rem] border border-white/60 bg-white/70 shadow-2xl backdrop-blur-xl">
        <div
          className="absolute inset-x-0 top-0 h-36"
          style={{
            background: `radial-gradient(circle at 20% 20%, ${accent}66, transparent 46%), linear-gradient(135deg, ${accent}33, transparent)`,
          }}
        />

        <motion.span
          className="absolute left-5 top-5 z-20 rounded-full bg-red-400/85 px-3 py-1 text-xs text-white shadow"
          style={{ opacity: opacityLeft }}
        >
          跳过
        </motion.span>
        <motion.span
          className="absolute right-5 top-5 z-20 rounded-full bg-emerald-400/85 px-3 py-1 text-xs text-white shadow"
          style={{ opacity: opacityRight }}
        >
          加入
        </motion.span>

        <div className="relative z-10 flex flex-wrap gap-2 px-6 pt-6">
          <span
            className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-medium text-white shadow-sm"
            style={{ backgroundColor: accent }}
          >
            <Sparkles className="h-3 w-3" />
            {categoryLabel(card.category)}
          </span>
          {card.fitTags?.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-white/50 bg-white/55 px-2.5 py-1 text-[10px] text-charcoal/70 backdrop-blur"
            >
              {tag}
            </span>
          ))}
        </div>

        <div className="relative z-10 flex flex-1 flex-col justify-center gap-5 px-7 py-6">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.2em] text-charcoal/35">
              {card.category === "food" ? "Local Taste" : "Experience"}
            </p>
            <h3 className="text-2xl font-semibold tracking-wide text-charcoal">
              {card.title}
            </h3>
          </div>

          {card.review && (
            <p className="rounded-2xl bg-white/55 px-4 py-3 font-serif text-sm italic leading-relaxed text-charcoal/80">
              「{card.review}」
            </p>
          )}

          {card.reason && (
            <p className="text-sm leading-relaxed text-muted">{card.reason}</p>
          )}
        </div>

        <div className="relative z-10 flex flex-wrap gap-3 border-t border-white/40 bg-white/35 px-6 py-4 backdrop-blur">
          {card.intensity && (
            <span className="inline-flex items-center gap-1 text-[11px] text-charcoal/60">
              <Footprints className="h-3 w-3" />
              {card.intensity}
            </span>
          )}
          {card.bestTime && (
            <span className="inline-flex items-center gap-1 text-[11px] text-charcoal/60">
              <Sun className="h-3 w-3" />
              {card.bestTime}
            </span>
          )}
          {card.estimatedDuration && (
            <span className="inline-flex items-center gap-1 text-[11px] text-charcoal/60">
              <Clock className="h-3 w-3" />
              {card.estimatedDuration}
            </span>
          )}
          <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-charcoal/50">
            <Heart className="h-3 w-3" />
            右滑加入
          </span>
        </div>
      </div>
    </motion.div>
  );
}
