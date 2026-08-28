import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { ollamaJson, LocalServiceError } from "@/lib/ollama";
import { planPrompt } from "@/lib/ai-prompts";
import {
  normalizeAiPlan,
  type AiPlanResponse,
  type NormalizeResult,
  type PlanAnchors,
  type PlanCardRef,
} from "@/lib/plan-normalizer";
import { occupiedIntervalsFor } from "@/lib/duration";
import type { DayPlanItem } from "@/lib/types";

export const maxDuration = 60;

/**
 * E3-2：AI 行程规划服务（纯只读）。
 * POST /api/trips/[id]/plan
 *
 * 职责：读 Trip（tags/selectedCards/骨架）→ planPrompt → LLM → normalizeAiPlan → 返回 NormalizeResult。
 * 明确不做：不写库、不改 DayPlan、不动 placeholder、不接 UI。
 * 落库与画布应用是后续阶段（E3-3）的事，由客户端拿到结果后经 PUT 通道完成。
 */

interface ItineraryRow {
  dayIndex: number;
  content: string;
}

function parseItems(content: string): DayPlanItem[] {
  try {
    const v = JSON.parse(content);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

const hourOf = (t?: string): number | null => {
  const m = /^(\d{1,2})/.exec(t ?? "");
  return m ? Number(m[1]) : null;
};

/**
 * 从骨架（真实 DB DayPlan）推导锚点：
 * - Day1 最早可排 = 酒店入住 rest 项的小时（= 到达后）；无 rest 则去程 transport 小时 +2；兜底 10
 * - 末日最晚可排 = 返程 transport 的小时；兜底 13
 * 只读取结构化 time 字段，不解析任何文案。
 */
function deriveAnchors(itineraries: ItineraryRow[], dayCount: number): PlanAnchors {
  const day1 = parseItems(itineraries.find((i) => i.dayIndex === 1)?.content ?? "[]");
  const lastDay = parseItems(itineraries.find((i) => i.dayIndex === dayCount)?.content ?? "[]");

  const rest = day1.find((i) => i.source === "rest");
  const goTransport = day1.find((i) => i.source === "transport");
  let day1EarliestHour = rest ? hourOf(rest.time) : null;
  if (day1EarliestHour == null && goTransport) {
    const h = hourOf(goTransport.time);
    day1EarliestHour = h != null ? Math.min(22, h + 2) : null;
  }
  if (day1EarliestHour == null) day1EarliestHour = 10;

  const backTransport = [...lastDay].reverse().find((i) => i.source === "transport");
  let lastDayLatestHour = backTransport ? hourOf(backTransport.time) : null;
  if (lastDayLatestHour == null) lastDayLatestHour = 13;

  return { day1EarliestHour, lastDayLatestHour };
}

export async function POST(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }
  const tripId = params.id;

  try {
    const trip = await prisma.trip.findUnique({
      where: { id: tripId, userId: session.user.id },
      include: { itineraries: true },
    });
    if (!trip) {
      return NextResponse.json({ error: "行程不存在" }, { status: 404 });
    }

    let pref: Record<string, unknown> = {};
    try {
      pref = JSON.parse(trip.preferences || "{}");
    } catch {
      pref = {};
    }
    const tags = (pref.tags ?? {}) as Record<string, unknown>;
    const rawUserText = typeof pref.rawUserText === "string" ? pref.rawUserText : undefined;

    // 白名单：DB selectedCards → PlanCardRef（保留真实 id/location，legacy 卡可能没有 id）
    const cards: PlanCardRef[] = (
      Array.isArray(pref.selectedCards) ? pref.selectedCards : []
    )
      .filter((c): c is Record<string, unknown> => !!c && typeof c === "object")
      .map((c) => ({
        id: typeof c.id === "string" ? c.id : undefined,
        title: String(c.title ?? ""),
        description: typeof c.description === "string" ? c.description : undefined,
        reason: typeof c.reason === "string" ? c.reason : undefined,
        location:
          c.location && typeof c.location === "object"
            ? (c.location as PlanCardRef["location"])
            : undefined,
      }))
      .filter((c) => c.title.length > 0);

    const dayCount = trip.itineraries.length || (typeof tags.days === "number" ? tags.days : 2);
    const anchors = deriveAnchors(trip.itineraries, dayCount);

    // 时间占用区间（duration 进入规划约束）：骨架中所有带 duration 的项（往返交通），用 maxHours 口径安全阻塞
    const occupiedIntervals = trip.itineraries.flatMap((d) => {
      const items = parseItems(d.content);
      return occupiedIntervalsFor(items, d.dayIndex, true);
    });
    // 节奏密度：「不要太累/轻松/慢节奏/陪父母/老人」→ 每天最多 3 个主要安排（否则默认 4）
    const prefArr = Array.isArray(tags.preferences) ? (tags.preferences as unknown[]) : [];
    const consArr = Array.isArray(tags.constraints) ? (tags.constraints as unknown[]) : [];
    const paceText = [...prefArr, ...consArr].join(" ");
    const maxPerDay = /不要太累|轻松|慢|父母|老人|长辈/.test(paceText) ? 3 : undefined;

    // 无已选卡片：不调 LLM，直接返回空结果（卡片全在池中由用户手动安排）
    if (cards.length === 0) {
      const empty: NormalizeResult = {
        placementsByDay: {},
        unplaced: [],
        rejected: [],
        warnings: ["没有已选卡片，AI 无可规划对象"],
      };
      return NextResponse.json(empty);
    }

    // 骨架确定性事实（供 prompt  prose，非 LLM 判断对象）
    const day1Items = parseItems(trip.itineraries.find((i) => i.dayIndex === 1)?.content ?? "[]");
    const lastItems = parseItems(
      trip.itineraries.find((i) => i.dayIndex === dayCount)?.content ?? "[]"
    );
    const goT = day1Items.find((i) => i.source === "transport");
    const backT = [...lastItems].reverse().find((i) => i.source === "transport");

    const prompt = planPrompt({
      destination: trip.destination,
      tags,
      rawUserText,
      cards: cards.map((c) => ({ ...c, cardId: c.id ?? null })),
      dayCount,
      anchors,
      skeletonFacts: {
        goLabel: goT?.activity,
        goTime: goT?.time,
        backLabel: backT?.activity,
        backTime: backT?.time,
      },
    });

    console.log(
      `[plan] trip=${tripId} cards=${cards.length} dayCount=${dayCount} anchors=${anchors.day1EarliestHour}-${anchors.lastDayLatestHour} prompt=${prompt.length}字符`
    );
    const t0 = Date.now();
    const raw = await ollamaJson<AiPlanResponse>(prompt, {
      maxTokens: 2048,
      jsonMode: true,
      repair: true,
    });
    const result = normalizeAiPlan({ raw, cards, dayCount, anchors, occupiedIntervals, maxPerDay });
    console.log(
      `[plan] trip=${tripId} LLM+normalize ${Date.now() - t0}ms → placed=${Object.values(result.placementsByDay).flat().length} unplaced=${result.unplaced.length} rejected=${result.rejected.length}`
    );

    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof LocalServiceError) {
      // LLM 不可用/超时/解析失败：结构化降级，P4 保持骨架（E3-3 客户端据此降级）
      return NextResponse.json(
        { error: e.message, service: e.service, offline: true },
        { status: 503 }
      );
    }
    console.error("[plan]", e);
    return NextResponse.json({ error: "规划失败，请稍后再试" }, { status: 500 });
  }
}
