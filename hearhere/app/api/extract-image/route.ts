import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { ollamaVisionJson, LocalServiceError } from "@/lib/ollama";
import { visionExtractPrompt } from "@/lib/ai-prompts";
import type { ExtractedTags } from "@/lib/types";

/**
 * 截图创建行程 API
 * 接收用户上传的旅行攻略/聊天截图，用视觉模型提取结构化旅行需求。
 * 返回格式与 /api/extract 一致，前端复用同一套 confirm 流程。
 */

const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

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

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "没有收到图片" }, { status: 400 });
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "只支持 JPG / PNG / WebP 图片" },
        { status: 400 }
      );
    }
    if (file.size > MAX_IMAGE_SIZE) {
      return NextResponse.json(
        { error: "图片太大了，请压缩到 10MB 以内" },
        { status: 400 }
      );
    }

    // 转 base64
    const arrayBuffer = await file.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");

    // 调视觉模型提取
    const llmTags = await ollamaVisionJson<Partial<ExtractedTags> & { mentionedPlaces?: string[] }>(
      visionExtractPrompt(),
      base64,
      file.type,
      { maxTokens: 1024 }
    );

    // 归一化（与 extract route 保持一致的格式）
    const normalized: ExtractedTags = {
      destination: compactTag(llmTags.destination, 8) ?? undefined,
      departure: compactTag(llmTags.departure, 6) ?? undefined,
      tripType: compactTag(llmTags.tripType, 6) ?? undefined,
      peopleCount: llmTags.peopleCount ?? undefined,
      days: llmTags.days ?? undefined,
      transportation: compactTag(llmTags.transportation, 6) ?? undefined,
      budget: compactTag(llmTags.budget, 10) ?? undefined,
      dates: compactTag(llmTags.dates, 10) ?? undefined,
      preferences: uniqueShortTags(llmTags.preferences ?? [], 8),
      constraints: uniqueShortTags(llmTags.constraints ?? [], 8),
      conflicts: uniqueShortTags(llmTags.conflicts ?? [], 10),
      groupMode: Boolean(
        llmTags.groupMode || (llmTags.peopleCount && llmTags.peopleCount > 1)
      ),
    };

    return NextResponse.json({
      refinedTranscript: "",  // 截图没有文字转写，confirm 页不显示原文
      originalTranscript: "",
      tags: normalized,
      // 📷 截图中识别出的具体地名（Page 3 置顶为已选卡片）
      mentionedPlaces: Array.isArray(llmTags.mentionedPlaces)
        ? llmTags.mentionedPlaces.filter((p): p is string => typeof p === "string" && p.trim().length >= 2).slice(0, 12)
        : [],
      source: "image",
    });
  } catch (e) {
    if (e instanceof LocalServiceError) {
      return NextResponse.json(
        { error: e.message, service: e.service, offline: true },
        { status: 503 }
      );
    }
    console.error("[extract-image]", e);
    return NextResponse.json({ error: "图片识别失败，请换一张试试" }, { status: 500 });
  }
}
