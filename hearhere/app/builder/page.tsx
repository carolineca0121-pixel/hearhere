"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save, Sparkles, Wand2, Loader2 } from "lucide-react";
import { GlassCard } from "@/components/layout/glass-card";
import { TimelineDay } from "@/components/builder/timeline-day";
import { DraggableCard } from "@/components/builder/draggable-card";
import { ConflictAlert } from "@/components/builder/conflict-alert";
import { useSessionStore } from "@/stores/session";
import {
  createEmptySlots,
  placeCardInSlot,
  removeCardFromSlot,
  autoSchedule,
  validateSchedule,
} from "@/lib/schedule";
import type { ContentCard, InsightCard } from "@/lib/types";
import { motion } from "framer-motion";

export default function BuilderPage() {
  const router = useRouter();
  const {
    tags,
    selectedContent,
    builderState,
    setBuilderState,
    addContentToBuilder,
    removeContentFromBuilder,
    selectedCards,
    addSelectedCard,
    selectedFoods,
    addSelectedFood,
    transcript,
  } = useSessionStore();
  const [isAutoGenerating, setIsAutoGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // 初始化builder状态
  useEffect(() => {
    if (!tags?.destination) {
      router.push("/");
      return;
    }

    if (!builderState) {
      const days = tags.days || 3;
      setBuilderState({
        days,
        slots: createEmptySlots(days),
        conflicts: [],
        selectedCategories: ["attraction", "food", "souvenir"],
      });
    }
  }, [tags, builderState, setBuilderState, router]);

  if (!builderState) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // 处理卡片拖放到插槽
  const handleDrop = (slotId: string, card: ContentCard) => {
    const existingSlot = builderState.slots.find(
      (s) => s.card?.id === card.id
    );
    if (existingSlot) {
      const { slots: slotsAfterRemove } = removeCardFromSlot(
        builderState.slots,
        existingSlot.id
      );
      const { slots, conflicts } = placeCardInSlot(slotsAfterRemove, slotId, card);
      setBuilderState({ ...builderState, slots, conflicts });
    } else {
      const { slots, conflicts } = placeCardInSlot(builderState.slots, slotId, card);
      addContentToBuilder(card);
      setBuilderState({ ...builderState, slots, conflicts });
    }
  };

  const handleRemove = (slotId: string) => {
    const slot = builderState.slots.find((s) => s.id === slotId);
    if (slot?.card) {
      removeContentFromBuilder(slot.card.id);
    }
    const { slots, conflicts } = removeCardFromSlot(builderState.slots, slotId);
    setBuilderState({ ...builderState, slots, conflicts });
  };

  // 自动排期
  const handleAutoSchedule = async () => {
    if ((selectedContent || []).length === 0) return;
    setIsAutoGenerating(true);
    try {
      const { slots, conflicts } = autoSchedule(
        selectedContent || [],
        builderState.days
      );
      setBuilderState({ ...builderState, slots, conflicts });
    } finally {
      setIsAutoGenerating(false);
    }
  };

  // 🆕 真实生成攻略
  const handleSave = async () => {
    if (!tags?.destination) return;
    setSaving(true);
    setSaveError(null);

    try {
      // 将 selectedContent 转为 InsightCard 格式传给 API
      const cards: InsightCard[] = (selectedContent || []).map((c) => ({
        id: c.id,
        title: c.title,
        review: c.description || "",
        reason: c.reason || "",
        category: c.category,
        location: c.location,
      }));

      const foods: InsightCard[] = (selectedContent || [])
        .filter((c) => c.category === "food")
        .map((c) => ({
          id: c.id,
          title: c.title,
          review: c.description || "",
          reason: c.reason || "",
          category: "food",
          location: c.location,
        }));

      const res = await fetch("/api/trips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          destination: tags.destination,
          tags: {
            ...tags,
            // 确保行程细节字段传入
            departureTime: tags.departureTime || "早上出发",
            returnTime: tags.returnTime || "午饭后返程",
          },
          selectedCards: cards,
          selectedFoods: foods,
          rawUserText: transcript,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "生成失败");
      }

      const data = await res.json();
      router.push(`/trip/${data.trip.id}`);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "生成攻略失败，请重试");
    } finally {
      setSaving(false);
    }
  };

  // 获取还没有安排到时间轴的卡片
  const unscheduledCards = (selectedContent || []).filter(
    (card) =>
      !builderState.slots.some((slot) => slot.card?.id === card.id)
  );

  const dayIndices = Array.from(
    { length: builderState.days },
    (_, i) => i
  );

  return (
    <div className="flex flex-col min-h-[calc(100vh-8rem)]">
      {/* 顶部导航 */}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>返回探索</span>
        </button>
        <h1 className="text-xl font-semibold text-gray-900">构建你的行程</h1>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-purple-500 text-white rounded-full font-medium hover:shadow-lg transition-all disabled:opacity-60"
        >
          {saving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          <span>{saving ? "生成中…" : "生成攻略"}</span>
        </button>
      </div>

      {/* 错误提示 */}
      {saveError && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700"
        >
          {saveError}
        </motion.div>
      )}

      {/* 冲突提示 */}
      <div className="mb-6">
        <ConflictAlert conflicts={builderState.conflicts} />
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* 左侧：时间轴 */}
        <div className="flex-1">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">行程时间轴</h2>
            {unscheduledCards.length > 0 && (
              <button
                onClick={handleAutoSchedule}
                disabled={isAutoGenerating}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-full text-sm font-medium hover:shadow-lg transition-all disabled:opacity-50"
              >
                {isAutoGenerating ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>安排中...</span>
                  </>
                ) : (
                  <>
                    <Wand2 className="w-4 h-4" />
                    <span>智能安排</span>
                  </>
                )}
              </button>
            )}
          </div>

          <div className="space-y-2">
            {dayIndices.map((dayIndex) => (
              <TimelineDay
                key={dayIndex}
                dayIndex={dayIndex}
                slots={builderState.slots}
                onDrop={handleDrop}
                onRemove={handleRemove}
              />
            ))}
          </div>
        </div>

        {/* 右侧：待安排卡片 */}
        <div className="lg:w-80">
          <GlassCard className="sticky top-4">
            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="w-5 h-5 text-purple-500" />
              <h3 className="font-semibold text-gray-900">待安排的项目</h3>
            </div>

            {unscheduledCards.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-500 text-sm">
                  所有项目都已安排好了！
                </p>
                <p className="text-gray-400 text-xs mt-1">
                  去探索页面添加更多地点吧
                </p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
                {unscheduledCards.map((card) => (
                  <DraggableCard key={card.id} card={card} />
                ))}
              </div>
            )}

            <div className="mt-4 pt-4 border-t border-gray-100">
              <button
                onClick={() => router.push("/discover")}
                className="w-full py-2.5 text-center text-blue-600 hover:text-blue-800 text-sm font-medium"
              >
                + 探索更多地点
              </button>
            </div>
          </GlassCard>
        </div>
      </div>
    </div>
  );
}
