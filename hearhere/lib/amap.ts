/**
 * 高德地图 Web API 客户端 — 纯 TypeScript 实现
 *
 * 直接调用 restapi.amap.com 的 REST 接口。
 * 此文件是 SERVER-ONLY（含 fs 依赖），客户端代码请使用 lib/amap-types.ts。
 */

import { readFileSync } from "fs";
import path from "path";
import { gcj02ToWgs84, ATTRACTION_TYPES, FOOD_TYPES } from "./amap-types";
import type { NormalizedPOI } from "./amap-types";

export type { NormalizedPOI } from "./amap-types";

// ── 配置 ──────────────────────────────────────────────

interface AmapConfig {
  api_key: string;
  timeout: number;
}

function loadAmapConfig(): AmapConfig {
  const envKey = process.env.AMAP_KEY;
  if (envKey) return { api_key: envKey, timeout: 12 };

  try {
    const configPath = path.join(process.cwd(), "config.local.json");
    const raw = readFileSync(configPath, "utf-8");
    const config = JSON.parse(raw);
    const amap = config.amap || {};
    if (amap.api_key) return { api_key: amap.api_key, timeout: amap.timeout || 12 };
  } catch { /* fall through */ }

  throw new Error("高德地图 API Key 未配置。请设置 AMAP_KEY 或创建 config.local.json");
}

// ── 客户端 ────────────────────────────────────────────

const ENDPOINT = "https://restapi.amap.com/v3/place/text";
let _config: AmapConfig | null = null;

function getConfig(): AmapConfig {
  if (!_config) _config = loadAmapConfig();
  return _config;
}

export async function searchPOI(params: {
  keywords: string;
  city: string;
  offset?: number;
}): Promise<AmapPOISearchResponse> {
  const config = getConfig();
  const url = new URL(ENDPOINT);
  url.searchParams.set("key", config.api_key);
  url.searchParams.set("keywords", params.keywords);
  url.searchParams.set("city", params.city);
  url.searchParams.set("citylimit", "true");
  url.searchParams.set("offset", String(params.offset || 20));
  url.searchParams.set("page", "1");
  url.searchParams.set("extensions", "base");
  url.searchParams.set("output", "json");

  const response = await fetch(url.toString(), {
    signal: AbortSignal.timeout((config.timeout || 12) * 1000),
  });

  if (!response.ok) throw new Error(`Amap API HTTP ${response.status}`);
  const data = (await response.json()) as AmapPOISearchResponse;
  if (data.status !== "1") throw new Error(`Amap API: ${data.info} (keywords=${params.keywords})`);
  return data;
}

interface AmapPOISearchResponse {
  status: string;
  info: string;
  count: string;
  pois: Array<{
    id: string;
    name: string;
    address: string;
    location: string;
    pname: string;
    cityname: string;
    adname: string;
    type: string;
    typecode: string;
  }>;
}

/**
 * 批量搜索 POI，按关键词逐一搜索，去重返回。
 */
export async function searchPOIsBatch(
  city: string,
  keywords: string[],
  limit = 5,
): Promise<NormalizedPOI[]> {
  const seen = new Set<string>();
  const results: NormalizedPOI[] = [];

  for (const keyword of keywords) {
    const trimmed = keyword.trim();
    if (!trimmed) continue;

    try {
      const data = await searchPOI({ keywords: trimmed, city, offset: 20 });

      for (const poi of data.pois.slice(0, limit)) {
        const key = poi.name.trim();
        if (seen.has(key)) continue;
        seen.add(key);

        const [lngStr, latStr] = (poi.location || ",").split(",");
        const gcjLng = parseFloat(lngStr);
        const gcjLat = parseFloat(latStr);
        let wgs84 = { lng: gcjLng, lat: gcjLat };
        if (!isNaN(gcjLng) && !isNaN(gcjLat)) {
          wgs84 = gcj02ToWgs84(gcjLng, gcjLat);
        }

        results.push({
          name: poi.name,
          address: poi.address || "",
          city: poi.cityname || city,
          district: poi.adname || "",
          type: poi.type || "",
          typecode: poi.typecode || "",
          lngWgs84: Math.round(wgs84.lng * 1e6) / 1e6,
          latWgs84: Math.round(wgs84.lat * 1e6) / 1e6,
          poiId: poi.id,
          searchKeyword: trimmed,
        });
      }
    } catch (e) {
      console.warn(`[amap] Search failed for "${trimmed}" in ${city}:`, e);
    }

    if (keywords.length > 1) {
      await new Promise((r) => setTimeout(r, 250));
    }
  }

  return results;
}

export function isAttraction(poi: NormalizedPOI): boolean {
  return ATTRACTION_TYPES.some((t) => poi.typecode?.startsWith(t));
}

export function isFood(poi: NormalizedPOI): boolean {
  return FOOD_TYPES.some((t) => poi.typecode?.startsWith(t));
}

// ── 天气查询 ─────────────────────────────────────────

export interface WeatherForecast {
  date: string;        // 2026-07-25
  week: string;        // 星期几（中文）
  dayWeather: string;  // 白天天气（晴/多云/小雨…）
  nightWeather: string;
  dayTemp: number;     // 白天高温
  nightTemp: number;   // 夜间低温
  dayWind: string;     // 风向
  dayPower: string;    // 风力
}

export interface WeatherInfo {
  city: string;
  live?: {
    weather: string;
    temperature: string;
    humidity: string;
    windDirection: string;
    windPower: string;
    reportTime: string;
  };
  forecasts: WeatherForecast[];
}

interface AmapWeatherResponse {
  status: string;
  info: string;
  lives?: Array<{
    city: string;
    weather: string;
    temperature: string;
    humidity: string;
    winddirection: string;
    windpower: string;
    reporttime: string;
  }>;
  forecasts?: Array<{
    city: string;
    casts: Array<{
      date: string;
      week: string;
      dayweather: string;
      nightweather: string;
      daytemp: string;
      nighttemp: string;
      daywind: string;
      daypower: string;
    }>;
  }>;
}

/**
 * 查询目的地天气（实况 + 未来 3 天预报）。
 * 高德天气 API 免费版只提供未来 3 天预报（含今天共 4 条）。
 * city 参数直接传目的地名（如「普陀山」「杭州」），高德会自动匹配行政区。
 */
export async function getWeather(destination: string): Promise<WeatherInfo> {
  const config = getConfig();
  const baseUrl = "https://restapi.amap.com/v3/weather/weatherInfo";

  // 高德天气 API 的 city 参数需要 adcode 或城市名。
  // 对景区名（如「普陀山」），先查 POI 拿到所属城市名，再查天气。
  let cityQuery = destination;
  try {
    const poiData = await searchPOI({ keywords: destination, city: destination, offset: 1 });
    const cityName = poiData.pois?.[0]?.cityname;
    if (cityName) cityQuery = cityName;
  } catch { /* 用原始目的地名兜底 */ }

  // 实况
  const liveUrl = new URL(baseUrl);
  liveUrl.searchParams.set("key", config.api_key);
  liveUrl.searchParams.set("city", cityQuery);
  liveUrl.searchParams.set("extensions", "base");
  liveUrl.searchParams.set("output", "json");

  // 预报
  const forecastUrl = new URL(baseUrl);
  forecastUrl.searchParams.set("key", config.api_key);
  forecastUrl.searchParams.set("city", cityQuery);
  forecastUrl.searchParams.set("extensions", "all");
  forecastUrl.searchParams.set("output", "json");

  const [liveRes, forecastRes] = await Promise.all([
    fetch(liveUrl.toString(), { signal: AbortSignal.timeout(config.timeout * 1000) }),
    fetch(forecastUrl.toString(), { signal: AbortSignal.timeout(config.timeout * 1000) }),
  ]);

  const liveData = (await liveRes.json()) as AmapWeatherResponse;
  const forecastData = (await forecastRes.json()) as AmapWeatherResponse;

  const result: WeatherInfo = { city: cityQuery, forecasts: [] };

  if (liveData.status === "1" && liveData.lives?.[0]) {
    const l = liveData.lives[0];
    result.live = {
      weather: l.weather,
      temperature: l.temperature,
      humidity: l.humidity,
      windDirection: l.winddirection,
      windPower: l.windpower,
      reportTime: l.reporttime,
    };
  }

  if (forecastData.status === "1" && forecastData.forecasts?.[0]?.casts) {
    result.forecasts = forecastData.forecasts[0].casts.map((c) => ({
      date: c.date,
      week: c.week,
      dayWeather: c.dayweather,
      nightWeather: c.nightweather,
      dayTemp: parseInt(c.daytemp, 10) || 0,
      nightTemp: parseInt(c.nighttemp, 10) || 0,
      dayWind: c.daywind,
      dayPower: c.daypower,
    }));
  }

  if (!result.live && result.forecasts.length === 0) {
    throw new Error(`高德天气查询失败：${liveData.info || forecastData.info || "未知错误"}`);
  }

  return result;
}
