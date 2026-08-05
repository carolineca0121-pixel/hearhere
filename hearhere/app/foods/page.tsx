"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SwipeCard } from "@/components/insights/swipe-card";
import { GlassCard } from "@/components/layout/glass-card";
import { Button } from "@/components/ui/button";
import { useSessionStore } from "@/stores/session";
import type { InsightCard } from "@/lib/types";
import { ChevronLeft, ChevronRight, Info, Loader2, Sparkles, Utensils } from "lucide-react";

const LOADING_STAGES = [
  { message: "正在识别当地特色风味", icon: "🍜" },
  { message: "正在筛选适合你的美食灵感", icon: "🥢" },
  { message: "正在生成可加入攻略的餐饮偏好", icon: "✨" },
];

const CREATING_STAGES = [
  { message: "正在整理你的旅行节奏", icon: "📋" },
  { message: "正在安排景点顺序", icon: "🗺️" },
  { message: "正在把美食灵感放进行程", icon: "🍜" },
  { message: "正在生成你的专属攻略", icon: "✨" },
];

export default function FoodsPage() {
  const router = useRouter();
  const {
    tags,
    harmony,
    transcript,
    selectedCards,
    foodCards,
    selectedFoods,
    setFoodCards,
    addSelectedFood,
    removeSelectedFood,
  } = useSessionStore();
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingStage, setLoadingStage] = useState(0);
  const [creatingStage, setCreatingStage] = useState(0);

  useEffect(() => {
    if (!tags) {
      router.replace("/");
      return;
    }

    let stageTimer = setInterval(() => {
      setLoadingStage((prev) => (prev + 1) % LOADING_STAGES.length);
    }, 1200);

    fetch("/api/foods", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ destination: tags.destination, tags }),
    })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? `加载失败 (${r.status})`);
        return d;
      })
      .then((d) => {
        if (d.cards) setFoodCards(d.cards);
        else throw new Error("接口返回的美食字段为空");
      })
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "加载美食推荐失败")
      )
      .finally(() => {
        clearInterval(stageTimer);
        setLoading(false);
      });
  }, [tags, router, setFoodCards]);

  if (!tags) return null;

  const current = foodCards[index];
  const next = foodCards[index + 1];

  const swipeLeft = () => setIndex((i) => i + 1);
  const swipeRight = () => {
    if (current) addSelectedFood(current);
    setIndex((i) => i + 1);
  };

  const createTrip = async () => {
    setCreating(true);
    setCreatingStage(0);
    setError(null);

    const stageTimer = setInterval(() => {
      setCreatingStage((prev) => (prev + 1) % CREATING_STAGES.length);
    }, 1500);

    try {
      const res = await fetch("/api/trips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          destination: tags.destination,
          tags,
          rawUserText: transcript,
          selectedCards,
          selectedFoods,
          harmony,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "创建失败");
      clearInterval(stageTimer);
      router.push(`/trip/${data.trip.id}`);
    } catch (e) {
      clearInterval(stageTimer);
      setError(e instanceof Error ? e.message : "创建行程失败");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-6 py-6">
      <div>
        <h1 className="text-xl font-semibold text-charcoal">选择美食灵感</h1>
        <p className="mt-1 text-sm text-muted">
          这里推荐特色菜和小吃，不推荐具体餐厅 · 右滑加入，左滑跳过
        </p>
      </div>

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
          <div className="mx-auto h-[300px] w-full max-w-sm rounded-2xl bg-gray-100/50 animate-pulse" />
        </GlassCard>
      )}

      {creating && (
        <GlassCard className="space-y-6 py-10 text-center">
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="text-3xl animate-bounce">
              {CREATING_STAGES[creatingStage].icon}
            </div>
            <div className="text-left">
              <p className="text-sm font-medium text-charcoal">
                {CREATING_STAGES[creatingStage].message}
              </p>
              <p className="text-xs text-muted mt-1">正在为你精心准备…</p>
            </div>
          </div>
          <div className="flex justify-center gap-1">
            {CREATING_STAGES.map((_, i) => (
              <div
                key={i}
                className={`h-2 rounded-full transition-all ${
                  i === creatingStage
                    ? "w-4 bg-vibe-dusk"
                    : i < creatingStage
                    ? "w-2 bg-vibe-dusk"
                    : "w-2 bg-gray-200"
                }`}
              />
            ))}
          </div>
        </GlassCard>
      )}

      {!loading && !creating && index < foodCards.length && (
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

      {!loading && !creating && index >= foodCards.length && foodCards.length > 0 && (
        <GlassCard className="text-center py-8">
          <Sparkles className="h-10 w-10 text-vibe-dusk mx-auto mb-4" />
          <p className="text-sm text-charcoal">已浏览全部美食灵感</p>
          <p className="text-xs text-muted mt-2">
            已选 {selectedFoods.length} 个美食灵感
            {selectedFoods.length === 0 && "（不选也没关系，可以直接生成）"}
          </p>
        </GlassCard>
      )}

      {!loading && !creating && selectedFoods.length > 0 && (
        <GlassCard>
          <div className="flex items-center gap-2 mb-3">
            <Utensils className="h-4 w-4 text-vibe-dusk" />
            <span className="text-xs font-medium uppercase tracking-wider text-muted">
              已加入美食 ({selectedFoods.length})
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {selectedFoods.map((c: InsightCard) => (
              <span
                key={c.id}
                className="inline-flex items-center gap-1 rounded-full bg-vibe-dusk/25 px-3 py-1 text-xs"
              >
                {c.title}
                <button
                  type="button"
                  onClick={() => removeSelectedFood(c.id)}
                  className="opacity-60 hover:opacity-100"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        </GlassCard>
      )}

      {error && (
        <GlassCard className="bg-amber-50/60">
          <div className="flex items-start gap-2">
            <Info className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-amber-900">{error}</p>
              <p className="mt-2 text-xs text-muted">
                没关系，可以直接生成攻略。
              </p>
            </div>
          </div>
        </GlassCard>
      )}

      {!creating && (
        <div className="flex flex-col gap-3">
          <Button variant="outline" onClick={() => router.push("/explore")}>返回选择地点</Button>
          <Button className="w-full" onClick={createTrip}>
            {selectedFoods.length > 0
              ? `生成我的行程（${selectedCards.length} 个地点 · ${selectedFoods.length} 个美食）`
              : `生成我的行程（${selectedCards.length} 个地点）`}
          </Button>
        </div>
      )}
    </div>
  );
}
