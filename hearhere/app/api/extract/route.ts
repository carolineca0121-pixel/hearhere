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
