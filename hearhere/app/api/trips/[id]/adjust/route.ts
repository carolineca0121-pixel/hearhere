import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { ollamaJson, LocalServiceError } from "@/lib/ollama";
import { inferVibeTheme, VIBE_COLORS } from "@/lib/vibe";
import type {
  ExtractedTags,
  InsightCard,
  VibeTheme,
} from "@/lib/types";

interface TripGenerateResponse {
  title?: string;
  vibeTheme: VibeTheme;
  overview?: string;
  travelTips?: string[];
  days: {
    dayIndex: number;
    items: {
      time: string;
      activity: string;
      note?: string;
      duration?: string;
      transport?: string;
      cost?: string;
      tips?: string;
      source?: string;
      recommendedDish?: string;
    }[];
  }[];
}

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  const tripId = params.id;

  try {
    // 获取原行程
    const originalTrip = await prisma.trip.findUnique({
      where: { id: tripId, userId: session.user.id },
      include: { moments: true, itineraries: true },
    });

    if (!originalTrip) {
      return NextResponse.json({ error: "行程不存在" }, { status: 404 });
    }

    const body = (await req.json()) as {
      adjustment: string;
    };
    const adjustment = body.adjustment;
    console.log("[adjust] 调整需求:", adjustment);

    // 解析原有 preferences
    let originalPrefs: {
      tags?: ExtractedTags;
      selectedCards?: InsightCard[];
      title?: string;
    } = {};
    try {
      originalPrefs = JSON.parse(originalTrip.preferences);
    } catch {
      // ignore
    }

    const destination = originalTrip.destination;
    const tags = originalPrefs.tags ?? {
      preferences: [],
      constraints: [],
      conflicts: [],
    };
    const selectedCards = originalPrefs.selectedCards ?? [];

    // 构建调整 prompt
    const adjustPrompt = `
你是专业的行程规划师。用户对一份行程有调整需求，请重新生成完整的${(originalTrip.itineraries?.length || 2)}天行程。

目的地：${destination}
原有偏好：${JSON.stringify(tags)}
用户的调整需求：${adjustment}

要求：
1. 根据用户的调整需求重新规划，但保持合理的行程结构
2. 每天仍然需要包含早中晚的活动和餐饮安排
3. 如果用户选择了景点（${selectedCards.length > 0 ? selectedCards.map(c => c.title).join(', ') : '无'}），确保它们还在行程中
4. 标题要简洁产品化，不要直接复述用户需求
5. 提供实用的贴士
6. 如果是多天行程，最后一天建议中午返程避开高峰

请直接返回符合要求的JSON，格式如下：
{
  "title": "调整后的行程标题",
  "vibeTheme": "sea|forest|dusk",
  "overview": "行程概述",
  "travelTips": ["贴士1", "贴士2", "贴士3", "贴士4"],
  "days": [
    {
      "dayIndex": 1,
      "items": [
        {
          "time": "09:00",
          "activity": "活动名称",
          "note": "为什么安排这个时间",
          "duration": "停留时长",
          "transport": "交通方式",
          "cost": "费用参考",
          "tips": "贴士",
          "source": "selected_card|recommended|food|transport|rest",
          "recommendedDish": "招牌菜（仅餐饮）"
        }
      ]
    }
  ]
}
`;

    const generated = await ollamaJson<TripGenerateResponse>(adjustPrompt);
    console.log("[adjust] 重新生成完成");

    const theme = inferVibeTheme(destination);
    const finalTheme = generated.vibeTheme ?? theme;

    // 确保天数足够
    const expectedDays = originalTrip.itineraries?.length || 2;
    while ((generated.days?.length ?? 0) < expectedDays) {
      const nextIndex = (generated.days?.length ?? 0) + 1;
      generated.days = generated.days ?? [];
      if (nextIndex < expectedDays) {
        generated.days.push({
          dayIndex: nextIndex,
          items: [
            { time: "09:00", activity: `继续探索${destination}`, note: "把还没去的地方补一下", duration: "2 小时", transport: "步行/打车", cost: "视景点而定", source: "recommended" },
            { time: "12:00", activity: "午餐", note: "吃一家之前没试过的店", duration: "1.5 小时", transport: "步行", cost: "约 60 元/人", source: "food", recommendedDish: "本地特色" },
            { time: "19:00", activity: "晚餐", note: "用一顿好吃的结束这一天", duration: "1.5 小时", transport: "步行", cost: "约 80 元/人", source: "food", recommendedDish: "招牌菜" },
          ],
        });
      } else {
        // 最后一天
        generated.days.push({
          dayIndex: nextIndex,
          items: [
            { time: "09:00", activity: "最后一个景点打卡", note: "把还没去的地方补一下", duration: "2 小时", transport: "步行/打车", cost: "视景点而定", source: "recommended" },
            { time: "12:00", activity: "最后的午餐", note: "再吃一顿本地特色，圆满结束旅程", duration: "1.5 小时", transport: "步行", cost: "约 80 元/人", source: "food", recommendedDish: "必吃招牌菜" },
            { time: "14:00", activity: "准备返程", note: "中午吃完午饭返程，避开下午高峰时段", duration: "灵活", transport: "自驾/打车去车站", cost: "视交通方式而定", source: "transport" },
          ],
        });
      }
    }

    // 确保选中的卡片还在
    if (selectedCards.length > 0) {
      const selectedTitles = selectedCards.map((c) => c.title);
      const existingActivities = new Set(
        (generated.days ?? []).flatMap((d) =>
          d.items.map((i) => i.activity)
        )
      );

      const missingCards = selectedTitles.filter((title) => {
        return !Array.from(existingActivities).some(activity =>
          activity.includes(title) || title.includes(activity)
        );
      });

      if (missingCards.length > 0 && generated.days.length > 0) {
        const firstDay = generated.days[0];
        missingCards.forEach((title, idx) => {
          const insertIndex = Math.min(2 + idx, firstDay.items.length - 1);
          firstDay.items.splice(insertIndex, 0, {
            time: `${14 + idx}:00`,
            activity: title,
            note: "你选择的必去地点",
            duration: "1.5 小时",
            transport: "步行",
            source: "selected_card",
          });
        });
      }
    }

    // 保存新行程（直接覆盖原行程的 itineraries）
    // 先删除旧的 moment 和 itinerary
    await prisma.moment.deleteMany({ where: { tripId } });
    await prisma.dayPlan.deleteMany({ where: { tripId } });

    // 再创建新的
    await prisma.trip.update({
      where: { id: tripId },
      data: {
        preferences: JSON.stringify({
          ...originalPrefs,
          title: generated.title,
          overview: generated.overview,
          travelTips: generated.travelTips,
          lastAdjustment: adjustment,
        }),
        vibeTheme: finalTheme,
        moments: {
          create: {
            title: "美好旅程",
            description: "享受你的旅行时光",
            vibeColor: VIBE_COLORS[finalTheme],
            musicHint: "",
          },
        },
        itineraries: {
          create: generated.days.map((d) => ({
            dayIndex: d.dayIndex,
            content: JSON.stringify(d.items),
          })),
        },
      },
    });

    // 返回更新后的行程
    const updatedTrip = await prisma.trip.findUnique({
      where: { id: tripId },
      include: { moments: true, itineraries: true },
    });

    return NextResponse.json({
      trip: updatedTrip,
    });
  } catch (e) {
    console.error("[adjust] error:", e);
    if (e instanceof LocalServiceError) {
      return NextResponse.json(
        { error: e.message, service: e.service, offline: true },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { error: "调整行程失败", detail: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
