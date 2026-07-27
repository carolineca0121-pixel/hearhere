import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";

/**
 * 记账 API
 * GET    /api/trips/[id]/expenses — 获取该行程所有账目
 * POST   /api/trips/[id]/expenses — 新增一笔账
 * DELETE /api/trips/[id]/expenses?expenseId=xxx — 删除一笔账
 */

async function verifyTripOwnership(tripId: string, userId: string) {
  return prisma.trip.findFirst({ where: { id: tripId, userId } });
}

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }
  if (!(await verifyTripOwnership(params.id, session.user.id))) {
    return NextResponse.json({ error: "行程不存在" }, { status: 404 });
  }

  const expenses = await prisma.expense.findMany({
    where: { tripId: params.id },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ expenses });
}

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }
  if (!(await verifyTripOwnership(params.id, session.user.id))) {
    return NextResponse.json({ error: "行程不存在" }, { status: 404 });
  }

  const body = (await req.json()) as {
    title?: string;
    amount?: number;
    payer?: string;
    shareWith?: string[];
  };

  if (!body.title?.trim()) {
    return NextResponse.json({ error: "请填写消费项目" }, { status: 400 });
  }
  if (!body.amount || body.amount <= 0) {
    return NextResponse.json({ error: "请填写正确的金额" }, { status: 400 });
  }
  if (!body.payer?.trim()) {
    return NextResponse.json({ error: "请填写付款人" }, { status: 400 });
  }
  if (!body.shareWith || body.shareWith.length === 0) {
    return NextResponse.json({ error: "请选择参与分摊的人" }, { status: 400 });
  }

  const expense = await prisma.expense.create({
    data: {
      title: body.title.trim(),
      amount: Math.round(body.amount * 100) / 100,
      payer: body.payer.trim(),
      shareWith: JSON.stringify(body.shareWith),
      tripId: params.id,
    },
  });

  return NextResponse.json({ expense });
}

export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }
  if (!(await verifyTripOwnership(params.id, session.user.id))) {
    return NextResponse.json({ error: "行程不存在" }, { status: 404 });
  }

  const { searchParams } = new URL(req.url);
  const expenseId = searchParams.get("expenseId");
  if (!expenseId) {
    return NextResponse.json({ error: "缺少 expenseId" }, { status: 400 });
  }

  await prisma.expense.deleteMany({
    where: { id: expenseId, tripId: params.id },
  });

  return NextResponse.json({ ok: true });
}
