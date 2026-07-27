"use client";

import { cn } from "@/lib/utils";
import { CATEGORY_LABELS, CATEGORY_COLORS } from "@/lib/content";
import type { ContentCard } from "@/lib/types";
import { Clock, MapPin, Plus, Check } from "lucide-react";
import { motion } from "framer-motion";

interface FeedCardProps {
  card: ContentCard;
  onAdd: (card: ContentCard) => void;
  onRemove?: (id: string) => void;
}

export function FeedCard({ card, onAdd, onRemove }: FeedCardProps) {
  const isSelected = card.status === "selected" || card.status === "scheduled";
  const isScheduled = card.status === "scheduled";
  const categoryColor = CATEGORY_COLORS[card.category];
  const categoryLabel = CATEGORY_LABELS[card.category];

  const handleClick = () => {
    if (isSelected && onRemove) {
      onRemove(card.id);
    } else {
      onAdd(card);
    }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "relative rounded-3xl overflow-hidden transition-all duration-300 bg-white shadow-md hover:shadow-xl",
        isSelected ? "shadow-lg" : ""
      )}
      style={
        isSelected
          ? { boxShadow: `0 0 0 3px ${categoryColor}60, 0 10px 25px -5px rgba(0, 0, 0, 0.1)` }
          : undefined
      }
    >
      {/* 头部区域 */}
      <div
        className="p-6 relative"
        style={{
          background: `linear-gradient(135deg, ${categoryColor}15 0%, ${categoryColor}05 100%)`,
        }}
      >
        <div className="flex items-start justify-between">
          <div>
            <span
              className="inline-block px-3 py-1 rounded-full text-xs font-medium text-white mb-2"
              style={{ backgroundColor: categoryColor }}
            >
              {categoryLabel}
            </span>
            <h3 className="text-lg font-semibold text-gray-900">{card.title}</h3>
          </div>

          {/* 已选标记 */}
          {isSelected && (
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center"
              style={{ backgroundColor: categoryColor }}
            >
              <Check className="w-5 h-5 text-white" />
            </div>
          )}
        </div>
      </div>

      {/* 内容区域 */}
      <div className="p-6">
        <p className="text-gray-600 text-sm mb-4">{card.description}</p>

        {/* 标签 */}
        {card.tags && card.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-4">
            {card.tags.map((tag, idx) => (
              <span
                key={idx}
                className="px-2.5 py-1 bg-gray-100 text-gray-600 text-xs rounded-full"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* 推荐理由 */}
        <div className="bg-blue-50 rounded-xl p-3.5 mb-4">
          <p className="text-blue-800 text-sm">
            <span className="font-medium">推荐理由：</span>
            {card.reason}
          </p>
        </div>

        {/* 底部信息 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 text-sm text-gray-500">
            {card.bestTime && (
              <div className="flex items-center gap-1">
                <Clock className="w-4 h-4" />
                <span>{card.bestTime}</span>
              </div>
            )}
            {card.distanceFromCenter && (
              <div className="flex items-center gap-1">
                <MapPin className="w-4 h-4" />
                <span>{card.distanceFromCenter}</span>
              </div>
            )}
          </div>

          <button
            onClick={handleClick}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all",
              isSelected
                ? "bg-gray-200 text-gray-700 hover:bg-gray-300"
                : "text-white hover:shadow-lg"
            )}
            style={
              isSelected
                ? undefined
                : { background: `linear-gradient(to right, ${categoryColor}, ${categoryColor}dd)` }
            }
          >
            {isScheduled ? (
              <>
                <Check className="w-4 h-4" />
                <span>已加入行程</span>
              </>
            ) : isSelected ? (
              <>
                <span>取消选择</span>
              </>
            ) : (
              <>
                <Plus className="w-4 h-4" />
                <span>加入行程</span>
              </>
            )}
          </button>
        </div>
      </div>
    </motion.div>
  );
}
