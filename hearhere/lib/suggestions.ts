/**
 * lib/suggestions.ts — AI 旅行建议数据层（E4.5 Phase 2）
 *
 * 产品宪法：
 * - AiSuggestions 是「建议层」，与「时间轴层」（editDays）严格分离；
 * - 本模块全是纯函数，不产生任何副作用，绝不可能写 editDays；
 * - 建议只读 NormalizeResult，转换后即与 LLM 输出解耦。
 */

import type { NormalizeResult } from "@/lib/plan-normalizer";

export interface AiSuggestionItem {
  cardId?: string;          // legacy 卡可能无 id（此时用 cardTitle 引用）
  cardTitle: string;
  suggestedDay: number;
  suggestedTime?: string;   // "HH:MM"
  reason?: string;          // AI 真实规划理由（原 note）
}

export interface AiSuggestions {
  generatedAt: string;      // ISO
  fingerprint: string;      // 输入指纹：变化即失效
  narrative: string;        // 总体建议文字（代码组装：规则触发 + 警告 + 分布摘要）
  items: AiSuggestionItem[];
  unplaced?: { cardTitle: string; reason: string }[]; // AI 认为不适合的（透明告知）
}

/** 影响规划的核心输入 → 稳定指纹（与数组顺序无关）；E4.5 Phase 5 起含 hotel 分量（/plan 已消费 hotel） */
export function suggestionFingerprint(input: {
  cardIds: (string | undefined)[];
  departureTime?: string;
  departureTimeVal?: string;
  returnTime?: string;
  returnTimeVal?: string;
  days?: number;
  hotel?: { amapId?: string; location?: { lng?: number; lat?: number } | null } | null;
}): string {
  const cards = input.cardIds.filter(Boolean).sort().join(",");
  // hotel 身份：amapId 优先（同店坐标微调不失效），无 id 时 lng,lat 兜底，无酒店为空串（字段结构稳定）
  const h = input.hotel;
  const hotelKey = h?.amapId
    ? h.amapId
    : h?.location && typeof h.location.lng === "number" && typeof h.location.lat === "number"
      ? `${h.location.lng},${h.location.lat}`
      : "";
  return [
    `cards:${cards}`,
    `dep:${input.departureTime ?? ""}/${input.departureTimeVal ?? ""}`,
    `ret:${input.returnTime ?? ""}/${input.returnTimeVal ?? ""}`,
    `days:${input.days ?? ""}`,
    `hotel:${hotelKey}`,
  ].join("|");
}

/** NormalizeResult → AiSuggestions（纯转换；activity/时间来自已校验的 placement） */
export function resultToSuggestions(result: NormalizeResult, fingerprint: string): AiSuggestions {
  const items: AiSuggestionItem[] = [];
  const days = Object.keys(result.placementsByDay).map(Number).sort((a, b) => a - b);
  for (const d of days) {
    for (const it of result.placementsByDay[d]) {
      items.push({
        cardId: it.cardId,
        cardTitle: it.activity,
        suggestedDay: d,
        suggestedTime: it.time,
        reason: it.note,
      });
    }
  }
  const parts: string[] = [];
  if (result.ruleNotes?.length) parts.push(...result.ruleNotes);
  if (result.warnings.length) parts.push(...result.warnings);
  if (items.length > 0) parts.push(`已为 ${items.length} 张卡给出安排建议，仅供参考，最终由你决定。`);
  else parts.push("暂时没有适合自动建议的安排，时间轴由你自由发挥。");
  return {
    generatedAt: new Date().toISOString(),
    fingerprint,
    narrative: parts.join(" "),
    items,
    unplaced: result.unplaced.map((u) => ({ cardTitle: u.cardTitle, reason: u.reason })),
  };
}

/** 从 preferences JSON 安全读取 aiSuggestions（任何损坏 → null，绝不抛） */
export function readSuggestionsFromPreferences(preferencesRaw: unknown): AiSuggestions | null {
  try {
    const pref = typeof preferencesRaw === "string" ? JSON.parse(preferencesRaw) : preferencesRaw;
    const s = pref?.aiSuggestions;
    if (!s || typeof s !== "object") return null;
    if (typeof s.fingerprint !== "string" || !Array.isArray(s.items)) return null;
    return s as AiSuggestions;
  } catch {
    return null;
  }
}

/** 建议时间 → 时段词（E4.5 Phase 3-1：UI 只显示时段，不显示精确 HH:MM，避免误认已落轴） */
export function suggestedTimeToPeriod(time?: string): string | null {
  if (!time) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  if (h < 12) return "上午";
  if (h < 14) return "中午";
  if (h < 18) return "下午";
  return "晚上";
}

/** 建议条目的展示文案：「Day 1 下午」；无时间只显示 Day */
export function suggestionLabel(item: AiSuggestionItem): string {
  const period = suggestedTimeToPeriod(item.suggestedTime);
  return `Day ${item.suggestedDay}${period ? ` ${period}` : ""}`;
}
