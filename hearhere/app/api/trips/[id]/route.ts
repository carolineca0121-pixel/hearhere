import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  const trip = await prisma.trip.findFirst({
    where: { id: params.id, userId: session.user.id },
    include: { moments: true, itineraries: { orderBy: { dayIndex: "asc" } } },
  });

  if (!trip) {
    return NextResponse.json({ error: "行程不存在" }, { status: 404 });
  }

  return NextResponse.json({ trip });
}

/**
 * PUT — 保存用户对每日时间轴的编辑（2.0 攻略卡拖拽排程）
 * body: { days: [{ dayIndex, items }] }
 * 只更新对应 dayIndex 的 content，其余字段不动（零回归）
 */
export async function PUT(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  const trip = await prisma.trip.findFirst({
    where: { id: params.id, userId: session.user.id },
  });
  if (!trip) {
    return NextResponse.json({ error: "行程不存在" }, { status: 404 });
  }

  try {
    const body = await req.json();
    const days: { dayIndex: number; items: unknown[] }[] = Array.isArray(body.days) ? body.days : [];
    for (const d of days) {
      if (typeof d.dayIndex !== "number") continue;
      await prisma.dayPlan.updateMany({
        where: { tripId: trip.id, dayIndex: d.dayIndex },
        data: { content: JSON.stringify(d.items ?? []) },
      });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[trips PUT]", e);
    return NextResponse.json({ error: "保存失败" }, { status: 500 });
  }
}
