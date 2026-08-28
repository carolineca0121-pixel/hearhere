/**
 * lib/duration.ts — 时长解析与时间占用区间（单一事实来源）
 *
 * 策略（经产品确认的设计决策）：
 * - 区间值如「约 3-4 小时」：UI 占位用 min（保守最少占用，视觉不过度阻塞）；
 *   规划/冲突判断用 max（安全阻塞，宁多不少）。
 * - 「约 1 小时」整 1 小时不算长项（不占延续行），但参与冲突判断。
 * - 无法解析 → null（不占位、不参与冲突）。
 */

export interface DurationRange {
  minHours: number;
  maxHours: number;
}

/** 解析时长文案："约 2.2 小时" / "约 3-4 小时" / "约 45 分钟" / "1小时30分钟" 等 */
export function parseDurationRange(text?: string | null): DurationRange | null {
  if (!text || typeof text !== "string") return null;
  const t = text.trim();
  if (!t) return null;

  // 组合形式："1小时30分钟" / "约1小时10分钟"
  const combo = /(\d+(?:\.\d+)?)\s*小时\s*(\d+)\s*分钟/.exec(t);
  if (combo) {
    const h = parseFloat(combo[1]);
    const m = parseInt(combo[2], 10) / 60;
    return { minHours: h + m, maxHours: h + m };
  }

  // 区间形式："3-4小时" / "3～4小时" / "3~4 小时"
  const range = /(\d+(?:\.\d+)?)\s*[-~～]\s*(\d+(?:\.\d+)?)\s*小时/.exec(t);
  if (range) {
    const a = parseFloat(range[1]);
    const b = parseFloat(range[2]);
    return { minHours: Math.min(a, b), maxHours: Math.max(a, b) };
  }

  // 单一小时："约 2 小时" / "2.5小时" / "2小时左右"
  const hours = /(\d+(?:\.\d+)?)\s*小时/.exec(t);
  if (hours) {
    const h = parseFloat(hours[1]);
    return { minHours: h, maxHours: h };
  }

  // 分钟："约 45 分钟" / "30分钟"
  const mins = /(\d+)\s*分钟/.exec(t);
  if (mins) {
    const h = parseInt(mins[1], 10) / 60;
    return { minHours: h, maxHours: h };
  }

  return null;
}

/** 兼容旧签名：取 min（UI 占位用） */
export function parseDurationHours(text?: string | null): number | null {
  return parseDurationRange(text)?.minHours ?? null;
}

export interface OccupiedInterval {
  dayIndex: number;
  startMin: number; // 分钟制，如 13:00 → 780
  endMin: number;
  label: string;
  source?: string;
}

/** 从「HH:MM」解析分钟数；非法返回 null */
export function timeToMinutes(time?: string | null): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec((time ?? "").trim());
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const mi = parseInt(m[2], 10);
  if (h > 23 || mi > 59) return null;
  return h * 60 + mi;
}

export function minutesToTime(mins: number): string {
  return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
}

/**
 * 计算一组行程项的占用区间。
 * @param items 带 time/duration/source 的项
 * @param useMax true=规划/冲突（maxHours，安全阻塞）；false=UI 占位（minHours）
 * @param minBlockHours 只有占用超过该时长才产生区间（默认 >1h；恰好 1h 不产生延续/阻塞）
 */
export function occupiedIntervalsFor<T extends { time?: string; activity?: string; duration?: string; source?: string }>(
  items: T[],
  dayIndex: number,
  useMax: boolean,
  minBlockHours = 1
): OccupiedInterval[] {
  const out: OccupiedInterval[] = [];
  for (const it of items) {
    const start = timeToMinutes(it.time);
    if (start === null) continue;
    const range = parseDurationRange(it.duration);
    if (!range) continue;
    const hours = useMax ? range.maxHours : range.minHours;
    if (hours <= minBlockHours) continue;
    out.push({
      dayIndex,
      startMin: start,
      endMin: start + Math.round(hours * 60),
      label: it.activity ?? "",
      source: it.source,
    });
  }
  return out;
}

/** 判断 [startMin, startMin+spanMin) 是否与区间冲突 */
export function intervalOverlaps(startMin: number, spanMin: number, iv: OccupiedInterval): boolean {
  const end = startMin + spanMin;
  return startMin < iv.endMin && iv.startMin < end;
}
