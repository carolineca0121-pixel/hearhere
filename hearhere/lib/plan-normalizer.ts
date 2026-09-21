/**
 * lib/plan-normalizer.ts — E3-1：AI 规划输出 → P4 可用数据的唯一受信通道
 *
 * 职责边界（硬约束）：
 * - LLM 只输出「判断」：dayIndex / time / 卡片引用 / durationMin / note
 * - 代码负责「身份与约束」：cardId / activity / lng / lat / source / origin / duration 格式化
 * - 【cardId 是系统身份，title 只是展示文本】（E1b 原则，E3-1r 修正后 AI 边界同样遵守）：
 *   · 新卡（有 id）：AI 必须用 cardId 引用；normalizer 只按 cardId 精确匹配白名单，
 *     编造/写错/越权的 cardId 一律 rejected，绝不做 title 回退猜测。
 *   · 旧卡（无 id 的 legacy 数据）：AI 用 cardTitle 引用，且 title 只允许命中无 id 的旧卡；
 *     若 title 实际属于有 id 的新卡 → 拒收并提示应使用 cardId。
 *   · activity / lng / lat 永远从真实卡片复制，AI 无权生成或改写。
 * - 白名单之外、越界、非法时间、重复、超量 → rejected / unplaced，绝不进入 P4。
 * - 纯函数，无副作用，对垃圾输入安全失败（不抛出）。
 *
 * 本文件只包含数据转换，不含 LLM 调用、不含路由、不含 UI（那是 E3-2+ 的事）。
 */

import type { DayPlanItem } from "@/lib/types";
import { timeToMinutes, intervalOverlaps, minutesToTime, type OccupiedInterval } from "@/lib/duration";

// ── LLM 输出契约（E3-2 的 planPrompt 将按此生成；刻意保持最小，无散文字段） ──

export interface AiPlacement {
  dayIndex: number;
  time: string; // "HH:MM"（容忍 "H:MM"，归一化为 HH:MM）
  cardId?: string; // 主引用方式：白名单精确匹配（AI 只能从清单中选择，不能发明/修改）
  cardTitle?: string; // legacy fallback：仅允许引用「无 id 的旧卡片」；新卡必须用 cardId
  durationMin?: number; // 可选：停留分钟数（代码格式化为 duration 文案）
  note?: string; // 可选：一句理由（≤60 字，超长截断）
}

export interface AiPlanResponse {
  placements: AiPlacement[];
  unplaced?: { cardId?: string; cardTitle?: string; reason: string }[];
}

// ── Normalizer 输入/输出 ──

/** 卡片白名单引用（= Trip.preferences.selectedCards 的形状；id 对旧数据可选） */
export interface PlanCardRef {
  id?: string;
  title: string;
  description?: string;
  reason?: string;
  location?: { lng?: number; lat?: number; address?: string };
  /** E4-2：卡片分类（attraction/food/souvenir），饭点 soft rule 的数据基础 */
  category?: string;
}

/** E4-2 饭点时间窗（分钟制）：早餐/午餐/下午茶/晚餐。餐厅落在窗外 → warning（soft rule，不拒收）
 * ⚠️ MVP 能力边界：当前只识别「category=food → 尽量落在进食窗口」，
 * 不区分早餐店/正餐/夜宵等细分餐饮类型（breakfast/brunch/lunch/dinner 分类属后续迭代）。 */
export const MEAL_WINDOWS: { name: string; startMin: number; endMin: number }[] = [
  { name: "早餐", startMin: 7 * 60, endMin: 10 * 60 },
  { name: "午餐", startMin: 11 * 60, endMin: 14 * 60 },
  { name: "下午茶", startMin: 14 * 60, endMin: 17 * 60 },
  { name: "晚餐", startMin: 17 * 60, endMin: 20 * 60 + 30 },
];

/** 判断时间是否落在任一饭点窗口 */
export function inMealWindow(time: string): boolean {
  const m = timeToMinutes(time);
  if (m === null) return false;
  return MEAL_WINDOWS.some((w) => m >= w.startMin && m < w.endMin);
}

/** 时间锚点（由代码从 tags/驾线路程预算好）：Day1 最早可排小时、末日最晚可排小时 */
export interface PlanAnchors {
  day1EarliestHour: number;
  lastDayLatestHour: number;
}

export interface NormalizeInput {
  raw: unknown;
  cards: PlanCardRef[];
  dayCount: number;
  anchors: PlanAnchors;
  /** 时间占用区间（如往返交通）：placement 与之冲突 → rejected。规划层使用 maxHours 口径（安全阻塞）。 */
  occupiedIntervals?: OccupiedInterval[];
  /** 每日 selected_card 上限（默认 4；「不要太累/陪父母」等节奏约束时由调用方传 3） */
  maxPerDay?: number;
}

export interface NormalizeResult {
  /** 可直接应用的 DayPlanItem（字段已被代码补全），按天分组、天内按 time 排序 */
  placementsByDay: Record<number, DayPlanItem[]>;
  /** AI 主动舍弃或代码溢出的卡片（cardId 已解析为真实身份；legacy 卡可能无 id） */
  unplaced: { cardId?: string; cardTitle: string; reason: string }[];
  /** 被拦截的非法/编造/重复/歧义条目（展示给用户，绝不上画布） */
  rejected: { raw: string; reason: string }[];
  /** 代码计算的提示（如「Day N 排满」），不依赖 LLM 自评 */
  warnings: string[];
  /** E4-1：命中的规划规则记录（如「节奏：不要太累 → 每天 ≤3 项」），供 UI 展示「系统为什么这样安排」 */
  ruleNotes?: string[];
}

/** 每天 selected_card 上限（硬限制，不靠 prompt 自觉） */
export const PLAN_MAX_CARDS_PER_DAY = 4;

// ── 内部工具 ──

/** 安全归一化：仅去空白 + 全角括号转半角。绝不做子串/模糊匹配——「西湖」≠「西湖景区」≠「西湖龙井村」。 */
export function normalizeTitle(s: string): string {
  return s.trim().replace(/\s+/g, "").replace(/（/g, "(").replace(/）/g, ")");
}

/** 白名单查找（cardId 主身份）：
 *  - ref 有 cardId → 只按 cardId 精确匹配（title 完全不参与，编造/写错一律拒收）；
 *  - ref 只有 cardTitle → legacy fallback：只允许命中「无 id 的旧卡」；
 *    若该 title 实际属于有 id 的新卡 → 拒收并提示改用 cardId（防止 title 成为新卡的后门身份）。
 *  匹配失败返回 reason（用于 rejected 记录），绝不猜。 */
function findCardByRef(
  cards: PlanCardRef[],
  ref: { cardId?: unknown; cardTitle?: unknown }
): { card?: PlanCardRef; reason?: string } {
  const refId = typeof ref.cardId === "string" ? ref.cardId.trim() : "";
  if (refId) {
    const hit = cards.find((c) => c.id && c.id === refId);
    return hit ? { card: hit } : { reason: `cardId 不在用户已选白名单中：「${refId}」` };
  }
  const title = typeof ref.cardTitle === "string" ? ref.cardTitle.trim() : "";
  if (!title) return { reason: "缺少 cardId/cardTitle 引用" };
  const legacyPool = cards.filter((c) => !c.id);
  const exact = legacyPool.filter((c) => c.title === title);
  if (exact.length === 1) return { card: exact[0] };
  if (exact.length > 1) return { reason: `多张无 id 同名旧卡「${title}」，无法确定指哪一张` };
  const nt = normalizeTitle(title);
  const norm = nt ? legacyPool.filter((c) => normalizeTitle(c.title) === nt) : [];
  if (norm.length === 1) return { card: norm[0] };
  if (norm.length > 1) return { reason: `多张无 id 同名旧卡「${title}」，无法确定指哪一张` };
  if (cards.some((c) => c.id && (c.title === title || normalizeTitle(c.title) === nt)))
    return { reason: `「${title}」是有 cardId 的新卡，必须改用 cardId 引用` };
  return { reason: `不在用户已选白名单中：「${title}」` };
}

/** 合法化时间：接受 "9:00"/"09:00" → "09:00"；24 点以上/非法分钟/非字符串 → null */
function normalizeTime(t: unknown): string | null {
  if (typeof t !== "string") return null;
  const m = /^(\d{1,2}):([0-5]\d)$/.exec(t.trim());
  if (!m) return null;
  const h = Number(m[1]);
  if (h > 23) return null;
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}

/** 合法化 dayIndex：必须是整数且 1..dayCount（字符串数字也拒收——AI 输出必须守型） */
function normalizeDayIndex(v: unknown, dayCount: number): number | null {
  if (typeof v !== "number" || !Number.isInteger(v)) return null;
  if (v < 1 || v > dayCount) return null;
  return v;
}

/** durationMin（分钟）→ 展示文案；非法值（非数/≤0/>720）静默丢弃该字段，不拒收整个 placement */
function formatDuration(min: unknown): string | undefined {
  if (typeof min !== "number" || !Number.isFinite(min) || min <= 0 || min > 720) return undefined;
  const r = Math.round(min);
  if (r < 60) return `约 ${r} 分钟`;
  const h = r / 60;
  return `约 ${Number.isInteger(h) ? h : h.toFixed(1)} 小时`;
}

/** note 清洗：压缩空白、限长 60 字 */
function sanitizeNote(n: unknown): string | undefined {
  if (typeof n !== "string") return undefined;
  const s = n.replace(/\s+/g, " ").trim();
  if (!s) return undefined;
  return s.length > 60 ? s.slice(0, 59) + "…" : s;
}

/** rejected 条目里的原始内容截断（防止超长 raw 撑爆日志/UI） */
function short(v: unknown): string {
  try {
    const s = typeof v === "string" ? v : JSON.stringify(v);
    return (s ?? "undefined").slice(0, 120);
  } catch {
    return String(v).slice(0, 120);
  }
}

// ── 主函数 ──

export function normalizeAiPlan(input: NormalizeInput): NormalizeResult {
  const result: NormalizeResult = { placementsByDay: {}, unplaced: [], rejected: [], warnings: [] };
  // 防御：调用方传垃圾也不崩溃（cards 非数组→空白名单；dayCount 非法→0，一切 dayIndex 都越界拒收）
  const cards = Array.isArray(input.cards) ? input.cards : [];
  const dayCount = Number.isInteger(input.dayCount) && input.dayCount >= 1 ? input.dayCount : 0;
  const anchors = input.anchors;
  const raw = input.raw;

  // L2 结构验证：raw 必须是对象
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    result.rejected.push({ raw: short(raw), reason: "LLM 输出不是 JSON 对象" });
    return result;
  }
  const placements = (raw as { placements?: unknown }).placements;
  if (!Array.isArray(placements)) {
    result.rejected.push({ raw: short(raw), reason: "placements 缺失或不是数组" });
    return result;
  }

  const anchorCheckEnabled =
    Number.isFinite(anchors?.day1EarliestHour) && Number.isFinite(anchors?.lastDayLatestHour);
  const maxPerDay = Number.isInteger(input.maxPerDay) && (input.maxPerDay as number) >= 1
    ? (input.maxPerDay as number)
    : PLAN_MAX_CARDS_PER_DAY;
  // 时间占用区间（规划层硬约束：placement 与交通等占用冲突 → 拒收）
  const occupiedByDay = new Map<number, OccupiedInterval[]>();
  for (const iv of input.occupiedIntervals ?? []) {
    if (!Number.isFinite(iv.startMin) || !Number.isFinite(iv.endMin)) continue;
    const list = occupiedByDay.get(iv.dayIndex) ?? [];
    list.push(iv);
    occupiedByDay.set(iv.dayIndex, list);
  }

  const usedKeys = new Set<string>(); // cardId（或 legacy title:） 唯一性
  // E5-6：用户可见降级 —— 被规则拒绝但能解析到白名单卡的 placement 进入 unplaced（不再从建议层消失）。
  // placedKeys = 已进 placements；demotedKeys = 已降级进 unplaced（每卡最多一次）；两集合即「最终处置」，互不重叠。
  const placedKeys = new Set<string>();
  const demotedKeys = new Set<string>();
  const demote = (pp: Record<string, unknown>, reason: string) => {
    // 仅在能可靠识别白名单卡时降级（cardId 主、title 仅 legacy 兜底）；无法识别 → 保持 rejected，绝不猜卡
    const { card } = findCardByRef(cards, {
      cardId: typeof pp.cardId === "string" ? pp.cardId : undefined,
      cardTitle: typeof pp.cardTitle === "string" ? pp.cardTitle : undefined,
    });
    if (!card) return;
    const key = card.id ?? `title:${card.title}`;
    if (placedKeys.has(key) || demotedKeys.has(key)) return;
    demotedKeys.add(key);
    result.unplaced.push({
      cardId: card.id,
      cardTitle: card.title,
      reason: `系统提示：${reason}`, // 来源标识：系统规则拒绝 ≠ AI 主动舍弃
    });
  };
  const perDayCount: Record<number, number> = {};
  // E4-6：每天已接受 placement 的占用时间（用于活动间 duration 互斥）
  const acceptedSpans = new Map<number, { startMin: number; endMin: number; label: string }[]>();

  // 确定性处理顺序（E4-6 Gate）：按 dayIndex → time → cardId/cardTitle 稳定排序后再校验。
  // 不改变 AI 决定的 day/time，只让校验顺序与 LLM 数组顺序无关（同一输入恒定同一结果）。
  const sortedPlacements = [...placements].sort((a: unknown, b: unknown) => {
    const key = (x: unknown): string => {
      if (!x || typeof x !== "object" || Array.isArray(x)) return "999|99:99|~";
      const p = x as Record<string, unknown>;
      const d = normalizeDayIndex(p.dayIndex, dayCount) ?? 999;
      const t = normalizeTime(p.time) ?? "99:99";
      const id = typeof p.cardId === "string" ? p.cardId : typeof p.cardTitle === "string" ? `t:${p.cardTitle}` : "~";
      return `${String(d).padStart(3, "0")}|${t}|${id}`;
    };
    return key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0; // Array.sort 稳定，同键保持原顺序
  });

  sortedPlacements.forEach((p: unknown, idx: number) => {
    const rawShort = short(p);
    // E5-6：reject 永远记录 rejected（调试）；forDemote 存在时才尝试用户可见降级（无可靠引用的拒绝不降级）
    const reject = (reason: string, forDemote?: Record<string, unknown>) => {
      result.rejected.push({ raw: rawShort, reason });
      if (forDemote) demote(forDemote, reason);
    };

    if (!p || typeof p !== "object" || Array.isArray(p)) {
      reject(`placements[${idx}] 不是对象`); return;
    }
    const pp = p as Record<string, unknown>;

    // 卡片引用：cardId（主）或 cardTitle（仅 legacy 旧卡），二者至少其一
    const hasRef =
      (typeof pp.cardId === "string" && pp.cardId.trim().length > 0) ||
      (typeof pp.cardTitle === "string" && pp.cardTitle.trim().length > 0);
    if (!hasRef) { reject("缺少 cardId/cardTitle 引用"); return; }

    const day = normalizeDayIndex(pp.dayIndex, dayCount);
    if (day === null) { reject(`dayIndex 非法或越界（需 1..${dayCount} 的整数）`, pp); return; }

    const time = normalizeTime(pp.time);
    if (!time) { reject("time 非法（需 HH:MM）", pp); return; }

    // 锚点约束：Day1 不能早于到达、末日「开始+duration」不能超过返程（代码执行，不靠 AI 自觉）
    const hour = Number(time.slice(0, 2));
    const startMin = timeToMinutes(time);
    const spanMin = typeof pp.durationMin === "number" && pp.durationMin > 0 ? pp.durationMin : 60;
    if (anchorCheckEnabled) {
      if (day === 1 && hour < anchors.day1EarliestHour) {
        reject(`早于 Day1 到达时间（${anchors.day1EarliestHour}:00 前不可排）`, pp); return;
      }
      // 末日结束边界（E4-6 Gate）：start+duration ≤ 返程时刻（贴边允许）
      if (day === dayCount && startMin !== null && startMin + spanMin > anchors.lastDayLatestHour * 60) {
        reject(`结束于返程之后（${time} 起 ${spanMin} 分钟会超过 ${anchors.lastDayLatestHour}:00 返程）`, pp); return;
      }
    }
    // 跨午夜（E4-6 Gate）：MVP 不建模跨天活动，明确拒收而非静默溢出到次日
    if (startMin !== null && startMin + spanMin > 24 * 60) {
      reject(`活动跨午夜（${time} 起 ${spanMin} 分钟超出当天 24:00），当前版本不支持`, pp); return;
    }

    // 占用区间约束：与交通等已占用时间冲突 → 拒收（duration 是真实规划约束，不只是 UI）
    const dayIntervals = occupiedByDay.get(day);
    if (startMin !== null && dayIntervals?.length) {
      const hit = dayIntervals.find((iv) => intervalOverlaps(startMin, spanMin, iv));
      if (hit) {
        reject(`与「${hit.label}」时间冲突（${minutesToTime(hit.startMin)}-${minutesToTime(hit.endMin)} 已被占用）`, pp);
        return;
      }
    }

    // 白名单匹配：cardId 主身份（唯一受信身份），cardTitle 仅 legacy 旧卡兜底
    const { card, reason } = findCardByRef(cards, { cardId: pp.cardId, cardTitle: pp.cardTitle });
    if (!card) { reject(reason ?? "白名单匹配失败"); return; }

    // 一卡一次
    const key = card.id ?? `title:${card.title}`;
    if (usedKeys.has(key)) { reject(`重复安排同一张卡「${card.title}」`, pp); return; }
    usedKeys.add(key); // 无论最终接受/溢出，都先占住（防三次引用）

    // 每日上限：溢出 → unplaced（代码执行节奏控制）
    const cnt = perDayCount[day] ?? 0;
    if (cnt >= maxPerDay) {
      result.unplaced.push({
        cardId: card.id,
        cardTitle: card.title,
        reason: `Day ${day} 已满（每天最多 ${maxPerDay} 个主要安排）`,
      });
      return;
    }
    perDayCount[day] = cnt + 1;

    // 通过全部校验 → 代码生成 DayPlanItem（activity/cardId/坐标一律取自真实卡片，AI 无权改写）
    const item: DayPlanItem = {
      time,
      activity: card.title,
      source: "selected_card",
      origin: "ai",
      ...(card.id ? { cardId: card.id } : {}),
      ...(card.location?.lng != null && card.location?.lat != null
        ? { lng: card.location.lng, lat: card.location.lat }
        : {}),
    };
    const dur = formatDuration(pp.durationMin);
    if (dur) item.duration = dur;
    const note = sanitizeNote(pp.note);
    if (note) item.note = note;

    // E4-6 活动互斥：与当天已接受 placement 的 duration 区间重叠 → 拒收（贴边允许）
    if (startMin !== null) {
      const span = typeof pp.durationMin === "number" && pp.durationMin > 0 ? pp.durationMin : 60;
      const accepted = acceptedSpans.get(day) ?? [];
      const hit = accepted.find((s) => intervalOverlaps(startMin, span, { dayIndex: day, startMin: s.startMin, endMin: s.endMin, label: s.label }));
      if (hit) {
        reject(`与已安排的「${hit.label}」（${minutesToTime(hit.startMin)}-${minutesToTime(hit.endMin)}）时间重叠`, pp);
        return;
      }
    }

    // E4-2 饭点 soft rule：美食卡落在饭点窗外 → warning（不拒收，用户选择优先）
    if (card.category === "food" && !inMealWindow(time)) {
      result.warnings.push(`「${card.title}」安排在 ${time}，不在常规用餐时段（早7-10/午11-14/下午茶14-17/晚17-20:30）`);
    }

    (result.placementsByDay[day] ??= []).push(item);
    placedKeys.add(key); // E5-6：最终处置=已排程
    // E4-6：记录已接受项的占用区间（供后续 placement 互斥检查）
    if (startMin !== null) {
      const span = typeof pp.durationMin === "number" && pp.durationMin > 0 ? pp.durationMin : 60;
      const list = acceptedSpans.get(day) ?? [];
      list.push({ startMin, endMin: startMin + span, label: card.title });
      acceptedSpans.set(day, list);
    }
  });

  // 天内按时间排序
  for (const d of Object.keys(result.placementsByDay)) {
    result.placementsByDay[Number(d)].sort((a, b) => (a.time || "").localeCompare(b.time || ""));
  }

  // AI 的 unplaced（断舍离）同样过白名单——引用规则与 placements 一致（cardId 主，legacy title 兜底）
  const aiUnplaced = (raw as { unplaced?: unknown }).unplaced;
  if (Array.isArray(aiUnplaced)) {
    for (const u of aiUnplaced) {
      if (!u || typeof u !== "object" || Array.isArray(u)) continue;
      const uu = u as Record<string, unknown>;
      const hasRef =
        (typeof uu.cardId === "string" && uu.cardId.trim().length > 0) ||
        (typeof uu.cardTitle === "string" && uu.cardTitle.trim().length > 0);
      if (!hasRef) continue;
      const { card, reason } = findCardByRef(cards, { cardId: uu.cardId, cardTitle: uu.cardTitle });
      if (!card) {
        result.rejected.push({ raw: short(u), reason: `unplaced ${reason ?? "匹配失败"}` });
        continue;
      }
      const uKey = card.id ?? `title:${card.title}`;
      // E5-6：已有最终处置（已排程/已被系统降级）的卡不再产生第二条 unplaced（情况 E/A）
      if (placedKeys.has(uKey) || demotedKeys.has(uKey)) continue;
      usedKeys.add(uKey);
      result.unplaced.push({
        cardId: card.id,
        cardTitle: card.title,
        reason: sanitizeNote(uu.reason) ?? "AI 未给出理由",
      });
    }
  }

  // warnings（代码计算）
  // E5-6 收尾对账：排序校验的时序可能让同卡先被降级、后被合法接受（或反之）——placements 永远是最终处置，撤下其 unplaced 条目
  if (placedKeys.size > 0 && result.unplaced.length > 0) {
    result.unplaced = result.unplaced.filter((u) => !placedKeys.has(u.cardId ?? `title:${u.cardTitle}`));
  }
  for (const [d, c] of Object.entries(perDayCount)) {
    if (c >= maxPerDay) {
      result.warnings.push(`Day ${d} 排满 ${maxPerDay} 项主要安排，节奏偏满`);
    }
  }
  if (cards.length > 0) {
    const neverMentioned = cards.filter((c) => !usedKeys.has(c.id ?? `title:${c.title}`));
    if (neverMentioned.length > 0) {
      result.warnings.push(
        `有 ${neverMentioned.length} 张已选卡片未被 AI 安排：${neverMentioned
          .map((c) => c.title)
          .slice(0, 5)
          .join("、")}${neverMentioned.length > 5 ? " 等" : ""}`
      );
    }
  }

  return result;
}
