"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { GlassCard } from "@/components/layout/glass-card";
import { MeshBackground } from "@/components/layout/mesh-background";
import type { VibeTheme, DayPlanItem } from "@/lib/types";
import { Sparkles, MapPin, Utensils, Car, Bed, Share2 } from "lucide-react";
import { motion } from "framer-motion";
import Link from "next/link";

interface TripData {
  id: string;
  destination: string;
  startDate: string | null;
  endDate: string | null;
  preferences: string;
  vibeTheme: string | null;
  itineraries: { dayIndex: number; content: string }[];
}

export default function SharePage() {
  const params = useParams();
  const token = params.token as string;
  const [trip, setTrip] = useState<TripData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    fetch(`/api/share/${token}`)
      .then((r) => {
        if (!r.ok) throw new Error("not found");
        return r.json();
      })
      .then((d) => setTrip(d.trip))
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-4 border-vibe-dusk/30 border-t-vibe-dusk rounded-full animate-spin" />
      </div>
    );
  }

  if (notFound || !trip) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 px-4">
        <p className="text-muted">这个分享链接不存在或已关闭</p>
        <Link href="/" className="text-sm text-vibe-sea hover:underline">
          去创建自己的旅行攻略 →
        </Link>
      </div>
    );
  }

  const theme = (trip.vibeTheme as VibeTheme) ?? "dusk";

  let title = "";
  let overview = "";
  try {
    const pref = JSON.parse(trip.preferences);
    title = pref.title ?? "";
    overview = pref.overview ?? "";
  } catch { /* ignore */ }
  const displayTitle = title || `${trip.destination} · 旅行攻略`;

  const sortedDays = [...trip.itineraries].sort((a, b) => a.dayIndex - b.dayIndex);

  const dateRange = trip.startDate && trip.endDate
    ? `${new Date(trip.startDate).toLocaleDateString("zh-CN", { month: "long", day: "numeric" })} — ${new Date(trip.endDate).toLocaleDateString("zh-CN", { month: "long", day: "numeric" })}`
    : null;

  return (
    <>
      <MeshBackground theme={theme} />
      <div className="relative flex flex-col min-h-[calc(100vh-8rem)]">
        {/* 顶部 */}
        <div className="sticky top-0 z-20 bg-parchment/80 backdrop-blur-md px-4 py-3 flex items-center justify-between border-b border-white/40">
          <div className="flex items-center gap-1.5 text-xs text-muted">
            <Share2 className="w-3.5 h-3.5" />
            <span>来自 HearHere 的分享</span>
          </div>
          <h1 className="text-sm font-semibold text-charcoal truncate max-w-[55%]">
            {displayTitle}
          </h1>
          <div className="w-10" />
        </div>

        {/* 行程概述 */}
        {(overview || dateRange) && (
          <div className="px-4 pt-4">
            <GlassCard className="px-4 py-3">
              {dateRange && (
                <p className="text-xs text-muted mb-1.5">📅 {dateRange}</p>
              )}
              {overview && (
                <div className="flex items-start gap-2">
                  <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-vibe-dusk" />
                  <p className="text-sm leading-relaxed text-charcoal/80">{overview}</p>
                </div>
              )}
            </GlassCard>
          </div>
        )}

        {/* 每日行程 */}
        <div className="flex-1 px-4 py-4 space-y-3">
          {sortedDays.map((day) => {
            const items = (() => {
              try {
                return JSON.parse(day.content) as (DayPlanItem & {
                  source?: string;
                  recommendedDish?: string;
                  period?: string;
                })[];
              } catch { return []; }
            })();

            return (
              <motion.div
                key={day.dayIndex}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: day.dayIndex * 0.08 }}
              >
                <GlassCard className="overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-3 border-b border-white/40">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-vibe-sea to-vibe-dusk flex items-center justify-center text-white text-xs font-bold">
                      {day.dayIndex}
                    </div>
                    <span className="text-sm font-semibold text-charcoal">
                      第 {day.dayIndex} 天
                    </span>
                    <span className="text-xs text-muted">{items.length} 项活动</span>
                  </div>
                  <div className="px-4 py-2">
                    {items.map((item, i) => {
                      const isFood = item.source === "food";
                      const isTransport = item.source === "transport";
                      const isRest = item.source === "rest";
                      return (
                        <div key={i} className="relative flex gap-3 py-2.5 border-b border-charcoal/5 last:border-0">
                          <div className="flex flex-col items-center">
                            <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 mt-1 ${
                              isFood ? "bg-green-400" :
                              isTransport ? "bg-blue-400" :
                              isRest ? "bg-purple-400" :
                              "bg-vibe-dusk/60"
                            }`} />
                            {i < items.length - 1 && (
                              <div className="w-px flex-1 bg-charcoal/10 mt-1" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-0.5">
                              {item.period && (
                                <span className="text-xs text-muted/70">{item.period}</span>
                              )}
                              {item.time && (
                                <span className="text-xs font-medium text-vibe-dusk/80">{item.time}</span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5">
                              {isFood && <Utensils className="w-3 h-3 text-green-600 shrink-0" />}
                              {isTransport && <Car className="w-3 h-3 text-blue-600 shrink-0" />}
                              {isRest && <Bed className="w-3 h-3 text-purple-600 shrink-0" />}
                              {!isFood && !isTransport && !isRest && (
                                <MapPin className="w-3 h-3 text-vibe-sea shrink-0" />
                              )}
                              <p className="text-sm font-medium text-charcoal/90">{item.activity}</p>
                            </div>
                            {item.note && (
                              <p className="text-xs text-muted/80 mt-1 leading-relaxed">{item.note}</p>
                            )}
                            {item.recommendedDish && (
                              <p className="text-xs text-green-700/80 mt-1">推荐：{item.recommendedDish}</p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </GlassCard>
              </motion.div>
            );
          })}
        </div>

        {/* 底部 CTA */}
        <div className="px-4 pb-8">
          <GlassCard className="text-center py-5">
            <p className="text-sm text-charcoal/80 mb-1">想要一份这样的定制攻略？</p>
            <p className="text-xs text-muted mb-3">说出你的旅行需求，AI 帮你规划</p>
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-vibe-sea to-vibe-dusk text-white text-sm font-medium px-5 py-2 hover:opacity-90 transition-opacity"
            >
              <Sparkles className="w-3.5 h-3.5" />
              免费创建我的攻略
            </Link>
          </GlassCard>
        </div>
      </div>
    </>
  );
}
