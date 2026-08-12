"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { GlassCard } from "@/components/layout/glass-card";
import { MeshBackground } from "@/components/layout/mesh-background";
import { BreathButton } from "@/components/voice/breath-button";
import { AmapView, CATEGORY_MARKER_COLORS, type MapMarker } from "@/components/map/amap-view";
import type { VibeTheme, DayPlanItem } from "@/lib/types";
import { getMicErrorMessage } from "@/lib/mic";
import {
  Clock, Bus, Coins, Lightbulb, Sparkles, MapPin,
  ChevronLeft, Home, RotateCcw, Utensils, Mic,
  ChevronDown, Car, Coffee, Bed, CloudSun, Droplets, Wind,
  Share2, Check, Plus, Trash2, Wallet,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface TripData {
  id: string;
  destination: string;
  vibeTheme: string | null;
  preferences: string;
  itineraries: { dayIndex: number; content: string }[];
}

interface WeatherData {
  city: string;
  live?: {
    weather: string;
    temperature: string;
    humidity: string;
    windDirection: string;
    windPower: string;
  };
  forecasts: {
    date: string;
    week: string;
    dayWeather: string;
    dayTemp: number;
    nightTemp: number;
  }[];
}

interface Expense {
  id: string;
  title: string;
  amount: number;
  payer: string;
  shareWith: string; // JSON 数组字符串
}

const SOURCE_ICONS: Record<string, React.ReactNode> = {
  food: <Utensils className="w-3.5 h-3.5" />,
  transport: <Car className="w-3.5 h-3.5" />,
  rest: <Bed className="w-3.5 h-3.5" />,
  selected_card: <MapPin className="w-3.5 h-3.5" />,
  recommended: <Sparkles className="w-3.5 h-3.5" />,
};

const SOURCE_COLORS: Record<string, string> = {
  food: "bg-green-100 text-green-700",
  transport: "bg-blue-100 text-blue-700",
  rest: "bg-purple-100 text-purple-700",
  selected_card: "bg-vibe-sea/20 text-vibe-sea",
  recommended: "bg-amber-100 text-amber-700",
};

export default function TripPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [trip, setTrip] = useState<TripData | null>(null);
  const [loading, setLoading] = useState(true);
  const [adjusting, setAdjusting] = useState(false);
  const [adjustText, setAdjustText] = useState("");
  const [expandedDays, setExpandedDays] = useState<Set<number>>(new Set([1]));
  const [thoughtExpanded, setThoughtExpanded] = useState(true);
  // 🎨 自定义画布：placeholder 占位卡的内联编辑
  const [activePlaceholder, setActivePlaceholder] = useState<string | null>(null);
  const [placeholderText, setPlaceholderText] = useState("");
  // 📍 周边推荐（占位卡沙盒）
  const [nearbyKey, setNearbyKey] = useState<string | null>(null);
  const [nearbyList, setNearbyList] = useState<{ name: string; type: string; distance: number }[]>([]);
  const [nearbyLoading, setNearbyLoading] = useState(false);
  // ── 2.0 攻略卡：可编辑时间轴 + 卡片池 + 打卡清单 ──
  const [editDays, setEditDays] = useState<Record<number, DayPlanItem[]>>({});
  const [pickedCard, setPickedCard] = useState<string | null>(null);
  const dragCardRef = useRef<string | null>(null);
  const [savingDays, setSavingDays] = useState(false);
  const [checkedSpots, setCheckedSpots] = useState<Set<string>>(new Set());
  const [weather, setWeather] = useState<WeatherData | null>(null);
  // 分享
  const [sharing, setSharing] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  // 记账
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [expTitle, setExpTitle] = useState("");
  const [expAmount, setExpAmount] = useState("");
  const [expPayer, setExpPayer] = useState("");
  const [expShareWith, setExpShareWith] = useState("");
  const [expSaving, setExpSaving] = useState(false);

  useEffect(() => {
    fetch(`/api/trips/${id}`)
      .then((r) => r.json())
      .then((d) => {
        setTrip(d.trip);
        // 拿到目的地后查天气
        if (d.trip?.destination) {
          fetch(`/api/weather?destination=${encodeURIComponent(d.trip.destination)}`)
            .then((r) => r.ok ? r.json() : null)
            .then((w) => { if (w && !w.error) setWeather(w); })
            .catch(() => { /* 天气查询失败静默处理 */ });
        }
      })
      .finally(() => setLoading(false));
    // 加载账目
    fetch(`/api/trips/${id}/expenses`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.expenses) setExpenses(d.expenses); })
      .catch(() => { /* 静默 */ });
  }, [id]);

  // ── 2.0 攻略卡：行程加载后初始化可编辑时间轴 ──
  useEffect(() => {
    if (!trip) return;
    const map: Record<number, DayPlanItem[]> = {};
    for (const d of trip.itineraries ?? []) {
      try { map[d.dayIndex] = JSON.parse(d.content); } catch { map[d.dayIndex] = []; }
    }
    setEditDays(map);
  }, [trip]);

  // 打卡清单：按行程持久化到 localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(`hh-checklist-${id}`);
      if (raw) setCheckedSpots(new Set(JSON.parse(raw)));
    } catch { /* ignore */ }
  }, [id]);

  const toggleSpot = (t: string) => {
    setCheckedSpots((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t); else next.add(t);
      try { localStorage.setItem(`hh-checklist-${id}`, JSON.stringify(Array.from(next))); } catch { /* ignore */ }
      return next;
    });
  };

  const persistDays = async (daysMap: Record<number, DayPlanItem[]>) => {
    setSavingDays(true);
    try {
      await fetch(`/api/trips/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          days: Object.entries(daysMap).map(([dayIndex, items]) => ({ dayIndex: Number(dayIndex), items })),
        }),
      });
    } catch { /* 静默 */ } finally { setSavingDays(false); }
  };

  // 把卡片池中的卡放进某天某小时（同一地点重复放置会自动移动）
  const placeCard = (dayIndex: number, hour: number, title: string) => {
    const next = { ...editDays };
    const items = (next[dayIndex] ?? []).filter((it) => it.activity !== title);
    items.push({
      time: `${String(hour).padStart(2, "0")}:00`,
      activity: title,
      source: "selected_card",
    });
    items.sort((a, b) => (a.time || "").localeCompare(b.time || ""));
    next[dayIndex] = items;
    setEditDays(next);
    setPickedCard(null);
    persistDays(next);
  };

  const removePlacedItem = (dayIndex: number, title: string) => {
    const next = { ...editDays };
    next[dayIndex] = (next[dayIndex] ?? []).filter((it) => it.activity !== title);
    setEditDays(next);
    persistDays(next);
  };

  // ── 分享 ──
  const handleShare = async () => {
    setSharing(true);
    try {
      const res = await fetch(`/api/trips/${id}/share`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "分享失败");
      const url = `${window.location.origin}/share/${data.shareToken}`;
      await navigator.clipboard.writeText(url);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2500);
    } catch (e) {
      alert(e instanceof Error ? e.message : "分享失败");
    } finally {
      setSharing(false);
    }
  };

  // ── 记账 ──
  const handleAddExpense = async () => {
    const amount = parseFloat(expAmount);
    const shareList = expShareWith.split(/[,，、\s]+/).map((s) => s.trim()).filter(Boolean);
    if (!expTitle.trim() || !amount || amount <= 0 || !expPayer.trim() || shareList.length === 0) {
      alert("请完整填写：项目、金额、付款人、分摊人（用逗号分隔）");
      return;
    }
    setExpSaving(true);
    try {
      const res = await fetch(`/api/trips/${id}/expenses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: expTitle.trim(),
          amount,
          payer: expPayer.trim(),
          shareWith: shareList,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "保存失败");
      setExpenses((prev) => [...prev, data.expense]);
      setExpTitle(""); setExpAmount(""); setExpPayer(""); setExpShareWith("");
      setShowExpenseForm(false);
    } catch (e) {
      alert(e instanceof Error ? e.message : "保存失败");
    } finally {
      setExpSaving(false);
    }
  };

  const handleDeleteExpense = async (expenseId: string) => {
    try {
      await fetch(`/api/trips/${id}/expenses?expenseId=${expenseId}`, { method: "DELETE" });
      setExpenses((prev) => prev.filter((e) => e.id !== expenseId));
    } catch { /* 静默 */ }
  };

  // 分账计算：每人应付多少、谁该给谁转钱
  const settlement = (() => {
    if (expenses.length === 0) return null;
    const paid: Record<string, number> = {};   // 每人实际付了多少
    const owed: Record<string, number> = {};   // 每人应该分摊多少
    expenses.forEach((e) => {
      let shares: string[] = [];
      try { shares = JSON.parse(e.shareWith); } catch { /* ignore */ }
      if (shares.length === 0) return;
      paid[e.payer] = (paid[e.payer] ?? 0) + e.amount;
      const per = e.amount / shares.length;
      shares.forEach((p) => { owed[p] = (owed[p] ?? 0) + per; });
    });
    const people = Array.from(new Set([...Object.keys(paid), ...Object.keys(owed)]));
    // 净额 = 实付 - 应付（正=别人欠他，负=他欠别人）
    const net = people.map((p) => ({
      person: p,
      net: Math.round(((paid[p] ?? 0) - (owed[p] ?? 0)) * 100) / 100,
    }));
    // 简化结算：欠钱的人向被欠的人转
    const debtors = net.filter((n) => n.net < -0.01).sort((a, b) => a.net - b.net);
    const creditors = net.filter((n) => n.net > 0.01).sort((a, b) => b.net - a.net);
    const transfers: { from: string; to: string; amount: number }[] = [];
    const d = debtors.map((x) => ({ ...x }));
    const c = creditors.map((x) => ({ ...x }));
    let i = 0, j = 0;
    while (i < d.length && j < c.length) {
      const amount = Math.min(-d[i].net, c[j].net);
      if (amount > 0.01) {
        transfers.push({ from: d[i].person, to: c[j].person, amount: Math.round(amount * 100) / 100 });
      }
      d[i].net += amount;
      c[j].net -= amount;
      if (d[i].net > -0.01) i++;
      if (c[j].net < 0.01) j++;
    }
    const total = expenses.reduce((s, e) => s + e.amount, 0);
    return { net, transfers, total: Math.round(total * 100) / 100 };
  })();

  // ── 解析所有 POI 坐标用于地图 ──
  const allMarkers: MapMarker[] = [];
  const allPoiNames = new Set<string>();

  if (trip) {
    [...(trip.itineraries ?? [])]
      .sort((a, b) => a.dayIndex - b.dayIndex)
      .forEach((day) => {
        try {
          const items = JSON.parse(day.content) as (DayPlanItem & {
            source?: string;
            recommendedDish?: string;
            lng?: number;
            lat?: number;
          })[];
          items.forEach((item, i) => {
            if (item.lng && item.lat && !allPoiNames.has(item.activity)) {
              allPoiNames.add(item.activity);
              const cat = item.source === "food" ? "food" : item.source === "rest" ? "hotel" : "attraction";
              allMarkers.push({
                id: `day${day.dayIndex}-${i}`,
                name: item.activity,
                lng: item.lng,
                lat: item.lat,
                category: cat,
                color: CATEGORY_MARKER_COLORS[cat] || "#6B7280",
              });
            }
          });
        } catch { /* ignore parse errors */ }
      });
  }

  // ── 语音调整 ──
  const handleVoiceAdjust = useCallback(async (transcript: string) => {
    if (!transcript.trim()) return;
    setAdjusting(true);
    setAdjustText(transcript);
    try {
      const res = await fetch(`/api/trips/${id}/adjust`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adjustment: transcript }),
      });
      if (!res.ok) throw new Error("调整失败");
      // 重新加载行程
      const reload = await fetch(`/api/trips/${id}`);
      const d = await reload.json();
      setTrip(d.trip);
    } catch (e) {
      console.warn("[trip] voice adjust failed:", e);
    } finally {
      setAdjusting(false);
      setAdjustText("");
    }
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-4 border-vibe-dusk/30 border-t-vibe-dusk rounded-full animate-spin" />
      </div>
    );
  }

  if (!trip) {
    return <p className="text-center text-muted py-10">行程不存在</p>;
  }

  const theme = (trip.vibeTheme as VibeTheme) ?? "dusk";

  // 解析偏好
  let title = "";
  let overview = "";
  let travelTips: string[] = [];
  let planningThought = "";
  let prefSelectedCards: { title?: string }[] = [];
  try {
    const pref = JSON.parse(trip.preferences);
    title = pref.title ?? "";
    overview = pref.overview ?? "";
    travelTips = pref.travelTips ?? [];
    planningThought = pref.planningThought ?? "";
    prefSelectedCards = Array.isArray(pref.selectedCards) ? pref.selectedCards : [];
  } catch { /* ignore */ }
  const displayTitle = title || `${trip.destination} · 我的旅行攻略`;

  // ── 2.0 攻略卡：卡片池 = 已选卡片 - 已排入时间轴的 ──
  const selectedCardTitles: string[] = prefSelectedCards.map((c) => c?.title).filter(Boolean) as string[];
  const usedTitles = new Set(Object.values(editDays).flat().map((it: any) => it?.activity).filter(Boolean));
  const cardPool = selectedCardTitles.filter((t) => !usedTitles.has(t));
  const totalExpenseAmount = expenses.reduce((s, e) => s + e.amount, 0);

  const sortedDays = [...(trip.itineraries ?? [])].sort((a, b) => a.dayIndex - b.dayIndex);

  const toggleDay = (dayIndex: number) => {
    setExpandedDays((prev) => {
      const next = new Set(prev);
      if (next.has(dayIndex)) next.delete(dayIndex);
      else next.add(dayIndex);
      return next;
    });
  };

  return (
    <>
      <MeshBackground theme={theme} />
      <div className="relative flex flex-col min-h-[calc(100vh-8rem)]">
        {/* ── 顶部导航 ── */}
        <div className="sticky top-0 z-20 bg-parchment/80 backdrop-blur-md px-4 py-3 flex items-center justify-between border-b border-white/40">
          <button onClick={() => router.back()} className="flex items-center gap-1.5 text-sm text-muted hover:text-charcoal transition-colors">
            <ChevronLeft className="w-4 h-4" />
            返回
          </button>
          <h1 className="text-sm font-semibold text-charcoal truncate max-w-[60%]">{displayTitle}</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={handleShare}
              disabled={sharing}
              className="flex items-center gap-1 text-xs text-muted hover:text-charcoal transition-colors"
              title="分享行程"
            >
              {shareCopied ? (
                <>
                  <Check className="w-4 h-4 text-green-600" />
                  <span className="text-green-600">已复制</span>
                </>
              ) : (
                <>
                  <Share2 className="w-4 h-4" />
                  <span>分享</span>
                </>
              )}
            </button>
            <button onClick={() => router.push("/trips")} className="text-xs text-muted hover:text-charcoal">
              <Home className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ── 地图区 ── */}
        {allMarkers.length > 0 && (
          <div className="relative">
            <AmapView markers={allMarkers} className="w-full h-[30vh]" />
            <div className="absolute bottom-2 left-3">
              <GlassCard className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs shadow-sm">
                <MapPin className="w-3 h-3 text-vibe-sea" />
                <span>{trip.destination} · {allMarkers.length} 个地点</span>
              </GlassCard>
            </div>
          </div>
        )}

        {/* ── 行程概述 ── */}
        {overview && (
          <div className="px-4 pt-4">
            <GlassCard className="px-4 py-3">
              <div className="flex items-start gap-2">
                <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-vibe-dusk" />
                <p className="text-sm leading-relaxed text-charcoal/80">{overview}</p>
              </div>
            </GlassCard>
          </div>
        )}

        {/* ── ✨ AI 规划心路历程 ── */}
        {planningThought && (
          <div className="px-4 pt-3">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="rounded-2xl border border-amber-200/60 bg-amber-50/50 backdrop-blur-md shadow-sm overflow-hidden"
            >
              <button
                onClick={() => setThoughtExpanded((v) => !v)}
                className="w-full flex items-center justify-between px-4 py-3 text-left"
              >
                <div className="flex items-center gap-2">
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                  <span className="text-xs font-medium text-amber-800/90">
                    🛎️ 旅行管家手记
                  </span>
                </div>
                <ChevronDown
                  className={`w-3.5 h-3.5 text-amber-600/70 transition-transform duration-200 ${
                    thoughtExpanded ? "rotate-180" : ""
                  }`}
                />
              </button>
              <AnimatePresence initial={false}>
                {thoughtExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25 }}
                  >
                    <div className="border-t border-amber-200/40">
                      <p className="px-4 pt-2.5 text-[11px] text-amber-700/60">
                        设计细节与避坑考量
                      </p>
                      <p className="px-4 pb-4 pt-1.5 text-sm italic leading-relaxed text-amber-900/70">
                        {planningThought}
                      </p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          </div>
        )}

        {/* ── 🛎️ 数据守护横幅 ── */}
        <div className="px-4 pt-3">
          <p className="text-[11px] text-muted/70 text-center leading-relaxed">
            🛎️ 旅行管家：您之前导入的截图和语音已安全存入本地，随时可以返回首页追加新想法，我们为您守护数据。
          </p>
        </div>

        {/* ── 天气条 ── */}
        {weather && (weather.live || (weather.forecasts?.length ?? 0) > 0) && (
          <div className="px-4 pt-3">
            <GlassCard className="px-4 py-3">
              <div className="flex items-center gap-2 mb-2">
                <CloudSun className="w-3.5 h-3.5 text-vibe-sea" />
                <span className="text-xs font-medium text-charcoal/80">
                  {weather.city}天气
                </span>
              </div>
              {/* 实况 */}
              {weather.live && (
                <div className="flex items-center gap-4 mb-2 pb-2 border-b border-white/40">
                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-semibold text-charcoal">
                      {weather.live.temperature}°
                    </span>
                    <span className="text-xs text-muted">{weather.live.weather}</span>
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-muted/80">
                    <span className="flex items-center gap-0.5">
                      <Droplets className="w-3 h-3" />
                      {weather.live.humidity}%
                    </span>
                    <span className="flex items-center gap-0.5">
                      <Wind className="w-3 h-3" />
                      {weather.live.windDirection}风 {weather.live.windPower}级
                    </span>
                  </div>
                </div>
              )}
              {/* 预报 */}
              {(weather.forecasts ?? []).length > 0 && (
                <div className="flex gap-1 overflow-x-auto">
                  {(weather.forecasts ?? []).slice(0, 4).map((f) => (
                    <div
                      key={f.date}
                      className="flex-1 min-w-[60px] text-center py-1"
                    >
                      <p className="text-[10px] text-muted/70">
                        {f.date.slice(5)} {f.week}
                      </p>
                      <p className="text-[11px] text-charcoal/80 my-0.5">
                        {f.dayWeather}
                      </p>
                      <p className="text-[11px]">
                        <span className="text-blue-500/80">{f.nightTemp}°</span>
                        <span className="text-muted/40 mx-0.5">/</span>
                        <span className="text-amber-600/90">{f.dayTemp}°</span>
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </GlassCard>
          </div>
        )}

        {/* ── 🧺 待安排卡片池（点选或拖入下方时间轴） ── */}
        {cardPool.length > 0 && (
          <div className="px-4 pt-3">
            <GlassCard className="px-4 py-3">
              <p className="text-xs font-medium text-charcoal/80 mb-2">
                🧺 待安排卡片
                <span className="text-muted/60 font-normal ml-1">点一下选中，再点下方时间轴空格放入（桌面端可直接拖拽）</span>
              </p>
              <div className="flex flex-wrap gap-1.5">
                {cardPool.map((t) => (
                  <button
                    key={t}
                    draggable
                    onDragStart={() => { dragCardRef.current = t; }}
                    onClick={() => setPickedCard(pickedCard === t ? null : t)}
                    className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs transition-all ${
                      pickedCard === t
                        ? "bg-gradient-to-r from-vibe-sea to-vibe-dusk text-white shadow-md scale-105"
                        : "bg-white/70 text-charcoal/80 border border-vibe-dusk/25 hover:bg-white"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </GlassCard>
          </div>
        )}

        {/* ── 📋 每日攻略卡（6:00–24:00 小时级时间轴） ── */}
        <div className="flex-1 px-4 py-4 space-y-3 pb-28">
          {sortedDays.map((day) => {
            const dayItems = (editDays[day.dayIndex] ?? []).filter(
              (it: any) => it?.source !== "placeholder" && it?.activity
            );
            const hourOf = (t?: string) => {
              const m = /^(\d{1,2})/.exec(t || "");
              return m ? parseInt(m[1], 10) : null;
            };
            const itemHours = dayItems.map((it: any) => hourOf(it.time)).filter((h): h is number => h !== null);
            const minHour = Math.min(6, ...(itemHours.length > 0 ? itemHours : [6]));
            const maxHour = Math.max(23, ...(itemHours.length > 0 ? itemHours : [23]));
            const hours = Array.from({ length: maxHour - minHour + 1 }, (_, i) => minHour + i);
            const dayWeather = weather?.forecasts?.[day.dayIndex - 1];

            return (
              <motion.div
                key={day.dayIndex}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: day.dayIndex * 0.08 }}
              >
                <GlassCard className="overflow-hidden">
                  {/* 卡头：Day N · 目的地 */}
                  <div className="flex items-center gap-2 px-4 py-3 border-b border-charcoal/5">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-vibe-sea to-vibe-dusk flex items-center justify-center text-white text-xs font-bold">
                      {day.dayIndex}
                    </div>
                    <span className="text-sm font-semibold text-charcoal">
                      Day {day.dayIndex} · {trip.destination}
                    </span>
                    {savingDays && <span className="text-[10px] text-muted/60 ml-auto">保存中…</span>}
                  </div>

                  <div className="flex flex-col md:flex-row gap-3 p-3">
                    {/* ── 左栏：天气 / 预算 / 打卡清单 ── */}
                    <div className="flex md:flex-col gap-2 md:w-28 shrink-0">
                      <div className="flex-1 rounded-xl bg-sky-50/70 border border-sky-200/50 p-2 text-center">
                        <p className="text-[10px] text-muted/60">天气&amp;温度</p>
                        {dayWeather ? (
                          <>
                            <p className="text-base mt-0.5">
                              {/雨/.test(dayWeather.dayWeather) ? "🌧️" : /雪/.test(dayWeather.dayWeather) ? "❄️" : /阴|云/.test(dayWeather.dayWeather) ? "⛅" : "☀️"}
                            </p>
                            <p className="text-xs font-semibold text-charcoal/85">
                              {dayWeather.nightTemp}°~{dayWeather.dayTemp}°
                            </p>
                            <p className="text-[10px] text-muted/70">{dayWeather.dayWeather}</p>
                          </>
                        ) : (
                          <p className="text-[10px] text-muted/50 mt-1">暂无</p>
                        )}
                      </div>
                      <div className="flex-1 rounded-xl bg-amber-50/70 border border-amber-200/50 p-2 text-center">
                        <p className="text-[10px] text-muted/60">今日预算</p>
                        <p className="text-xs font-semibold text-charcoal/85 mt-0.5">已花 ¥{totalExpenseAmount}</p>
                        <p className="text-[10px] text-muted/50">（全程累计）</p>
                      </div>
                      <div className="flex-1 rounded-xl bg-emerald-50/60 border border-emerald-200/50 p-2">
                        <p className="text-[10px] text-muted/60 text-center mb-1">打卡清单</p>
                        <div className="space-y-0.5">
                          {selectedCardTitles.slice(0, 8).map((t) => (
                            <button key={t} onClick={() => toggleSpot(t)} className="w-full flex items-center gap-1 text-left">
                              <span className="text-[10px]">{checkedSpots.has(t) ? "☑️" : "⬜"}</span>
                              <span className={`text-[10px] leading-tight ${checkedSpots.has(t) ? "line-through text-muted/50" : "text-charcoal/80"}`}>{t}</span>
                            </button>
                          ))}
                          {selectedCardTitles.length === 0 && (
                            <p className="text-[10px] text-muted/40 text-center">无</p>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* ── 右栏：小时级时间轴（重点） ── */}
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] text-muted/60 mb-1">今日行程</p>
                      <div>
                        {hours.map((h) => {
                          const rowItems = dayItems.filter((it: any) => hourOf(it.time) === h);
                          const canPlace = pickedCard !== null;
                          return (
                            <div
                              key={h}
                              onDragOver={(e) => e.preventDefault()}
                              onDrop={() => {
                                if (dragCardRef.current) {
                                  placeCard(day.dayIndex, h, dragCardRef.current);
                                  dragCardRef.current = null;
                                }
                              }}
                              onClick={() => { if (pickedCard) placeCard(day.dayIndex, h, pickedCard); }}
                              className={`flex gap-2 items-start py-1 border-b border-charcoal/5 last:border-0 min-h-[32px] ${
                                canPlace ? "cursor-pointer hover:bg-vibe-sea/5 rounded-lg" : ""
                              }`}
                            >
                              <span className="w-10 shrink-0 text-[10px] font-mono text-muted/60 pt-1">
                                {String(h).padStart(2, "0")}:00
                              </span>
                              <div className="flex-1 flex flex-wrap gap-1.5 items-center">
                                {rowItems.length === 0 ? (
                                  <span className={`text-[11px] ${canPlace ? "text-vibe-sea font-medium" : "text-muted/25"}`}>
                                    {canPlace ? `＋ 点击放入「${pickedCard}」` : "·"}
                                  </span>
                                ) : (
                                  rowItems.map((it: any, idx: number) => {
                                    const fixed = it.source === "transport" || it.source === "rest";
                                    return (
                                      <span
                                        key={idx}
                                        className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs ${
                                          it.source === "transport"
                                            ? "bg-blue-50 border border-blue-200/60 text-blue-800"
                                            : it.source === "rest"
                                            ? "bg-purple-50 border border-purple-200/60 text-purple-800"
                                            : it.source === "food"
                                            ? "bg-green-50 border border-green-200/60 text-green-800"
                                            : "bg-vibe-sea/10 border border-vibe-sea/30 text-charcoal"
                                        }`}
                                      >
                                        {it.source === "transport" ? "🚄" : it.source === "rest" ? "🏨" : it.source === "food" ? "🍜" : "📍"}
                                        <span className="font-medium">{it.activity}</span>
                                        {it.duration && <span className="text-[10px] opacity-60">{it.duration}</span>}
                                        {it.cost && <span className="text-[10px] opacity-60">{it.cost}</span>}
                                        {!fixed && (
                                          <button
                                            onClick={(e) => { e.stopPropagation(); removePlacedItem(day.dayIndex, it.activity); }}
                                            className="ml-0.5 text-muted/50 hover:text-red-500"
                                          >
                                            ×
                                          </button>
                                        )}
                                      </span>
                                    );
                                  })
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </GlassCard>
              </motion.div>
            );
          })}
        </div>

        {/* ── 实用贴士 ── */}
        {travelTips.length > 0 && (
          <div className="px-4 pb-4">
            <GlassCard className="px-4 py-3">
              <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted">
                💡 实用贴士
              </h3>
              <ul className="space-y-1.5">
                {travelTips.map((tip, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-xs text-charcoal/70">
                    <Lightbulb className="mt-0.5 h-3 w-3 shrink-0 text-amber-400" />
                    {tip}
                  </li>
                ))}
              </ul>
            </GlassCard>
          </div>
        )}

        {/* ── 💰 记账分账 ── */}
        <div className="px-4 pt-3 pb-2">
          <GlassCard className="px-4 py-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Wallet className="w-4 h-4 text-vibe-sea" />
                <span className="text-sm font-semibold text-charcoal">记账分账</span>
                {settlement && (
                  <span className="text-xs text-muted">
                    共 ¥{settlement.total}
                  </span>
                )}
              </div>
              <button
                onClick={() => setShowExpenseForm((v) => !v)}
                className="flex items-center gap-1 text-xs text-vibe-sea hover:text-vibe-dusk transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                记一笔
              </button>
            </div>

            {/* 记账表单 */}
            <AnimatePresence>
              {showExpenseForm && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="space-y-2 pb-3 border-b border-white/40 mb-2">
                    <input
                      value={expTitle}
                      onChange={(e) => setExpTitle(e.target.value)}
                      placeholder="消费项目（如：普陀山门票）"
                      className="w-full px-3 py-2 text-sm rounded-lg bg-white/60 border border-charcoal/10 focus:outline-none focus:border-vibe-sea/40"
                    />
                    <div className="flex gap-2">
                      <input
                        value={expAmount}
                        onChange={(e) => setExpAmount(e.target.value)}
                        placeholder="金额"
                        type="number"
                        min="0"
                        step="0.01"
                        className="w-24 px-3 py-2 text-sm rounded-lg bg-white/60 border border-charcoal/10 focus:outline-none focus:border-vibe-sea/40"
                      />
                      <input
                        value={expPayer}
                        onChange={(e) => setExpPayer(e.target.value)}
                        placeholder="付款人"
                        className="flex-1 px-3 py-2 text-sm rounded-lg bg-white/60 border border-charcoal/10 focus:outline-none focus:border-vibe-sea/40"
                      />
                    </div>
                    <input
                      value={expShareWith}
                      onChange={(e) => setExpShareWith(e.target.value)}
                      placeholder="分摊人，用逗号分隔（如：我,爸,妈）"
                      className="w-full px-3 py-2 text-sm rounded-lg bg-white/60 border border-charcoal/10 focus:outline-none focus:border-vibe-sea/40"
                    />
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={handleAddExpense}
                        disabled={expSaving}
                        className="flex-1 py-2 rounded-lg bg-gradient-to-r from-vibe-sea to-vibe-dusk text-white text-xs font-medium disabled:opacity-50"
                      >
                        {expSaving ? "保存中…" : "保存"}
                      </button>
                      <button
                        onClick={() => setShowExpenseForm(false)}
                        className="px-4 py-2 rounded-lg border border-charcoal/10 text-xs text-muted"
                      >
                        取消
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* 账目列表 */}
            {expenses.length === 0 ? (
              <p className="text-xs text-muted/60 py-2">
                还没有记账，点「记一笔」开始记录旅行花费
              </p>
            ) : (
              <div className="space-y-1.5">
                {expenses.map((e) => {
                  let shares: string[] = [];
                  try { shares = JSON.parse(e.shareWith); } catch { /* ignore */ }
                  return (
                    <div key={e.id} className="flex items-center justify-between py-1.5 border-b border-charcoal/5 last:border-0">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-charcoal/90">{e.title}</p>
                        <p className="text-[11px] text-muted/70">
                          {e.payer} 付 · {shares.join("/")} 分摊
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-sm font-medium text-charcoal">¥{e.amount}</span>
                        <button
                          onClick={() => handleDeleteExpense(e.id)}
                          className="text-muted/40 hover:text-red-500 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* 分账结果 */}
            {settlement && settlement.transfers.length > 0 && (
              <div className="mt-3 pt-3 border-t border-white/40">
                <p className="text-xs font-medium text-charcoal/80 mb-2">💸 怎么算钱</p>
                <div className="space-y-1.5">
                  {settlement.transfers.map((t, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <span className="text-charcoal/90 font-medium">{t.from}</span>
                      <span className="text-muted/70 text-xs">转给</span>
                      <span className="text-charcoal/90 font-medium">{t.to}</span>
                      <span className="ml-auto text-vibe-sea font-semibold">¥{t.amount}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {settlement.net.map((n) => (
                    <span
                      key={n.person}
                      className={`text-[11px] px-2 py-0.5 rounded-full ${
                        n.net > 0.01
                          ? "bg-green-100 text-green-700"
                          : n.net < -0.01
                          ? "bg-amber-100 text-amber-700"
                          : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {n.person} {n.net > 0.01 ? `+¥${n.net}` : n.net < -0.01 ? `-¥${Math.abs(n.net)}` : "已平"}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </GlassCard>
        </div>

        {/* ── 🆕 语音调整 —— 呼吸按钮 ── */}
        <motion.div
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="fixed bottom-24 right-4 z-30"
        >
          <BreathButton
            isRecording={adjusting}
            disabled={false}
            onStart={async () => {
              // 启动语音识别
              try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                const recorder = new MediaRecorder(stream);
                const chunks: Blob[] = [];
                recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
                recorder.onstop = async () => {
                  stream.getTracks().forEach((t) => t.stop());
                  const blob = new Blob(chunks, { type: "audio/webm" });
                  const fd = new FormData();
                  fd.append("file", blob);
                  try {
                    const res = await fetch("/api/asr", { method: "POST", body: fd });
                    const data = await res.json();
                    if (data.text) await handleVoiceAdjust(data.text);
                  } catch { /* ignore */ }
                };
                recorder.start();
                // 5 秒后自动停止
                setTimeout(() => {
                  if (recorder.state === "recording") recorder.stop();
                }, 5000);
              } catch (e) {
                alert(getMicErrorMessage(e));
              }
            }}
            onStop={() => { /* recorder auto-stops */ }}
          />
        </motion.div>

        {/* ── 底部导航 ── */}
        <div className="px-4 pb-6 pt-2 flex gap-2">
          <button
            onClick={() => router.push("/discover")}
            className="flex-1 py-2.5 rounded-xl border border-charcoal/10 text-sm text-muted hover:bg-white/50 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5 inline mr-1" />
            再规划一次
          </button>
          <button
            onClick={() => router.push("/trips")}
            className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-vibe-sea to-vibe-dusk text-white text-sm font-medium shadow-md hover:shadow-lg transition-all"
          >
            <Home className="w-3.5 h-3.5 inline mr-1" />
            我的攻略
          </button>
        </div>
      </div>
    </>
  );
}
