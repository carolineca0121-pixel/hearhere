import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth-options";
import { generateContentCards } from "@/lib/content";
import type { ContentCategory } from "@/lib/types";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { destination, tags, categories } = body;

    if (!destination) {
      return NextResponse.json({ error: "缺少目的地" }, { status: 400 });
    }

    const cards = await generateContentCards(destination, tags, categories);
    return NextResponse.json({ cards });
  } catch (e) {
    console.error("Discover API 错误:", e);
    return NextResponse.json(
      { error: "生成推荐失败" },
      { status: 500 }
    );
  }
}
