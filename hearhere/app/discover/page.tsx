"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Sparkles, MapPin, Utensils, Gift, Building2, Users, Clock, Car, X, AlertTriangle } from "lucide-react";
import { AmapView, CATEGORY_MARKER_COLORS, type MapMarker } from "@/components/map/amap-view";
import { PoiCard, type PoiCardData } from "@/components/discover/poi-card";
import { GlassCard } from "@/components/layout/glass-card";
import { useSessionStore } from "@/stores/session";

type DiscoverCategory = "attraction" | "food" | "souvenir" | "hotel";

const CATEGORIES: { key: DiscoverCategory; label: string; icon: React.ReactNode }[] = [
  { key: "attraction", label: "景点", icon: <MapPin className="w-4 h-4" /> },
  { key: "food", label: "美食", icon: <Utensils className="w-4 h-4" /> },
  { key: "souvenir", label: "伴手礼", icon: <Gift className="w-4 h-4" /> },
  { key: "hotel", label: "酒店", icon: <Building2 className="w-4 h-4" /> },
];

const CAT_DESC: Record<DiscoverCategory, string> = {
  attraction: "根据你的偏好，推荐这些地点",
  food: "根据你的口味，找到最对胃的那一口",
  souvenir: "带点当地特色回家",
  hotel: "根据预算和位置推荐住宿",
};

// ── 美食筛选 Chip ──

const MEAL_CHIPS = [
  { key: "", label: "全部时段" },
  { key: "breakfast", label: "☀️ 早餐" },
  { key: "lunch", label: "🍱 午餐" },
  { key: "afternoon", label: "☕ 下午茶" },
  { key: "dinner", label: "🌙 晚餐" },
  { key: "latenight", label: "🦉 夜宵" },
];

const CUISINE_CHIPS = [
  { key: "", label: "全部菜系" },
  { key: "local", label: "本地特色" },
  { key: "chuan", label: "川菜·麻辣" },
  { key: "yue", label: "粤菜·点心" },
  { key: "hotpot", label: "火锅·串串" },
  { key: "seafood", label: "海鲜" },
  { key: "veg", label: "素食" },
  { key: "cafe", label: "咖啡·甜品" },
  { key: "snack", label: "小吃·快餐" },
];

export default function DiscoverPage() {
  const router = useRouter();
  const { tags, _hydrated, selectedContent, addContentCard, removeContentCard } = useSessionStore();
  const [activeCategory, setActiveCategory] = useState<DiscoverCategory>("attraction");
  const [allCards, setAllCards] = useState<Record<DiscoverCategory, PoiCardData[]>>({
    attraction: [], food: [], souvenir: [], hotel: [],
  });
  const [loading, setLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const poiCoordsRef = useRef<Map<string, { lng: number; lat: number }>>(new Map());

  // 美食筛选
  const [mealType, setMealType] = useState("");
  const [cuisine, setCuisine] = useState("");
  // 选择数量校验
  const [showInsufficientWarning, setShowInsufficientWarning] = useState(false);

  const destination = tags?.destination || "";

  const selectedLocations = Array.from(selectedIds)
    .map((id) => poiCoordsRef.current.get(id))
    .filter(Boolean) as { lng: number; lat: number }[];

  const markers: MapMarker[] = (allCards[activeCategory] || [])
    .map((c) => {
      const coords = poiCoordsRef.current.get(c.id);
      if (!coords) return null;
      return { id: c.id, name: c.name, ...coords, category: c.category, color: CATEGORY_MARKER_COLORS[c.category] || "#6B7280", selected: selectedIds.has(c.id) };
    })
    .filter(Boolean) as MapMarker[];

  // ── 加载推荐（带上筛选参数） ──
  const loadCategory = useCallback(async (category: DiscoverCategory, mt?: string, cui?: string) => {
    if (!destination) return;
    setLoading(true);
    try {
      const body: any = { destination, tags, category };
      if (category === "food") {
        if (mt) body.mealType = mt;
        if (cui) body.cuisine = cui;
      }
      if (selectedLocations.length > 0 && category !== "attraction") body.selectedLocations = selectedLocations;
      const res = await fetch("/api/recommend", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      const cards: PoiCardData[] = (data.pois || []).map((p: any) => {
        if (p.lng != null && p.lat != null) poiCoordsRef.current.set(p.id, { lng: p.lng, lat: p.lat });
        return {
          id: p.id,
          name: p.name,
          address: p.address,
          description: p.reason,
          recommendedDish: p.recommendedDish,
          giftPitch: p.giftPitch,
          category,
        };
      });
      setAllCards((prev) => ({ ...prev, [category]: cards }));
    } catch (e) { console.warn("[discover]", e); }
    finally { setLoading(false); }
  }, [destination, tags, selectedLocations]);

  // 分类变化时，清空筛选并加载
  useEffect(() => {
    if (_hydrated && destination) {
      if (activeCategory === "food") {
        // 美食：用当前筛选重新加载
        const currentCards = allCards.food;
        const hasCards = currentCards.length > 0;
        // 有缓存且在相同筛选项下不重新加载
        loadCategory(activeCategory, mealType || undefined, cuisine || undefined);
      } else {
        loadCategory(activeCategory);
      }
    }
  }, [_hydrated, destination, activeCategory]);

  // 筛选变化时重新加载美食
  useEffect(() => {
    if (_hydrated && destination && activeCategory === "food") {
      loadCategory("food", mealType || undefined, cuisine || undefined);
    }
  }, [mealType, cuisine]);

  useEffect(() => { setSelectedIds(new Set(selectedContent.map((c) => c.id))); }, [selectedContent]);

  const handleToggle = (card: PoiCardData) => {
    if (selectedIds.has(card.id)) { removeContentCard(card.id); }
    else {
      const coords = poiCoordsRef.current.get(card.id);
      addContentCard({ id: card.id, title: card.name, description: card.description || card.address || "", reason: card.description || "推荐", category: card.category as any, status: "selected", tags: [], suitableFor: [], location: coords ? { lat: coords.lat, lng: coords.lng, address: card.address } : undefined });
    }
  };

  const currentCards = (allCards[activeCategory] || []).map((c) => ({ ...c, selected: selectedIds.has(c.id) }));
  const activeColor = CATEGORY_MARKER_COLORS[activeCategory];
  const isFood = activeCategory === "food";

  // ── 选择数量校验 ──
  const days = tags?.days || 3;
  const minRecommended = days * 2; // 每天至少 2 个点
  const isInsufficient = selectedContent.length < minRecommended;

  const handleGoBuilder = () => {
    if (isInsufficient) {
      setShowInsufficientWarning(true);
    } else {
      router.push("/builder");
    }
  };

  if (!_hydrated) return null;

  return (
    <div className="flex flex-col min-h-screen bg-parchment/30">
      {/* ── 地图区 ── */}
      <div className="relative">
        <AmapView markers={markers} className="w-full h-[38vh]" />
        <div className="absolute top-3 left-3 right-3 flex items-center justify-between pointer-events-none">
          <GlassCard className="inline-flex items-center gap-2 px-3 py-1.5 shadow-sm">
            <MapPin className="w-3.5 h-3.5 text-vibe-sea" />
            <span className="text-sm font-medium text-charcoal">{destination || "选择地点"}</span>
            {tags?.days && <span className="text-xs text-muted">{tags.days}天</span>}
          </GlassCard>
          {selectedContent.length > 0 && (
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="pointer-events-auto">
              <button onClick={() => router.push("/builder")} className="flex items-center gap-1.5 bg-gradient-to-r from-vibe-sea to-vibe-dusk text-white rounded-full px-4 py-2 shadow-lg text-sm font-medium">
                已选 {selectedContent.length}
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </motion.div>
          )}
        </div>
      </div>

      {/* ── 标签摘要 ── */}
      {tags && (
        <div className="px-4 -mt-2 relative z-10">
          <GlassCard className="px-4 py-2.5">
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              {tags.tripType && <span className="inline-flex items-center gap-1 bg-vibe-sea/15 text-charcoal/70 rounded-full px-2 py-0.5"><Users className="w-3 h-3" />{tags.tripType}</span>}
              {tags.peopleCount && <span className="text-muted">{tags.peopleCount}人</span>}
              {tags.days && <span className="inline-flex items-center gap-1 text-muted"><Clock className="w-3 h-3" />{tags.days}天</span>}
              {tags.transportation && <span className="inline-flex items-center gap-1 text-muted"><Car className="w-3 h-3" />{tags.transportation}</span>}
              {tags.departure && <span className="text-muted">从{tags.departure}出发</span>}
              {tags.preferences.length > 0 && (
                <>
                  <span className="text-muted/40">|</span>
                  {tags.preferences.slice(0, 4).map((p) => (
                    <span key={p} className="bg-vibe-dusk/10 text-charcoal/60 rounded-full px-2 py-0.5">{p}</span>
                  ))}
                </>
              )}
            </div>
          </GlassCard>
        </div>
      )}

      {/* ── 类别 Tab ── */}
      <div className="px-4 mt-3">
        <div className="flex bg-white/50 backdrop-blur-sm rounded-2xl p-1 shadow-sm">
          {CATEGORIES.map((cat) => {
            const isActive = activeCategory === cat.key;
            const color = CATEGORY_MARKER_COLORS[cat.key];
            return (
              <button
                key={cat.key}
                onClick={() => setActiveCategory(cat.key)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-medium transition-all relative ${
                  isActive ? "text-white" : "text-muted hover:text-charcoal/70"
                }`}
              >
                {isActive && (
                  <motion.div layoutId="tab-bg" className="absolute inset-0 rounded-xl" style={{ background: `linear-gradient(135deg, ${color}, ${color}dd)` }} transition={{ type: "spring", stiffness: 400, damping: 30 }} />
                )}
                <span className="relative z-10">{cat.icon}</span>
                <span className="relative z-10">{cat.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── 🆕 美食筛选 Chip ── */}
      {isFood && (
        <div className="px-4 mt-3 space-y-2">
          {/* 时段 */}
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
            <span className="text-[11px] text-muted/40 mr-1 flex-shrink-0">时段</span>
            {MEAL_CHIPS.map((chip) => (
              <button
                key={chip.key}
                onClick={() => setMealType(chip.key)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                  mealType === chip.key
                    ? "bg-vibe-dusk text-white shadow-sm"
                    : "bg-white/70 text-muted hover:bg-white hover:text-charcoal/70 border border-white/80"
                }`}
              >
                {chip.label}
              </button>
            ))}
          </div>
          {/* 菜系 */}
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
            <span className="text-[11px] text-muted/40 mr-1 flex-shrink-0">菜系</span>
            {CUISINE_CHIPS.map((chip) => (
              <button
                key={chip.key}
                onClick={() => setCuisine(chip.key)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                  cuisine === chip.key
                    ? "bg-vibe-sea text-white shadow-sm"
                    : "bg-white/70 text-muted hover:bg-white hover:text-charcoal/70 border border-white/80"
                }`}
              >
                {chip.label}
              </button>
            ))}
          </div>
          {/* 清除筛选 */}
          {(mealType || cuisine) && (
            <button
              onClick={() => { setMealType(""); setCuisine(""); }}
              className="flex items-center gap-1 text-[11px] text-muted/50 hover:text-charcoal/60 transition-colors"
            >
              <X className="w-3 h-3" /> 清除筛选
            </button>
          )}
        </div>
      )}

      {/* ── 内容区 ── */}
      <div className="flex-1 px-4 py-4 space-y-3 pb-28">
        <p className="text-xs text-muted/70">{CAT_DESC[activeCategory]}</p>

        {loading ? (
          <div className="space-y-2.5">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-white/60 rounded-2xl p-3 animate-pulse">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gray-200" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3.5 bg-gray-200 rounded w-1/2" />
                    <div className="h-2.5 bg-gray-100 rounded w-3/4" />
                  </div>
                  <div className="w-8 h-8 rounded-full bg-gray-200" />
                </div>
              </div>
            ))}
          </div>
        ) : currentCards.length === 0 ? (
          <GlassCard className="py-10 text-center">
            <div className="w-12 h-12 rounded-full bg-vibe-dusk/10 flex items-center justify-center mx-auto mb-3">
              <Sparkles className="w-5 h-5 text-vibe-dusk/40" />
            </div>
            <p className="text-sm text-muted">暂无推荐</p>
            <p className="text-xs text-muted/50 mt-1">换个筛选条件试试</p>
          </GlassCard>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div key={activeCategory + mealType + cuisine} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-2.5">
              {currentCards.map((card) => (
                <div key={card.id} id={`card-${card.id}`}>
                  <PoiCard card={card} onToggle={() => handleToggle(card)} />
                </div>
              ))}
            </motion.div>
          </AnimatePresence>
        )}
      </div>

      {/* ── 底部确认 ── */}
      {selectedContent.length > 0 && (
        <motion.div initial={{ y: 100 }} animate={{ y: 0 }}
          className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-parchment via-parchment/95 to-transparent z-20">
          <button
            onClick={handleGoBuilder}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-white font-semibold text-base shadow-lg active:scale-[0.98] transition-transform"
            style={{ background: `linear-gradient(135deg, ${activeColor}, ${activeColor}dd)` }}
          >
            <Sparkles className="w-5 h-5" />
            已选 {selectedContent.length} 项，生成攻略
            <ArrowRight className="w-5 h-5" />
          </button>
        </motion.div>
      )}

      {/* ── 选择不足警告弹窗 ── */}
      <AnimatePresence>
        {showInsufficientWarning && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/40 backdrop-blur-sm"
            onClick={() => setShowInsufficientWarning(false)}
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm"
            >
              <GlassCard className="p-5">
                <div className="flex items-start gap-3 mb-4">
                  <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                    <AlertTriangle className="w-5 h-5 text-amber-600" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-charcoal mb-1">
                      地点可能不够哦
                    </h3>
                    <p className="text-sm text-charcoal/70 leading-relaxed">
                      {days} 天行程建议至少选 {minRecommended} 个地点，你现在只选了 {selectedContent.length} 个。
                      继续生成的话，行程可能会比较空。
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowInsufficientWarning(false)}
                    className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-vibe-sea to-vibe-dusk text-white text-sm font-medium"
                  >
                    再去选一些
                  </button>
                  <button
                    onClick={() => router.push("/builder")}
                    className="px-4 py-2.5 rounded-xl border border-charcoal/15 text-sm text-muted hover:text-charcoal transition-colors"
                  >
                    直接生成
                  </button>
                </div>
              </GlassCard>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
