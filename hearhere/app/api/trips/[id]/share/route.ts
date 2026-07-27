import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { randomBytes } from "crypto";

/**
 * 分享行程 API
 * POST /api/trips/[id]/share — 生成/获取分享 token
 * DELETE /api/trips/[id]/share — 关闭分享
 */
export async function POST(
  _req: Request,
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

  // 已有 token 直接返回，否则生成新的
  const token = trip.shareToken ?? randomBytes(12).toString("base64url");
  if (!trip.shareToken) {
    await prisma.trip.update({
      where: { id: trip.id },
      data: { shareToken: token },
    });
  }

  return NextResponse.json({ shareToken: token });
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  await prisma.trip.updateMany({
    where: { id: params.id, userId: session.user.id },
    data: { shareToken: null },
  });

  return NextResponse.json({ ok: true });
}
