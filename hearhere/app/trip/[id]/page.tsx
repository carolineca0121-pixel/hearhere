"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { GlassCard } from "@/components/layout/glass-card";
import { MeshBackground } from "@/components/layout/mesh-background";
import { BreathButton } from "@/components/voice/breath-button";
import { AmapView, CATEGORY_MARKER_COLORS, type MapMarker } from "@/components/map/amap-view";
import type { VibeTheme, DayPlanItem } from "@/lib/types";
import type { NormalizeResult } from "@/lib/plan-normalizer";
import { suggestionFingerprint, resultToSuggestions, readSuggestionsFromPreferences, suggestionLabel, suggestedTimeToPeriod, type AiSuggestions } from "@/lib/suggestions";
import { occupiedIntervalsFor, minutesToTime, intervalOverlaps, timeToMinutes } from "@/lib/duration";
import { inMealWindow } from "@/lib/plan-normalizer";
import { isOutdoorishCard } from "@/lib/planning-rules";
import { haversineKm, FAR_PAIR_KM } from "@/lib/geo";
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

// === E1B-CONTRACT-HELPERS-BEGIN ===
// E1b 数据契约：卡片身份匹配。cardId 优先，title 兜底旧数据（勿改动规则，ad-hoc 校验脚本会抽取本段实测）
type PoolCard = {
  id?: string;
  title: string;
  description?: string;
  reason?: string;
  category?: string; // E4.5：「我的选择」按类别分组（attraction/food/souvenir；缺失默认景点组）
  location?: { lng?: number; lat?: number; address?: string };
};
/** 已放置项 vs 卡片池卡：item 带 cardId 时必须精确匹配（同名不同卡不误伤）；item 不带时按 title 兜底（兼容旧 trip） */
function placedItemMatchesCard(
  item: { cardId?: string; activity?: string },
  card: { id?: string; title: string }
): boolean {
  if (item.cardId && card.id) return item.cardId === card.id;
  return (item.activity ?? "") === card.title;
}
/** 两个已放置项是否同一项（removePlacedItem 用）：任一方有 cardId 就只按 cardId，双方都没有才按 title（旧行为） */
function samePlacedItem(
  a: { cardId?: string; activity?: string },
  b: { cardId?: string; activity?: string }
): boolean {
  if (a.cardId || b.cardId) return Boolean(a.cardId && b.cardId && a.cardId === b.cardId);
  return (a.activity ?? "") === (b.activity ?? "");
}
// === E1B-CONTRACT-HELPERS-END ===

// === DURATION-OCCUPANCY-HELPERS（P4 时间轴按持续时长占位；解析逻辑单一来源 = lib/duration） ===
/** UI 占位口径：用 minHours（保守最少占用）。规划/冲突口径在 lib/duration 用 maxHours。 */
function continuationMapFor(items: DayPlanItem[]): Map<number, { title: string; until: string; source?: string }> {
  const map = new Map<number, { title: string; until: string; source?: string }>();
  for (const iv of occupiedIntervalsFor(items, 0, false)) {
    const startH = Math.floor(iv.startMin / 60);
    for (let h = startH + 1; h * 60 < iv.endMin; h++) {
      map.set(h, { title: iv.label, until: minutesToTime(iv.endMin), source: iv.source });
    }
  }
  return map;
}
// === DURATION-OCCUPANCY-HELPERS-END ===

/** E2：语音全量调整入口开关。/adjust 语义是 LLM 全量重生成并覆盖画布，
 *  在 Copilot（提案制）替代它之前保持 false。恢复入口只需改回 true。 */
const VOICE_ADJUST_ENABLED = false;

export default function TripPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [trip, setTrip] = useState<TripData | null>(null);
  const [loading, setLoading] = useState(true);
  const [adjusting, setAdjusting] = useState(false);
  const [adjustText, setAdjustText] = useState("");
  const [expandedDays, setExpandedDays] = useState<Set<number>>(new Set([1]));
  const [thoughtExpanded, setThoughtExpanded] = useState(false); // E4.5 Phase 6-1：L2 状态条默认收起
  const [weatherExpanded, setWeatherExpanded] = useState(false); // E4.5 Phase 6-1：天气默认紧凑单行，点击展开预报
  // 🎨 自定义画布：placeholder 占位卡的内联编辑
  const [activePlaceholder, setActivePlaceholder] = useState<string | null>(null);
  const [placeholderText, setPlaceholderText] = useState("");
  // 📍 周边推荐（占位卡沙盒）
  const [nearbyKey, setNearbyKey] = useState<string | null>(null);
  const [nearbyList, setNearbyList] = useState<{ name: string; type: string; distance: number }[]>([]);
  const [nearbyLoading, setNearbyLoading] = useState(false);
  // ── 2.0 攻略卡：可编辑时间轴 + 卡片池 ──
  const [editDays, setEditDays] = useState<Record<number, DayPlanItem[]>>({});
  const [pickedCard, setPickedCard] = useState<PoolCard | null>(null);
  const dragCardRef = useRef<PoolCard | null>(null);
  const [savingDays, setSavingDays] = useState(false);
  // E3-3：AI 自动规划状态机（idle/planning/failed）+ 失败类别（plan=LLM失败 / save=落库失败）+ 空结果轻提示
  const [planState, setPlanState] = useState<"idle" | "planning" | "failed">("idle");
  const [planErrorKind, setPlanErrorKind] = useState<"" | "plan" | "save">("");
  const [planNotice, setPlanNotice] = useState<"" | "empty">(""); // 空规划轻提示
  // 时间冲突提示（用户手动放置与占用区间冲突时；允许保留，但必须可见）
  const [conflictNotice, setConflictNotice] = useState("");
  useEffect(() => {
    if (!conflictNotice) return;
    const t = setTimeout(() => setConflictNotice(""), 6000);
    return () => clearTimeout(t);
  }, [conflictNotice]);
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

  // ── E4.5 Phase 2：trip 加载后读取/生成 AI 建议（建议层与时间轴解耦，无需等 editDays） ──
  // 已有建议且 fingerprint 匹配 → 直接复用（不调 LLM）；否则生成一次。
  useEffect(() => {
    if (!trip) return;
    if (planAutoDoneRef.current) return;
    const existing = readSuggestionsFromPreferences(trip.preferences);
    if (existing && existing.fingerprint === currentFingerprint) {
      setAiSuggestions(existing);
      planAutoDoneRef.current = true;
      return;
    }
    planAutoDoneRef.current = true;
    void runAiPlan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip]);

  // E3-3：返回值标识 PUT 是否成功（AI 自动规划必须区分「规划失败」与「保存失败」）；
  // 原有调用方（placeCard/removePlacedItem）忽略返回值，行为不变。
  const persistDays = async (daysMap: Record<number, DayPlanItem[]>): Promise<boolean> => {
    setSavingDays(true);
    try {
      const res = await fetch(`/api/trips/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          days: Object.entries(daysMap).map(([dayIndex, items]) => ({ dayIndex: Number(dayIndex), items })),
        }),
      });
      return res.ok;
    } catch {
      return false;
    } finally { setSavingDays(false); }
  };

  // 把卡片池中的卡放进某天某小时（同一地点重复放置会自动移动）
  // E1b：接收完整卡片，写入 cardId/origin/lng/lat（activity 用卡片原始 title，坐标从 selectedCards.location 复制）
  // 冲突策略：允许放置（用户主权），但与已占用区间（交通等长项）冲突时给出明确警告并打 userOverride 标记
  // E4.5 Gate：cardId 在整个行程内唯一——放置前从「所有 Day」移除该卡旧位置（移动语义，不是复制）
  // E4.5 Phase 3-2：放置时检查 天气/饭点/距离——全部 warning-only，永不阻止用户
  const placeCard = (dayIndex: number, hour: number, card: PoolCard) => {
    const next = { ...editDays };
    for (const d of Object.keys(next)) {
      next[Number(d)] = (next[Number(d)] ?? []).filter((it) => !placedItemMatchesCard(it, card));
    }
    const items = next[dayIndex] ?? [];
    const startMin = hour * 60;
    const timeStr = `${String(hour).padStart(2, "0")}:00`;

    const warns: string[] = [];
    // ① 交通占用冲突（既有）
    const conflict = occupiedIntervalsFor(items, dayIndex, true)
      .find((iv) => intervalOverlaps(startMin, 60, iv));
    if (conflict) {
      warns.push(`与「${conflict.label}」（${minutesToTime(conflict.startMin)}-${minutesToTime(conflict.endMin)}）时间冲突`);
    }
    // ② 天气：目标日预报不利 + 户外型卡片（Day N ≈ 预报第 N 天，无具体日期时的近似，仅提示）
    const fc = weather?.forecasts?.[dayIndex - 1];
    if (fc && /雨|雪|雷|冰雹/.test(fc.dayWeather) && isOutdoorishCard({ category: card.category, title: card.title, description: card.description })) {
      warns.push(`Day ${dayIndex} 白天${fc.dayWeather}，「${card.title}」属于户外安排，建议考虑调整日期或准备雨具`);
    }
    // ③ 饭点：美食卡落在窗外 / 非美食卡占用午晚餐时段
    const lunch = startMin >= 11 * 60 && startMin < 13.5 * 60;
    const dinner = startMin >= 17.5 * 60 && startMin < 19.5 * 60;
    if (card.category === "food" && !inMealWindow(timeStr)) {
      warns.push(`「${card.title}」安排在 ${timeStr}，不在常规用餐时段，建议留意`);
    } else if (card.category !== "food" && (lunch || dinner)) {
      warns.push(`${timeStr} 接近${lunch ? "午" : "晚"}餐时段，建议预留用餐时间`);
    }
    // ④ 距离：与当天前一有坐标的活动直线距离过远
    if (card.location?.lng != null && card.location?.lat != null) {
      const prev = items
        .filter((it) => it.lng != null && it.lat != null && timeToMinutes(it.time) !== null && (timeToMinutes(it.time) as number) <= startMin)
        .sort((a, b) => (timeToMinutes(b.time) ?? 0) - (timeToMinutes(a.time) ?? 0))[0];
      if (prev) {
        const km = haversineKm({ lng: prev.lng, lat: prev.lat }, card.location);
        if (km !== null && km > FAR_PAIR_KM) {
          warns.push(`这里距离上一站「${prev.activity}」直线约 ${km.toFixed(0)}km，当天移动可能较赶`);
        }
      }
    }

    items.push({
      time: timeStr,
      activity: card.title,
      source: "selected_card",
      ...(card.id ? { cardId: card.id } : {}),
      origin: "user",
      ...(warns.length > 0 ? { userOverride: true } : {}),
      ...(card.location?.lng != null && card.location?.lat != null
        ? { lng: card.location.lng, lat: card.location.lat }
        : {}),
    });
    items.sort((a, b) => (a.time || "").localeCompare(b.time || ""));
    next[dayIndex] = items;
    setEditDays(next);
    setPickedCard(null);
    if (warns.length > 0) {
      setConflictNotice(`⚠️ AI 提醒：${warns.join("；")}。已按你的选择保留，可再调整`);
    }
    persistDays(next);
  };

  // E1b：按身份移除（cardId 优先，title 兜底旧数据），同名不同卡的项不再互相误伤
  const removePlacedItem = (dayIndex: number, target: DayPlanItem) => {
    const next = { ...editDays };
    next[dayIndex] = (next[dayIndex] ?? []).filter((it) => !samePlacedItem(it, target));
    setEditDays(next);
    persistDays(next);
  };

  // ── E4.5 Phase 2：AI 建议层（首入时生成一次；建议与时间轴严格分离，永不写入 editDays） ──
  // 契约：/plan 只读返回 NormalizeResult → 转换为 AiSuggestions → state + preferences.aiSuggestions 持久化。
  const planInFlightRef = useRef(false);   // 并发锁（StrictMode 双挂载/快速重入）
  const planAutoDoneRef = useRef(false);   // 本页面生命周期内自动触发只试一次
  const [aiSuggestions, setAiSuggestions] = useState<AiSuggestions | null>(null);

  /** 当前规划输入指纹（selectedCards + 出发/返程时间 + 天数）；与建议的 fingerprint 不一致 → 建议失效 */
  const currentFingerprint = (() => {
    if (!trip) return "";
    try {
      const pref = JSON.parse(trip.preferences || "{}");
      const tags = pref.tags ?? {};
      const cards = Array.isArray(pref.selectedCards) ? pref.selectedCards : [];
      return suggestionFingerprint({
        cardIds: cards.map((c: any) => c?.id ?? (c?.title ? `t:${c.title}` : undefined)),
        departureTime: tags.departureTime,
        departureTimeVal: tags.departureTimeVal,
        returnTime: tags.returnTime,
        returnTimeVal: tags.returnTimeVal,
        days: typeof tags.days === "number" ? tags.days : trip.itineraries?.length,
        hotel: tags.hotel ?? null, // E4.5 Phase 5：/plan 已消费 hotel，指纹同步含 hotel 分量
      });
    } catch { return ""; }
  })();

  /** 建议落库：NormalizeResult → AiSuggestions → state + PUT {aiSuggestions}（绝不写 days/editDays） */
  const storeAiSuggestions = async (result: NormalizeResult): Promise<boolean> => {
    const sug = resultToSuggestions(result, currentFingerprint);
    setAiSuggestions(sug);
    try {
      const res = await fetch(`/api/trips/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aiSuggestions: sug }),
      });
      return res.ok;
    } catch {
      return false;
    }
  };

  /** 实际生成建议（自动触发与手动重试共用；内含并发锁） */
  const runAiPlan = async () => {
    if (!trip) return;
    if (planInFlightRef.current) return;
    let hasCards = false;
    try {
      const pref = JSON.parse(trip.preferences || "{}");
      hasCards = Array.isArray(pref.selectedCards) && pref.selectedCards.length > 0;
    } catch { /* ignore */ }
    if (!hasCards) return; // 无可规划卡片：不调 /plan、不报错、保持骨架

    planInFlightRef.current = true;
    setPlanState("planning");
    setPlanErrorKind("");
    try {
      const res = await fetch(`/api/trips/${id}/plan`, { method: "POST" });
      if (!res.ok) throw new Error(`plan-http-${res.status}`);
      const result = (await res.json()) as NormalizeResult;
      const itemCount = Object.values(result.placementsByDay ?? {}).flat().length;
      const ok = await storeAiSuggestions(result);
      if (ok) {
        setPlanState("idle");
        setPlanNotice(itemCount === 0 ? "empty" : "");
      } else {
        setPlanState("failed");
        setPlanErrorKind("save");
      }
    } catch {
      // /plan 失败（LLM/网络/503）：画布零改动，骨架与 placeholder 原样
      setPlanState("failed");
      setPlanErrorKind("plan");
    } finally {
      planInFlightRef.current = false;
    }
  };

  /** 手动重试：plan 失败重跑；save 失败仅重试建议落库（不重跑 LLM） */
  const retryAiPlan = () => {
    if (planErrorKind === "save") {
      if (planInFlightRef.current || !aiSuggestions) return;
      planInFlightRef.current = true;
      setPlanState("planning");
      fetch(`/api/trips/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aiSuggestions }),
      })
        .then((res) => {
          if (res.ok) { setPlanState("idle"); setPlanErrorKind(""); }
          else setPlanState("failed");
        })
        .catch(() => setPlanState("failed"))
        .finally(() => { planInFlightRef.current = false; });
      return;
    }
    void runAiPlan();
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
  // E1b：改读 editDays（而非初始 trip.itineraries）——放置/删除卡片后地图 marker 实时更新，不再依赖刷新。
  // 去重键 cardId 优先（同名不同卡各自出 marker），title 兜底旧数据。
  const allMarkers: MapMarker[] = [];
  const allPoiNames = new Set<string>();

  Object.entries(editDays)
    .sort(([a], [b]) => Number(a) - Number(b))
    .forEach(([dayIndex, items]) => {
      (items ?? []).forEach((item, i) => {
        const dedupeKey = item.cardId ?? item.activity;
        if (item.lng && item.lat && !allPoiNames.has(dedupeKey)) {
          allPoiNames.add(dedupeKey);
          const cat = item.source === "food" ? "food" : item.source === "rest" ? "hotel" : "attraction";
          allMarkers.push({
            id: `day${dayIndex}-${i}`,
            name: item.activity,
            lng: item.lng,
            lat: item.lat,
            category: cat,
            color: CATEGORY_MARKER_COLORS[cat] || "#6B7280",
          });
        }
      });
    });

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
  // E1b：读取完整卡片身份（id/title/description/reason/location）；旧数据缺 id/location 也可正常打开
  let prefSelectedCards: PoolCard[] = [];
  // E4.5 Phase 4-2：酒店事实（tags.hotel = 用户 POI 选择的精确地点；缺失则不展示，legacy 兼容）
  let prefHotel: { name: string; address?: string; district?: string } | null = null;
  try {
    const pref = JSON.parse(trip.preferences);
    title = pref.title ?? "";
    overview = pref.overview ?? "";
    travelTips = pref.travelTips ?? [];
    planningThought = pref.planningThought ?? "";
    const h = pref?.tags?.hotel;
    if (h && typeof h.name === "string" && h.location && typeof h.location.lng === "number" && typeof h.location.lat === "number") {
      prefHotel = {
        name: h.name,
        address: typeof h.address === "string" ? h.address : undefined,
        district: typeof h.district === "string" ? h.district : undefined,
      };
    }
    prefSelectedCards = (Array.isArray(pref.selectedCards) ? pref.selectedCards : [])
      .filter((c: any) => c && typeof c.title === "string" && c.title.length > 0)
      .map((c: any) => ({
        id: typeof c.id === "string" ? c.id : undefined,
        title: c.title as string,
        description: c.description,
        reason: c.reason,
        category: typeof c.category === "string" ? c.category : undefined,
        location: c.location && typeof c.location.lng === "number" && typeof c.location.lat === "number"
          ? { lng: c.location.lng, lat: c.location.lat, address: c.location.address }
          : undefined,
      }));
  } catch { /* ignore */ }
  const displayTitle = title || `${trip.destination} · 我的旅行攻略`;

  // ── 2.0 攻略卡：「我的选择」= 全部已选卡（E4.5：卡片不因已安排而消失，状态以标签呈现；按 category 分组） ──
  const placedItemsWithDay = Object.entries(editDays).flatMap(([d, items]) =>
    (items ?? []).map((it) => ({ ...it, _day: Number(d) }))
  );
  const cardPool = prefSelectedCards; // 全量用户选择（不再过滤已安排）
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

        {/* ── L2 系统状态折叠条（E4.5 Phase 6-1：概述+管家手记+数据守护三合一，默认收起；L0 决策链路优先） ── */}
        <div className="px-4 pt-3">
          <div className="rounded-xl border border-amber-200/50 bg-amber-50/40 backdrop-blur-md">
            <button
              onClick={() => setThoughtExpanded((v) => !v)}
              className="w-full flex items-center justify-between px-3.5 py-2 text-left"
            >
              <span className="text-[11px] text-amber-800/80">
                ✦ 行程骨架已准备好，AI 已根据你的选择生成建议
              </span>
              <ChevronDown
                className={`w-3.5 h-3.5 text-amber-600/70 transition-transform duration-200 ${thoughtExpanded ? "rotate-180" : ""}`}
              />
            </button>
            <AnimatePresence initial={false}>
              {thoughtExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.25 }}
                  className="overflow-hidden"
                >
                  <div className="border-t border-amber-200/40 px-3.5 py-2.5 space-y-2">
                    {overview && (
                      <p className="text-[11px] leading-relaxed text-charcoal/70">{overview}</p>
                    )}
                    {planningThought && (
                      <p className="text-[11px] italic leading-relaxed text-amber-900/70">🛎️ {planningThought}</p>
                    )}
                    <p className="text-[11px] text-muted/60 leading-relaxed">
                      AI 的建议仅供参考，最终安排由你决定。您之前导入的截图和语音已安全存入本地，随时可以返回首页追加新想法。
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* ── AI 建议状态条（建议生成中/失败重试/无建议提示；建议层与时间轴分离） ── */}
        {planState === "planning" && (
          <div className="px-4 pt-3">
            <GlassCard className="px-4 py-2.5 flex items-center gap-2 text-xs text-charcoal/70">
              <span className="animate-pulse">✨</span>
              <span>AI 正在分析你的选择，生成旅行建议…</span>
            </GlassCard>
          </div>
        )}
        {planState === "failed" && (
          <div className="px-4 pt-3">
            <GlassCard className="px-4 py-2.5 flex items-center justify-between gap-2 text-xs">
              <span className="text-red-600">
                ⚠️ {planErrorKind === "save"
                  ? "AI 建议已生成，但保存失败，请重试。"
                  : "AI 建议暂时生成不了，你的画布不受影响。"}
              </span>
              <button
                onClick={retryAiPlan}
                className="shrink-0 rounded-full bg-gradient-to-r from-vibe-sea to-vibe-dusk text-white px-3 py-1 text-[11px] font-medium"
              >
                重试
              </button>
            </GlassCard>
          </div>
        )}
        {planState === "idle" && planNotice === "empty" && (
          <div className="px-4 pt-3">
            <GlassCard className="px-4 py-2.5 text-xs text-muted/70">
              暂时没有可建议的安排，时间轴由你自由安排 🧺
            </GlassCard>
          </div>
        )}
        {/* 时间冲突提示（user override 可见警告，6s 自动消失） */}
        {conflictNotice && (
          <div className="px-4 pt-3">
            <GlassCard className="px-4 py-2.5 text-xs text-amber-700 bg-amber-50/70 border-amber-200/60">
              {conflictNotice}
            </GlassCard>
          </div>
        )}

        {/* ── 🧺 我的选择（按类别分组；已安排的卡保留并显示状态，点选可再次移动） ── */}
        {cardPool.length > 0 && (
          <div className="px-4 pt-3">
            <GlassCard className="px-4 py-3">
              <p className="text-xs font-medium text-charcoal/80 mb-2">
                🧺 我的选择
                <span className="text-muted/60 font-normal ml-1">点一下选中，再点下方时间轴空格放入（桌面端可直接拖拽）</span>
              </p>
              <div className="space-y-2">
                {([["attraction", "🎯 景点"], ["food", "🍜 美食"], ["souvenir", "🎁 伴手礼"]] as const).map(([cat, label]) => {
                  const group = cardPool.filter((c) => (c.category ?? "attraction") === cat);
                  if (group.length === 0) return null;
                  return (
                    <div key={cat}>
                      <p className="text-[10px] text-muted/60 mb-1">{label} · {group.length}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {group.map((card) => {
                          const cardKey = card.id ?? card.title;
                          const placed = placedItemsWithDay.find((it) => placedItemMatchesCard(it, card));
                          const isPicked = pickedCard
                            ? pickedCard.id && card.id
                              ? pickedCard.id === card.id
                              : pickedCard.title === card.title
                            : false;
                          return (
                            <button
                              key={cardKey}
                              draggable
                              onDragStart={() => { dragCardRef.current = card; }}
                              onClick={() => setPickedCard(isPicked ? null : card)}
                              className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs transition-all ${
                                isPicked
                                  ? "bg-gradient-to-r from-vibe-sea to-vibe-dusk text-white shadow-md scale-105"
                                  : placed
                                  ? "bg-emerald-50 text-emerald-800 border border-emerald-200/70"
                                  : "bg-white/70 text-charcoal/80 border border-vibe-dusk/25 hover:bg-white"
                              }`}
                            >
                              {card.title}
                              {placed && (
                                <span className="text-[10px] opacity-75">✓ 已安排 Day {placed._day}{placed.time ? ` ${placed.time}` : ""}</span>
                              )}
                              {/* E4.5 Phase 3-1：AI 建议标签（时段词，不显示精确时间；只是建议，不是已安排） */}
                              {!placed && (() => {
                                const sug = aiSuggestions?.items.find((i) =>
                                  (i.cardId && card.id && i.cardId === card.id) || (!i.cardId && i.cardTitle === card.title)
                                );
                                return sug ? (
                                  <span className="text-[10px] text-vibe-sea/90">· AI 建议 {suggestionLabel(sug)}</span>
                                ) : null;
                              })()}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </GlassCard>
          </div>
        )}

        {/* ── ✨ AI 旅行建议（建议层：与时间轴视觉/语义隔离；仅供参考，不自动落轴） ── */}
        {aiSuggestions && (aiSuggestions.items.length > 0 || (aiSuggestions.unplaced?.length ?? 0) > 0) && (
          <div className="px-4 pt-3">
            <GlassCard className="px-4 py-3 border-vibe-sea/25 bg-vibe-sea/[0.04]">
              <p className="text-xs font-medium text-charcoal/80 mb-1.5">✨ AI 旅行建议</p>
              {aiSuggestions.narrative && (
                <p className="text-[11px] text-muted/80 leading-relaxed mb-2">{aiSuggestions.narrative}</p>
              )}
              <div className="space-y-1.5">
                {aiSuggestions.items.map((item, idx) => {
                  // E4.5 Phase 7-1：render-time 派生「你已安排」反馈（复用 placedItemMatchesCard/placedItemsWithDay/suggestedTimeToPeriod；不持久化、不改建议数据、不触发 /plan）
                  const arranged = placedItemsWithDay.find((p) =>
                    placedItemMatchesCard(p, { id: item.cardId, title: item.cardTitle })
                  );
                  const arrangedPeriod = arranged ? suggestedTimeToPeriod(arranged.time) : null;
                  return (
                    <div key={`${item.cardId ?? item.cardTitle}-${idx}`} className="rounded-lg bg-white/60 border border-vibe-sea/15 px-2.5 py-1.5">
                      <p className="text-xs text-charcoal/85">
                        <span className="font-medium">{item.cardTitle}</span>
                        <span className="text-vibe-sea/90 ml-1.5">建议 {suggestionLabel(item)}</span>
                      </p>
                      {item.reason && (
                        <p className="text-[10px] text-muted/70 mt-0.5 leading-snug">{item.reason}</p>
                      )}
                      {arranged && (
                        <p className="text-[10px] mt-0.5 text-vibe-forest font-medium">
                          ✓ 你已安排 Day {arranged._day}{arrangedPeriod ? ` · ${arrangedPeriod}` : ""}
                        </p>
                      )}
                    </div>
                  );
                })}
                {(aiSuggestions.unplaced ?? []).map((u, idx) => (
                  <div key={`unplaced-${idx}`} className="rounded-lg bg-white/40 border border-dashed border-charcoal/15 px-2.5 py-1.5">
                    <p className="text-xs text-charcoal/60">
                      <span className="font-medium">{u.cardTitle}</span>
                      <span className="text-muted/60 ml-1.5">暂未建议</span>
                    </p>
                    <p className="text-[10px] text-muted/60 mt-0.5 leading-snug">{u.reason}</p>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-muted/50 mt-2">以上是 AI 的建议，仅供参考；最终怎么安排，由你在下方时间轴自己决定。</p>
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
            // 长项（duration>1h）的跨小时延续占位表
            const continuationMap = continuationMapFor(dayItems);
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
                    </div>

                    {/* ── 右栏：小时级时间轴（重点） ── */}
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] text-muted/60 mb-1">今日行程</p>
                      <div>
                        {hours.map((h) => {
                          const rowItems = dayItems.filter((it: any) => hourOf(it.time) === h);
                          const continuation = continuationMap.get(h);
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
                                {/* 长项跨小时延续条：让 3 小时的交通真实占住 3 个小时格 */}
                                {continuation && (
                                  <span className={`inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[10px] border border-dashed ${
                                    continuation.source === "transport"
                                      ? "bg-blue-50/60 border-blue-200/60 text-blue-700/80"
                                      : continuation.source === "rest"
                                        ? "bg-purple-50/60 border-purple-200/60 text-purple-700/80"
                                        : "bg-vibe-sea/5 border-vibe-sea/25 text-charcoal/60"
                                  }`}>
                                    ⏳ {continuation.title} · 进行中（至 {continuation.until}）
                                  </span>
                                )}
                                {rowItems.length === 0 ? (
                                  (!continuation || canPlace) && (
                                    <span className={`text-[11px] ${canPlace ? "text-vibe-sea font-medium" : "text-muted/25"}`}>
                                      {canPlace && pickedCard ? `＋ 点击放入「${pickedCard.title}」` : "·"}
                                    </span>
                                  )
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
                                        {/* E4-5 可解释性：AI 规划理由真实可见（truncate 保护布局，title 悬浮看全文） */}
                                        {it.note && (
                                          <span className="text-[10px] opacity-70 max-w-[9rem] truncate" title={it.note}>
                                            · {it.note}
                                          </span>
                                        )}
                                        {!fixed && (
                                          <button
                                            onClick={(e) => { e.stopPropagation(); removePlacedItem(day.dayIndex, it); }}
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

        {/* ── 🗺 行程空间总览（E4.5 Phase 6-1：地图移至时间轴后——先决定怎么安排，再看空间分布；逻辑与渲染条件不变） ── */}
        {allMarkers.length > 0 && (
          <div className="pt-4">
            <p className="px-4 pb-2 text-[11px] font-medium text-muted/70">🗺 行程空间总览</p>
            <div className="relative">
              <AmapView markers={allMarkers} className="w-full h-[30vh]" />
              <div className="absolute bottom-2 left-3">
                <GlassCard className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs shadow-sm">
                  <MapPin className="w-3 h-3 text-vibe-sea" />
                  <span>{trip.destination} · {allMarkers.length} 个地点</span>
                </GlassCard>
              </div>
            </div>
          </div>
        )}

        {/* ── L1 旅行事实区（E4.5 Phase 6-1：住宿+天气，移至决策链路之后；数据链路不变） ── */}
        {prefHotel && (
          <div className="px-4 pt-3">
            <p className="text-xs text-charcoal/75 leading-relaxed truncate">
              🏨 {prefHotel.name}
              {prefHotel.district ? ` · ${prefHotel.district}` : ""}
              {prefHotel.address ? `　${prefHotel.address}` : ""}
            </p>
          </div>
        )}
        {weather && (weather.live || (weather.forecasts?.length ?? 0) > 0) && (
          <div className="px-4 pt-2 pb-2">
            <button
              onClick={() => setWeatherExpanded((v) => !v)}
              className="w-full flex items-center justify-between rounded-xl bg-white/50 border border-vibe-dusk/15 px-3.5 py-2 text-left"
            >
              <span className="text-xs text-charcoal/75">
                🌤 {weather.city}{weather.live ? ` · ${weather.live.weather} · ${weather.live.temperature}℃` : ""}
              </span>
              <ChevronDown className={`w-3.5 h-3.5 text-muted/60 transition-transform duration-200 ${weatherExpanded ? "rotate-180" : ""}`} />
            </button>
            {weatherExpanded && (
              <GlassCard className="px-4 py-3 mt-1.5">
                {weather.live && (
                  <div className="flex items-center gap-4 mb-2 pb-2 border-b border-white/40">
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-semibold text-charcoal">{weather.live.temperature}°</span>
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
                {(weather.forecasts ?? []).length > 0 && (
                  <div className="flex gap-1 overflow-x-auto">
                    {(weather.forecasts ?? []).slice(0, 4).map((f) => (
                      <div key={f.date} className="flex-1 min-w-[60px] text-center py-1">
                        <p className="text-[10px] text-muted/70">{f.date.slice(5)} {f.week}</p>
                        <p className="text-[11px] text-charcoal/80 my-0.5">{f.dayWeather}</p>
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
            )}
          </div>
        )}

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
        {/* E2 临时隐藏：该入口调用 /api/trips/[id]/adjust，其语义是「LLM 全量重生成并覆盖整个画布」。
            此前因 ollamaJson 解析缺陷该接口 100% 失败（功能实际已死）；
            E2 修复 parser 后它会突然“复活”并覆盖用户手动排好的画布（origin=user 的项也会被抹掉）。
            故在 E3/E4 Copilot（提案制、不覆盖用户内容）落地前，先隐藏入口。
            API 保留未删，handleVoiceAdjust 逻辑保留未改。 */}
        {VOICE_ADJUST_ENABLED && (
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
        )}

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
