// lib/recommend/normalize.ts — POI 归一化与去重（E6-1C）
// 三铁律：①同 poiId 不双现 ②异 poiId+异 district 不误并 ③官方名称仅用于展示，永不改写。
// normalizedName 只用于匹配/去重。

import type { NormalizedPOI } from "@/lib/amap";

/** 归一化名称（仅匹配用）：去括号 → 去「·/—/-」尾巴 → 循环剥后缀词表直到稳定 */
export function normalizedName(name: string): string {
  let s = name.replace(/（.*?）|\(.*?\)/g, "").replace(/[-—·].*$/, "").trim();
  const SUFFIXES = [
    // 行政/景区等级缀词
    "国家级景点", "国家湿地公园", "国家湿地公园", "风景名胜区", "风景区", "森林公园", "湿地公园", "旅游区", "度假区", "景区",
    // 业态缀词
    "总店", "旗舰店", "直营店", "分店", "专卖店", "餐厅", "饭店", "酒家", "菜馆", "宾馆", "酒店", "卤味熟食", "宴会厅",
    // 片区/方位缀词
    "东区", "西区", "南区", "北区", "洪园", "周家村", "绿堤", "东楼", "西楼",
    // 设施缀词
    "售票处", "停车场", "入口", "出口", "东门", "西门", "南门", "北门",
    // 兜底
    "店",
  ];
  let changed = true;
  while (changed) {
    changed = false;
    for (const suf of SUFFIXES) {
      if (s.length > suf.length + 1 && s.endsWith(suf)) {
        s = s.slice(0, -suf.length).trim();
        changed = true;
      }
    }
  }
  return s;
}

/**
 * 去重（替换旧名称核 dedup）：
 * 1. poiId 优先：同 poiId 合并 sourceRoutes，永不双现
 * 2. normalizedName 归并：
 *    - attraction：normalizedName + district（异区同名=不同实体，不并）
 *    - food/souvenir：normalizedName（连锁品牌按品牌合并——选品池语义是一家品牌一张卡，
 *      分店选择是后续细节；实测异区守卫会把终榜淹成同品牌分店列表）
 * 展示名保留首个出现的官方全名，不改写。
 */
export function dedupePOIs(pois: NormalizedPOI[], category = "attraction"): NormalizedPOI[] {
  const byId = new Map<string, NormalizedPOI>();
  const noId: NormalizedPOI[] = [];

  for (const p of pois) {
    const id = (p.poiId || "").trim();
    if (id) {
      const existing = byId.get(id);
      if (existing) {
        existing.sourceRoutes = Array.from(new Set([...(existing.sourceRoutes || []), ...(p.sourceRoutes || [])]));
      } else {
        byId.set(id, { ...p });
      }
    } else {
      noId.push(p);
    }
  }

  const brandLevel = category === "food" || category === "souvenir";
  const byNorm = new Map<string, NormalizedPOI>();
  const result: NormalizedPOI[] = [];
  for (const p of [...Array.from(byId.values()), ...noId]) {
    const norm = normalizedName(p.name);
    if (norm.length < 2) continue;
    const key = brandLevel ? norm : `${norm}::${p.district || ""}`;
    const existing = byNorm.get(key);
    if (existing) {
      existing.sourceRoutes = Array.from(new Set([...(existing.sourceRoutes || []), ...(p.sourceRoutes || [])]));
      continue;
    }
    byNorm.set(key, p);
    result.push(p);
  }
  return result;
}
