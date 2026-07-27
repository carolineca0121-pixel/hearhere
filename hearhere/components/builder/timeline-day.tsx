"use client";

import { cn } from "@/lib/utils";
import type { ScheduleSlot, ContentCard } from "@/lib/types";
import { TimelineSlot } from "./timeline-slot";
import { Calendar } from "lucide-react";

interface TimelineDayProps {
  dayIndex: number;
  slots: ScheduleSlot[];
  onDrop: (slotId: string, card: ContentCard) => void;
  onRemove: (slotId: string) => void;
}

export function TimelineDay({ dayIndex, slots, onDrop, onRemove }: TimelineDayProps) {
  const daySlots = slots.filter((s) => s.dayIndex === dayIndex);

  return (
    <div className="mb-8">
      {/* 日期标题 */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full flex items-center justify-center">
          <Calendar className="w-5 h-5 text-white" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900">
          第 {dayIndex + 1} 天
        </h3>
      </div>

      {/* 时间轴插槽 */}
      <div className="ml-6 pl-6 border-l-2 border-gray-200 space-y-4">
        {daySlots.map((slot) => (
          <TimelineSlot
            key={slot.id}
            slot={slot}
            onDrop={onDrop}
            onRemove={onRemove}
          />
        ))}
      </div>
    </div>
  );
}
