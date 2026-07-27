import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { transcribeAudio } from "@/lib/whisper";
import { LocalServiceError } from "@/lib/ollama";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file");
    if (!file || !(file instanceof Blob)) {
      return NextResponse.json({ error: "未收到音频文件" }, { status: 400 });
    }

    const text = await transcribeAudio(file);
    return NextResponse.json({ text });
  } catch (e) {
    if (e instanceof LocalServiceError) {
      return NextResponse.json(
        { error: e.message, service: e.service, offline: true },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: "转写失败" }, { status: 500 });
  }
}
