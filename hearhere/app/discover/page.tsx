"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Sparkles, MapPin, Utensils, Gift, Users, Clock, Car, Check, Mic, Square } from "lucide-react";
import { AmapView, CATEGORY_MARKER_COLORS, type MapMarker } from "@/components/map/amap-view";
import { PoiCard, type PoiCardData } from "@/components/discover/poi-card";
import { GlassCard } from "@/components/layout/glass-card";
import { useSessionStore } from "@/stores/session";
import { getMicErrorMessage } from "@/lib/mic";
import { wgs84ToGcj02 } from "@/lib/amap-types";

type DiscoverCategory = "attraction" | "food" | "souvenir"; // 2.0: 酒店分类删除（品牌质量一般、可有可无）

const CATEGORIES: { key: DiscoverCategory; label: string; icon: React.ReactNode }[] = [
  { key: "attraction", label: "景点", icon: <MapPin className="w-4 h-4" /> },
  { key: "food", label: "美食", icon: <Utensils className="w-4 h-4" /> },
  { key: "souvenir", label: "伴手礼", icon: <Gift className="w-4 h-4" /> },
];

const CAT_DESC: Record<DiscoverCategory, string> = {
  attraction: "根据你的偏好，推荐这些地点",
  food: "根据你的口味，找到最对胃的那一口",
  souvenir: "带点当地特色回家",
};

export default function DiscoverPage() {
  const router = useRouter();
  const { tags, _hydrated, selectedContent, addContentCard, removeContentCard, transcript, screenshotPlaces, setScreenshotPlaces, reset } = useSessionStore();
  const [activeCategory, setActiveCategory] = useState<DiscoverCategory>("attraction");
  const [allCards, setAllCards] = useState<Record<DiscoverCategory, PoiCardData[]>>({
    attraction: [], food: [], souvenir: [],
  });
  const [loading, setLoading] = useState(false);
  // 🚀 已加载分类缓存标记 + 各分类请求中状态（Tab 切换 0ms 读缓存）
  const loadedCatsRef = useRef<Set<DiscoverCategory>>(new Set());
  const [pendingCats, setPendingCats] = useState<Set<DiscoverCategory>>(new Set());
  const prefetchFiredRef = useRef(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const poiCoordsRef = useRef<Map<string, { lng: number; lat: number }>>(new Map());
  // 📷 用户手动移除的截图地名（不强行加回）；新增地名会自动蹦入
  const dismissedShotsRef = useRef<Set<string>>(new Set());

  // 选择数量校验
  const [canvasCreating, setCanvasCreating] = useState(false);
  const [canvasError, setCanvasError] = useState<string | null>(null);
  const [recommendError, setRecommendError] = useState<string | null>(null);

  // ── 🎨 自定义画布：推荐为空/不满意时的逃生舱，绝不卡死用户 ──
  const handleCustomCanvas = async () => {
    if (!tags?.destination || canvasCreating) return;
    setCanvasCreating(true);
    setCanvasError(null);
    try {
      const res = await fetch("/api/trips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          destination: tags.destination,
          tags,
          rawUserText: transcript,
          // 2.0：已选卡片随身带入行程（卡片池 + 打卡清单的数据源），画布骨架不受影响
          // location 必须保留（P4 地图标注与坐标注入的数据源）
          selectedCards: selectedContent.map((c) => ({ id: c.id, title: c.title, description: c.description, reason: c.reason, location: c.location, category: c.category })),
          selectedFoods: [],
          isCustomCanvas: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "创建失败");
      reset(); // 🧹 行程已生成并落库，静默清空本地草稿
      router.push(`/trip/${data.trip.id}`);
    } catch (e) {
      console.error("[discover] custom canvas failed:", e);
      setCanvasError(e instanceof Error ? e.message : "画布生成失败，请再试一次");
      setCanvasCreating(false);
    }
  };

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
  // P3 性能修复：同 category+参数的请求在途时去重（mount 时「分类 effect」与「预加载 effect」会重复触发 attraction）
  const inFlightCatsRef = useRef<Set<string>>(new Set());
  const loadCategory = useCallback(async (category: DiscoverCategory) => {
    if (!destination) return;
    const flightKey = category;
    if (inFlightCatsRef.current.has(flightKey)) return; // 🚀 同一请求在途，直接跳过
    inFlightCatsRef.current.add(flightKey);
    setLoading(true);
    setPendingCats((prev) => new Set(prev).add(category));
    try {
      // E4.5：美食细分类筛选已删除（UI 层），recommend API 的 mealType/cuisine 入参保留兼容
      const body: any = { destination, tags, category };
      if (selectedLocations.length > 0 && category !== "attraction") body.selectedLocations = selectedLocations;
      const res = await fetch("/api/recommend", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      // 推荐失败原因透传（如高德 Key 异常/超时），便于 UI 展示与排查
      setRecommendError(data._error ?? null);
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
      loadedCatsRef.current.add(category);
    } catch (e) { console.warn("[discover]", e); }
    finally {
      inFlightCatsRef.current.delete(flightKey);
      setLoading(false);
      setPendingCats((prev) => { const next = new Set(prev); next.delete(category); return next; });
    }
  }, [destination, tags, selectedLocations]);

  // 分类变化时：已缓存的直接 0ms 读取，未缓存的才请求
  useEffect(() => {
    if (!_hydrated || !destination) return;
    if (loadedCatsRef.current.has(activeCategory)) return; // 🚀 缓存命中，0ms
    loadCategory(activeCategory);
  }, [_hydrated, destination, activeCategory]);

  // 🚀 进场即并发预加载全部 3 个分类（各自独立 serverless 调用，互不阻塞）
  useEffect(() => {
    if (!_hydrated || !destination || prefetchFiredRef.current) return;
    prefetchFiredRef.current = true;
    Promise.all(
      (["attraction", "food", "souvenir"] as DiscoverCategory[]).map((c) => loadCategory(c))
    );
  }, [_hydrated, destination, loadCategory]);

  useEffect(() => { setSelectedIds(new Set(selectedContent.map((c) => c.id))); }, [selectedContent]);

  // 📷 截图 OCR 联动：识别出的地名默认作为已选卡片置顶；追加上传的地名会自动蹦入
  useEffect(() => {
    if (!_hydrated || screenshotPlaces.length === 0) return;
    for (const name of screenshotPlaces) {
      const id = `shot-${name}`;
      if (dismissedShotsRef.current.has(name)) continue;
      if (selectedContent.some((c) => c.id === id)) continue;
      addContentCard({
        id,
        title: name,
        description: "来自你的截图",
        reason: "截图中识别出的地点",
        category: "attraction",
        status: "selected",
      });
    }
  }, [_hydrated, screenshotPlaces, selectedContent, addContentCard]);

  // 📷 截图卡片点击切换（加回/移除）
  const handleShotToggle = (name: string) => {
    const id = `shot-${name}`;
    if (selectedContent.some((c) => c.id === id)) {
      dismissedShotsRef.current.add(name);
      removeContentCard(id);
    } else {
      dismissedShotsRef.current.delete(name);
      addContentCard({
        id,
        title: name,
        description: "来自你的截图",
        reason: "截图中识别出的地点",
        category: "attraction",
        status: "selected",
      });
    }
  };

  // 🎙️ 语音补充地点（2.0：P3 不再传截图，直接说「我一定要去外滩和黄浦江」）
  const voiceMediaRef = useRef<MediaRecorder | null>(null);
  const voiceChunksRef = useRef<Blob[]>([]);
  const [voiceRecording, setVoiceRecording] = useState(false);
  const [voiceProcessing, setVoiceProcessing] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);

  const processVoice = async (blob: Blob) => {
    setVoiceProcessing(true);
    setVoiceError(null);
    try {
      const fd = new FormData();
      fd.append("file", blob);
      const asrRes = await fetch("/api/asr", { method: "POST", body: fd });
      const asrData = await asrRes.json();
      if (!asrRes.ok) throw new Error(asrData.error ?? "转写失败");
      const text = (asrData.text || "").trim();
      if (!text) throw new Error("没听清，请再说一次");

      const res = await fetch("/api/extract-places", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, destination }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "识别失败");
      const places: { name: string; address?: string; lng?: number; lat?: number }[] = data.places ?? [];
      if (places.length === 0) throw new Error("没有识别出具体地点，可以说「我想去XX」试试");
      for (const p of places) {
        const id = `voice-${p.name}`;
        if (p.lng && p.lat) poiCoordsRef.current.set(id, { lng: p.lng, lat: p.lat });
        if (!selectedContent.some((c) => c.id === id)) {
          addContentCard({
            id,
            title: p.name,
            description: p.address || "语音补充的地点",
            reason: "你语音说要去的",
            category: "attraction",
            status: "selected",
            // E1b：已有坐标必须进 selectedContent（此前只进页面内存 ref，刷新即丢，P4 地图/距离无数据）
            location: p.lng && p.lat ? { lng: p.lng, lat: p.lat, address: p.address } : undefined,
          });
        }
      }
    } catch (e) {
      setVoiceError(e instanceof Error ? e.message : "语音识别失败");
    } finally {
      setVoiceProcessing(false);
    }
  };

  const startVoice = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      voiceChunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) voiceChunksRef.current.push(e.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(voiceChunksRef.current, { type: "audio/webm" });
        await processVoice(blob);
      };
      voiceMediaRef.current = recorder;
      recorder.start();
      setVoiceRecording(true);
      setVoiceError(null);
    } catch (e) {
      setVoiceError(getMicErrorMessage(e));
    }
  };

  const stopVoice = () => { voiceMediaRef.current?.stop(); setVoiceRecording(false); };

  const handleToggle = (card: PoiCardData) => {
    if (selectedIds.has(card.id)) { removeContentCard(card.id); }
    else {
      const coords = poiCoordsRef.current.get(card.id);
      // E1b 坐标统一：推荐卡坐标源为 WGS84（lib/amap.ts 转过），入库一律转 GCJ-02（高德原生坐标系），
      // 与语音卡（原生 GCJ-02）保持同一规范。仅 rec-* 推荐卡走 handleToggle，语音/截图卡不经此路径。
      const stored = coords && card.id.startsWith("rec-") ? wgs84ToGcj02(coords.lng, coords.lat) : coords;
      addContentCard({ id: card.id, title: card.name, description: card.description || card.address || "", reason: card.description || "推荐", category: card.category as any, status: "selected", tags: [], suitableFor: [], location: stored ? { lat: stored.lat, lng: stored.lng, address: card.address } : undefined });
    }
  };

  const currentCards = (allCards[activeCategory] || []).map((c) => ({ ...c, selected: selectedIds.has(c.id) }));
  const activeColor = CATEGORY_MARKER_COLORS[activeCategory];

  // ── 选择数量校验 ──
  const days = tags?.days || 3;

  const handleGoBuilder = () => {
    // 2.0：不再去 builder 页，直接生成骨架行程（交通+酒店预留），进攻略卡页拖拽排程
    handleCustomCanvas();
  };

  if (!_hydrated) return null;

  return (
    <div className="flex flex-col min-h-screen bg-parchment/30">
      {/* ── 地图区 ── */}
      <div className="relative">
        <AmapView markers={markers} city={destination} className="w-full h-[38vh]" />
        <div className="absolute top-3 left-3 right-3 flex items-center justify-between pointer-events-none">
          <GlassCard className="inline-flex items-center gap-2 px-3 py-1.5 shadow-sm">
            <MapPin className="w-3.5 h-3.5 text-vibe-sea" />
            <span className="text-sm font-medium text-charcoal">{destination || "选择地点"}</span>
            {tags?.days && <span className="text-xs text-muted">{tags.days}天</span>}
          </GlassCard>
          {selectedContent.length > 0 && (
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="pointer-events-auto">
              <button onClick={handleCustomCanvas} className="flex items-center gap-1.5 bg-gradient-to-r from-vibe-sea to-vibe-dusk text-white rounded-full px-4 py-2 shadow-lg text-sm font-medium">
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

      {/* ── 📷 根据你的截图识别出的地点 ── */}
      {screenshotPlaces.length > 0 && (
        <div className="px-4 mt-2">
          <GlassCard className="px-4 py-2.5">
            <p className="text-xs font-medium text-charcoal/80 mb-1.5">
              📷 根据你的截图识别出的地点
              <span className="text-muted/60 font-normal ml-1">已默认帮你选上，点可取消</span>
            </p>
            <div className="flex flex-wrap gap-1.5">
              {screenshotPlaces.map((name) => {
                const isOn = selectedContent.some((c) => c.id === `shot-${name}`);
                return (
                  <button
                    key={name}
                    onClick={() => handleShotToggle(name)}
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs transition-colors ${
                      isOn
                        ? "bg-gradient-to-r from-vibe-sea to-vibe-dusk text-white shadow-sm"
                        : "bg-white/60 text-muted border border-charcoal/10"
                    }`}
                  >
                    {isOn && <Check className="w-3 h-3" />}
                    {name}
                  </button>
                );
              })}
            </div>
          </GlassCard>
        </div>
      )}

      {/* ── 🛎️ 数据守护横幅 ── */}
      {(transcript || screenshotPlaces.length > 0) && (
        <div className="px-4 mt-2">
          <p className="text-[11px] text-muted/70 text-center leading-relaxed">
            🛎️ 旅行管家：您之前导入的截图和语音已安全存入本地，随时可以返回首页追加新想法，我们为您守护数据。
          </p>
        </div>
      )}

      {/* ── 🎙️ 语音补充地点（2.0 场景三主入口） ── */}
      <div className="px-4 mt-2">
        <button
          onClick={voiceRecording ? stopVoice : startVoice}
          disabled={voiceProcessing}
          className={`w-full py-2.5 rounded-2xl text-sm font-medium transition-all flex items-center justify-center gap-2 ${
            voiceRecording
              ? "bg-red-100 text-red-600 border border-red-300"
              : "bg-white/70 text-charcoal/80 border border-vibe-dusk/25 hover:bg-white shadow-sm"
          } disabled:opacity-60`}
        >
          {voiceProcessing ? (
            <>
              <span className="w-3.5 h-3.5 animate-spin rounded-full border-2 border-vibe-dusk/30 border-t-vibe-dusk" />
              正在识别你说的地方…
            </>
          ) : voiceRecording ? (
            <>
              <Square className="w-3.5 h-3.5 fill-red-500 text-red-500 animate-pulse" />
              录音中…说完点这里结束
            </>
          ) : (
            <>
              <Mic className="w-4 h-4 text-vibe-dusk" />
              语音补充想去的地点（如：我一定要去外滩和黄浦江）
            </>
          )}
        </button>
        {voiceError && <p className="text-[11px] text-red-500/90 mt-1 text-center">{voiceError}</p>}
      </div>

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

      {/* ── 内容区 ── */}
      <div className="flex-1 px-4 py-4 space-y-3 pb-28">
        <p className="text-xs text-muted/70">{CAT_DESC[activeCategory]}</p>

        {(loading || pendingCats.has(activeCategory)) ? (
          <div className="space-y-2.5">
            {/* ── P3 加载文案（A3）：明确告诉用户系统正在工作，避免误以为卡死 ── */}
            <div className="flex items-center gap-2 px-1 pt-1 pb-0.5">
              <div className="w-3.5 h-3.5 rounded-full border-2 border-vibe-sea/30 border-t-vibe-sea animate-spin shrink-0" />
              <p className="text-xs text-muted/80">
                {activeCategory === "attraction" ? "正在为你寻找适合的景点…"
                  : activeCategory === "food" ? "正在为你寻找适合的美食…"
                  : activeCategory === "souvenir" ? "正在为你挑选伴手礼…"
                  : "正在为你加载…"}
              </p>
            </div>
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
          <div className="space-y-3">
            {/* ── 🎙️ 2.0：P3 不再传截图，引导用户用语音直接说想去的地点 ── */}
            <GlassCard className="py-5 px-5 text-center">
              <div className="text-2xl mb-1.5">🎙️</div>
              <p className="text-sm font-medium text-charcoal/85">没有心仪的推荐？直接说出你想去的地方！</p>
              <p className="text-xs text-muted/60 mt-1.5 leading-relaxed">
                点上方麦克风，说「我想去外滩、黄浦江」，
                <br />
                地点会立刻加入你的已选卡片。
              </p>
            </GlassCard>
            {recommendError && (
              <p className="text-[11px] text-amber-600/90 text-center leading-relaxed">
                （推荐接口刚才出了点小状况：{recommendError}）
              </p>
            )}

            {/* ── 或：纯空白画布（场景一：纯粹的自主规划者） ── */}
            <GlassCard className="py-6 px-5 text-center">
              <p className="text-sm font-medium text-charcoal/80">一张截图都没准备？试试开启「自定义画布」吧！</p>
              <p className="text-xs text-muted/70 mt-2 leading-relaxed">
                我们会保留你规划的往返机票/高铁和预订的酒店，
                <br />
                为你生成一张空白的行程骨架，由你来亲手涂鸦每个时段。
              </p>
              <button
                onClick={handleCustomCanvas}
                disabled={canvasCreating}
                className="mt-4 inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full bg-gradient-to-r from-vibe-sea to-vibe-dusk text-white text-sm font-medium shadow-md active:scale-[0.97] transition-transform disabled:opacity-60"
              >
                {canvasCreating ? (
                  <>正在为你搭建画布…</>
                ) : (
                  <>🎨 一键开启自定义画布，直接去排程</>
                )}
              </button>
              {canvasError && (
                <p className="text-[11px] text-red-500/90 mt-2">{canvasError}</p>
              )}
            </GlassCard>
          </div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div key={activeCategory} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-2.5">
              {currentCards.map((card) => (
                <div key={card.id} id={`card-${card.id}`}>
                  <PoiCard card={card} onToggle={() => handleToggle(card)} />
                </div>
              ))}
            </motion.div>
          </AnimatePresence>
        )}
      </div>

      {/* ── 🎨 常驻画布入口：推荐都不喜欢时的逃生舱 ── */}
      <div className="px-4 pb-2 flex justify-center">
        <button
          onClick={handleCustomCanvas}
          disabled={canvasCreating}
          className="text-xs text-vibe-dusk/70 underline underline-offset-4 decoration-vibe-dusk/30 hover:text-vibe-dusk transition-colors disabled:opacity-50"
        >
          {canvasCreating ? "正在为你搭建画布…" : "🎨 都不喜欢？直接去开启画布"}
        </button>
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

      {/* ── 🎨 画布创建全局遮罩：创建期间阻塞一切交互，消灭「延迟跳转的劫持感」 ── */}
      {canvasCreating && (
        <div className="fixed inset-0 z-50 bg-parchment/80 backdrop-blur-sm flex items-center justify-center">
          <GlassCard className="px-6 py-5 flex flex-col items-center gap-3 mx-6">
            <div className="w-8 h-8 rounded-full border-2 border-vibe-sea/30 border-t-vibe-sea animate-spin" />
            <p className="text-sm font-medium text-charcoal/85">正在为你搭建画布…</p>
            <p className="text-[11px] text-muted/70">往返交通与酒店骨架生成中，完成后自动进入行程画布</p>
          </GlassCard>
        </div>
      )}

      {/* ── 画布创建失败提示（遮罩消失后全局可见，可关闭） ── */}
      {!canvasCreating && canvasError && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 w-[min(92vw,360px)]">
          <GlassCard className="px-4 py-3 flex items-center justify-between gap-2 text-xs">
            <span className="text-red-600">⚠️ {canvasError}</span>
            <button
              onClick={() => setCanvasError(null)}
              className="text-muted/60 hover:text-charcoal transition-colors shrink-0 px-1"
              aria-label="关闭错误提示"
            >✕</button>
          </GlassCard>
        </div>
      )}
    </div>
  );
}
