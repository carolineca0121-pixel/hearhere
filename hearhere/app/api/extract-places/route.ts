import { NextResponse } from "next/server";
import { ollamaJson } from "@/lib/ollama";
import { searchPOI } from "@/lib/amap";

export const maxDuration = 60;

/**
 * 语音补充地点提取（Page 3 场景三）
 * POST { text, destination } → { places: [{name, address, lng?, lat?}] }
 * LLM 提取具体地名 → 高德搜索补坐标
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const text = typeof body.text === "string" ? body.text.trim() : "";
    const destination = typeof body.destination === "string" ? body.destination : "";
    if (!text) {
      return NextResponse.json({ error: "缺少文本" }, { status: 400 });
    }

    // 1. LLM 提取用户明确想去的具体地名
    const names = await ollamaJson<string[]>(
      `从下面这段旅行需求中，提取出用户明确说想去的【具体地点名称】（景点/餐厅/街区/场馆/商圈等）。
规则：
- 只输出 JSON 数组，如 ["外滩","黄浦江"]，不要任何其他文字
- 只要地名本身，不要修饰语；最多 6 个
- 必须是具体地名，不要「美食」「古镇」这种泛称
- 没有具体地点就输出 []
目的地城市：${destination || "未知"}
用户说：「${text}」`,
      { maxTokens: 256 }
    );
    const list = (Array.isArray(names) ? names : []).slice(0, 6);

    // 2. 高德搜索补坐标（并发）
    const places = await Promise.all(
      list.map(async (name) => {
        try {
          const r = await searchPOI({ keywords: name, city: destination || "", offset: 1 });
          const p = r.pois?.[0];
          const [lng, lat] = String(p?.location || "").split(",").map(Number);
          return {
            name,
            address: p?.address ? String(p.address) : "",
            lng: lng || undefined,
            lat: lat || undefined,
          };
        } catch {
          return { name };
        }
      })
    );

    return NextResponse.json({ places });
  } catch (e) {
    console.error("[extract-places]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "地点提取失败" },
      { status: 500 }
    );
  }
}
