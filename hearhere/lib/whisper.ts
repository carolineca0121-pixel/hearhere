import { LocalServiceError } from "@/lib/ollama";

const SILICONFLOW_API_KEY = process.env.SILICONFLOW_API_KEY ?? "";
const SILICONFLOW_BASE_URL = process.env.SILICONFLOW_BASE_URL ?? "https://api.siliconflow.cn/v1";
const SILICONFLOW_ASR_MODEL = process.env.SILICONFLOW_ASR_MODEL ?? "FunAudioLLM/SenseVoiceSmall";

export async function transcribeAudio(audio: Blob): Promise<string> {
  if (!SILICONFLOW_API_KEY) {
    throw new LocalServiceError("未配置 SILICONFLOW_API_KEY", "siliconflow-asr");
  }

  const formData = new FormData();
  formData.append("file", audio, "recording.webm");
  formData.append("model", SILICONFLOW_ASR_MODEL);

  let res: Response;
  try {
    res = await fetch(`${SILICONFLOW_BASE_URL}/audio/transcriptions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${SILICONFLOW_API_KEY}`,
      },
      body: formData,
      signal: AbortSignal.timeout(60000),
    });
  } catch {
    throw new LocalServiceError(
      "无法连接硅基流动语音识别服务",
      "siliconflow-asr"
    );
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new LocalServiceError(
      `语音识别失败 (${res.status}): ${text}`,
      "siliconflow-asr"
    );
  }

  const data = (await res.json()) as { text?: string };
  return (data.text ?? "").trim();
}
