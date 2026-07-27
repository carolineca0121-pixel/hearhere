import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * 公开分享行程 API（无需登录）
 * GET /api/share/[token] — 通过 shareToken 获取行程（只读）
 */
export async function GET(
  _req: Request,
  { params }: { params: { token: string } }
) {
  const trip = await prisma.trip.findFirst({
    where: { shareToken: params.token },
    include: { itineraries: { orderBy: { dayIndex: "asc" } } },
  });

  if (!trip) {
    return NextResponse.json({ error: "分享链接不存在或已关闭" }, { status: 404 });
  }

  // 只返回只读字段，不暴露 userId
  return NextResponse.json({
    trip: {
      id: trip.id,
      destination: trip.destination,
      startDate: trip.startDate,
      endDate: trip.endDate,
      preferences: trip.preferences,
      vibeTheme: trip.vibeTheme,
      itineraries: trip.itineraries,
    },
  });
}
