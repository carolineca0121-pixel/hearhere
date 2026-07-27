"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { GlassCard } from "@/components/layout/glass-card";
import { Button } from "@/components/ui/button";
import { CalendarDays, MapPin, ChevronRight, Sparkles } from "lucide-react";

interface TripItem {
  id: string;
  destination: string;
  preferences: string;
  vibeTheme: string | null;
  createdAt: string;
}

export default function TripsPage() {
  const router = useRouter();
  const [trips, setTrips] = useState<TripItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/trips")
      .then((r) => r.json())
      .then((d) => {
        setTrips(d.trips ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <p className="py-12 text-center text-sm text-muted animate-pulse">
        加载我的攻略…
      </p>
    );
  }

  if (trips.length === 0) {
    return (
      <div className="flex flex-col items-center gap-6 py-16">
        <Sparkles className="h-10 w-10 text-vibe-dusk/40" />
        <p className="text-sm text-muted">还没有生成过攻略</p>
        <Button onClick={() => router.push("/")}>去规划一次旅行</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 py-6">
      <header className="text-center">
        <h1 className="text-xl font-semibold text-charcoal">我的攻略</h1>
        <p className="mt-1 text-sm text-muted">共 {trips.length} 份旅行计划</p>
      </header>

      <div className="space-y-3">
        {trips.map((trip) => {
          let title = trip.destination;
          let overview = "";
          try {
            const p = JSON.parse(trip.preferences);
            title = p.title || title;
            overview = p.overview || "";
          } catch {
            // ignore
          }
          const date = new Date(trip.createdAt).toLocaleDateString("zh-CN", {
            month: "short",
            day: "numeric",
          });

          return (
            <GlassCard
              key={trip.id}
              className="cursor-pointer transition-transform hover:scale-[1.01]"
              onClick={() => router.push(`/trip/${trip.id}`)}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="truncate text-base font-medium text-charcoal">
                    {title}
                  </p>
                  {overview && (
                    <p className="line-clamp-1 text-xs text-muted">{overview}</p>
                  )}
                  <div className="flex flex-wrap gap-3 pt-1">
                    <span className="inline-flex items-center gap-1 text-[11px] text-muted">
                      <MapPin className="h-3 w-3" />
                      {trip.destination}
                    </span>
                    <span className="inline-flex items-center gap-1 text-[11px] text-muted">
                      <CalendarDays className="h-3 w-3" />
                      {date}
                    </span>
                  </div>
                </div>
                <ChevronRight className="mt-0.5 h-5 w-5 shrink-0 text-charcoal/30" />
              </div>
            </GlassCard>
          );
        })}
      </div>

      <Button
        className="w-full"
        variant="outline"
        onClick={() => router.push("/")}
      >
        再规划一次
      </Button>
    </div>
  );
}
