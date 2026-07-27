import { NextResponse } from "next/server";
import { searchPOIsBatch } from "@/lib/amap";
import type { NormalizedPOI } from "@/lib/amap-types";

// ── 类别 → Amap typecode 前缀映射 ────────────────────

const CATEGORY_TYPECODES: Record<string, string[]> = {
  attraction: ["110000", "110100", "110200", "140000", "060000"],
  food: ["050000", "050100", "050200", "050300"],
  souvenir: ["060000", "130000"],
  hotel: ["100000", "100100", "100200"],
};

/**
 * POST /api/poi/search
 *
 * Body: {
 *   city: string,
 *   keywords: string,          // 搜索词，用 | 分隔多个
 *   categories?: string,       // attraction | food | souvenir | hotel | all
 *   location?: string,         // "lng,lat" 用于周边搜索
 *   radius?: number,           // 周边搜索半径（米），默认 5000
 *   limit?: number
 * }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const city = body.city?.trim();
    const keywordsStr = body.keywords?.trim();
    const categories = body.categories || "all";
    const location = body.location;  // "lng,lat"
    const radius = body.radius || 5000;
    const limit = body.limit || 8;

    if (!city || !keywordsStr) {
      return NextResponse.json({ error: "缺少 city 或 keywords" }, { status: 400 });
    }

    const keywords = keywordsStr.split(/[|,，]/).filter(Boolean);

    // 直接调用 TypeScript Amap 客户端（无 Python exec 开销）
    let pois: NormalizedPOI[];
    try {
      pois = await searchPOIsBatch(city, keywords, limit);
    } catch (e) {
      console.error("[poi/search] Amap error:", e);
      return NextResponse.json({ error: "搜索失败", pois: [], count: 0 }, { status: 502 });
    }

    // 按类别过滤
    if (categories !== "all" && CATEGORY_TYPECODES[categories]) {
      const codes = CATEGORY_TYPECODES[categories];
      pois = pois.filter((p) => codes.some((c) => p.typecode?.startsWith(c)));
    }

    return NextResponse.json({
      city,
      pois: pois.map((p) => ({
        name: p.name,
        address: p.address,
        city: p.city,
        district: p.district,
        type: p.type,
        typecode: p.typecode,
        lng_wgs84: p.lngWgs84,
        lat_wgs84: p.latWgs84,
        lng: p.lngWgs84,   // WGS84 (for map display)
        lat: p.latWgs84,
        searchKeyword: p.searchKeyword,
      })),
      count: pois.length,
    });
  } catch (error) {
    console.error("[poi/search] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "POI 搜索失败", pois: [], count: 0 },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const city = searchParams.get("city");
  const keywords = searchParams.get("keywords");

  if (!city || !keywords) {
    return NextResponse.json({ error: "缺少 city 或 keywords 参数" }, { status: 400 });
  }

  const syntheticReq = new Request(request.url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      city,
      keywords,
      categories: searchParams.get("categories") || "all",
      limit: Number(searchParams.get("limit")) || 5,
    }),
  });

  return POST(syntheticReq);
}
