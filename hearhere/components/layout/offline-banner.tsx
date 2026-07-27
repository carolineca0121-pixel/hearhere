"use client";

import { useEffect, useState } from "react";
import { AlertCircle } from "lucide-react";

type HealthStatus = {
  siliconflow: boolean;
  tavily: boolean;
  insightSource: string;
};

export function OfflineBanner() {
  const [status, setStatus] = useState<HealthStatus | null>(null);

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((d: HealthStatus) => setStatus(d))
      .catch(() =>
        setStatus({ siliconflow: false, tavily: false, insightSource: "mock" })
      );
  }, []);

  if (!status) return null;

  // 硅基流动是录音 + AI 理解的核心服务，缺失必须警告
  // Tavily 只在 INSIGHT_SOURCE=tavily 时才是问题；mock 模式下缺失无所谓
  const siliconflowMissing = !status.siliconflow;
  const tavilyMissing = !status.tavily && status.insightSource === "tavily";

  if (!siliconflowMissing && !tavilyMissing) return null;

  const parts: string[] = [];
  if (siliconflowMissing) parts.push("硅基流动（语音识别 + AI 理解）");
  if (tavilyMissing) parts.push("Tavily 搜索");

  return (
    <div className="mx-6 mb-4 flex items-start gap-2 rounded-2xl border border-amber-200/60 bg-amber-50/80 px-4 py-3 text-sm text-amber-900 backdrop-blur-sm">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <p>
        云端服务未就绪：{parts.join("、")}。请在项目根目录 <code className="rounded bg-amber-100 px-1">.env</code> 中配置对应的 API Key，再重启 <code className="rounded bg-amber-100 px-1">npm run dev</code>。
      </p>
    </div>
  );
}
