import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { ollamaJson, LocalServiceError } from "@/lib/ollama";
import { harmonyPrompt } from "@/lib/ai-prompts";
import type { ExtractedTags, HarmonyResult } from "@/lib/types";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  try {
    const { tags, transcript } = (await req.json()) as {
      tags?: ExtractedTags;
      transcript?: string;
    };

    if (!tags) {
      return NextResponse.json({ error: "缺少标签数据" }, { status: 400 });
    }

    const needsHarmony =
      tags.groupMode ||
      (tags.peopleCount != null && tags.peopleCount > 1) ||
      (tags.conflicts?.length ?? 0) > 0 ||
      tags.preferences.length > 2;

    if (!needsHarmony) {
      return NextResponse.json({
        harmony: {
          summary: "当前为单人或少冲突需求，无需额外调和。",
          resolutions: [],
          scheduleHints: [],
        } as HarmonyResult,
        skipped: true,
      });
    }

    let harmony: HarmonyResult;
    try {
      harmony = await ollamaJson<HarmonyResult>(
        harmonyPrompt(tags, transcript ?? "")
      );
    } catch {
      harmony = {
        summary: "已为多人出行生成折中方案：上午分头行动，傍晚汇合共享高光时刻。",
        resolutions: [
          "选择兼具商圈与自然景观的目的地",
          "在时间线上交替安排不同偏好活动",
        ],
        scheduleHints: ["上午：购物 / 下午：轻徒步 / 傍晚：一起看落日"],
      };
    }

    return NextResponse.json({ harmony });
  } catch (e) {
    if (e instanceof LocalServiceError) {
      return NextResponse.json(
        { error: e.message, service: e.service, offline: true },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: "调和失败" }, { status: 500 });
  }
}
