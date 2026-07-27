/**
 * 高德路径规划 API — 驾车路线
 * 文档：https://lbs.amap.com/api/webservice/guide/api/driving
 *
 * 用途：行程生成时，为自驾用户提供：
 *   ① 真实驾车时长（替代硬编码估算）
 *   ② 途经服务区 POI（用户要求"提示沿途可休整的服务区"）
 *
 * 注意：此文件是 SERVER-ONLY（依赖 lib/amap.ts 的 config）。
 */

import { readFileSync } from "fs";
import path from "path";
import { searchPOI } from "./amap";

interface AmapConfig {
  api_key: string;
  timeout: number;
}

function loadAmapConfig(): AmapConfig {
  const envKey = process.env.AMAP_KEY;
  if (envKey) return { api_key: envKey, timeout: 15 };
  try {
    const configPath = path.join(process.cwd(), "config.local.json");
    const raw = readFileSync(configPath, "utf-8");
    const config = JSON.parse(raw);
    const amap = config.amap || {};
    if (amap.api_key) return { api_key: amap.api_key, timeout: amap.timeout || 15 };
  } catch { /* fall through */ }
  throw new Error("高德地图 API Key 未配置");
}

// ── 地理编码（城市名 → 经纬度） ──────────────────────

interface GeoResult {
  lng: number;
  lat: number;
  city?: string;
}

/**
 * 地理编码：先用 POI 搜索（对景区名更准，如「普陀山」），
 * 失败后回退到 geocode API（对城市名更准，如「上海」）。
 */
async function geocode(address: string): Promise<GeoResult | null> {
  const config = loadAmapConfig();

  // 1. 先试 POI 搜索（景区/地点名更准）
  try {
    const poiData = await searchPOI({ keywords: address, city: address, offset: 1 });
    const poi = poiData.pois?.[0];
    if (poi?.location) {
      const [lng, lat] = poi.location.split(",").map(Number);
      if (!isNaN(lng) && !isNaN(lat)) {
        return { lng, lat, city: poi.cityname };
      }
    }
  } catch { /* fall through to geocode */ }

  // 2. 回退 geocode API（城市名）
  const url = new URL("https://restapi.amap.com/v3/geocode/geo");
  url.searchParams.set("key", config.api_key);
  url.searchParams.set("address", address);
  url.searchParams.set("output", "json");

  try {
    const res = await fetch(url.toString(), {
      signal: AbortSignal.timeout(config.timeout * 1000),
    });
    const data = await res.json();
    if (data.status === "1" && data.geocodes?.[0]?.location) {
      const [lng, lat] = data.geocodes[0].location.split(",").map(Number);
      return { lng, lat, city: data.geocodes[0].city };
    }
  } catch (e) {
    console.warn("[amap-direction] geocode failed:", e);
  }
  return null;
}

// ── 驾车路径规划 ─────────────────────────────────────

export interface DrivingRoute {
  distanceKm: number;      // 距离（公里）
  durationHours: number;   // 时长（小时，保留 1 位小数）
  durationText: string;    // "约 4.5 小时"
  tolls?: number;          // 过路费（元）
  serviceAreas: string[];  // 途经服务区名称列表
}

interface AmapDrivingResponse {
  status: string;
  info: string;
  route?: {
    paths?: Array<{
      distance: string;   // 米
      duration: string;   // 秒
      tolls?: string;     // 元
      steps?: Array<{
        instruction?: string;
        road?: string;
        serviceArea?: Array<{ name?: string }>;
      }>;
    }>;
  };
}

/**
 * 查询两地之间的驾车路线。
 * @param origin 出发地（城市名或地址，如「上海」）
 * @param destination 目的地（如「普陀山」）
 */
export async function getDrivingRoute(
  origin: string,
  destination: string
): Promise<DrivingRoute | null> {
  const config = loadAmapConfig();

  // 1. 两地地理编码
  const [from, to] = await Promise.all([geocode(origin), geocode(destination)]);
  if (!from || !to) {
    console.warn(`[amap-direction] geocode failed: ${origin} -> ${destination}`);
    return null;
  }

  // 2. 驾车路径规划
  const url = new URL("https://restapi.amap.com/v3/direction/driving");
  url.searchParams.set("key", config.api_key);
  url.searchParams.set("origin", `${from.lng},${from.lat}`);
  url.searchParams.set("destination", `${to.lng},${to.lat}`);
  url.searchParams.set("strategy", "0"); // 0=速度优先
  url.searchParams.set("output", "json");

  try {
    const res = await fetch(url.toString(), {
      signal: AbortSignal.timeout(config.timeout * 1000),
    });
    const data = (await res.json()) as AmapDrivingResponse;

    if (data.status !== "1" || !data.route?.paths?.[0]) {
      console.warn(`[amap-direction] no route: ${data.info}`);
      return null;
    }

    const path = data.route.paths[0];
    const distanceKm = Math.round(parseInt(path.distance, 10) / 100) / 10;
    const durationHours = Math.round((parseInt(path.duration, 10) / 3600) * 10) / 10;
    const tolls = path.tolls ? Math.round(parseFloat(path.tolls)) : undefined;

    // 3. 途经服务区：高德驾车 API 免费版无 serviceArea 字段，
    //    改为在路线中点附近搜「服务区」POI 作为休整提示。
    const serviceAreas: string[] = [];
    try {
      // 路线中点坐标（用于搜附近服务区）
      const midLng = (from.lng + to.lng) / 2;
      const midLat = (from.lat + to.lat) / 2;
      const saUrl = new URL("https://restapi.amap.com/v3/place/around");
      saUrl.searchParams.set("key", config.api_key);
      saUrl.searchParams.set("location", `${midLng},${midLat}`);
      saUrl.searchParams.set("keywords", "服务区");
      saUrl.searchParams.set("radius", "50000"); // 50km 半径
      saUrl.searchParams.set("offset", "5");
      saUrl.searchParams.set("output", "json");
      const saRes = await fetch(saUrl.toString(), {
        signal: AbortSignal.timeout(config.timeout * 1000),
      });
      const saData = await saRes.json();
      for (const poi of saData.pois ?? []) {
        if (poi.name && !serviceAreas.includes(poi.name)) {
          serviceAreas.push(poi.name);
        }
      }
    } catch { /* 服务区查询失败不影响主流程 */ }

    return {
      distanceKm,
      durationHours,
      durationText: `约 ${durationHours} 小时`,
      tolls,
      serviceAreas,
    };
  } catch (e) {
    console.warn("[amap-direction] driving route failed:", e);
    return null;
  }
}
