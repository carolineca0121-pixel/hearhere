"use client";

import { Music2 } from "lucide-react";

interface PolaroidMomentProps {
  title: string;
  description: string;
  vibeColor: string;
  musicHint: string;
}

export function PolaroidMoment({
  title,
  description,
  vibeColor,
  musicHint,
}: PolaroidMomentProps) {
  return (
    <article
      className="mx-auto max-w-sm rotate-[-1deg] rounded-sm bg-white p-4 pb-8 shadow-glass"
      style={{ boxShadow: `0 12px 40px ${vibeColor}33` }}
    >
      {/* 氛围渐变占位（无图） */}
      <div
        className="relative flex aspect-[4/3] w-full flex-col items-center justify-center gap-3 overflow-hidden rounded-sm px-6 text-center"
        style={{
          background: `linear-gradient(135deg, ${vibeColor}40, ${vibeColor}15)`,
        }}
      >
        <span className="font-serif text-2xl text-charcoal/40">{title}</span>
        <span
          className="h-1 w-20 rounded-full"
          style={{ backgroundColor: `${vibeColor}66` }}
        />
        <span className="text-xs text-charcoal/40">HearHere 情感高光时刻</span>
      </div>

      <div className="mt-4 space-y-3 px-1">
        <h3 className="font-serif text-lg font-semibold text-charcoal">
          {title}
        </h3>
        <p className="font-serif text-sm leading-relaxed text-charcoal/85">
          {description}
        </p>

        {musicHint && (
          <div
            className="flex items-center gap-3 rounded-2xl border border-white/40 bg-white/50 p-3 backdrop-blur-sm"
            aria-label="歌单氛围参考，无音频播放"
          >
            <div
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl"
              style={{ backgroundColor: `${vibeColor}44` }}
            >
              <Music2 className="h-5 w-5 text-charcoal/70" />
            </div>
            <div>
              <p className="text-xs text-muted">氛围歌单 · 仅视觉参考</p>
              <p className="text-sm text-charcoal">{musicHint}</p>
            </div>
          </div>
        )}
      </div>
    </article>
  );
}
