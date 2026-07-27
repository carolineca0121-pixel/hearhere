/**
 * 高德地图 JS API v2 — HearHere 风格地图组件
 */

"use client";

import { useEffect, useRef, useState } from "react";

const AMAP_JS_KEY = "13357beee837c8a8cfbcfb9828b88e2a";

export interface MapMarker {
  id: string;
  name: string;
  lng: number;
  lat: number;
  category: string;
  color: string;
  selected?: boolean;
}

interface AmapViewProps {
  markers: MapMarker[];
  city?: string;
  onMarkerClick?: (id: string) => void;
  className?: string;
}

let amapLoaded = false;
let amapLoadPromise: Promise<void> | null = null;

function loadAmap(): Promise<void> {
  if (amapLoaded) return Promise.resolve();
  if (amapLoadPromise) return amapLoadPromise;
  amapLoadPromise = new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = `https://webapi.amap.com/maps?v=2.0&key=${AMAP_JS_KEY}`;
    script.onload = () => { amapLoaded = true; resolve(); };
    script.onerror = () => { amapLoadPromise = null; resolve(); };
    document.head.appendChild(script);
  });
  return amapLoadPromise;
}

// CSS to hide Amap branding
const HIDE_LOGO_CSS = `
.amap-logo,.amap-copyright{display:none!important}
`;

export function AmapView({ markers, city, onMarkerClick, className }: AmapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    loadAmap().then(() => {
      if (typeof window !== "undefined" && (window as any).AMap) setReady(true);
    });
  }, []);

  useEffect(() => {
    if (!ready || !containerRef.current) return;
    const AMap = (window as any).AMap;
    if (!AMap) return;

    let center: [number, number] = [116.397428, 39.90923];
    if (markers.length > 0) center = [markers[0].lng, markers[0].lat];

    if (!mapRef.current) {
      mapRef.current = new AMap.Map(containerRef.current, {
        zoom: 13,
        center,
        mapStyle: "amap://styles/light",
        features: ["bg", "road", "building", "point"],
        viewMode: "2D",
      });
    }
  }, [ready]);

  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const AMap = (window as any).AMap;
    if (!AMap) return;

    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];
    if (markers.length === 0) return;

    const create = markers.map((m) => {
      const marker = new AMap.Marker({
        position: [m.lng, m.lat],
        title: m.name,
        label: {
          content: `<div style="background:${m.color};color:#fff;padding:2px 8px;border-radius:10px;font-size:11px;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,0.15);font-weight:500">${m.name.length > 6 ? m.name.slice(0, 6) + "…" : m.name}</div>`,
          offset: new AMap.Pixel(0, -28),
        },
        zIndex: m.selected ? 200 : 100,
      });
      if (onMarkerClick) marker.on("click", () => onMarkerClick(m.id));
      marker.setMap(mapRef.current);
      return marker;
    });
    markersRef.current = create;
    if (create.length > 0) mapRef.current.setFitView(null, false, [80, 80, 80, 320]);
  }, [markers, ready, onMarkerClick]);

  return (
    <>
      <style>{HIDE_LOGO_CSS}</style>
      <div
        ref={containerRef}
        className={className || "w-full h-64 rounded-2xl overflow-hidden"}
      >
        {!ready && (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-vibe-sea/20 via-white to-vibe-dusk/20">
            <div className="flex flex-col items-center gap-2">
              <div className="w-8 h-8 border-2 border-vibe-dusk/30 border-t-vibe-dusk rounded-full animate-spin" />
              <span className="text-xs text-muted">加载地图中…</span>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

export const CATEGORY_MARKER_COLORS: Record<string, string> = {
  attraction: "#3B82F6",
  food: "#EF4444",
  souvenir: "#F59E0B",
  hotel: "#8B5CF6",
};
