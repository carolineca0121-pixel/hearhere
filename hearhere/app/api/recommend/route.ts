/**
 * 智能推荐 API — LLM 驱动的标签→搜索→排序→推荐语管道
 *
 * POST /api/recommend
 * Body: {
 *   destination: string,
 *   tags: ExtractedTags,
 *   category: "attraction" | "food" | "souvenir" | "hotel",
 *   selectedLocations?: { name: string; lng: number; lat: number }[]
 * }
 *
 * 管道流程:
 *   用户标签 → LLM#1 生成搜索关键词 → 高德搜索真实 POI
 *   → 去重+质量过滤 → LLM#2 偏好排序+推荐语（合并为一次调用）→ 返回
 */

import { NextResponse } from "next/server";
import { searchPOIsBatch } from "@/lib/amap";
import { ollamaJson } from "@/lib/ollama";
import type { NormalizedPOI } from "@/lib/amap-types";
import { rankPipeline, preferenceSignals } from "@/lib/recommend/rank";
import { buildQueries } from "@/lib/recommend/retrieval";
import { searchPOIsRouted } from "@/lib/amap";

// Vercel 免费版 Serverless 默认 10s 超时，这个管道要串行 3 次 LLM + N 次高德请求，必须放宽
export const maxDuration = 60;

// ── 去重 ──────────────────────────────────────────────

function deduplicate(pois: NormalizedPOI[]): NormalizedPOI[] {
  const result: NormalizedPOI[] = [];
  const seen = new Set<string>();

  for (const p of pois) {
    const core = p.name
      .replace(/（.*?）|\(.*?\)/g, "")
      .replace(/(放生池|客堂|流通处|售票处|停车场|入口|出口|东门|西门|南门|北门|停车场).*$/, "")
      .replace(/(店|分店|旗舰店).*$/, "")
      .trim();

    if (core.length < 2) continue;
    if (seen.has(core)) continue;
    seen.add(core);
    result.push({ ...p, name: core });
  }
  return result;
}

// ── 质量过滤 ──────────────────────────────────────────

const TRASH_TYPECODES = new Set([
  "150000", "150100", "150200", "150300",
  "170000", "170100", "170200", "170300",
  "990000",
]);

const TRASH_KEYWORDS = [
  "售票", "停车场", "入口", "出口", "厕所", "卫生间",
  "公交站", "地铁站", "加油站", "收费站", "服务区",
  "ATM", "银行", "医院", "药店", "公厕",
];

function isTrash(poi: NormalizedPOI): boolean {
  const code = poi.typecode.slice(0, 6);
  if (TRASH_TYPECODES.has(code)) return true;
  const name = poi.name;
  if (TRASH_KEYWORDS.some((k) => name.includes(k))) return true;
  if (name.length < 3) return true;
  return false;
}

// ── LLM#1: 标签 → 搜索关键词 ─────────────────────────

const CATEGORY_NAMES: Record<string, string> = {
  attraction: "景点",
  food: "美食/餐厅",
  souvenir: "伴手礼/特产",
  hotel: "酒店/住宿",
};

/** 用餐时段 → LLM 搜索提示 */
const MEAL_HINTS: Record<string, string> = {
  breakfast: "侧重早餐、早茶、早点类",
  lunch: "侧重午餐、正餐、商务餐类",
  dinner: "侧重晚餐、家庭聚餐、正餐类",
  latenight: "侧重夜宵、深夜营业、烧烤类",
  afternoon: "侧重下午茶、咖啡、甜品、小吃类",
};

/** 菜系 → LLM 搜索提示 */
const CUISINE_HINTS: Record<string, string> = {
  local: "侧重本地特色菜、土菜馆",
  chuan: "侧重川菜、麻辣、火锅",
  yue: "侧重粤菜、点心、烧腊",
  seafood: "侧重海鲜、鱼鲜",
  hotpot: "侧重火锅、串串香",
  veg: "侧重素食、素斋、清淡",
  cafe: "侧重咖啡馆、茶室、甜品店",
  snack: "侧重小吃、快餐、路边摊",
};

/**
 * 智能搜索关键词生成。
 *
 * 优先用 LLM 生成（如果能正确返回具体关键词），
 * 如果 LLM 返回了很泛的词（如只用目的地名），则自动用规则补充。
 * 如果 LLM 完全失败，使用偏好驱动的规则生成。
 */
async function llmSearchKeywords(
  destination: string,
  preferences: string[],
  category: string,
  mealType?: string,
  cuisine?: string,
  budget?: string
): Promise<string[]> {
  const catName = CATEGORY_NAMES[category] || category;
  const prefStr = preferences.join("");
  const prefLen = preferences.length;

  // ── 直接规则生成（快速、可靠） ──
  const keywords: string[] = [destination + getCategorySuffix(category, 0)];

  // 根据偏好追加
  if (category === "attraction") {
    if (/父母|爸妈|老人|长辈/.test(prefStr)) keywords.push(destination + "寺庙", destination + "公园");
    else if (/情侣|约会|浪漫/.test(prefStr)) keywords.push(destination + "夜景", destination + "海滩");
    else if (/闺蜜|拍照|打卡|网红/.test(prefStr)) keywords.push(destination + "拍照", destination + "咖啡馆");
    else if (/徒步|爬山|户外|登山/.test(prefStr)) keywords.push(destination + "徒步", destination + "山");
    else if (/看海|海边|沙滩|海/.test(prefStr)) keywords.push(destination + "海滩", destination + "海景");
    else if (/祈福|寺|拜佛|佛/.test(prefStr)) keywords.push(destination + "寺庙", destination + "观音");
    else if (/历史|文化|博物|古镇/.test(prefStr)) keywords.push(destination + "博物馆", destination + "古镇");
    else if (/安静|喝茶|小众|放松|发呆/.test(prefStr)) keywords.push(destination + "茶馆", destination + "安静");
    else {
      keywords.push(destination + "景区", destination + "景点");
    }
  } else if (category === "food") {
    // 菜系优先
    if (cuisine === "hotpot" || /火锅|麻辣|串串/.test(prefStr)) keywords.push(destination + "火锅", destination + "串串");
    else if (cuisine === "chuan" || /川菜|辣/.test(prefStr)) keywords.push(destination + "川菜", destination + "麻辣");
    else if (cuisine === "yue" || /粤菜|点心|早茶/.test(prefStr)) keywords.push(destination + "粤菜", destination + "早茶");
    else if (cuisine === "seafood" || /海鲜|鱼/.test(prefStr)) keywords.push(destination + "海鲜", destination + "鱼鲜");
    else if (cuisine === "veg" || /素|斋|清淡/.test(prefStr)) keywords.push(destination + "素食", destination + "素斋");
    else if (cuisine === "cafe" || /咖啡|茶|甜品|下午茶/.test(prefStr)) keywords.push(destination + "咖啡馆", destination + "甜品");
    else if (cuisine === "snack" || /小吃|快餐/.test(prefStr)) keywords.push(destination + "小吃", destination + "快餐");
    else if (/本地|特色|老店/.test(prefStr)) keywords.push(destination + "本地菜", destination + "老字号");
    else keywords.push(destination + "美食", destination + "餐厅");

    // 时段
    if (mealType === "breakfast") keywords.push(destination + "早餐");
    else if (mealType === "afternoon") keywords.push(destination + "下午茶");
    else if (mealType === "latenight") keywords.push(destination + "夜宵");
  } else if (category === "souvenir") {
    keywords.push(destination + "特产", destination + "伴手礼");
  } else if (category === "hotel") {
    // ── 品牌连锁酒店（按 budget 分档） ──
    const budgetStr = budget || "";
    const isLuxury = /豪华|高端|五星|奢侈|不设限|贵/.test(budgetStr);
    const isMid = /中等|中档|舒适|千元|几百/.test(budgetStr) || (!isLuxury && !/经济|便宜|预算|省钱|穷游/.test(budgetStr));

    if (isLuxury) {
      // 豪华型
      keywords.push(destination + "希尔顿", destination + "万豪", destination + "洲际", destination + "香格里拉");
    } else if (isMid) {
      // 中高端
      keywords.push(destination + "全季", destination + "桔子水晶", destination + "亚朵", destination + "希尔顿欢朋");
    } else {
      // 经济型
      keywords.push(destination + "汉庭", destination + "如家", destination + "格林豪泰", destination + "7天");
    }
  }

  // 去重
  const seen = new Set<string>();
  const unique = keywords.filter((k) => {
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  // ── 同时尝试 LLM（非阻塞，仅作增强） ──
  const prompt = `目的地:${destination} 偏好:${prefStr}${mealType ? " 时段:" + mealType : ""}${cuisine ? " 菜系:" + cuisine : ""}
生成2个新的高德地图"${catName}"搜索词，不要与已有词重复。仅JSON数组。`;

  try {
    const llmResult = await ollamaJson<string[]>(prompt, { maxTokens: 128 });
    if (Array.isArray(llmResult)) {
      for (const kw of llmResult) {
        if (typeof kw === "string" && kw.length > 2 && !seen.has(kw)) {
          seen.add(kw);
          unique.push(kw);
        }
      }
    }
  } catch {
    // LLM 失败不影响——规则生成已足够好
  }

  return unique.slice(0, 5);
}

function getCategorySuffix(category: string, index: number): string {
  const map: Record<string, string[]> = {
    attraction: ["景区", "必去景点", "旅游"],
    food: ["美食", "好吃的", "餐厅"],
    souvenir: ["特产", "伴手礼", "买什么"],
    hotel: ["酒店", "住宿", "住哪里"],
  };
  const suffixes = map[category] || map.attraction;
  return suffixes[index % suffixes.length];
}

// ── 排序链路已迁至 lib/recommend/rank.ts（E6-1A：代码预排序 → Top15 → LLM 终审 → 模板兜底） ──

// ── 目的地→Amap 搜索城市 ─────────────────────────────

function resolveAmapCity(dest: string): string {
  // 让 LLM 来做这个映射太重了，保留硬编码 + 兜底
  const map: Record<string, string> = {
    普陀山: "舟山", 鼓浪屿: "厦门", 兵马俑: "西安", 华山: "渭南",
    黄山: "黄山", 泰山: "泰安", 峨眉山: "乐山", 庐山: "九江",
    千岛湖: "杭州", 乌镇: "嘉兴", 周庄: "苏州",
    九寨沟: "阿坝", 张家界: "张家界",
  };
  return map[dest] || dest;
}

// ── API ───────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const destination: string = body.destination?.trim();
    const tags = body.tags || {};
    const category: string = body.category || "attraction";
    const preferences: string[] = tags.preferences || [];
    const mealType: string | undefined = body.mealType;
    const cuisine: string | undefined = body.cuisine;

    if (!destination) {
      return NextResponse.json({ error: "缺少目的地" }, { status: 400 });
    }

    // 1. 召回查询（E6-1B-1）：attraction/food 走确定性多路；hotel/souvenir 保持原链路不变
    const searchCity = resolveAmapCity(destination);
    const useDeterministic = category === "attraction" || category === "food";
    const signalsForRetrieval = preferenceSignals([...preferences, ...(tags.constraints || [])], body.rawText);
    const routedQueries = useDeterministic ? buildQueries(destination, signalsForRetrieval, category) : [];
    const keywords = useDeterministic
      ? routedQueries.map((q) => q.keyword)
      : await llmSearchKeywords(destination, preferences, category, mealType, cuisine, tags.budget);

    console.log(`[recommend] destination=${destination}, category=${category}`);
    console.log(`[recommend] keywords=${JSON.stringify(keywords)}, searchCity=${searchCity}`);
    if (useDeterministic) {
      console.log(`[recommend] routes=${JSON.stringify(routedQueries.map((q) => `${q.route}→${q.keyword}`))}`);
    }

    // 2. Amap 搜索真实 POI
    let pois: NormalizedPOI[];
    const tAmap = Date.now();
    try {
      pois = useDeterministic
        ? await searchPOIsRouted(searchCity, routedQueries, 8)
        : await searchPOIsBatch(searchCity, keywords, 8);
      console.log(`[recommend] Amap returned ${pois.length} POIs, amap=${Date.now() - tAmap}ms`);
    } catch (e) {
      console.error("[recommend] Amap search failed:", e);
      return NextResponse.json({ pois: [], count: 0, _error: `amap: ${e instanceof Error ? e.message : String(e)}` });
    }

    // 3. 去重 + 质量过滤
    pois = deduplicate(pois.filter((p) => !isTrash(p)));
    console.log(`[recommend] after dedup+filter: ${pois.length} POIs`);

    // 4. 排序链路（E6-1A）：代码预排序 → Top15 → LLM 终审 → 失败保留代码序+模板推荐语
    const { final, reasonOf, llmOnline, traces, signals, codeMs, llmMs } = await rankPipeline(
      destination,
      pois,
      [...preferences, ...(tags.constraints || [])],
      category,
      body.rawText
    );
    pois = final;
    console.log(`[recommend] rank: llmOnline=${llmOnline}, signals=${signals.evidence.join(";") || "none"}`);
    console.log(`[recommend] latency: code=${codeMs}ms llm=${llmMs}ms`);

    // 6. 构建响应
    const items = pois.slice(0, 12).map((p) => {
      const reasonData = reasonOf(p);
      return {
        id: `rec-${category}-${p.poiId || Math.random().toString(36).slice(2, 8)}`,
        name: p.name,
        address: p.address,
        district: p.district,
        type: p.type,
        lng: p.lngWgs84,
        lat: p.latWgs84,
        reason: reasonData.description,
        recommendedDish: reasonData.recommendedDish,
        giftPitch: reasonData.giftPitch,
        category,
      };
    });

    console.log(`[recommend] returning ${items.length} items`);
    return NextResponse.json({
      pois: items,
      count: items.length,
      _debug: {
        keywords, searchCity, llmOnline,
        traces: traces.slice(0, 15).map((t) => ({ name: t.name, total: t.total, matched: t.matched })),
      },
      _v: 3,
    });
  } catch (error) {
    console.error("[recommend]", error);
    return NextResponse.json({ pois: [], count: 0, _error: error instanceof Error ? error.message : String(error) });
  }
}
