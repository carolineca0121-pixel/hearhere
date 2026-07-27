"use client";

import { CATEGORY_COLORS, CATEGORY_LABELS } from "@/lib/content";
import type { ContentCard } from "@/lib/types";
import { GripVertical, Clock } from "lucide-react";

interface DraggableCardProps {
  card: ContentCard;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}

export function DraggableCard({ card, onDragStart, onDragEnd }: DraggableCardProps) {
  const categoryColor = CATEGORY_COLORS[card.category];
  const categoryLabel = CATEGORY_LABELS[card.category];

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData("cardId", card.id);
    e.dataTransfer.setData("cardData", JSON.stringify(card));
    onDragStart?.();
  };

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onDragEnd={onDragEnd}
      className="bg-white rounded-2xl p-4 shadow-md cursor-grab active:cursor-grabbing hover:shadow-lg transition-shadow"
    >
      <div className="flex items-start gap-3">
        <GripVertical className="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span
              className="px-2 py-0.5 rounded-full text-xs font-medium text-white"
              style={{ backgroundColor: categoryColor }}
            >
              {categoryLabel}
            </span>
            <span className="text-xs text-gray-500 truncate">
              {card.title}
            </span>
          </div>
          {card.bestTime && (
            <div className="flex items-center gap-1 text-xs text-gray-500">
              <Clock className="w-3 h-3" />
              <span>{card.bestTime}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
