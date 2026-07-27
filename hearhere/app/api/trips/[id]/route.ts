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
