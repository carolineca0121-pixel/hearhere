import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { getInsightCards } from "@/lib/insight";
import type { ExtractedTags } from "@/lib/types";

/**
 * 新主入口：POST 带完整 tags，让 LLM 能做真正的个性化推荐。
 */
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
      { error: "缺少目的地，请先在首页录音说出你想去的地方" },
      { status: 400 }
    );
  }

  try {
    const cards = await getInsightCards(destination, body.tags);
    return NextResponse.json({
      cards,
      source: process.env.INSIGHT_SOURCE ?? "llm",
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "获取情报失败" },
      { status: 500 }
    );
  }
}

/**
 * 兼容旧 GET 接口（无标签，纯关键词搜索）。
 * LLM 模式下没有上下文会效果不佳，建议改用 POST。
 */
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const intent =
    searchParams.get("intent") ??
    searchParams.get("q") ??
    "旅行推荐";

  try {
    const cards = await getInsightCards(intent);
    return NextResponse.json({
      cards,
      source: process.env.INSIGHT_SOURCE ?? "llm",
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "获取情报失败" },
      { status: 500 }
    );
  }
}
