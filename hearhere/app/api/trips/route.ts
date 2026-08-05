import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { ollamaJson, LocalServiceError } from "@/lib/ollama";
import { harmonyPrompt, tripPrompt } from "@/lib/ai-prompts";
import { inferVibeTheme, VIBE_COLORS } from "@/lib/vibe";
import { getDrivingRoute } from "@/lib/amap-direction";
import type {
  ExtractedTags,
  HarmonyResult,
  InsightCard,
  OmittedSpot,
  VibeTheme,
} from "@/lib/types";

interface TripGenerateResponse {
  planningThought?: string;
  title?: string;
  vibeTheme: VibeTheme;
  overview?: string;
  travelTips?: string[];
  omittedSpots?: OmittedSpot[];
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

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  const trips = await prisma.trip.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    include: { moments: true, itineraries: true },
  });

  return NextResponse.json({ trips });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  try {
    const body = (await req.json()) as {
      destination?: string;
      tags?: ExtractedTags;
      rawUserText?: string;
      selectedCards?: InsightCard[];
      selectedFoods?: InsightCard[];
      harmony?: HarmonyResult;
    };
    console.log("[trips] body received:", {
      destination: body.destination,
      hasTags: !!body.tags,
      cardsCount: body.selectedCards?.length ?? 0,
      foodsCount: body.selectedFoods?.length ?? 0,
      hasHarmony: !!body.harmony,
    });

    const destination =
      body.destination ?? body.tags?.destination ?? "未知目的地";
    const tags = body.tags ?? {
      preferences: [],
      constraints: [],
      conflicts: [],
    };
    const selectedCards = body.selectedCards ?? [];
    const selectedFoods = body.selectedFoods ?? [];
    const enrichedTags: ExtractedTags = selectedFoods.length > 0
      ? {
          ...tags,
          preferences: [
            ...(tags.preferences ?? []),
            `想吃：${selectedFoods.map((f) => f.title).join("、")}`,
          ],
        }
      : tags;

    let autoHarmony = body.harmony;
    const needsAutoHarmony =
      !autoHarmony &&
      (enrichedTags.groupMode ||
        (enrichedTags.peopleCount != null && enrichedTags.peopleCount > 1) ||
        enrichedTags.conflicts.length > 0 ||
        enrichedTags.constraints.length > 0);

    if (needsAutoHarmony) {
      try {
        autoHarmony = await ollamaJson<HarmonyResult>(
          harmonyPrompt(enrichedTags, JSON.stringify(enrichedTags))
        );
      } catch (e) {
        console.warn("[trips] auto harmony failed, continue without explicit harmony:", e);
      }
    }

    let generated: TripGenerateResponse;
    try {
      // 🆕 自驾用户：先查真实驾车路线（时长+服务区+过路费）
      let drivingRoute = null;
      if (
        tags.departure &&
        tags.transportation &&
        (tags.transportation === "自驾" || tags.transportation.includes("自驾"))
      ) {
        try {
          drivingRoute = await getDrivingRoute(tags.departure, destination);
          if (drivingRoute) {
            console.log(
              `[trips] driving route: ${tags.departure}→${destination} ${drivingRoute.durationText}, ${drivingRoute.distanceKm}km, 服务区${drivingRoute.serviceAreas.length}个`
            );
          }
        } catch (e) {
          console.warn("[trips] driving route query failed, fallback to estimate:", e);
        }
      }

      const rawUserText = body.rawUserText?.trim() || undefined;
      const prompt = tripPrompt(destination, enrichedTags, selectedCards, rawUserText, autoHarmony, drivingRoute);
      console.log("[trips] calling ollamaJson, prompt length:", prompt.length);
      generated = await ollamaJson<TripGenerateResponse>(prompt);
      console.log("[trips] ollamaJson success, days:", generated.days?.length);
    } catch (e) {
      console.warn("[trips] ollamaJson failed:", e);
      // 创建一个更具体的兜底行程
      const theme = inferVibeTheme(destination);
      const pref =
        tags.preferences.length > 0 ? tags.preferences[0] : "观光";

      // 推断天数
      let dayCount = tags.days ?? 2;
      const dates = tags.dates?.toLowerCase() ?? "";
      if (/三天|3天|三日|3日/.test(dates)) dayCount = 3;
      else if (/四天|4天|四日|4日/.test(dates)) dayCount = 4;
      else if (/五天|5天|五日|5日/.test(dates)) dayCount = 5;

      // 根据目的地生成更具体的兜底
      let isPutuo = /普陀山/.test(destination);
      let isXiamen = /厦门/.test(destination);
      let isXian = /西安/.test(destination);

      // 构建兜底天数
      const fallbackDays = [];
      for (let d = 1; d <= dayCount; d++) {
        if (d === 1) {
          fallbackDays.push({
            dayIndex: 1,
            items: [
              {
                time: "09:00",
                activity: isPutuo ? "普济寺参拜" : isXiamen ? "鼓浪屿游览" : isXian ? "兵马俑参观" : `${destination}核心景区游览`,
                note: "上午游客较少，适合慢慢游览",
                duration: "2 小时",
                transport: "步行/打车",
                cost: isPutuo ? "门票 35 元/人" : "视景点而定",
                source: "recommended",
              },
              {
                time: "12:00",
                activity: isPutuo ? "普济寺素斋午餐" : isXiamen ? "沙茶面特色午餐" : isXian ? "肉夹馍凉皮午餐" : "当地特色午餐",
                note: "尝尝本地风味",
                duration: "1.5 小时",
                transport: "步行 10 分钟",
                cost: isPutuo ? "约 50 元/人" : "约 60 元/人",
                source: "food",
                recommendedDish: isPutuo ? "素面、素鸭" : isXiamen ? "沙茶面、海蛎煎" : isXian ? "肉夹馍、凉皮" : "当地特色菜",
              },
              {
                time: "14:30",
                activity: isPutuo ? "法雨寺游览" : isXiamen ? "曾厝垵漫步" : isXian ? "华清宫游览" : "继续深度游览",
                note: "下午可以去一些有特色的地方",
                duration: "2 小时",
                transport: "步行",
                cost: isPutuo ? "门票 30 元/人" : "免费或门票",
                source: "recommended",
              },
              {
                time: "17:00",
                activity: isPutuo ? "百步沙看日落" : isXiamen ? "环岛路看海" : isXian ? "大雁塔赏景" : "看日落/赏景",
                note: "傍晚光线柔和，适合拍照",
                duration: "1 小时",
                transport: "步行",
                cost: "免费",
                source: "recommended",
              },
              {
                time: "19:00",
                activity: isPutuo ? "朱家尖海鲜排档晚餐" : isXiamen ? "八市海鲜加工晚餐" : isXian ? "回民街晚餐" : "晚餐",
                note: "用一顿好吃的结束第一天",
                duration: "1.5 小时",
                transport: "打车 15 分钟",
                cost: isPutuo ? "约 150 元/人" : "约 80 元/人",
                source: "food",
                recommendedDish: isPutuo ? "清蒸梭子蟹、椒盐皮皮虾" : isXiamen ? "海鲜加工" : isXian ? "羊肉泡馍" : "招牌菜",
              },
              {
                time: "21:00",
                activity: "回酒店休息",
                note: "养足精神迎接第二天",
                source: "rest",
              },
            ],
          });
        } else if (d < dayCount) {
          fallbackDays.push({
            dayIndex: d,
            items: [
              {
                time: "09:00",
                activity: isPutuo ? "南海观音参拜" : isXiamen ? "南普陀寺祈福" : isXian ? "明城墙漫步" : "另一景区游览",
                note: "今天去一些昨天没去到的地方",
                duration: "2 小时",
                transport: "步行/打车",
                cost: "视景点而定",
                source: "recommended",
              },
              {
                time: "11:30",
                activity: "当地小吃",
                note: "边走边吃，感受地道风味",
                duration: "1 小时",
                transport: "步行",
                cost: "约 30 元/人",
                source: "food",
                recommendedDish: isPutuo ? "观音饼" : isXiamen ? "土笋冻" : isXian ? "柿子饼" : "特色小吃",
              },
              {
                time: "14:00",
                activity: "休闲时光",
                note: "可以找个地方坐坐，整理照片",
                duration: "1.5 小时",
                transport: "步行",
                cost: "约 40 元/人",
                source: "recommended",
              },
              {
                time: "16:00",
                activity: isPutuo ? "西天景区漫步" : isXiamen ? "中山路购物" : isXian ? "回民街逛吃" : "逛特色街区/买伴手礼",
                note: "带点当地特色回家",
                duration: "1 小时",
                transport: "步行",
                cost: "因人而异",
                source: "recommended",
              },
              {
                time: "18:00",
                activity: "告别晚餐",
                note: "用一顿好吃的结束这一天",
                duration: "1.5 小时",
                transport: "步行",
                cost: "约 80 元/人",
                source: "food",
                recommendedDish: "本地特色",
              },
              {
                time: "20:00",
                activity: "回酒店休息",
                note: "整理回忆",
                source: "rest",
              },
            ],
          });
        } else {
          // 最后一天
          fallbackDays.push({
            dayIndex: d,
            items: [
              {
                time: "09:00",
                activity: isPutuo ? "紫竹林最后一拜" : isXiamen ? "厦门大学打卡" : isXian ? "最后一个景点打卡" : "最后一个景点打卡",
                note: "把还没去的地方补一下",
                duration: "2 小时",
                transport: "步行/打车",
                cost: "视景点而定",
                source: "recommended",
              },
              {
                time: "12:00",
                activity: "最后的午餐",
                note: "再吃一顿本地特色，圆满结束旅程，建议中午吃完返程避开高峰",
                duration: "1.5 小时",
                transport: "步行",
                cost: "约 80 元/人",
                source: "food",
                recommendedDish: "必吃招牌菜",
              },
              {
                time: "14:00",
                activity: "准备返程",
                note: "中午吃完午饭返程，避开下午高速高峰时段",
                duration: "灵活",
                transport: "自驾/打车去车站",
                cost: "视交通方式而定",
                source: "transport",
              },
            ],
          });
        }
      }

      generated = {
        title: `${destination} · ${pref}之旅`,
        vibeTheme: theme,
        overview: `这是一场围绕「${pref}」展开的${destination}之旅，节奏轻松，适合慢慢走、慢慢看。`,
        travelTips: [
          "建议穿舒适的鞋子，每天步行较多",
          "提前查好天气，带上轻便外套",
          "热门餐厅建议错峰用餐",
          "最后一天建议中午吃完午饭返程，避开下午高峰时段"
        ],
        days: fallbackDays,
      };
    }

    // ===== 后处理：兜底修正 =====
    const theme = inferVibeTheme(destination);

    // 1. title 兜底 - 确保不是用户原话
    if (!generated.title?.trim() || generated.title.includes(destination) && generated.title.length > 20) {
      const pref = tags.preferences.length > 0 ? tags.preferences[0] : "观光";
      // 生成更产品化的标题
      let crowdTag = "";
      if (/父母|爸妈|老人|长辈/.test(tags.preferences.join(""))) crowdTag = "家庭";
      else if (/情侣|约会/.test(tags.preferences.join(""))) crowdTag = "情侣";
      else if (/闺蜜|朋友/.test(tags.preferences.join(""))) crowdTag = "闺蜜";
      generated.title = crowdTag
        ? `轻松${crowdTag}${destination}${(generated.days?.length || 2)}日游`
        : `${destination}${(generated.days?.length || 2)}日慢旅行`;
    }

    // 2. 天数兜底：检查天数是否完整，不完整就补上
    const dates = tags.dates?.toLowerCase() ?? "";
    let expectedDays = tags.days ?? 2;
    if (/三天|3天|三日|3日/.test(dates)) expectedDays = 3;
    else if (/四天|4天|四日|4日/.test(dates)) expectedDays = 4;
    else if (/五天|5天|五日|5日/.test(dates)) expectedDays = 5;

    // 确保生成足够的天数
    while ((generated.days?.length ?? 0) < expectedDays) {
      const nextIndex = (generated.days?.length ?? 0) + 1;
      generated.days = generated.days ?? [];

      if (nextIndex < expectedDays) {
        generated.days.push({
          dayIndex: nextIndex,
          items: [
            { time: "09:00", activity: `继续探索${destination}`, note: "把还没去的地方补一补", duration: "2 小时", transport: "步行/打车", cost: "视景点而定", source: "recommended" },
            { time: "12:00", activity: "午餐", note: "吃一家之前没试过的店", duration: "1.5 小时", transport: "步行", cost: "约 60 元/人", source: "food", recommendedDish: "本地特色" },
            { time: "14:30", activity: "轻松漫步", note: "不赶时间，慢慢感受", duration: "1.5 小时", transport: "步行", cost: "免费", source: "recommended" },
            { time: "17:00", activity: "傍晚景色", note: "找个好地方看日落或夜景", duration: "1 小时", transport: "步行", cost: "免费", source: "recommended" },
            { time: "19:00", activity: "晚餐", note: "用一顿好吃的结束这一天", duration: "1.5 小时", transport: "步行", cost: "约 80 元/人", source: "food", recommendedDish: "招牌菜" },
            { time: "21:00", activity: "回酒店休息", note: "整理行李", source: "rest" },
          ],
        });
      } else {
        // 最后一天必须有返程
        generated.days.push({
          dayIndex: nextIndex,
          items: [
            { time: "09:00", activity: "最后一个景点打卡", note: "把还没去的地方补一下", duration: "2 小时", transport: "步行/打车", cost: "视景点而定", source: "recommended" },
            { time: "12:00", activity: "最后的午餐", note: "再吃一顿本地特色，圆满结束旅程，建议中午吃完返程避开高峰", duration: "1.5 小时", transport: "步行", cost: "约 80 元/人", source: "food", recommendedDish: "必吃招牌菜" },
            { time: "14:00", activity: "准备返程", note: "中午吃完午饭返程，避开下午高速高峰时段", duration: "灵活", transport: "自驾/打车去车站", cost: "视交通方式而定", source: "transport" },
          ],
        });
      }
    }

    // 3. 【极其重要】选中卡片强制插入：检查每个选中卡片是否出现在 days 里
    // 断舍离机制：AI 在 omittedSpots 里说明理由主动舍弃的卡片，尊重其判断，不再强制插回
    const omittedTitles = new Set(
      (generated.omittedSpots ?? []).map((o) => o.title)
    );
    if (omittedTitles.size > 0) {
      console.log("[trips] AI 主动舍弃的地点:", Array.from(omittedTitles));
    }
    const selectedTitles = selectedCards
      .map((c) => c.title)
      .filter((title) =>
        // 模糊匹配 omittedSpots（防止「普济寺」vs「普济寺景区」对不上）
        !Array.from(omittedTitles).some(
          (omitted) => omitted.includes(title) || title.includes(omitted)
        )
      );
    if (selectedTitles.length > 0) {
      // 收集现有活动
      const existingActivities = new Set(
        (generated.days ?? []).flatMap((d) =>
          d.items.map((i) => i.activity)
        )
      );

      const missingCards = selectedTitles.filter((title) => {
        // 模糊匹配，防止"普济寺"和"普济寺参拜"没有算上
        return !Array.from(existingActivities).some(activity =>
          activity.includes(title) || title.includes(activity)
        );
      });

      if (missingCards.length > 0 && generated.days.length > 0) {
        console.log("[trips] 强制插入缺失卡片:", missingCards);
        // 把缺失的卡片插入第一天下午，确保它们都在
        const firstDay = generated.days[0];
        missingCards.forEach((title, idx) => {
          const insertIndex = Math.min(2 + idx, firstDay.items.length - 1);
          firstDay.items.splice(insertIndex, 0, {
            time: `${14 + idx}:00`,
            activity: title,
            note: "你选择的必去地点，特意安排在行程中",
            duration: "1.5 小时",
            transport: "步行",
            source: "selected_card",
          });
        });
      }
    }

    // 4. overview 兜底
    if (!generated.overview?.trim()) {
      const pref = tags.preferences.length > 0 ? tags.preferences[0] : "观光";
      generated.overview = `这是一场围绕「${pref}」展开的${destination}之旅，节奏轻松，适合慢慢走、慢慢看。`;
    }

    // 5. travelTips 兜底
    if (!generated.travelTips || generated.travelTips.length < 3) {
      generated.travelTips = [
        "建议穿舒适的鞋子，每天步行较多",
        "提前查好天气，带上轻便外套",
        "热门餐厅建议错峰用餐",
        "最后一天建议中午吃完午饭返程，避开下午高峰时段"
      ];
    }

    // 6. 🆕 注入坐标：将 selectedCards 的坐标匹配到生成的 items 中
    const locationMap = new Map<string, { lng: number; lat: number }>();
    for (const card of selectedCards) {
      if (card.location?.lng && card.location?.lat) {
        locationMap.set(card.title, { lng: card.location.lng, lat: card.location.lat });
      }
    }
    for (const card of selectedFoods) {
      if (card.location?.lng && card.location?.lat) {
        locationMap.set(card.title, { lng: card.location.lng, lat: card.location.lat });
      }
    }
    if (locationMap.size > 0) {
      for (const day of generated.days) {
        for (const item of (day.items as any[])) {
          const loc = locationMap.get(item.activity);
          if (loc) {
            (item as any).lng = loc.lng;
            (item as any).lat = loc.lat;
          }
        }
      }
    }

    // 7. 🆕 路途段强制插入：Day 1 必须有出发路段，最后一天必须有返程
    const departure = tags.departure || "";
    const transportation = tags.transportation || "";
    const departureTimeLabel = tags.departureTime || "早上出发";
    const departureHour: Record<string, number> = { "早上出发": 9, "中午出发": 13, "下午出发": 15 };
    const returnHour: Record<string, number> = { "午饭后返程": 13, "一早返程": 9 };
    const depHour = departureHour[departureTimeLabel] || 9;
    const retHour = returnHour[tags.returnTime || "午饭后返程"] || 13;

    if (departure && transportation && generated.days && generated.days.length > 0) {
      const travelLabel = transportation === "自驾" ? `${departure}自驾前往${destination}` : `${departure}${transportation}前往${destination}`;
      const travelDuration = transportation === "自驾" ? "约 3-4 小时" : transportation === "飞机" ? "约 3-4 小时（含候机）" : "约 1-3 小时";

      // Day 1 — 确保第一个 item 是路途
      const day1 = generated.days[0];
      const hasTransportFirst = day1.items.length > 0 && (
        day1.items[0].source === "transport" ||
        day1.items[0].activity.includes("前往") ||
        day1.items[0].activity.includes("出发")
      );

      if (!hasTransportFirst) {
        day1.items.unshift({
          time: `${String(depHour).padStart(2, "0")}:00`,
          activity: travelLabel,
          note: `从${departure}出发，${transportation === "自驾" ? "路途服务区可以休整" : "提前出发避免赶时间"}`,
          duration: travelDuration,
          transport: travelDuration,
          cost: transportation === "自驾" ? "油费+过路费约 150-300 元" : "视车次/航班而定",
          tips: "建议提前出发，避开早高峰",
          source: "transport",
        });
      }

      // Last day — 确保最后有返程项
      const lastDay = generated.days[generated.days.length - 1];
      const returnLabel = `${destination}${transportation}返回${departure}`;
      const hasReturnLast = lastDay.items.length > 0 && (
        lastDay.items[lastDay.items.length - 1].source === "transport" ||
        lastDay.items[lastDay.items.length - 1].activity.includes("返回") ||
        lastDay.items[lastDay.items.length - 1].activity.includes("返程")
      );

      if (!hasReturnLast) {
        lastDay.items.push({
          time: `${String(retHour).padStart(2, "0")}:00`,
          activity: returnLabel,
          note: tags.returnTime === "一早返程" ? "早起返程，到家还能休息一下迎接新一周" : "午饭后返程，避开晚高峰",
          duration: travelDuration,
          transport: travelDuration,
          cost: transportation === "自驾" ? "油费+过路费约 150-300 元" : "视车次/航班而定",
          tips: "建议提前收拾好行李，退房前检查物品",
          source: "transport",
        });
      }
    }

    // 8. 🆕 给所有 item 添加模糊时段字段（前端展示用）
    const HOUR_TO_PERIOD: Record<number, string> = {
      6: "早上", 7: "早上", 8: "上午",
      9: "上午", 10: "上午", 11: "上午",
      12: "午饭", 13: "下午", 14: "下午",
      15: "下午", 16: "下午", 17: "傍晚",
      18: "晚饭", 19: "晚上", 20: "晚上",
      21: "晚上", 22: "夜晚", 23: "夜晚",
    };
    for (const day of generated.days || []) {
      for (const item of (day.items as any[])) {
        const hour = parseInt(item.time?.split(":")[0] || "9");
        (item as any).period = HOUR_TO_PERIOD[hour] || "上午";
      }
    }

    const finalTheme = generated.vibeTheme ?? theme;
    console.log(
      "[trips] creating trip, userId:", session.user.id,
      "title:", generated.title,
      "days:", generated.days?.length,
      "theme:", finalTheme
    );

    const trip = await prisma.trip.create({
      data: {
        destination,
        preferences: JSON.stringify({
          tags: enrichedTags,
          harmony: autoHarmony,
          selectedCards,
          selectedFoods,
          title: generated.title,
          overview: generated.overview,
          travelTips: generated.travelTips,
          omittedSpots: generated.omittedSpots ?? [],
          planningThought: generated.planningThought ?? "",
          rawUserText: body.rawUserText ?? "",
        }),
        vibeTheme: finalTheme,
        userId: session.user.id,
        moments: {
          // 创建一个空的 moment（数据库要求至少一个）
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
      include: { moments: true, itineraries: true },
    });
    console.log("[trips] trip created:", trip.id);

    return NextResponse.json({
      trip,
    });
  } catch (e) {
    console.error("[trips] create error:", e);
    if (e instanceof LocalServiceError) {
      return NextResponse.json(
        { error: e.message, service: e.service, offline: true },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { error: "创建行程失败", detail: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
