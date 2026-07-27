import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { getWeather } from "@/lib/amap";

/**
 * 天气查询 API
 * GET /api/weather?destination=普陀山
 * 返回实况 + 未来 3 天预报（高德免费版）。
 */
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const destination = searchParams.get("destination")?.trim();
  if (!destination) {
    return NextResponse.json({ error: "缺少 destination 参数" }, { status: 400 });
  }

  try {
    const weather = await getWeather(destination);
    return NextResponse.json(weather);
  } catch (e) {
    console.warn("[weather]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "天气查询失败" },
      { status: 502 }
    );
  }
}
