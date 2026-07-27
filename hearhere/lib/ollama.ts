/**
 * LLM 客户端 — 支持 DeepSeek / 硅基流动 双 Provider
 *
 * DeepSeek API 与 OpenAI 兼容：https://api.deepseek.com/v1
 * 硅基流动 API：https://api.siliconflow.cn/v1
 *
 * 优先使用 DeepSeek（DEEPSEEK_API_KEY 存在时），
 * 回退到硅基流动（SILICONFLOW_API_KEY）。
 */

export class LocalServiceError extends Error {
  service: string;

  constructor(message: string, service: string) {
    super(message);
    this.name = "LocalServiceError";
    this.service = service;
  }
}

// ── 配置 ──────────────────────────────────────────────

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY ?? "";
const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com/v1";
const DEEPSEEK_CHAT_MODEL = process.env.DEEPSEEK_CHAT_MODEL ?? "deepseek-chat";

const SILICONFLOW_API_KEY = process.env.SILICONFLOW_API_KEY ?? "";
const SILICONFLOW_BASE_URL =
  process.env.SILICONFLOW_BASE_URL ?? "https://api.siliconflow.cn/v1";
const SILICONFLOW_CHAT_MODEL =
  process.env.SILICONFLOW_CHAT_MODEL ?? "Qwen/Qwen2.5-32B-Instruct";

function isPlaceholder(value: string): boolean {
  return !value || value.startsWith("请替换") || value.trim() === "";
}

function getProvider(): {
  apiKey: string;
  baseUrl: string;
  model: string;
  name: string;
  fallback?: { apiKey: string; baseUrl: string; model: string; name: string };
} {
  const hasDeepSeek = !isPlaceholder(DEEPSEEK_API_KEY);
  const hasSilicon = !isPlaceholder(SILICONFLOW_API_KEY);

  if (hasDeepSeek && hasSilicon) {
    return {
      apiKey: DEEPSEEK_API_KEY,
      baseUrl: DEEPSEEK_BASE_URL,
      model: DEEPSEEK_CHAT_MODEL,
      name: "deepseek",
      fallback: {
        apiKey: SILICONFLOW_API_KEY,
        baseUrl: SILICONFLOW_BASE_URL,
        model: SILICONFLOW_CHAT_MODEL,
        name: "siliconflow",
      },
    };
  }
  if (hasDeepSeek) {
    return {
      apiKey: DEEPSEEK_API_KEY,
      baseUrl: DEEPSEEK_BASE_URL,
      model: DEEPSEEK_CHAT_MODEL,
      name: "deepseek",
    };
  }
  if (hasSilicon) {
    return {
      apiKey: SILICONFLOW_API_KEY,
      baseUrl: SILICONFLOW_BASE_URL,
      model: SILICONFLOW_CHAT_MODEL,
      name: "siliconflow",
    };
  }
  throw new LocalServiceError(
    "未配置任何 LLM API Key。请设置 DEEPSEEK_API_KEY 或 SILICONFLOW_API_KEY",
    "llm"
  );
}

// ── 底层调用 ──────────────────────────────────────────

async function chat(prompt: string, maxTokens = 4096): Promise<string> {
  const provider = getProvider();

  const tryChat = async (
    apiKey: string,
    baseUrl: string,
    model: string,
    name: string
  ): Promise<string> => {
    const messages: Array<{ role: string; content: string }> = [];

    if (name === "deepseek") {
      messages.push({
        role: "system",
        content:
          "你是一个精准的工具型助手。必须严格遵循用户指令，只输出要求的格式，不添加任何额外文字或解释。生成的内容要具体、可操作，避免泛泛而谈。",
      });
    }

    messages.push({ role: "user", content: prompt });

    const body = {
      model,
      messages,
      temperature: 0.7,
      max_tokens: maxTokens,
    };

    const res = await fetch(baseUrl + "/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + apiKey,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new LocalServiceError(
        name + " API 调用失败 (" + res.status + "): " + text.slice(0, 300),
        name
      );
    }

    const data = await res.json();
    return data.choices?.[0]?.message?.content ?? "";
  };

  try {
    return await tryChat(
      provider.apiKey,
      provider.baseUrl,
      provider.model,
      provider.name
    );
  } catch (e) {
    if (provider.fallback) {
      console.warn(
        `[ollama] ${provider.name} 失败，回退到 ${provider.fallback.name}:`,
        e instanceof Error ? e.message : String(e)
      );
      return tryChat(
        provider.fallback.apiKey,
        provider.fallback.baseUrl,
        provider.fallback.model,
        provider.fallback.name
      );
    }
    throw e;
  }
}

// ── JSON 模式 ─────────────────────────────────────────

export async function ollamaJson<T>(
  prompt: string,
  opts?: { maxTokens?: number }
): Promise<T> {
  const maxTokens = opts?.maxTokens ?? 4096;
  const text = await chat(prompt, maxTokens);

  const arrMatch = text.match(/\[[\s\S]*\]/);
  const objMatch = text.match(/\{[\s\S]*\}/);
  const candidate =
    arrMatch?.[0] ??
    objMatch?.[0] ??
    tryRecoverTruncatedJson(text);

  if (!candidate) {
    throw new LocalServiceError(
      "无法从 LLM 响应中提取 JSON。原始输出（前 200 字）：" + text.slice(0, 200),
      "llm-parse"
    );
  }

  try {
    return JSON.parse(candidate) as T;
  } catch (e) {
    const recovered = tryRecoverTruncatedJson(candidate);
    if (recovered) {
      try {
        return JSON.parse(recovered) as T;
      } catch {
        // ignore
      }
    }
    throw new LocalServiceError(
      "LLM 返回的 JSON 解析失败：" +
        (e instanceof Error ? e.message : "未知") +
        "。原始输出（前 300 字）：" + text.slice(0, 300),
      "llm-parse"
    );
  }
}

export async function ollamaChat(
  prompt: string,
  opts?: { maxTokens?: number }
): Promise<string> {
  const maxTokens = opts?.maxTokens ?? 2048;
  return chat(prompt, maxTokens);
}

// ── 视觉模型（截图提取行程） ──────────────────────────

const SILICONFLOW_VISION_MODEL =
  process.env.SILICONFLOW_VISION_MODEL ?? "Qwen/Qwen2.5-VL-32B-Instruct";
const DEEPSEEK_VISION_MODEL =
  process.env.DEEPSEEK_VISION_MODEL ?? "deepseek-vl2";

/**
 * 调用视觉模型，传入图片 base64 + prompt，返回解析后的 JSON。
 * 用于「截图创建行程」：上传攻略/聊天截图 → 提取结构化旅行需求。
 * 优先硅基流动视觉模型（Qwen2.5-VL），DeepSeek 视觉作为备选。
 */
export async function ollamaVisionJson<T>(
  prompt: string,
  imageBase64: string,
  mimeType: string,
  opts?: { maxTokens?: number }
): Promise<T> {
  const maxTokens = opts?.maxTokens ?? 1024;

  // 视觉模型目前只在硅基流动稳定可用（Qwen2.5-VL）。
  // DeepSeek 视觉模型接口不稳定，优先硅基流动。
  const apiKey = !isPlaceholder(SILICONFLOW_API_KEY)
    ? SILICONFLOW_API_KEY
    : !isPlaceholder(DEEPSEEK_API_KEY)
    ? DEEPSEEK_API_KEY
    : "";
  const baseUrl = !isPlaceholder(SILICONFLOW_API_KEY)
    ? SILICONFLOW_BASE_URL
    : DEEPSEEK_BASE_URL;
  const model = !isPlaceholder(SILICONFLOW_API_KEY)
    ? SILICONFLOW_VISION_MODEL
    : DEEPSEEK_VISION_MODEL;

  if (!apiKey) {
    throw new LocalServiceError(
      "未配置任何 LLM API Key，无法使用截图识别",
      "llm-vision"
    );
  }

  const body = {
    model,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          {
            type: "image_url",
            image_url: { url: `data:${mimeType};base64,${imageBase64}` },
          },
        ],
      },
    ],
    temperature: 0.3,
    max_tokens: maxTokens,
  };

  const res = await fetch(baseUrl + "/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new LocalServiceError(
      `视觉模型调用失败 (${res.status}): ${text.slice(0, 300)}`,
      "llm-vision"
    );
  }

  const data = await res.json();
  const text: string = data.choices?.[0]?.message?.content ?? "";

  // 复用 JSON 提取逻辑
  const objMatch = text.match(/\{[\s\S]*\}/);
  if (!objMatch) {
    throw new LocalServiceError(
      "无法从视觉模型响应中提取 JSON。原始输出（前 200 字）：" + text.slice(0, 200),
      "llm-parse"
    );
  }
  try {
    return JSON.parse(objMatch[0]) as T;
  } catch (e) {
    throw new LocalServiceError(
      "视觉模型返回的 JSON 解析失败。原始输出（前 300 字）：" + text.slice(0, 300),
      "llm-parse"
    );
  }
}

function tryRecoverTruncatedJson(text: string): string | null {
  const start = text.indexOf("[");
  if (start === -1) return null;
  const lastBrace = text.lastIndexOf("}");
  if (lastBrace <= start) return null;
  return text.slice(start, lastBrace + 1) + "]";
}
