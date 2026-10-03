// lib/recommend/retrieval.ts — 确定性多路召回：决定「应该向高德搜什么」（E6-1B-1）
// 纯函数层：无 LLM、无 IO。职责仅此一件事，ranking/dedup/TRASH 不在此文件。

import type { PreferenceSignals } from "./signals";

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
