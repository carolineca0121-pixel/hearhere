"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { CATEGORY_COLORS, CATEGORY_LABELS } from "@/lib/content";
import type { ScheduleSlot, ContentCard } from "@/lib/types";
import { Plus, X, Clock } from "lucide-react";
import { motion } from "framer-motion";
import { SLOT_INFO } from "@/lib/schedule";

interface TimelineSlotProps {
  slot: ScheduleSlot;
  onDrop: (slotId: string, card: ContentCard) => void;
  onRemove: (slotId: string) => void;
}

export function TimelineSlot({ slot, onDrop, onRemove }: TimelineSlotProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const slotInfo = SLOT_INFO[slot.slot];

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    const cardData = e.dataTransfer.getData("cardData");
    if (cardData) {
      const card = JSON.parse(cardData) as ContentCard;
      onDrop(slot.id, card);
    }
  };

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    onRemove(slot.id);
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={cn(
        "relative min-h-[100px] rounded-2xl border-2 border-dashed transition-all p-4",
        isDragOver
          ? "border-blue-500 bg-blue-50/50"
          : slot.card
          ? "border-transparent bg-white shadow-md"
          : "border-gray-200 bg-white/50 hover:border-gray-300"
      )}
    >
      {/* 时段标签 */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs font-medium text-gray-500">
          {slotInfo.label}
        </span>
        <span className="text-xs text-gray-400">
          {slotInfo.defaultTime}
        </span>
      </div>

      {slot.card ? (
        <motion.div
          layout
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="relative"
        >
          <div
            className="p-3 rounded-xl border-l-4"
            style={{
              borderLeftColor: CATEGORY_COLORS[slot.card.category],
              backgroundColor: `${CATEGORY_COLORS[slot.card.category]}10`,
            }}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className="px-2 py-0.5 rounded-full text-xs font-medium text-white"
                    style={{ backgroundColor: CATEGORY_COLORS[slot.card.category] }}
                  >
                    {CATEGORY_LABELS[slot.card.category]}
                  </span>
                  <h4 className="font-medium text-gray-900 text-sm">
                    {slot.card.title}
                  </h4>
                </div>
                <p className="text-xs text-gray-500 line-clamp-2">
                  {slot.card.description}
                </p>
              </div>
              <button
                onClick={handleRemove}
                className="text-gray-400 hover:text-red-500 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </motion.div>
      ) : (
        <div className="flex flex-col items-center justify-center h-16 text-gray-400">
          <Plus className="w-6 h-6 mb-1" />
          <span className="text-sm">拖拽卡片到这里</span>
        </div>
      )}
    </div>
  );
}
