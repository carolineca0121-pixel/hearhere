import { readFile } from "fs/promises";
import path from "path";
import type { ExtractedTags, InsightCard } from "@/lib/types";
import { LocalServiceError, ollamaJson } from "@/lib/ollama";
import { foodCardsPrompt, llmCardsPrompt, poiReviewPrompt } from "@/lib/ai-prompts";
import { searchPOIsBatch, isAttraction, isFood, type NormalizedPOI } from "@/lib/amap";

const INSIGHT_SOURCE = process.env.INSIGHT_SOURCE ?? "llm";
const CRAWLER_URL = process.env.CRAWLER_URL ?? "http://localhost:8000/api/insights";
const TAVILY_API_KEY = process.env.TAVILY_API_KEY ?? "";

function isPlaceholder(value: string): boolean {
  return !value || value.startsWith("请替换") || value.trim() === "";
}

async function loadMockCards(intent: string): Promise<InsightCard[]> {
  const filePath = path.join(process.cwd(), "data", "mock-insights.json");
  const raw = await readFile(filePath, "utf-8");
  const all = JSON.parse(raw) as InsightCard[];
  const q = intent.toLowerCase();
  const filtered = all.filter(
    (c) =>
      c.category !== "food" &&
      (c.title.includes(intent) || c.reason.includes(intent) || q.length < 2)
  );
  return (filtered.length > 0 ? filtered : all.filter((c) => c.category !== "food")).slice(0, 12);
}

async function fetchCrawlerCards(intent: string): Promise<InsightCard[]> {
  const url = new URL(CRAWLER_URL);
  url.searchParams.set("q", intent);

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      signal: AbortSignal.timeout(30000),
    });
  } catch {
    throw new LocalServiceError(
      "无法连接本地爬虫服务，将回退 Mock 数据",
      "crawler"
    );
  }

  if (!res.ok) {
    throw new LocalServiceError(`爬虫返回错误 (${res.status})`, "crawler");
  }

  const data = (await res.json()) as { cards?: InsightCard[] };
  return (data.cards ?? []).filter((c) => c.category !== "food").slice(0, 12);
}

async function fetchTavilyCards(intent: string): Promise<InsightCard[]> {
  if (isPlaceholder(TAVILY_API_KEY)) {
    throw new LocalServiceError("未配置 TAVILY_API_KEY", "tavily");
  }

  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      api_key: TAVILY_API_KEY,
      query: `${intent} 具体景点 推荐 -美食 -餐厅`,
      search_depth: "basic",
      include_images: true,
      include_image_descriptions: true,
      max_results: 10,
    }),
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) {
    throw new LocalServiceError(`Tavily API 返回错误 (${res.status})`, "tavily");
  }

  const data = (await res.json()) as {
    results?: Array<{
      title?: string;
      content?: string;
      url?: string;
    }>;
    images?: Array<string | { url?: string; description?: string }>;
  };
  const results = data.results ?? [];
  const images = data.images ?? [];

  const TAVILY_FALLBACK = "https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=800&q=80";
  const pickImage = (i: number): string => {
    const raw = images[i];
    if (!raw) return TAVILY_FALLBACK;
    if (typeof raw === "string") return raw;
    return raw.url ?? TAVILY_FALLBACK;
  };

  return results.slice(0, 12).map((result, index): InsightCard => {
    const content = result.content ?? "";
    return {
      id: `tavily-${index}`,
      title: result.title ?? `景点 ${index + 1}`,
      review: content.slice(0, 70) || "值得加入行程的具体景点",
      reason: content.slice(70, 140) || "符合你的旅行偏好",
      imageUrl: pickImage(index),
      sourceUrl: result.url,
      category: "attraction",
    };
  });
}

async function fetchLLMCards(
  destination: string,
  tags: ExtractedTags
): Promise<InsightCard[]> {
  type RawCard = {
    title: string;
    review: string;
    reason: string;
    fitTags?: string[];
    intensity?: string;
    bestTime?: string;
    estimatedDuration?: string;
    category?: string;
  };

  let raw: RawCard[];
  try {
    raw = await ollamaJson<RawCard[]>(llmCardsPrompt(destination, tags, 12));
  } catch (e) {
    throw new LocalServiceError(
      `LLM 卡片生成失败：${e instanceof Error ? e.message : "未知错误"}`,
      "llm-cards"
    );
  }

  if (!Array.isArray(raw) || raw.length === 0) {
    throw new LocalServiceError("LLM 未返回推荐卡片", "llm-cards");
  }

  return raw
    .filter((c) => c.category !== "food")
    .filter((c) => c.title !== destination)
    .slice(0, 12)
    .map((c, i): InsightCard => ({
      id: `llm-${Date.now()}-${i}`,
      title: c.title,
      review: c.review || "",
      reason: c.reason || "",
      category: "attraction",
      fitTags: c.fitTags,
      intensity: c.intensity,
      bestTime: c.bestTime,
      estimatedDuration: c.estimatedDuration,
    }));
}

async function fetchLLMFoodCards(
  destination: string,
  tags: ExtractedTags
): Promise<InsightCard[]> {
  type RawCard = {
    title: string;
    review: string;
    reason: string;
    fitTags?: string[];
    intensity?: string;
    bestTime?: string;
    estimatedDuration?: string;
    category?: string;
  };

  let raw: RawCard[];
  try {
    raw = await ollamaJson<RawCard[]>(foodCardsPrompt(destination, tags, 12));
  } catch (e) {
    throw new LocalServiceError(
      `LLM 美食生成失败：${e instanceof Error ? e.message : "未知错误"}`,
      "llm-food-cards"
    );
  }

  if (!Array.isArray(raw) || raw.length === 0) {
    throw new LocalServiceError("LLM 未返回美食卡片", "llm-food-cards");
  }

  const nonFoodPattern = /香包|纪念品|伴手礼|博物馆|景区|寺|山|湖|公园|街区|古城|沙滩|海边|酒店|车站|机场/;

  return raw
    .filter((c) => !nonFoodPattern.test(c.title))
    .slice(0, 12)
    .map((c, i): InsightCard => ({
      id: `food-${Date.now()}-${i}`,
      title: c.title,
      review: c.review || "",
      reason: c.reason || "",
      category: "food",
      fitTags: c.fitTags,
      intensity: c.intensity,
      bestTime: c.bestTime,
      estimatedDuration: c.estimatedDuration,
    }));
}

// ── Amap 真实 POI 卡片生成 ──────────────────────────

/** 目的地 → 搜索关键词映射 */
const DESTINATION_KEYWORDS: Record<string, { attractions: string[]; foods: string[] }> = {
  普陀山: { attractions: ["寺庙", "海滩", "景点", "观景台"], foods: ["素斋", "海鲜排档", "小吃"] },
  厦门: { attractions: ["景点", "海滩", "文艺街区", "拍照"], foods: ["沙茶面", "海鲜", "小吃"] },
  西安: { attractions: ["景点", "历史遗址", "城墙", "博物馆"], foods: ["肉夹馍", "凉皮", "羊肉泡馍", "小吃"] },
  成都: { attractions: ["景点", "公园", "文艺街区", "拍照"], foods: ["火锅", "串串", "小吃", "茶馆"] },
  杭州: { attractions: ["景点", "西湖", "寺庙", "茶园"], foods: ["杭帮菜", "小吃", "茶馆"] },
  南京: { attractions: ["景点", "历史遗址", "博物馆", "城墙"], foods: ["鸭血粉丝", "小吃", "盐水鸭"] },
  北京: { attractions: ["景点", "故宫", "博物馆", "胡同"], foods: ["烤鸭", "涮羊肉", "小吃"] },
  上海: { attractions: ["景点", "外滩", "文艺街区", "博物馆"], foods: ["生煎", "小笼包", "本帮菜"] },
  大理: { attractions: ["景点", "洱海", "古城", "拍照"], foods: ["菌子", "米线", "烧烤"] },
  丽江: { attractions: ["景点", "古城", "雪山", "拍照"], foods: ["纳西菜", "米线", "小吃"] },
};

/** 默认搜索词 */
const DEFAULT_KEYWORDS = { attractions: ["景点", "公园", "寺庙", "网红打卡"], foods: ["本地美食", "小吃", "特色菜"] };

function getDestinationKeywords(destination: string) {
  for (const [key, val] of Object.entries(DESTINATION_KEYWORDS)) {
    if (destination.includes(key)) return val;
  }
  return DEFAULT_KEYWORDS;
}

/**
 * 从 Amap 搜索真实 POI，再用 LLM 为每个 POI 写个性化 review 和 reason。
 */
async function fetchAmapCards(
  destination: string,
  tags: ExtractedTags,
  category: "attraction" | "food"
): Promise<InsightCard[]> {
  const kw = getDestinationKeywords(destination);
  const searchKeywords = category === "attraction" ? kw.attractions : kw.foods;

  // 1. 搜索 Amap
  let pois: NormalizedPOI[];
  try {
    // 确定高德搜索城市名：如果是特定景区，用其所属城市
    const searchCity = resolveAmapCity(destination);
    pois = await searchPOIsBatch(searchCity, searchKeywords, 5);
    // 按类别过滤
    pois = category === "attraction"
      ? pois.filter(isAttraction)
      : pois.filter(isFood);
  } catch (e) {
    console.warn(`[insight] Amap search failed for ${destination}:`, e);
    // 回退到纯 LLM
    return category === "attraction"
      ? fetchLLMCards(destination, tags)
      : fetchLLMFoodCards(destination, tags);
  }

  if (pois.length === 0) {
    console.warn(`[insight] Amap returned 0 ${category} POIs for ${destination}`);
    return category === "attraction"
      ? fetchLLMCards(destination, tags)
      : fetchLLMFoodCards(destination, tags);
  }

  // 2. 用 LLM 写 review/reason
  type ReviewResult = Array<{ name: string; review: string; reason: string; fitTags?: string[] }>;
  let reviews: ReviewResult;
  try {
    const prompt = poiReviewPrompt(destination, tags, pois, category);
    reviews = await ollamaJson<ReviewResult>(prompt);
  } catch (e) {
    console.warn(`[insight] LLM review generation failed:`, e);
    // 使用纯数据卡片（无 review）
    return pois.slice(0, 12).map((poi, i): InsightCard => ({
      id: `amap-${category}-${Date.now()}-${i}`,
      title: poi.name,
      review: poi.address ? `📍 ${poi.address}` : poi.type.split(";")[0] || "",
      reason: `位于${poi.district || poi.city}`,
      category,
      fitTags: tags.preferences?.slice(0, 3),
    }));
  }

  // 3. 合并 POI 数据 + LLM review
  const reviewMap = new Map(reviews.map((r) => [r.name, r]));
  return pois.slice(0, 12).map((poi, i): InsightCard => {
    const review = reviewMap.get(poi.name);
    return {
      id: `amap-${category}-${Date.now()}-${i}`,
      title: poi.name,
      review: review?.review || poi.type.split(";")[0] || "",
      reason: review?.reason || `位于${poi.district || poi.city}`,
      category,
      fitTags: review?.fitTags || tags.preferences?.slice(0, 3),
    };
  });
}

/** 将目的地名称映射到高德搜索所需的城市名 */
function resolveAmapCity(destination: string): string {
  const map: Record<string, string> = {
    普陀山: "舟山",
    鼓浪屿: "厦门",
    兵马俑: "西安",
    华山: "渭南",
    黄山: "黄山",
    泰山: "泰安",
    峨眉山: "乐山",
    庐山: "九江",
    千岛湖: "杭州",
    乌镇: "嘉兴",
    周庄: "苏州",
    凤凰古城: "湘西",
    平遥古城: "晋中",
    九寨沟: "阿坝",
    张家界: "张家界",
  };
  return map[destination] || destination;
}
export async function getInsightCards(
  destination: string,
  tags?: ExtractedTags
): Promise<InsightCard[]> {
  const safeTags: ExtractedTags = tags ?? {
    preferences: [],
    constraints: [],
    conflicts: [],
  };

  // 优先使用 Amap 真实 POI
  try {
    const cards = await fetchAmapCards(destination, safeTags, "attraction");
    if (cards.length > 0) {
      console.log(`[insight] Amap cards: ${cards.length} attractions for ${destination}`);
      return cards;
    }
  } catch (e) {
    console.warn("[insight] Amap cards failed, falling back to LLM:", e);
  }

  if (INSIGHT_SOURCE === "llm") {
    return fetchLLMCards(destination, safeTags);
  }
  if (INSIGHT_SOURCE === "tavily") {
    try {
      const cards = await fetchTavilyCards(destination);
      if (cards.length > 0) return cards;
    } catch {
      // fall through to mock
    }
  }
  if (INSIGHT_SOURCE === "crawler") {
    try {
      const cards = await fetchCrawlerCards(destination);
      if (cards.length > 0) return cards;
    } catch {
      // fall through to mock
    }
  }
  return loadMockCards(destination);
}

export async function getFoodCards(
  destination: string,
  tags?: ExtractedTags
): Promise<InsightCard[]> {
  const safeTags: ExtractedTags = tags ?? {
    preferences: [],
    constraints: [],
    conflicts: [],
  };

  // 优先使用 Amap 真实餐厅
  try {
    const cards = await fetchAmapCards(destination, safeTags, "food");
    if (cards.length > 0) {
      console.log(`[insight] Amap food cards: ${cards.length} restaurants for ${destination}`);
      return cards;
    }
  } catch (e) {
    console.warn("[insight] Amap food cards failed, falling back to LLM:", e);
  }

  return fetchLLMFoodCards(destination, safeTags);
}
