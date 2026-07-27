"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MapPin, AlertCircle, Compass } from "lucide-react";
import { GlassCard } from "@/components/layout/glass-card";
import { FeedCard } from "@/components/discover/feed-card";
import { CategoryFilter } from "@/components/discover/category-filter";
import { useSessionStore } from "@/stores/session";
import { generateContentCards, CATEGORY_COLORS, CATEGORY_LABELS } from "@/lib/content";
import type { ContentCategory } from "@/lib/types";

export default function MapPage() {
  const router = useRouter();
  const { tags, contentCards, setContentCards, addContentCard, removeContentCard } =
    useSessionStore();
  const [loading, setLoading] = useState(true);
  const [selectedCategories, setSelectedCategories] = useState<ContentCategory[]>([
    "attraction",
    "food",
    "souvenir",
  ]);
  const [selectedPoint, setSelectedPoint] = useState<string | null>(null);

  // 加载内容
  useEffect(() => {
    const loadContent = async () => {
      if (!tags?.destination) {
        router.push("/");
        return;
      }

      setLoading(true);
      try {
        const cards = await generateContentCards(tags.destination, tags, selectedCategories);
        setContentCards(cards);
      } catch (error) {
        console.error("加载内容失败", error);
      } finally {
        setLoading(false);
      }
    };

    loadContent();
  }, [tags?.destination, router, setContentCards, selectedCategories]);

  // 筛选卡片
  const filteredCards = (contentCards || []).filter((card) =>
    selectedCategories.includes(card.category)
  );

  // 生成模拟位置
  const getPosition = (index: number) => {
    const positions = [
      { x: 25, y: 30 },
      { x: 50, y: 25 },
      { x: 75, y: 35 },
      { x: 35, y: 55 },
      { x: 60, y: 60 },
      { x: 20, y: 70 },
      { x: 55, y: 75 },
      { x: 80, y: 80 },
    ];
    return positions[index % positions.length];
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-gray-600">正在为你发现精彩内容...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {/* 分类筛选 */}
      <CategoryFilter
        selectedCategories={selectedCategories}
        onChange={setSelectedCategories}
      />

      {/* 地图容器 */}
      <GlassCard className="relative h-[45vh] mb-6 overflow-hidden">
        {/* 模拟地图背景 */}
        <div className="absolute inset-0 bg-gradient-to-br from-green-50 via-blue-50 to-amber-50">
          {/* 装饰线条 */}
          <div className="absolute top-1/2 left-0 right-0 h-1 bg-gray-200 -translate-y-1/2 opacity-50" />
          <div className="absolute top-0 bottom-0 left-1/3 w-1 bg-gray-200 opacity-50" />
          <div className="absolute top-0 bottom-0 right-1/4 w-1 bg-gray-200 opacity-50" />

          {/* 地图标记 */}
          {filteredCards.map((card, index) => {
            const pos = getPosition(index);
            const color = CATEGORY_COLORS[card.category];
            const isSelected = selectedPoint === card.id;
            const isCardSelected = card.status === "selected" || card.status === "scheduled";

            return (
              <div
                key={card.id}
                className="absolute cursor-pointer transform -translate-x-1/2 -translate-y-full transition-all duration-300 hover:scale-110"
                style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
                onClick={() => setSelectedPoint(isSelected ? null : card.id)}
              >
                <div className="relative">
                  <MapPin
                    className={`w-10 h-10 drop-shadow-lg ${isSelected ? "scale-125 animate-bounce" : ""}`}
                    style={{ color: isCardSelected ? "#10B981" : color }}
                  />
                  {isCardSelected && (
                    <div className="absolute -top-1 -right-1 w-5 h-5 bg-green-500 rounded-full flex items-center justify-center">
                      <Compass className="w-3 h-3 text-white" />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* 占位提示 */}
        <div className="absolute bottom-4 left-4 right-4 pointer-events-none">
          <div className="bg-black/60 text-white px-4 py-2 rounded-lg text-sm text-center">
            🗺️ 点击地图标记查看详情，真实地图功能开发中
          </div>
        </div>
      </GlassCard>

      {/* 选中点的详情 */}
      {selectedPoint && (
        <div className="mb-6">
          {(() => {
            const card = filteredCards.find((c) => c.id === selectedPoint);
            if (!card) return null;
            return (
              <FeedCard
                key={card.id}
                card={card}
                onAdd={addContentCard}
                onRemove={removeContentCard}
              />
            );
          })()}
        </div>
      )}

      {/* 列表预览 */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">推荐列表</h3>
        <div className="flex flex-col gap-3">
          {filteredCards.map((card) => (
            <FeedCard
              key={card.id}
              card={card}
              onAdd={addContentCard}
              onRemove={removeContentCard}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
