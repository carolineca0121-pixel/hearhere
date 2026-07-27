"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Calendar } from "lucide-react";
import { FeedCard } from "@/components/discover/feed-card";
import { CategoryFilter } from "@/components/discover/category-filter";
import { GlassCard } from "@/components/layout/glass-card";
import { useSessionStore } from "@/stores/session";
import { generateContentCards } from "@/lib/content";
import type { ContentCategory } from "@/lib/types";
import { motion } from "framer-motion";

export default function FeedPage() {
  const router = useRouter();
  const {
    tags,
    contentCards,
    selectedContent,
    _hydrated,
    setContentCards,
    addContentCard,
    removeContentCard,
    builderState,
    setBuilderState,
  } = useSessionStore();
  const [loading, setLoading] = useState(true);
  const [selectedCategories, setSelectedCategories] = useState<ContentCategory[]>([
    "attraction",
    "food",
    "souvenir",
  ]);

  // 加载内容
  useEffect(() => {
    if (!_hydrated) return; // 等待 persist hydration 完成
    const loadContent = async () => {
      if (!tags?.destination) {
        router.push("/");
        return;
      }

      setLoading(true);
      try {
        const cards = await generateContentCards(
          tags.destination,
          tags,
          selectedCategories
        );
        setContentCards(cards);
      } catch (error) {
        console.error("加载内容失败:", error);
      } finally {
        setLoading(false);
      }
    };

    loadContent();
  }, [tags?.destination, router, setContentCards]);

  // 筛选显示的卡片
  const filteredCards = (contentCards || []).filter((card) =>
    selectedCategories.includes(card.category)
  );

  // 进入行程构建器
  const goToBuilder = () => {
    router.push("/builder");
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

      {/* 已选内容统计 */}
      {selectedContent.length > 0 && (
        <GlassCard className="mb-6 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full flex items-center justify-center">
                <Calendar className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="font-medium text-gray-900">
                  已选择 {selectedContent.length} 个项目
                </p>
                <p className="text-sm text-gray-500">
                  可以去构建你的行程啦！
                </p>
              </div>
            </div>
            <button
              onClick={goToBuilder}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-purple-500 text-white rounded-full font-medium hover:shadow-lg transition-all"
            >
              <span>构建行程</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </GlassCard>
      )}

      {/* 内容列表 */}
      <div className="flex flex-col gap-4">
        {filteredCards.length === 0 ? (
          <GlassCard className="p-8 text-center">
            <p className="text-gray-500">没有找到符合条件的内容</p>
            <p className="text-sm text-gray-400 mt-2">尝试选择更多分类</p>
          </GlassCard>
        ) : (
          filteredCards.map((card) => (
            <FeedCard
              key={card.id}
              card={card}
              onAdd={addContentCard}
              onRemove={removeContentCard}
            />
          ))
        )}
      </div>

      {/* 底部去构建按钮 */}
      {selectedContent.length > 0 && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50">
          <motion.button
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            onClick={goToBuilder}
            className="flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-blue-500 to-purple-500 text-white rounded-full font-semibold text-lg shadow-xl hover:shadow-2xl transition-all"
          >
            <Calendar className="w-5 h-5" />
            <span>开始构建行程</span>
            <ArrowRight className="w-5 h-4" />
          </motion.button>
        </div>
      )}

      {/* 底部占位 */}
      <div className="h-32" />
    </div>
  );
}
