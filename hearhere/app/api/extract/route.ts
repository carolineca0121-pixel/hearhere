import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { ollamaJson, LocalServiceError } from "@/lib/ollama";
import { quickExtractPrompt } from "@/lib/ai-prompts";
import type { ExtractedTags } from "@/lib/types";

const CN_NUMBERS: Record<string, number> = {
  一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5,
  六: 6, 七: 7, 八: 8, 九: 9, 十: 10,
};

function compactTag(text?: string | null, max = 8): string | undefined {
  if (!text) return undefined;
  const cleaned = text
    .replace(/[，。！？、；：,.!?;:]/g, "")
    .replace(/我想|我要|计划|准备|预计|大概|左右|一起|去玩|玩/g, "")
    .trim();
  if (!cleaned || cleaned.length > max) return undefined;
  return cleaned;
}

function uniqueShortTags(values: Array<string | undefined>, max = 8): string[] {
  const seen = new Set<string>();
  return values
    .map((v) => compactTag(v, max))
    .filter((v): v is string => Boolean(v))
    .filter((v) => { if (seen.has(v)) return false; seen.add(v); return true; });
}

// ── 规则提取（<1ms） ──────────────────────────────

function inferRuleTags(text: string): Partial<ExtractedTags> {
  const result: Partial<ExtractedTags> = {};

  const depMatch = text.match(/从([^，。,.\s]+?)(?:出发|自驾|坐|乘|去|到)/);
  if (depMatch?.[1] && depMatch[1].length <= 6) result.departure = depMatch[1];

  const destMatch = text.match(/去([^，。,.\s]+?)(?:玩|旅行|旅游|三天|两天|[0-9一二两三四五六七八九十]+天|$)/);
  if (destMatch?.[1] && destMatch[1].length <= 8) result.destination = destMatch[1];

  const arabicDays = text.match(/(\d+)\s*天/);
  const chineseDays = text.match(/([一二两三四五六七八九十])天/);
  if (arabicDays) result.days = Number(arabicDays[1]);
  else if (chineseDays) result.days = CN_NUMBERS[chineseDays[1]];

  const pplArabic = text.match(/(\d+)\s*(?:个人|人)/);
  const pplChinese = text.match(/([一二两三四五六七八九十])\s*(?:个人|人)/);
  if (pplArabic) result.peopleCount = Number(pplArabic[1]);
  else if (pplChinese) result.peopleCount = CN_NUMBERS[pplChinese[1]];
  else if (/爸妈|父母/.test(text)) result.peopleCount = 3;

  if (/自驾|开车/.test(text)) result.transportation = "自驾";
  else if (/高铁|动车/.test(text)) result.transportation = "高铁";
  else if (/飞机|航班/.test(text)) result.transportation = "飞机";

  if (/爸妈|父母|老人|长辈/.test(text)) result.tripType = "家庭游";
  else if (/女朋友|男朋友|情侣|对象|约会/.test(text)) result.tripType = "情侣游";
  else if (/闺蜜|姐妹|女生|朋友/.test(text)) result.tripType = "朋友游";
  else if (/一个人|独自|自己/.test(text)) result.tripType = "独自游";

  const prefs: string[] = [];
  if (/爸妈|父母/.test(text)) prefs.push("陪父母");
  if (/不想太累|不能太累|轻松|慢/.test(text)) prefs.push("轻松");
  if (/看海|海边|沙滩/.test(text)) prefs.push("看海");
  if (/拍照|打卡/.test(text)) prefs.push("拍照");
  if (/小众/.test(text)) prefs.push("小众");
  if (/咖啡/.test(text)) prefs.push("咖啡馆");
  if (/海鲜/.test(text)) prefs.push("海鲜");
  if (/祈福|寺|拜/.test(text)) prefs.push("祈福");

  const constraints: string[] = [];
  if (/老人.*(不能|不想|少).*(走|累)|不能.*多走|少走/.test(text)) constraints.push("少走路");
  if (/不吃辣|不能吃辣/.test(text)) constraints.push("不吃辣");

  result.preferences = prefs;
  result.constraints = constraints;
  result.groupMode = Boolean(result.peopleCount && result.peopleCount > 1) || /爸妈|父母|朋友|闺蜜|我们/.test(text);

  // ── 出发/返程时间（E4-0：自然语言时间进入 tags，不再静默丢弃；规则层提取，LLM 不涉及）──
  // 中文数字小时：一点~十二点（含「两」）
  const zhHour = (s: string): number | null => {
    const map: Record<string, number> = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
    if (map[s] != null) return map[s];
    if (s === "十一") return 11;
    if (s === "十二") return 12;
    return null;
  };
  const clockToHHMM = (period: string | undefined, hh: string, mmRaw?: string): string | null => {
    let h = /^\d{1,2}$/.test(hh) ? parseInt(hh, 10) : (zhHour(hh) ?? NaN);
    if (Number.isNaN(h) || h > 24) return null;
    let min = 0;
    const mm = mmRaw?.replace(/\s*分/, "");
    if (mm === "半") min = 30;
    else if (mm) { min = parseInt(mm, 10); if (Number.isNaN(min) || min > 59) return null; }
    if (period && /下午|傍晚|晚上/.test(period) && h < 12) h += 12;
    if (period && /中午/.test(period) && h >= 1 && h <= 2) h += 12; // 中午1点=13:00
    if (h > 23) return null;
    return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
  };
  // 出发：精确「（下午）3点（半）出发/走」优先（支持中文数字：两点/十二点）
  const depClock = text.match(/(早上|上午|早晨|中午|下午|傍晚|晚上)?\s*(\d{1,2}|[一二两三四五六七八九]|十[一二]?)\s*[点：:]\s*(半|\d{1,2}\s*分?)?\s*(?:左右)?\s*(?:出发|走)/);
  if (depClock) {
    const v = clockToHHMM(depClock[1], depClock[2], depClock[3]);
    if (v) {
      result.departureTimeVal = v;
      const h = parseInt(v.slice(0, 2), 10);
      result.departureTime = h < 11 ? "早上出发" : h < 14 ? "中午出发" : h < 17 ? "下午出发" : "晚上出发";
    }
  }
  // 出发：模糊标签兜底（「一早」必须紧跟出发/走，避免「一早返程」误伤）
  if (!result.departureTime) {
    if (/(?:一早|一大早)\s*(?:出发|走)/.test(text) || /早点出发/.test(text) || /(早上|上午|早晨)\s*(?:出发|走)/.test(text)) result.departureTime = "早上出发";
    else if (/(午饭后|中午|午后)\s*(?:出发|走)/.test(text)) result.departureTime = "中午出发";
    else if (/下午\s*(?:出发|走)/.test(text)) result.departureTime = "下午出发";
    else if (/(傍晚|晚上|晚饭后)\s*(?:出发|走)/.test(text)) result.departureTime = "晚上出发";
  }
  // 返程：精确「下午3点返程/回家」（支持中文数字）
  const retClock = text.match(/(早上|上午|中午|下午|傍晚|晚上)?\s*(\d{1,2}|[一二两三四五六七八九]|十[一二]?)\s*[点：:]\s*(半|\d{1,2}\s*分?)?\s*(?:左右)?\s*(?:返程|回去|回家|回来)/);
  if (retClock) {
    const v = clockToHHMM(retClock[1], retClock[2], retClock[3]);
    if (v) {
      result.returnTimeVal = v;
      result.returnTime = parseInt(v.slice(0, 2), 10) < 11 ? "一早返程" : "午饭后返程";
    }
  }
  if (!result.returnTime) {
    if (/一早\s*(?:返程|回去|回家)/.test(text)) result.returnTime = "一早返程";
    else if (/(午饭后|下午)\s*(?:返程|回去|回家|回来)/.test(text)) result.returnTime = "午饭后返程";
  }

  return result;
}

// ── API ────────────────────────────────────────────

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  try {
    const { transcript } = (await req.json()) as { transcript?: string };
    if (!transcript?.trim()) {
      return NextResponse.json({ error: "转写内容为空" }, { status: 400 });
    }

    // 规则先行，即时出结果
    const ruleTags = inferRuleTags(transcript);

    // LLM 增强（单次调用，合并 refine+extract，512 tokens 快速返回）
    let llmTags: Partial<ExtractedTags> = {};
    try {
      llmTags = await ollamaJson<Partial<ExtractedTags>>(
        quickExtractPrompt(transcript),
        { maxTokens: 512 }
      );
    } catch (e) {
      console.warn("[extract] LLM failed, using rule-only:", e);
    }

    // 合并：规则 base + LLM 覆盖
    const normalized: ExtractedTags = {
      destination: compactTag(llmTags.destination, 8) ?? ruleTags.destination ?? undefined,
      departure: compactTag(llmTags.departure, 6) ?? ruleTags.departure ?? undefined,
      tripType: compactTag(llmTags.tripType, 6) ?? ruleTags.tripType ?? undefined,
      peopleCount: llmTags.peopleCount ?? ruleTags.peopleCount ?? undefined,
      days: llmTags.days ?? ruleTags.days ?? undefined,
      transportation: compactTag(llmTags.transportation, 6) ?? ruleTags.transportation ?? undefined,
      budget: compactTag(llmTags.budget, 10) ?? undefined,
      dates: compactTag(llmTags.dates, 10) ?? undefined,
      preferences: uniqueShortTags([
        ...(ruleTags.preferences ?? []),
        ...(llmTags.preferences ?? []),
      ], 8),
      constraints: uniqueShortTags([
        ...(ruleTags.constraints ?? []),
        ...(llmTags.constraints ?? []),
      ], 8),
      // E4-0：出发/返程时间仅由规则层提取（LLM 不提供；P2 可继续手动覆盖）
      departureTime: ruleTags.departureTime ?? undefined,
      departureTimeVal: ruleTags.departureTimeVal ?? undefined,
      returnTime: ruleTags.returnTime ?? undefined,
      returnTimeVal: ruleTags.returnTimeVal ?? undefined,
      conflicts: uniqueShortTags(llmTags.conflicts ?? [], 10),
      groupMode: Boolean(
        llmTags.groupMode || ruleTags.groupMode ||
        (llmTags.peopleCount && llmTags.peopleCount > 1) ||
        (ruleTags.peopleCount && ruleTags.peopleCount > 1) ||
        /三个人|一家|我们|团体|多人|爸妈|父母|朋友|闺蜜/.test(transcript)
      ),
    };

    return NextResponse.json({
      refinedTranscript: transcript,
      originalTranscript: transcript,
      tags: normalized,
    });
  } catch (e) {
    if (e instanceof LocalServiceError) {
      return NextResponse.json(
        { error: e.message, service: e.service, offline: true },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: "提取失败" }, { status: 500 });
  }
}
