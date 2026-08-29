/**
 * lib/geo.ts — 地理关系计算（E4-3）
 *
 * 本阶段范围：haversine 直线距离，用于「明显不合理的远距离组合」检测与 prompt 事实注入。
 * 明确不做：真实驾车/步行时间（高德路径规划）——那是 E5。
 */

export interface GeoPoint {
  lng?: number;
  lat?: number;
}

/** 两点球面距离（公里）；任一缺坐标 → null */
export function haversineKm(a: GeoPoint | null | undefined, b: GeoPoint | null | undefined): number | null {
  if (a?.lng == null || a?.lat == null || b?.lng == null || b?.lat == null) return null;
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/**
 * 同日两项直线距离超过该值（公里）视为「明显不合理的远距离组合」。
 * ⚠️ MVP heuristic（E4-3）：直线距离 ≠ 真实交通时间，阈值按同城/近郊经验设定，
 * 后续应按目的地尺度优化（跨省/跨市行程需要不同阈值）；真实驾车时间建模属 E5。
 */
export const FAR_PAIR_KM = 25;

/** 生成白名单两两距离事实（供 prompt）。格式：「A↔B≈4.2km」。缺坐标的对跳过。 */
export function geoFactsFor(cards: { title: string; location?: GeoPoint | null }[]): string[] {
  const facts: string[] = [];
  for (let i = 0; i < cards.length; i++) {
    for (let j = i + 1; j < cards.length; j++) {
      const km = haversineKm(cards[i].location, cards[j].location);
      if (km === null) continue;
      facts.push(`${cards[i].title}↔${cards[j].title}≈${km.toFixed(1)}km`);
    }
  }
  return facts;
}

/**
 * 同日远距 soft rule（E4-3，可确定性测试）：同一天被排的两卡直线距离 > FAR_PAIR_KM → warning。
 * 只产出提示，绝不删除/移动任何 placement（用户选择与 AI 安排都保留）。
 */
export function farPairWarnings(
  placementsByDay: Record<number, { activity: string; lng?: number; lat?: number }[]>,
  thresholdKm: number = FAR_PAIR_KM
): string[] {
  const out: string[] = [];
  for (const [d, items] of Object.entries(placementsByDay)) {
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const km = haversineKm(items[i], items[j]);
        if (km !== null && km > thresholdKm) {
          out.push(`Day ${d}「${items[i].activity}」与「${items[j].activity}」直线距离约 ${km.toFixed(0)}km，同一天往返可能较赶`);
        }
      }
    }
  }
  return out;
}
