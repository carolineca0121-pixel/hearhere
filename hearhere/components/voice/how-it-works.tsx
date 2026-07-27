"use client";

import { Mic, Tags, Layers, Map } from "lucide-react";

const STEPS = [
  { icon: Mic, label: "说出需求" },
  { icon: Tags, label: "确认标签" },
  { icon: Layers, label: "滑动选卡" },
  { icon: Map, label: "生成攻略" },
];

export function HowItWorks() {
  return (
    <div className="flex items-center justify-center gap-1.5 text-[11px] text-muted">
      {STEPS.map((s, i) => (
        <div key={s.label} className="flex items-center gap-1.5">
          <span className="inline-flex items-center gap-1 rounded-full border border-charcoal/10 bg-white/40 px-2 py-0.5">
            <s.icon className="h-3 w-3" />
            {s.label}
          </span>
          {i < STEPS.length - 1 && (
            <span className="text-charcoal/20">→</span>
          )}
        </div>
      ))}
    </div>
  );
}
