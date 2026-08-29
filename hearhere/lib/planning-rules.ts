/**
 * lib/planning-rules.ts — 用户偏好 → 规划策略（可扩展规则层，E4-1）
 *
 * 设计原则：
 * - 规则是代码，不是 prompt 祈求：每条规则产出「硬约束（maxPerDay）」+「prompt 指导（hints）」+「触发记录（notes，可解释性数据源）」
 * - 多条规则可叠加；硬约束取最严格值（min）
 * - 新增偏好规则 = 在 RULES 数组加一条，不动其他代码
 */

export interface PlanningContext {
  /** 每天 selected_card 上限（undefined = normalizer 默认 4）；多条规则取最小值 */
  maxPerDay?: number;
  /** 注入 planPrompt 的行为指导（LLM 软约束） */
  promptHints: string[];
  /** 触发的规则记录（「系统为什么这样安排」的数据源） */
  notes: string[];
}

export interface PlanningRule {
  id: string;
  /** 是否命中（基于 tags.preferences / constraints / tripType 等） */
  when: (tags: Record<string, unknown>) => boolean;
  apply: (ctx: PlanningContext) => void;
}

const textOf = (tags: Record<string, unknown>): string => {
  const arr = (v: unknown) => (Array.isArray(v) ? v.join(" ") : "");
  return [arr(tags.preferences), arr(tags.constraints), String(tags.tripType ?? "")].join(" ");
};

const tighten = (ctx: PlanningContext, n: number) => {
  ctx.maxPerDay = ctx.maxPerDay === undefined ? n : Math.min(ctx.maxPerDay, n);
};

export const PLANNING_RULES: PlanningRule[] = [
  {
    id: "pace-relaxed",
    when: (t) => /不要太累|轻松|慢节奏|慢一点/.test(textOf(t)),
    apply: (ctx) => {
      tighten(ctx, 3);
      ctx.promptHints.push("用户明确想轻松一点：每天最多 3 个主要安排，相邻安排之间留吃饭/休息间隙，不要塞满每个小时");
      ctx.notes.push("节奏：不要太累 → 每天 ≤3 项");
    },
  },
  {
    id: "pace-parents",
    when: (t) => /陪父母|父母|爸妈|老人|长辈|家庭/.test(textOf(t)),
    apply: (ctx) => {
      tighten(ctx, 3);
      ctx.promptHints.push("陪父母出行：上午一个下午一个为宜，午餐安排留足时间，避免 20:00 之后的活动，避免连续长距离移动");
      ctx.notes.push("同行：陪父母 → 每天 ≤3 项 + 午休节奏");
    },
  },
];

/** 解析 tags → 规划上下文（所有命中规则叠加） */
export function resolvePlanningRules(tags: Record<string, unknown>): PlanningContext {
  const ctx: PlanningContext = { promptHints: [], notes: [] };
  for (const rule of PLANNING_RULES) {
    if (rule.when(tags)) rule.apply(ctx);
  }
  return ctx;
}

/**
 * E4-4 天气 soft rule（可注入测试）：雨天白天 + 户外型景点 → warning。
 * 只产出提示，绝不修改 placements；用户手动项不在 placementsByDay 中，天然不受影响。
 */
export function weatherWarnings(
  placementsByDay: Record<number, { activity: string; cardId?: string }[]>,
  cards: { id?: string; category?: string; description?: string }[],
  rainyDays: Set<number>
): string[] {
  if (rainyDays.size === 0) return [];
  const indoorHint = /馆|室内|博物|商城|书店|茶|影院|浴|温泉/;
  const out: string[] = [];
  for (const [d, items] of Object.entries(placementsByDay)) {
    const dayNum = Number(d);
    if (!rainyDays.has(dayNum)) continue;
    for (const it of items) {
      const card = cards.find((c) => c.id === it.cardId);
      const isOutdoorish =
        (card?.category ?? "attraction") === "attraction" &&
        !indoorHint.test(`${it.activity} ${card?.description ?? ""}`);
      if (isOutdoorish) {
        out.push(`Day ${dayNum} 白天有雨，「${it.activity}」可能受天气影响，建议关注天气或准备雨具`);
      }
    }
  }
  return out;
}

// ── E4-4 Gate：天气-旅行日对齐（错误天气事实比没有天气更危险） ──────────────
// 原则：A 有明确日期且落在预报范围内 → 注入；B 无明确日期 → 禁止把「预报第N天」伪装成「旅行DayN」；
//      C 日期超出预报范围 → 不注入不报错；D API 失败 → graceful（调用方 try/catch）。

export interface WeatherForecastLike {
  date: string;       // "2026-08-28"
  dayWeather: string; // 日级粒度：白天天气（无小时级数据，禁止扩写成伪精确时段）
  dayTemp: number;
  nightTemp: number;
}

const daySerial = (y: number, m: number, d: number) => Math.round(Date.UTC(y, m - 1, d) / 86400000);

/**
 * 解析旅行开始日期。仅接受明确日期："2026-08-29" / "8月29日"（无年份按今年，过去 30 天以上则按明年）。
 * 「五一」「下周」等模糊表述 → null（宁缺毋滥，不猜）。
 */
export function parseTripStartDate(dates?: string): { y: number; m: number; d: number } | null {
  if (!dates) return null;
  const iso = /(\d{4})-(\d{1,2})-(\d{1,2})/.exec(dates);
  if (iso) {
    const y = +iso[1], m = +iso[2], d = +iso[3];
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) return { y, m, d };
    return null;
  }
  const zh = /(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]/.exec(dates);
  if (zh) {
    const m = +zh[1], d = +zh[2];
    if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
    const now = new Date();
    let y = now.getFullYear();
    // 该日期在今年已过去 30 天以上 → 视为明年（旅行通常指向未来）
    if (daySerial(y, m, d) < daySerial(now.getFullYear(), now.getMonth() + 1, now.getDate()) - 30) y += 1;
    return { y, m, d };
  }
  return null;
}

/**
 * 天气事实对齐到旅行天。无明确日期 / 不在预报范围内 → 返回空（不注入）。
 * 产出日级粒度事实（「白天大雨」），绝不生成 API 未提供的小时级表述。
 */
export function alignWeatherToTripDays(
  forecasts: WeatherForecastLike[],
  dayCount: number,
  datesStr?: string
): { facts: string[]; rainyDays: number[] } {
  const start = parseTripStartDate(datesStr);
  if (!start) return { facts: [], rainyDays: [] };
  const startSerial = daySerial(start.y, start.m, start.d);
  const facts: string[] = [];
  const rainyDays: number[] = [];
  for (const f of forecasts ?? []) {
    const fm = /(\d{4})-(\d{1,2})-(\d{1,2})/.exec(f.date ?? "");
    if (!fm) continue;
    const tripDay = daySerial(+fm[1], +fm[2], +fm[3]) - startSerial + 1;
    if (tripDay < 1 || tripDay > dayCount) continue;
    facts.push(`Day${tripDay}（${f.date}）白天${f.dayWeather} ${f.nightTemp}~${f.dayTemp}°C`);
    if (/雨|雪|雷|冰雹/.test(f.dayWeather)) rainyDays.push(tripDay);
  }
  return { facts, rainyDays };
}
