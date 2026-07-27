"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Camera, Utensils, BookOpen, Heart, Zap, ArrowRight } from "lucide-react";
import { GlassCard } from "@/components/layout/glass-card";
import { FeedCard } from "@/components/discover/feed-card";
import { useSessionStore } from "@/stores/session";
import { generateContentCards } from "@/lib/content";
import type { ContentCategory } from "@/lib/types";
import { motion } from "framer-motion";

const INTERESTS = [
  { id: "photo", label: "想拍照", icon: Camera, categories: ["photo", "attraction"] },
  { id: "food", label: "想吃东西", icon: Utensils, categories: ["food", "lifestyle"] },
  { id: "culture", label: "了解历史", icon: BookOpen, categories: ["culture", "attraction"] },
  { id: "relax", label: "放松休闲", icon: Heart, categories: ["lifestyle", "hidden"] },
  { id: "adventure", label: "探索冒险", icon: Zap, categories: ["hidden", "attraction"] },
];

export default function InterestsPage() {
  const router = useRouter();
  const {
    tags,
    contentCards,
    selectedContent,
    _hydrated,
    setContentCards,
    addContentCard,
    removeContentCard,
  } = useSessionStore();
  const [loading, setLoading] = useState(true);
  const [selectedInterest, setSelectedInterest] = useState<string | null>(null);
  const [filteredCards, setFilteredCards] = useState(contentCards);

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
        const cards = await generateContentCards(tags.destination, tags);
        setContentCards(cards);
        setFilteredCards(cards);
      } catch (error) {
        console.error("加载内容失败:", error);
      } finally {
        setLoading(false);
      }
    };

    loadContent();
  }, [tags?.destination, router, setContentCards]);

  // 选择兴趣
  const handleSelectInterest = (interestId: string) => {
    setSelectedInterest(interestId);
    const interest = INTERESTS.find((i) => i.id === interestId);
    if (interest) {
      const cards = (contentCards || []).filter((card) =>
        interest.categories.includes(card.category as any)
      );
      setFilteredCards(cards);
    } else {
      setFilteredCards(contentCards || []);
    }
  };

  // 去构建行程
  const goToBuilder = () => {
    router.push("/builder");
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-gray-600">正在发现你的兴趣...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {/* 兴趣选择 */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          选择你的兴趣
        </h3>
        <div className="grid grid-cols-2 gap-3">
          {INTERESTS.map((interest, index) => {
            const Icon = interest.icon;
            const isSelected = selectedInterest === interest.id;

            return (
              <motion.button
                key={interest.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                onClick={() => handleSelectInterest(interest.id)}
                className={
                  `p-4 rounded-2xl text-left transition-all ${
                    isSelected
                      ? "bg-gradient-to-br from-blue-500 to-purple-500 text-white shadow-lg"
                      : "bg-white/70 hover:bg-white"
                  }`
                }
              >
                <div className="flex items-center gap-3 mb-2">
                  <Icon className={`w-6 h-6 ${isSelected ? "text-white" : "text-gray-600"}`} />
                  <span className={`font-medium ${isSelected ? "text-white" : "text-gray-900"}`}>
                    {interest.label}
                  </span>
                </div>
                <div className="flex gap-1">
                  {interest.categories.map((cat) => (
                    <span
                      key={cat}
                      className={`text-xs px-2 py-1 rounded-full ${
                        isSelected ? "bg-white/20" : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {cat}
                    </span>
                  ))}
                </div>
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* 推荐内容 */}
      {selectedInterest && (
        <div className="mb-6">
          <GlassCard className="p-4 flex items-center gap-3 mb-4">
            <Sparkles className="w-5 h-5 text-purple-500" />
            <p className="text-gray-700">
              为你推荐符合兴趣的地点
            </p>
          </GlassCard>

          <div className="flex flex-col gap-4">
            {filteredCards.length === 0 ? (
              <GlassCard className="p-8 text-center">
                <p className="text-gray-500">没有找到相关内容</p>
                <p className="text-sm text-gray-400 mt-2">试试选择其他兴趣</p>
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
        </div>
      )}

      {/* 如果没有选择兴趣，显示引导 */}
      {!selectedInterest && (
        <GlassCard className="p-8 text-center">
          <Sparkles className="w-12 h-12 text-purple-500 mx-auto mb-4" />
          <p className="text-gray-700 font-medium mb-2">
            选择你的兴趣，我们为你推荐
          </p>
          <p className="text-gray-500 text-sm">
            从上面选择一个兴趣开始探索吧！
          </p>
        </GlassCard>
      )}

      {/* 底部去构建按钮 */}
      {selectedContent.length > 0 && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50">
          <motion.button
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            onClick={goToBuilder}
            className="flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-blue-500 to-purple-500 text-white rounded-full font-semibold text-lg shadow-xl hover:shadow-2xl transition-all"
          >
            <Sparkles className="w-5 h-5" />
            <span>开始构建行程</span>
            <ArrowRight className="w-5 h-4" />
          </motion.button>
        </div>
      )}

      <div className="h-32" />
    </div>
  );
}
