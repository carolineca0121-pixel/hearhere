"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useSessionStore } from "@/stores/session";

export default function DiscoverLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { tags } = useSessionStore();

  return (
    <div className="flex flex-col min-h-[calc(100vh-8rem)]">
      {/* 顶部导航 — 仅返回按钮 */}
      <div className="flex items-center justify-between mb-4 px-1">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1.5 text-muted hover:text-charcoal transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="text-sm">返回</span>
        </button>
        <h1 className="text-sm font-medium text-charcoal/70">
          {tags?.destination ? `探索 ${tags.destination}` : "选择地点"}
        </h1>
        <div className="w-12" />
      </div>

      {children}
    </div>
  );
}
