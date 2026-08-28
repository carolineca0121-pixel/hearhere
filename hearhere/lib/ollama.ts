/**
 * LLM 客户端 — 支持 DeepSeek / 硅基流动 双 Provider
 *
 * DeepSeek API 与 OpenAI 兼容：https://api.deepseek.com/v1
 * 硅基流动 API：https://api.siliconflow.cn/v1
 *
 * 优先使用 DeepSeek（DEEPSEEK_API_KEY 存在时），
 * 回退到硅基流动（SILICONFLOW_API_KEY）。
 *
 * E2 基础设施修复：
 * 1. ollamaJson 解析顺序重写——根治「数组正则优先 + 贪婪跨界」导致
 *    「对象中嵌套数组」被错误截取的问题（此前对象型输出 100% 解析失败）。
 * 2. chat() 增加 AbortSignal 超时保护（LLM_TIMEOUT_MS，默认 45s）。
 * 3. 可选 jsonMode（response_format: json_object），provider 拒绝时降级重试。
 * 4. 可选单次 repair pass（默认关闭），不为修 JSON 无限调用 LLM。
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

/** 单次 LLM 调用超时（毫秒）。可用 LLM_TIMEOUT_MS 环境变量覆盖（测试/部署调优用）。 */
const LLM_TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS ?? 45000);

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

interface ChatOptions {
  /** 请求 response_format: { type: "json_object" }。provider 拒绝（400）时自动降级重试一次。 */
  jsonMode?: boolean;
}

async function chat(prompt: string, maxTokens = 4096, opts?: ChatOptions): Promise<string> {
  const provider = getProvider();
  const jsonMode = opts?.jsonMode === true;

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

    const doFetch = (withJsonFormat: boolean) =>
      fetch(baseUrl + "/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + apiKey,
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: 0.7,
          max_tokens: maxTokens,
          ...(withJsonFormat ? { response_format: { type: "json_object" } } : {}),
        }),
        signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
      });

    let res: Response;
    try {
      res = await doFetch(jsonMode);
    } catch (e) {
      if (e instanceof Error && e.name === "TimeoutError") {
        throw new LocalServiceError(`${name} API 调用超时（>${LLM_TIMEOUT_MS}ms）`, name);
      }
      throw e;
    }

    // jsonMode  graceful fallback：provider 不接受 response_format 时降级重试一次
    if (!res.ok && jsonMode && res.status === 400) {
      const errText = await res.text().catch(() => "");
      console.warn(
        `[ollama] ${name} 不接受 response_format（${errText.slice(0, 120)}），降级为普通模式重试`
      );
      try {
        res = await doFetch(false);
      } catch (e) {
        if (e instanceof Error && e.name === "TimeoutError") {
          throw new LocalServiceError(`${name} API 调用超时（>${LLM_TIMEOUT_MS}ms）`, name);
        }
        throw e;
      }
    }

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

// ── JSON 提取（E2 重写：纯函数，可独立测试） ─────────────

/** 去除 ```json ... ``` 或 ``` ... ``` 围栏；无围栏则原样 trim。 */
export function stripCodeFence(text: string): string {
  const m = text.match(/```(?:json|JSON)?\s*([\s\S]*?)```/);
  if (m) return m[1].trim();
  return text.trim();
}

/**
 * 从 LLM 文本中解析 JSON。解析顺序（E2 根治方案）：
 * 1. 去围栏后整体直接 JSON.parse（覆盖干净输出）；
 * 2. 按「第一个结构字符」判定目标形态：
 *    - 先出现 `[` → 数组优先提取（兼容纯数组 / 对象元素数组，推荐路由正是此形态）；
 *    - 否则 → 对象优先提取（对象中嵌套数组时，贪婪匹配从首个 `{` 到末个 `}` 正好是完整对象）；
 * 3. 另一种形态作为 fallback 再试一次；
 * 4. 全部失败 → 抛 LocalServiceError（安全失败，绝不抛出不可控异常）。
 */
export function parseJsonFromText<T>(text: string): T {
  const stripped = stripCodeFence(text);

  // 1) 整体直接 parse
  try {
    return JSON.parse(stripped) as T;
  } catch {
    // 继续走提取
  }

  // 2) 形态判定 + 提取
  const firstArr = stripped.indexOf("[");
  const firstObj = stripped.indexOf("{");
  const arrMatch = stripped.match(/\[[\s\S]*\]/);
  const objMatch = stripped.match(/\{[\s\S]*\}/);
  const preferArray =
    firstArr !== -1 && (firstObj === -1 || firstArr < firstObj);
  const candidates = preferArray
    ? [arrMatch?.[0], objMatch?.[0]]
    : [objMatch?.[0], arrMatch?.[0]];

  for (const c of candidates) {
    if (!c) continue;
    try {
      return JSON.parse(c) as T;
    } catch {
      // 试下一个候选
    }
  }

  throw new LocalServiceError(
    "无法从 LLM 响应中提取 JSON。原始输出（前 200 字）：" + text.slice(0, 200),
    "llm-parse"
  );
}

export async function ollamaJson<T>(
  prompt: string,
  opts?: { maxTokens?: number; jsonMode?: boolean; repair?: boolean }
): Promise<T> {
  const maxTokens = opts?.maxTokens ?? 4096;
  const text = await chat(prompt, maxTokens, { jsonMode: opts?.jsonMode });

  try {
    return parseJsonFromText<T>(text);
  } catch (e) {
    // 可选单次 repair pass（默认关闭）：把损坏的输出交给 LLM 修一次，绝不循环
    if (opts?.repair) {
      console.warn("[ollama] JSON 解析失败，执行单次 repair pass");
      const repairedText = await chat(
        "下面的内容本应是一个 JSON，但格式已损坏。请只输出修复后的合法 JSON 本身，不要输出任何解释、注释或额外文字：\n\n" +
          text.slice(0, 3000),
        maxTokens,
        { jsonMode: true }
      );
      return parseJsonFromText<T>(repairedText);
    }
    throw e;
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
  process.env.SILICONFLOW_VISION_MODEL ?? "Qwen/Qwen3-VL-8B-Instruct"; // 轻量快速（Qwen2.5-VL全系已被硅基流动下架，实测不可用）
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

  let res: Response;
  try {
    res = await fetch(baseUrl + "/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + apiKey,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
    });
  } catch (e) {
    if (e instanceof Error && e.name === "TimeoutError") {
      throw new LocalServiceError(`视觉模型调用超时（>${LLM_TIMEOUT_MS}ms）`, "llm-vision");
    }
    throw e;
  }

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
