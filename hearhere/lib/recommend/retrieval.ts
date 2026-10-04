// lib/recommend/retrieval.ts — 召回编排：确定性多路（纯函数）+ 可选 LLM hints 通道（IO 有界，失败静默退化）
// 职责边界：只管「应该向高德搜什么」；ranking/dedup/TRASH 不在此文件。

import { ollamaJson } from "@/lib/ollama";
import type { PreferenceSignals } from "./signals";

// ── E6-1B-3 可配置常量 ──────────────────────────────────
export const HINT_MAX_PER_CATEGORY = Number(process.env.HINT_MAX_PER_CATEGORY ?? 4);
export const HINT_MAX_TOTAL = Number(process.env.HINT_MAX_TOTAL ?? 8);
export const HINTS_TIMEOUT_MS = Number(process.env.HINTS_TIMEOUT_MS ?? 12000);
export const HINT_CACHE_TTL_MS = Number(process.env.HINT_CACHE_TTL_MS ?? 6 * 60 * 60 * 1000); // 6h

// ── hints 内存缓存（opportunistic，进程内；实例重启/扩容即丢失，不是持久缓存） ──
interface HintCacheEntry { hints: string[]; expiresAt: number }
const hintCache = new Map<string, HintCacheEntry>();
function cacheKey(destination: string, category: string) { return `${destination}::${category}`; }

/** LLM 输出归一化：数组/包裹对象 → 干净 string[]。任何脏输入都返回 []（不抛错）。 */
export function normalizeHints(raw: unknown, existingKeywords: string[]): string[] {
  let arr: unknown[] | null = null;
  if (Array.isArray(raw)) arr = raw;
  else if (raw && typeof raw === "object") {
    arr = (Object.values(raw as Record<string, unknown>).find(Array.isArray) as unknown[] | undefined) ?? null;
  }
  if (!arr) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of arr) {
    if (typeof item !== "string") continue;
    const s = item.trim();
    // 过滤：空串/过长/含解释性标点/明显类别词/已在确定性查询中
    if (!s || s.length > 12 || /[，。；：、\s]/.test(s)) continue;
    if (/景点|餐厅|美食|推荐|名单|如下|例如/.test(s)) continue;
    if (seen.has(s) || existingKeywords.includes(s)) continue;
    seen.add(s);
    out.push(s);
    if (out.length >= HINT_MAX_PER_CATEGORY) break;
  }
  return out;
}

export interface HintsResult {
  hints: string[];
  cacheHit: boolean;
  timedOut: boolean;
  failed: boolean;
  latencyMs: number;
}

/**
 * 生成 destination-specific POI 专名 hints。
 * 契约（任务书）：任何失败/超时/脏输出 → hints=[]，绝不阻断主召回链路。
 */
export async function getDestinationHints(
  destination: string,
  category: string,
  signals: PreferenceSignals,
  existingKeywords: string[]
): Promise<HintsResult> {
  const t0 = Date.now();
  const key = cacheKey(destination, category);
  const cached = hintCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return { hints: cached.hints.filter((h) => !existingKeywords.includes(h)).slice(0, HINT_MAX_PER_CATEGORY), cacheHit: true, timedOut: false, failed: false, latencyMs: 0 };
  }

  const catName = category === "food" ? "餐厅/美食（优先本地老字号、特色正餐）" : "景点";
  const scene = [signals.party === "family" ? "家庭出行" : "", signals.pace === "slow" ? "慢节奏" : ""].filter(Boolean).join("，");
  const prompt = `列出「${destination}」旅行最具代表性的${catName}具体名称，${HINT_MAX_PER_CATEGORY + 2} 个。只要具体 POI 名或区域词根（如「灵隐寺」「龙井」），不要类别词、不要解释。${scene ? `游客场景：${scene}。` : ""}仅输出 JSON 数组。`;

  try {
    // 外层墙钟硬顶：内部任何重试/降级路径都不允许让 hints 超过 HINTS_TIMEOUT_MS
    const raw = await Promise.race([
      ollamaJson<unknown>(prompt, { maxTokens: 512, jsonMode: true, timeoutMs: HINTS_TIMEOUT_MS }),
      new Promise<never>((_, rej) =>
        setTimeout(() => rej(new Error(`hints 墙钟超时（>${HINTS_TIMEOUT_MS}ms）`)), HINTS_TIMEOUT_MS)
      ),
    ]);
    const hints = normalizeHints(raw, existingKeywords);
    hintCache.set(key, { hints, expiresAt: Date.now() + HINT_CACHE_TTL_MS });
    console.log(`[hints] generated: ${JSON.stringify(hints)}`);
    return { hints, cacheHit: false, timedOut: false, failed: false, latencyMs: Date.now() - t0 };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const timedOut = /超时/.test(msg);
    console.warn(`[hints] 生成失败（${timedOut ? "timeout" : "error"}），退化为纯确定性召回:`, msg);
    return { hints: [], cacheHit: false, timedOut, failed: !timedOut, latencyMs: Date.now() - t0 };
  }
}


export interface RetrievalQuery {
  keyword: string;
  route: string; // base / interest:* / party:* / mobility:* / food:* / coverage:*
  category: string;
}

/** 通用目的地覆盖 taxonomy（非城市定制；某城市无结果=空即可，不强造候选） */
const COVERAGE_TAXONOMY: Array<{ route: string; suffix: string }> = [
  { route: "coverage:water", suffix: "湖泊" },
  { route: "coverage:wetland", suffix: "湿地" },
  { route: "coverage:temple", suffix: "寺庙" },
  { route: "coverage:heritage", suffix: "历史街区" },
  { route: "coverage:museum", suffix: "博物馆" },
  { route: "coverage:tea", suffix: "茶园" },
];

const BASE_SUFFIX: Record<string, string> = {
  attraction: "景区",
  food: "美食",
  souvenir: "特产",
};

/** 兴趣 → 召回词（可叠加；每兴趣 ≤2 词，全部经高德探针验证有效） */
const INTEREST_KEYWORDS: Record<string, string[]> = {
  photo: ["观景台", "夜景"],
  food: [], // food 兴趣由 food 类路由承载，景点类不重复造词
  culture: ["古镇", "历史街区"],
  nature: ["湖泊", "公园"],
  religion: ["寺庙"],
  niche: ["小众景点"],
};

/**
 * 构造确定性召回查询集。
 * 规则：
 * - attraction/food 走多路；souvenir 保持 base（其原链路逻辑在 route 层保留）
 * - 空偏好也有 base(+coverage) 路由
 * - 关键词按文本去重，路由合并
 */
export function buildQueries(
  destination: string,
  signals: PreferenceSignals,
  category: string
): RetrievalQuery[] {
  const queries: RetrievalQuery[] = [];
  const push = (keyword: string, route: string) => {
    const kw = keyword.trim();
    if (!kw) return; // 空 query 不发送
    const existing = queries.find((q) => q.keyword === kw);
    if (existing) {
      if (!existing.route.includes(route)) existing.route += `,${route}`; // duplicate query 去重、路由合并
    } else {
      queries.push({ keyword: kw, route, category });
    }
  };

  const base = BASE_SUFFIX[category];
  if (!base) return queries; // hotel 等不在此层处理
  push(destination + base, "base");

  if (category === "attraction") {
    // 兴趣路由（叠加，不再 else-if 互斥）
    for (const it of signals.interests) {
      for (const kw of INTEREST_KEYWORDS[it] || []) push(destination + kw, `interest:${it}`);
    }
    // party 辅助路由（mobility 不提供召回词：实测「观光车/电瓶车游览」类关键词
    // 只召回乘车点/停靠点等纯噪声 POI——mobility 保留在 ranking 信号层发挥作用）
    if (signals.party === "family") push(destination + "亲子", "party:family");
    // 通用目的地覆盖
    for (const t of COVERAGE_TAXONOMY) push(destination + t.suffix, t.route);
  }

  if (category === "food") {
    push(destination + "餐厅", "base");
    if (signals.food.localClassic) {
      push(destination + "老字号", "food:localClassic");
      push(destination + "本地菜", "food:localClassic");
    }
    if (signals.interests.includes("food")) push(destination + "特色餐厅", "interest:food");
    if (signals.party === "family") push(destination + "家庭聚餐", "party:family");
  }

  return queries;
}
