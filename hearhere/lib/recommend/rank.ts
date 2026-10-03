// lib/recommend/rank.ts — 确定性预排序 + LLM 终审 + 模板兜底推荐语（纯函数层 + 一个 LLM 边界）
// E6-1A 原则：LLM 是增强层不是单点；失败时保留代码排序 + 信号可解释推荐语。

import { ollamaJson } from "@/lib/ollama";
import type { NormalizedPOI } from "@/lib/amap";
import { haversineKm } from "@/lib/geo";
import { preferenceSignals, signalsSummary, type PreferenceSignals } from "./signals";

// ── trace（benchmark/debug 用，不进前端） ────────────────
export interface ScoreTrace {
  name: string;
  poiId?: string;
  base: number;
  interestBoost: number;
  mobilityPenalty: number;
  brandPenalty: number;
  localityBoost: number;
  partyPenalty: number;
  /** E6-1B-2 tie-break 明细（仅打破同分，幅度 <1，不压过偏好分） */
  routeBonus: number;    // 多路由佐证
  gradeBonus: number;    // AMap 景区等级（国家级景点）
  spatialAdj: number;    // 距候选池锚点平滑降权（负值）
  distKm: number | null;
  tieAdjust: number;
  total: number;
  matched: string[]; // 命中的信号
}

export interface ScoredPOI {
  poi: NormalizedPOI;
  score: number;
  trace: ScoreTrace;
}

const FASTFOOD_RE = /肯德基|麦当劳|汉堡王|必胜客|德克士|赛百味|华莱士|塔斯汀/;
const GENERIC_CHAIN_RE = /星巴克|瑞幸|蜜雪冰城|海底捞|很久以前|哥老官|牛.?New|肉本家/;
const LOCAL_CLASSIC_RE = /楼外楼|知味观|奎元馆|杭州酒家|天香楼|山外山|王润兴|状元馆|西乐园|采芝斋|叶受和|皇饭儿|德明饭店|福缘居|外婆家|新白鹿|绿茶/;
const MOUNTAIN_RE = /登山|爬山|徒步|索道|攀岩|峰|山巅/;
const NIGHTLIFE_TYPE_RE = /酒吧|夜店|KTV/;

/** 单个候选的确定性打分。纯函数。 */
export function scoreCandidate(
  poi: NormalizedPOI,
  signals: PreferenceSignals,
  category: string
): ScoredPOI {
  const typeFirst = (poi.type || "").split(";")[0] || "";
  const name = poi.name;
  const trace: ScoreTrace = {
    name, poiId: poi.poiId, base: 5,
    interestBoost: 0, mobilityPenalty: 0, brandPenalty: 0, localityBoost: 0, partyPenalty: 0,
    routeBonus: 0, gradeBonus: 0, spatialAdj: 0, distKm: null, tieAdjust: 0,
    total: 0, matched: [],
  };

  // 兴趣 × 类型匹配
  for (const it of signals.interests) {
    let boost = 0;
    if (category === "attraction") {
      if (it === "nature" && /风景名胜|公园|湿地|湖泊/.test(poi.type + name)) boost = 2;
      if (it === "religion" && /寺|庙|禅|宗教|佛/.test(name + poi.type)) boost = 2;
      if (it === "culture" && /博物|历史|街区|古镇|故居|纪念馆|文化/.test(name + poi.type)) boost = 2;
      if (it === "photo" && /观景|夜景|灯光|桥|塔/.test(name)) boost = 1;
      if (it === "food" && /茶|茶楼|茶村/.test(name)) boost = 1;
    } else if (category === "food") {
      if (it === "food" && /餐饮|浙江菜|本帮|地方菜/.test(poi.type)) boost = 1;
    } else if (category === "souvenir") {
      if (it === "culture" && /文创|工艺|特产/.test(name + poi.type)) boost = 1;
    }
    if (boost > 0) {
      trace.interestBoost += boost;
      trace.matched.push(`interest:${it}+${boost}`);
    }
  }

  // mobility：老人 → 山岳/徒步类降权
  if (signals.mobility === "elderly" && category === "attraction" && MOUNTAIN_RE.test(name + poi.type)) {
    trace.mobilityPenalty = -3;
    trace.matched.push("mobility:elderly-3");
  }

  // party：家庭/老人 → 夜生活类降权
  if ((signals.party === "family" || signals.mobility === "elderly") && NIGHTLIFE_TYPE_RE.test(poi.type + name)) {
    trace.partyPenalty = -2;
    trace.matched.push("party-2");
  }

  // food 品牌/本地性
  if (category === "food") {
    if (FASTFOOD_RE.test(name) && !signals.food.fastFoodOk) {
      trace.brandPenalty = -3;
      trace.matched.push("fastfood-3");
    } else if (GENERIC_CHAIN_RE.test(name) && signals.food.localClassic) {
      trace.brandPenalty = -2;
      trace.matched.push("chain-2");
    }
    if (LOCAL_CLASSIC_RE.test(name)) {
      trace.localityBoost = signals.food.localClassic ? 3 : 1;
      trace.matched.push(`localClassic+${trace.localityBoost}`);
    }
  }

  // pace slow：纯展示信号，不改分（裁决：slow 不砍候选数量）
  if (signals.pace === "slow") trace.matched.push("pace:slow(仅标记)");

  trace.total = trace.base + trace.interestBoost + trace.mobilityPenalty + trace.brandPenalty + trace.localityBoost + trace.partyPenalty;
  return { poi, score: trace.total, trace };
}

/** 全池确定性预排序。同分打破：多路由佐证 + AMap 等级 + 空间平滑降权 + poiId 兜底（幅度全部 <1，不压过偏好分）。 */
export function rankCandidates(
  pois: NormalizedPOI[],
  signals: PreferenceSignals,
  category: string
): { ranked: ScoredPOI[]; traces: ScoreTrace[] } {
  const scored = pois.map((p, i) => ({ ...scoreCandidate(p, signals, category), _i: i }));

  // 空间锚点：候选池经纬度中位数（对远郊离群鲁棒；无有效坐标则不施加空间调整）
  const valid = scored.filter((s) => s.poi.lngWgs84 && s.poi.latWgs84);
  let anchor: { lng: number; lat: number } | null = null;
  if (valid.length >= 3) {
    const mid = (arr: number[]) => { const s = [...arr].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
    anchor = { lng: mid(valid.map((s) => s.poi.lngWgs84)), lat: mid(valid.map((s) => s.poi.latWgs84)) };
  }

  for (const s of scored) {
    const t = s.trace;
    // 多路由佐证：被越多独立路由召回，证据越强（封顶 4 路）
    const routes = s.poi.sourceRoutes?.length ?? 0;
    t.routeBonus = Math.min(routes, 4) * 0.15;
    // AMap 景区等级（官方语义，通用信号）
    t.gradeBonus = /国家级景点/.test(s.poi.type) ? 0.25 : 0;
    // 类目对齐：景点页优先真景点（购物/餐饮误入不加分），美食页同理
    const typeHead = (s.poi.type || "").split(";")[0] || "";
    const align = category === "attraction" ? typeHead === "风景名胜" : category === "food" ? typeHead === "餐饮服务" : true;
    if (align) t.gradeBonus += 0.1;
    // 伞下子景点让位母景区（通用规则：「母景区-子景点」命名结构）
    const dash = s.poi.name.indexOf("-");
    if (dash > 1) {
      const parent = s.poi.name.slice(0, dash);
      if (scored.some((o) => o !== s && o.poi.name === parent)) {
        t.gradeBonus -= 0.2;
        t.matched.push("umbrella-child-0.2");
      }
    }
    // 空间：距锚点平滑降权，无硬阈值（0km→0，30km→-0.15，133km→-0.665 封顶 -0.75）
    if (anchor) {
      const d = haversineKm({ lng: s.poi.lngWgs84, lat: s.poi.latWgs84 }, anchor);
      t.distKm = d === null ? null : Math.round(d * 10) / 10;
      t.spatialAdj = d === null ? 0 : -Math.min(d, 150) / 200;
    }
    t.tieAdjust = Math.round((t.routeBonus + t.gradeBonus + t.spatialAdj) * 1000) / 1000;
    if (t.routeBonus > 0) t.matched.push(`routes×${routes}+${t.routeBonus}`);
    if (t.gradeBonus > 0) t.matched.push("grade:国家级+0.25");
    if (t.spatialAdj < -0.1) t.matched.push(`spatial:${t.distKm}km${t.spatialAdj}`);
  }

  scored.sort((a, b) =>
    b.score - a.score ||
    b.trace.tieAdjust - a.trace.tieAdjust ||
    (a.poi.poiId || a.poi.name).localeCompare(b.poi.poiId || b.poi.name)
  );
  return { ranked: scored, traces: scored.map((s) => s.trace) };
}

// ── 模板兜底推荐语（必须含具体可解释信号，≠类别名） ──────

export function templateReason(poi: NormalizedPOI, signals: PreferenceSignals, category: string): string {
  const name = poi.name;
  const district = poi.district || "";
  const typeFirst = (poi.type || "").split(";")[0] || "";

  if (category === "attraction") {
    if (signals.mobility === "elderly" && !MOUNTAIN_RE.test(name + poi.type)) return "地势平缓，步行负担相对较低";
    if (signals.interests.includes("religion") && /寺|庙|禅/.test(name)) return "寺庙清净，适合陪长辈祈福静游";
    if (signals.interests.includes("culture") && /街区|古镇|故居|博物/.test(name)) return "人文街区，适合慢逛细看";
    if (signals.interests.includes("nature") && /湖|湿地|公园/.test(name)) return "自然风光，适合慢节奏游览";
    if (signals.pace === "slow") return "节奏从容，适合慢游";
    if (district) return `位于${district}，适合顺路安排`;
  }
  if (category === "food") {
    if (LOCAL_CLASSIC_RE.test(name)) return "本地老字号，适合家庭聚餐";
    if (district) return `位于${district}，行程顺路就餐`;
  }
  if (category === "souvenir" && district) return `${district}特产，返程前可顺路买`;
  // 最终兜底也不许是裸类别名
  return district ? `${typeFirst}，位于${district}` : `${typeFirst}，行程中可灵活安排`;
}

// ── LLM 终审（Top 15 → ≤20字短评，index 映射，失败返 null） ──

export interface RerankResult {
  /** LLM 排出的 index 顺序（指向输入数组） */
  order: number[];
  /** index → 推荐理由/推荐菜 */
  reasons: Map<number, { description?: string; recommendedDish?: string; giftPitch?: string }>;
}

const RERANK_TIMEOUT_MS = 35000;

/** 把 LLM 返回数组鲁棒映射为 {order, reasons}。纯函数：乱序/子集/越界/脏数据均不丢卡不崩溃。 */
export function applyRerankArray(
  arr: unknown[],
  candidateCount: number
): RerankResult | null {
  const order: number[] = [];
  const used = new Set<number>();
  const reasons = new Map<number, { description?: string; recommendedDish?: string; giftPitch?: string }>();

  for (const item of arr) {
    if (!item || typeof item !== "object") continue;
    const idx = (item as { index?: unknown }).index;
    if (typeof idx !== "number" || idx < 0 || idx >= candidateCount || used.has(idx)) continue;
    used.add(idx);
    order.push(idx);
    const it = item as { description?: unknown; recommendedDish?: unknown; giftPitch?: unknown };
    reasons.set(idx, {
      description: typeof it.description === "string" ? it.description : undefined,
      recommendedDish: typeof it.recommendedDish === "string" ? it.recommendedDish : undefined,
      giftPitch: typeof it.giftPitch === "string" ? it.giftPitch : undefined,
    });
  }
  return order.length > 0 ? { order, reasons } : null;
}

export async function llmRerank(
  destination: string,
  candidates: NormalizedPOI[], // 已代码预排序的 Top N
  signals: PreferenceSignals,
  category: string
): Promise<RerankResult | null> {
  if (candidates.length === 0) return null;

  const list = candidates
    .map((p, i) => `${i}: ${p.name}（${(p.type || "").split(";")[0] || "其他"}，${p.district || "未知区"}）`)
    .join("\n");

  const extraSpec =
    category === "food"
      ? `，并附 recommendedDish（1-2 道推荐菜，顿号分隔）`
      : category === "souvenir"
        ? `，并附 giftPitch（≤15字推荐话语）`
        : "";

  const prompt = `你是旅行推荐专家。目的地【${destination}】。用户信号：${signalsSummary(signals)}。
候选${category === "food" ? "餐厅" : category === "souvenir" ? "伴手礼" : category === "hotel" ? "酒店" : "景点"}（已初步排序）：
${list}
任务：按与用户信号的匹配度重新排序，最多保留12个；为每个写 description（≤20字，具体说明为何适合这个用户，禁止套话）${extraSpec}。
只输出JSON数组：[{"index":0,"description":"..."}]`;

  try {
    const raw = await ollamaJson<unknown>(prompt, { maxTokens: 1200, jsonMode: true, timeoutMs: RERANK_TIMEOUT_MS });
    // 鲁棒取数组：直接数组 or 包裹在对象里
    const arr: unknown[] | null = Array.isArray(raw)
      ? raw
      : raw && typeof raw === "object"
        ? (Object.values(raw as Record<string, unknown>).find(Array.isArray) as unknown[] | undefined) ?? null
        : null;
    if (!arr || arr.length === 0) return null;
    return applyRerankArray(arr, candidates.length);
  } catch (e) {
    console.warn("[recommend] llmRerank failed, fallback to code ranking:", e instanceof Error ? e.message : e);
    return null;
  }
}

/** 完整排序链路：代码预排序 → Top N → LLM 终审 → 兜底。返回最终 POI 序 + 每卡推荐语。 */
export async function rankPipeline(
  destination: string,
  pois: NormalizedPOI[],
  prefsText: string[],
  category: string,
  rawText?: string
): Promise<{
  final: NormalizedPOI[];
  reasonOf: (p: NormalizedPOI) => { description: string; recommendedDish?: string; giftPitch?: string };
  llmOnline: boolean;
  traces: ScoreTrace[];
  signals: PreferenceSignals;
  codeMs: number;
  llmMs: number;
}> {
  const t0 = Date.now();
  const signals = preferenceSignals(prefsText, rawText);
  const { ranked, traces } = rankCandidates(pois, signals, category);
  const topN = ranked.slice(0, 15);
  const codeMs = Date.now() - t0;
  const tLlm = Date.now();
  const llm = await llmRerank(destination, topN.map((s) => s.poi), signals, category);
  const llmMs = Date.now() - tLlm;

  // LLM 成功：按 LLM 顺序 + 追加未提及的（保数据）；失败：代码顺序
  const finalScored = llm
    ? [...llm.order.map((i) => topN[i]), ...topN.filter((_, i) => !llm.order.includes(i))]
    : topN;
  const final = [...finalScored.map((s) => s.poi), ...ranked.slice(15).map((s) => s.poi)];

  const reasonOf = (p: NormalizedPOI) => {
    const idx = topN.findIndex((s) => s.poi === p);
    const llmReason = idx >= 0 && llm ? llm.reasons.get(idx) : undefined;
    return {
      description: llmReason?.description || templateReason(p, signals, category),
      recommendedDish: llmReason?.recommendedDish,
      giftPitch: llmReason?.giftPitch,
    };
  };

  return { final, reasonOf, llmOnline: llm !== null, traces, signals, codeMs, llmMs };
}

export { preferenceSignals };
