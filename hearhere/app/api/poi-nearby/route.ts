import { NextResponse } from "next/server";
import { searchNearbyPOI } from "@/lib/amap";

export const maxDuration = 30;

/**
 * 周边搜索（Page 4 占位卡「看看周边」）
 * POST { lng, lat, keywords? } → 1.5km 内景点/咖啡/美食
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const lng = Number(body.lng);
    const lat = Number(body.lat);
    if (!lng || !lat) {
      return NextResponse.json({ error: "缺少坐标" }, { status: 400 });
    }
    const pois = await searchNearbyPOI({
      lng,
      lat,
      radius: 1500,
      keywords: typeof body.keywords === "string" ? body.keywords : undefined,
    });
    return NextResponse.json({ pois, count: pois.length });
  } catch (e) {
    console.error("[poi-nearby]", e);
    return NextResponse.json(
      { pois: [], count: 0, error: e instanceof Error ? e.message : "周边搜索失败" },
      { status: 200 } // 前端兜底展示，不用 500 砸脸
    );
  }
}
