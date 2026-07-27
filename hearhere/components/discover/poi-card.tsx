"use client";

import { cn } from "@/lib/utils";
import { MapPin, Plus, Check, UtensilsCrossed, Sparkles } from "lucide-react";
import { motion } from "framer-motion";
import { emojiForPoi, CATEGORY_GRADIENTS } from "@/lib/poi-emoji";

export interface PoiCardData {
  id: string;
  name: string;
  description?: string;      // 推荐理由 / 详细介绍
  address?: string;
  category: "attraction" | "food" | "souvenir" | "hotel";
  recommendedDish?: string;  // 美食推荐菜
  giftPitch?: string;        // 伴手礼推荐话语
  selected?: boolean;
}

const LABELS: Record<string, string> = {
  attraction: "景点",
  food: "美食",
  souvenir: "伴手礼",
  hotel: "酒店",
};

const LABEL_COLORS: Record<string, string> = {
  attraction: "bg-sky-100 text-sky-700",
  food: "bg-orange-100 text-orange-700",
  souvenir: "bg-amber-100 text-amber-700",
  hotel: "bg-violet-100 text-violet-700",
};

const ACCENT: Record<string, string> = {
  attraction: "#3B82F6",
  food: "#F97316",
  souvenir: "#F59E0B",
  hotel: "#8B5CF6",
};

interface PoiCardProps {
  card: PoiCardData;
  onToggle: () => void;
}

export function PoiCard({ card, onToggle }: PoiCardProps) {
  const emoji = emojiForPoi(card.name, card.category);
  const gradient = CATEGORY_GRADIENTS[card.category];
  const accent = ACCENT[card.category];

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className={cn(
        "relative rounded-2xl transition-all overflow-hidden",
        "bg-white/85 backdrop-blur-sm border",
        card.selected
          ? "border-transparent shadow-lg"
          : "border-white/60 shadow-sm hover:shadow-md"
      )}
      style={
        card.selected
          ? { boxShadow: `0 0 0 2px ${accent}50, 0 6px 24px rgba(0,0,0,0.08)` }
          : undefined
      }
    >
      <div className="flex items-stretch gap-0">
        {/* 左侧大 emoji 区 */}
        <div
          className={cn(
            "w-[72px] shrink-0 flex flex-col items-center justify-center gap-1 py-3 bg-gradient-to-br",
            gradient
          )}
        >
          <span className="text-[28px] leading-none drop-shadow-sm">{emoji}</span>
          <span
            className={cn(
              "text-[10px] px-1.5 py-0.5 rounded-full font-medium",
              LABEL_COLORS[card.category]
            )}
          >
            {LABELS[card.category]}
          </span>
        </div>

        {/* 内容区 */}
        <div className="flex-1 min-w-0 p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <h4 className="text-sm font-semibold text-charcoal truncate">
              {card.name}
            </h4>
            {card.selected && (
              <Check className="w-3.5 h-3.5 text-green-500 shrink-0" />
            )}
          </div>

          {/* 详细介绍 / 推荐理由 — 始终展示 */}
          {card.description && (
            <p className="text-xs leading-relaxed text-charcoal/75 mb-1.5">
              {card.description}
            </p>
          )}

          {/* 美食：推荐菜 */}
          {card.category === "food" && card.recommendedDish && (
            <div className="flex items-start gap-1 mb-1.5">
              <UtensilsCrossed className="w-3 h-3 mt-0.5 text-orange-500 shrink-0" />
              <p className="text-xs text-orange-700/90 leading-relaxed">
                推荐：{card.recommendedDish}
              </p>
            </div>
          )}

          {/* 伴手礼：推荐话语 */}
          {card.category === "souvenir" && card.giftPitch && (
            <div className="flex items-start gap-1 mb-1.5">
              <Sparkles className="w-3 h-3 mt-0.5 text-amber-500 shrink-0" />
              <p className="text-xs text-amber-700/90 leading-relaxed">
                {card.giftPitch}
              </p>
            </div>
          )}

          {/* 地址 */}
          {card.address && (
            <div className="flex items-center gap-0.5 text-[11px] text-muted/60">
              <MapPin className="w-2.5 h-2.5 shrink-0" />
              <span className="truncate">{card.address}</span>
            </div>
          )}
        </div>

        {/* 选择按钮 */}
        <div className="flex items-center pr-3">
          <button
            onClick={onToggle}
            aria-label={card.selected ? "取消选择" : "选择"}
            className={cn(
              "w-9 h-9 rounded-full flex items-center justify-center transition-all shrink-0",
              card.selected
                ? "text-white shadow-md"
                : "bg-gray-100 text-gray-400 hover:bg-gray-200 hover:text-gray-500"
            )}
            style={card.selected ? { backgroundColor: accent } : undefined}
          >
            {card.selected ? (
              <Check className="w-4 h-4" />
            ) : (
              <Plus className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>
    </motion.div>
  );
}
