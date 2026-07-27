import { NextResponse } from "next/server";

// 判断 .env 中的值是否仍为占位符（中文"请替换"开头 / 空字符串）
function isPlaceholder(value: string | undefined): boolean {
  if (!value) return true;
  return value.startsWith("请替换") || value.trim() === "";
}

async function pingSiliconFlow(): Promise<boolean> {
  const apiKey = process.env.SILICONFLOW_API_KEY;
  if (isPlaceholder(apiKey)) return false;

  try {
    const res = await fetch("https://api.siliconflow.cn/v1/models", {
      headers: { "Authorization": `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function pingTavily(): Promise<boolean> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (isPlaceholder(apiKey)) return false;

  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: apiKey, query: "test", max_results: 1 }),
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function GET() {
  const [siliconflow, tavily] = await Promise.all([
    pingSiliconFlow().catch(() => false),
    pingTavily().catch(() => false),
  ]);

  return NextResponse.json({
    siliconflow,
    tavily,
    insightSource: process.env.INSIGHT_SOURCE ?? "mock",
  });
}
