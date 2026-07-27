import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { getFoodCards } from "@/lib/insight";
import type { ExtractedTags } from "@/lib/types";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  let body: { destination?: string; tags?: ExtractedTags };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求体非法" }, { status: 400 });
  }

  const destination = body.destination?.trim() || body.tags?.destination?.trim();
  if (!destination) {
    return NextResponse.json(
      { error: "缺少目的地，请先说出你想去的地方" },
      { status: 400 }
    );
  }

  try {
    const cards = await getFoodCards(destination, body.tags);
    return NextResponse.json({ cards });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "获取美食推荐失败" },
      { status: 500 }
    );
  }
}
