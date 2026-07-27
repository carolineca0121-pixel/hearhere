import type { ContentCard, ContentCategory, ExtractedTags, InsightCard } from "./types";
import { ollamaJson } from "./ollama";
import { llmCardsPrompt, foodCardsPrompt, poiReviewPrompt } from "./ai-prompts";
import type { NormalizedPOI } from "./amap-types";

// ── 目的地 → Amap 搜索关键词 ────────────────────────

const DESTINATION_KEYWORDS: Record<string, { attractions: string[]; foods: string[] }> = {
  普陀山: { attractions: ["寺庙", "海滩", "景点", "观景台"], foods: ["素斋", "海鲜排档", "小吃"] },
  厦门: { attractions: ["景点", "海滩", "街区", "拍照"], foods: ["沙茶面", "海鲜", "小吃"] },
  西安: { attractions: ["景点", "城墙", "博物馆", "历史"], foods: ["肉夹馍", "凉皮", "泡馍", "小吃"] },
  成都: { attractions: ["景点", "公园", "街区", "拍照"], foods: ["火锅", "串串", "小吃", "茶馆"] },
  杭州: { attractions: ["西湖", "寺庙", "茶园", "景点"], foods: ["杭帮菜", "小吃", "茶馆"] },
  南京: { attractions: ["景点", "城墙", "博物馆", "历史"], foods: ["鸭血粉丝", "小吃", "盐水鸭"] },
  北京: { attractions: ["故宫", "景点", "博物馆", "胡同"], foods: ["烤鸭", "涮羊肉", "小吃"] },
  上海: { attractions: ["外滩", "景点", "街区", "博物馆"], foods: ["生煎", "小笼包", "本帮菜"] },
  大理: { attractions: ["洱海", "古城", "景点", "拍照"], foods: ["菌子", "米线", "烧烤"] },
  丽江: { attractions: ["古城", "雪山", "景点", "拍照"], foods: ["纳西菜", "米线", "小吃"] },
};

const DEFAULT_KEYWORDS = { attractions: ["景点", "公园", "寺庙", "博物馆"], foods: ["本地美食", "小吃", "特色菜"] };

const ATTRACTION_TYPES = ["110000", "110100", "110200", "140000"];
const FOOD_TYPES = ["050000", "050100", "050200", "050300"];

function isAttraction(p: NormalizedPOI): boolean { return ATTRACTION_TYPES.some((t) => p.typecode?.startsWith(t)); }
function isFood(p: NormalizedPOI): boolean { return FOOD_TYPES.some((t) => p.typecode?.startsWith(t)); }

function getKw(dest: string) {
  for (const [k, v] of Object.entries(DESTINATION_KEYWORDS)) {
    if (dest.includes(k)) return v;
  }
  return DEFAULT_KEYWORDS;
}

function amapCity(dest: string): string {
  const map: Record<string, string> = {
    普陀山: "舟山", 鼓浪屿: "厦门", 兵马俑: "西安", 华山: "渭南",
    黄山: "黄山", 泰山: "泰安", 峨眉山: "乐山", 庐山: "九江",
    千岛湖: "杭州", 乌镇: "嘉兴", 周庄: "苏州", 凤凰古城: "湘西",
    平遥古城: "晋中", 九寨沟: "阿坝", 张家界: "张家界",
  };
  return map[dest] || dest;
}

/**
 * 通过 /api/poi/search 搜索高德 POI，再用 LLM 写 review。
 * 失败时回退纯 LLM。
 */
async function amapToCards(
  destination: string,
  tags: ExtractedTags,
  category: "attraction" | "food"
): Promise<InsightCard[]> {
  const kw = getKw(destination);
  const keywords = (category === "attraction" ? kw.attractions : kw.foods).join(",");
  const city = amapCity(destination);

  // ── 尝试 Amap ──
  let pois: NormalizedPOI[];
  try {
    const res = await fetch("/api/poi/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ city, keywords, categories: category === "attraction" ? "attraction" : "food" }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    pois = (data.pois || []) as NormalizedPOI[];
    pois = category === "attraction" ? pois.filter(isAttraction) : pois.filter(isFood);
  } catch (e) {
    console.warn("[content] Amap search failed, fallback LLM:", e);
    return category === "attraction"
      ? ollamaJson<InsightCard[]>(llmCardsPrompt(destination, tags, 8))
      : ollamaJson<InsightCard[]>(foodCardsPrompt(destination, tags, 6));
  }

  if (pois.length === 0) {
    console.warn("[content] Amap returned 0 POIs, fallback LLM");
    return category === "attraction"
      ? ollamaJson<InsightCard[]>(llmCardsPrompt(destination, tags, 8))
      : ollamaJson<InsightCard[]>(foodCardsPrompt(destination, tags, 6));
  }

  console.log(`[content] Amap ${category}: ${pois.length} POIs for ${destination}`);

  // ── LLM 写 review ──
  type ReviewItem = { name: string; review: string; reason: string; fitTags?: string[] };
  let reviews: ReviewItem[];
  try {
    reviews = await ollamaJson<ReviewItem[]>(poiReviewPrompt(destination, tags, pois, category));
  } catch {
    return pois.slice(0, 12).map((p, i): InsightCard => ({
      id: `amap-${category}-${Date.now()}-${i}`,
      title: p.name,
      review: p.address ? `📍 ${p.address}` : p.type.split(";")[0] || "",
      reason: `位于${p.district || p.city}`,
      category,
      fitTags: tags.preferences?.slice(0, 3),
    }));
  }

  const reviewMap = new Map(reviews.map((r) => [r.name, r]));
  return pois.slice(0, 12).map((p, i): InsightCard => {
    const rv = reviewMap.get(p.name);
    return {
      id: `amap-${category}-${Date.now()}-${i}`,
      title: p.name,
      review: rv?.review || p.type.split(";")[0] || "",
      reason: rv?.reason || `位于${p.district || p.city}`,
      category,
      fitTags: rv?.fitTags || tags.preferences?.slice(0, 3),
    };
  });
}

// ── 内容分类标签 ──────────────────────────────────────

export const CATEGORY_LABELS: Record<ContentCategory, string> = {
  attraction: "景点",
  food: "美食",
  souvenir: "文创",
  culture: "文化",
  photo: "拍照",
  lifestyle: "生活",
  hidden: "隐藏",
};

export const CATEGORY_COLORS: Record<ContentCategory, string> = {
  attraction: "#3B82F6",
  food: "#EF4444",
  souvenir: "#F59E0B",
  culture: "#8B5CF6",
  photo: "#EC4899",
  lifestyle: "#10B981",
  hidden: "#6B7280",
};

function convertToContentCard(card: InsightCard, category: ContentCategory = "attraction"): ContentCard {
  return {
    id: card.id,
    title: card.title,
    description: card.review || "",
    reason: card.reason || "",
    category,
    bestTime: card.bestTime,
    estimatedDuration: card.estimatedDuration,
    tags: card.fitTags || [],
    suitableFor: ["所有人群"],
    status: "available",
  };
}

function generateSouvenirCards(destination: string): ContentCard[] {
  const souvenirs: Record<string, ContentCard[]> = {
    普陀山: [
      { id: "souvenir-1", title: "观音饼", description: "普陀山传统特色糕点", reason: "当地特色，适合做伴手礼", category: "souvenir", bestTime: "下午", estimatedDuration: "0.5小时", tags: ["伴手礼", "传统"], suitableFor: ["家庭"], status: "available" },
      { id: "souvenir-2", title: "普陀山佛茶", description: "普陀山特色禅茶", reason: "茶香醇厚，有纪念意义", category: "souvenir", bestTime: "下午", estimatedDuration: "0.5小时", tags: ["茶叶", "伴手礼"], suitableFor: ["所有人群"], status: "available" },
    ],
    厦门: [
      { id: "souvenir-1", title: "黄胜记肉脯", description: "厦门老字号肉脯", reason: "美味又方便携带", category: "souvenir", bestTime: "下午", estimatedDuration: "0.5小时", tags: ["老字号", "伴手礼"], suitableFor: ["所有人群"], status: "available" },
      { id: "souvenir-2", title: "赵小姐的店", description: "厦门特色馅饼店", reason: "精致包装，适合送礼", category: "souvenir", bestTime: "下午", estimatedDuration: "0.5小时", tags: ["伴手礼", "网红店"], suitableFor: ["朋友"], status: "available" },
    ],
    西安: [
      { id: "souvenir-1", title: "西安甑糕", description: "西安传统小吃", reason: "软糯香甜，有特色", category: "souvenir", bestTime: "上午", estimatedDuration: "0.5小时", tags: ["传统小吃", "伴手礼"], suitableFor: ["家庭"], status: "available" },
      { id: "souvenir-2", title: "碑林拓片", description: "西安碑林特色文创", reason: "有文化底蕴，收藏价值高", category: "souvenir", bestTime: "下午", estimatedDuration: "0.5小时", tags: ["文化", "伴手礼"], suitableFor: ["家庭"], status: "available" },
    ],
  };

  for (const [dest, cards] of Object.entries(souvenirs)) {
    if (destination.includes(dest)) return cards;
  }

  return [
    { id: "souvenir-1", title: "当地特色明信片", description: "精选当地风景明信片", reason: "轻便又有纪念意义", category: "souvenir", bestTime: "下午", estimatedDuration: "0.5小时", tags: ["伴手礼", "纪念"], suitableFor: ["所有人群"], status: "available" },
  ];
}

// ── 主函数 ────────────────────────────────────────────

export async function generateContentCards(
  destination: string,
  tags: ExtractedTags,
  categories?: ContentCategory[]
): Promise<ContentCard[]> {
  const allCards: ContentCard[] = [];
  const selectedCategories = categories || ["attraction", "food", "souvenir"];

  try {
    if (selectedCategories.includes("attraction")) {
      const attractionCards = await amapToCards(destination, tags, "attraction");
      if (Array.isArray(attractionCards)) {
        allCards.push(...attractionCards.map(card => convertToContentCard(card, "attraction")));
      }
    }

    if (selectedCategories.includes("food")) {
      const foodCards = await amapToCards(destination, tags, "food");
      if (Array.isArray(foodCards)) {
        allCards.push(...foodCards.map(card => convertToContentCard(card, "food")));
      }
    }

    if (selectedCategories.includes("souvenir")) {
      allCards.push(...generateSouvenirCards(destination));
    }
  } catch (e) {
    console.error("生成推荐内容失败:", e);
    allCards.push({
      id: "fallback-1", title: `${destination}城市漫步`, description: "在城市里随意走走", reason: "感受当地生活气息",
      category: "lifestyle", bestTime: "上午", estimatedDuration: "2小时", tags: ["休闲"], suitableFor: ["所有人群"], status: "available",
    });
  }

  return allCards;
}

export function isContentCategory(value: string): value is ContentCategory {
  return ["attraction", "food", "souvenir", "culture", "photo", "lifestyle", "hidden"].includes(value);
}
