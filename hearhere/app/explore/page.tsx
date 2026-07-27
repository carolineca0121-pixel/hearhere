"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SwipeCard } from "@/components/insights/swipe-card";
import { GlassCard } from "@/components/layout/glass-card";
import { Button } from "@/components/ui/button";
import { useSessionStore } from "@/stores/session";
import type { InsightCard } from "@/lib/types";
import {
  Sparkles,
  MapPin,
  Info,
  ChevronRight,
  ChevronLeft,
} from "lucide-react";

// 加载阶段显示
const LOADING_STAGES = [
  { message: "正在理解你的旅行偏好", icon: "🧠" },
  { message: "正在帮你匹配适合你的目的地体验", icon: "🔍" },
  { message: "为你生成专属推荐", icon: "✨" },
];

export default function ExplorePage() {
  const router = useRouter();
  const {
    tags,
    insightCards,
    selectedCards,
    setInsightCards,
    addSelectedCard,
    removeSelectedCard,
  } = useSessionStore();
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadingStage, setLoadingStage] = useState(0);

  useEffect(() => {
    if (!tags) {
      router.replace("/");
      return;
    }

    // 加载阶段动画
    let stageTimer: NodeJS.Timeout;
    const animateStages = () => {
      stageTimer = setInterval(() => {
        setLoadingStage((prev) => (prev + 1) % LOADING_STAGES.length);
      }, 1200);
    };
    animateStages();

    fetch("/api/insights", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ destination: tags.destination, tags }),
    })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) {
          throw new Error(d.error ?? `加载失败 (${r.status})`);
        }
        return d;
      })
      .then((d) => {
        if (d.cards) setInsightCards(d.cards);
        else throw new Error("接口返回的卡片字段为空");
      })
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "加载情报失败")
      )
      .finally(() => {
        clearInterval(stageTimer);
        setLoading(false);
      });
  }, [tags, router, setInsightCards]);

  const current = insightCards[index];
  const next = insightCards[index + 1];

  const swipeLeft = () => setIndex((i) => i + 1);
  const swipeRight = () => {
    if (current) addSelectedCard(current);
    setIndex((i) => i + 1);
  };

  const goFoods = () => {
    router.push("/foods");
  };

  if (!tags) return null;

  return (
    <div className="space-y-6 py-6">
      <div>
        <h1 className="text-xl font-semibold text-charcoal">探索地点</h1>
        <p className="text-sm text-muted mt-1">
          左右滑动选择你感兴趣的地点 · 右滑加入，左滑跳过
        </p>
      </div>

      {/* 加载状态 */}
      {loading && (
        <GlassCard className="space-y-6 py-10 text-center">
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="text-3xl animate-bounce">
              {LOADING_STAGES[loadingStage].icon}
            </div>
            <div className="text-left">
              <p className="text-sm font-medium text-charcoal">
                {LOADING_STAGES[loadingStage].message}
              </p>
              <p className="text-xs text-muted mt-1">请稍候…</p>
            </div>
          </div>
          {/* 骨架屏占位 */}
          <div className="mx-auto h-[300px] w-full max-w-sm rounded-2xl bg-gray-100/50 animate-pulse" />
        </GlassCard>
      )}

      {/* 加载完成但没有卡片 */}
      {!loading && insightCards.length === 0 && !error && (
        <GlassCard className="text-center py-8">
          <MapPin className="h-10 w-10 text-muted mx-auto mb-4" />
          <p className="text-sm text-charcoal">暂时没有推荐卡片</p>
          <p className="text-xs text-muted mt-2">
            没关系，可以继续选择美食灵感后生成攻略
          </p>
        </GlassCard>
      )}

      {/* 显示卡片 */}
      {!loading && index < insightCards.length && (
        <>
          <div className="relative mx-auto h-[340px] w-full max-w-sm">
            {next && (
              <SwipeCard
                card={next}
                onSwipeLeft={() => {}}
                onSwipeRight={() => {}}
                isTop={false}
              />
            )}
            {current && (
              <SwipeCard
                card={current}
                onSwipeLeft={swipeLeft}
                onSwipeRight={swipeRight}
              />
            )}
          </div>

          {/* 操作提示 */}
          <div className="flex justify-center gap-8 text-xs text-muted">
            <div className="flex items-center gap-1">
              <ChevronLeft className="h-4 w-4" />
              <span>跳过</span>
            </div>
            <div className="flex items-center gap-1">
              <span>加入</span>
              <ChevronRight className="h-4 w-4" />
            </div>
          </div>
        </>
      )}

      {/* 已浏览完全部卡片提示 */}
      {!loading && index >= insightCards.length && insightCards.length > 0 && (
        <GlassCard className="text-center py-8">
          <Sparkles className="h-10 w-10 text-vibe-dusk mx-auto mb-4" />
          <p className="text-sm text-charcoal">已浏览全部卡片</p>
          <p className="text-xs text-muted mt-2">
            已选 {selectedCards.length} 个地点
            {selectedCards.length === 0 && "（没选也没关系，可以直接生成）"}
          </p>
        </GlassCard>
      )}

      {/* 已选卡片列表 */}
      {!loading && selectedCards.length > 0 && (
        <GlassCard>
          <div className="flex items-center gap-2 mb-3">
            <MapPin className="h-4 w-4 text-vibe-sea" />
            <span className="text-xs font-medium uppercase tracking-wider text-muted">
              已加入 ({selectedCards.length})
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {selectedCards.map((c) => (
              <span
                key={c.id}
                className="inline-flex items-center gap-1 rounded-full bg-vibe-sea/30 px-3 py-1 text-xs"
              >
                {c.title}
                <button
                  type="button"
                  onClick={() => removeSelectedCard(c.id)}
                  className="opacity-60 hover:opacity-100"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        </GlassCard>
      )}

      {/* 错误提示 */}
      {error && (
        <GlassCard className="bg-amber-50/60">
          <div className="flex items-start gap-2">
            <Info className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-amber-900">{error}</p>
              <p className="mt-2 text-xs text-muted">
                没关系，可以继续选择美食灵感后生成攻略
              </p>
            </div>
          </div>
        </GlassCard>
      )}

      {/* 下一步按钮 */}
      <Button
        className="w-full"
        onClick={goFoods}
      >
        {selectedCards.length > 0 ? (
          `下一步：选择美食灵感（已选 ${selectedCards.length} 个地点）`
        ) : (
          "下一步：选择美食灵感"
        )}
      </Button>
    </div>
  );
}
