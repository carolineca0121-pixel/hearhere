/**
 * 高德地图共享类型 + 工具函数 — 客户端/服务端安全使用（无 fs 依赖）
 */

export interface NormalizedPOI {
  name: string;
  address: string;
  city: string;
  district: string;
  type: string;
  typecode: string;
  lngWgs84: number;
  latWgs84: number;
  poiId: string;
  searchKeyword: string;
}

// ── GCJ-02 → WGS84 坐标转换 ──────────────────────────

const A = 6378245.0; // 长半轴
const EE = 0.00669342162296594323; // 偏心率平方

function transformLat(x: number, y: number): number {
  let ret = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
  ret += ((20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) * 2.0) / 3.0;
  ret += ((20.0 * Math.sin(y * Math.PI) + 40.0 * Math.sin((y / 3.0) * Math.PI)) * 2.0) / 3.0;
  ret += ((160.0 * Math.sin((y / 12.0) * Math.PI) + 320.0 * Math.sin((y * Math.PI) / 30.0)) * 2.0) / 3.0;
  return ret;
}

function transformLng(x: number, y: number): number {
  let ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  ret += ((20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) * 2.0) / 3.0;
  ret += ((20.0 * Math.sin(x * Math.PI) + 40.0 * Math.sin((x / 3.0) * Math.PI)) * 2.0) / 3.0;
  ret += ((150.0 * Math.sin((x / 12.0) * Math.PI) + 300.0 * Math.sin((x / 30.0) * Math.PI)) * 2.0) / 3.0;
  return ret;
}

/** GCJ-02 (高德/国测局) → WGS84 */
export function gcj02ToWgs84(lng: number, lat: number): { lng: number; lat: number } {
  const dLat = transformLat(lng - 105.0, lat - 35.0);
  const dLng = transformLng(lng - 105.0, lat - 35.0);
  const radLat = (lat / 180.0) * Math.PI;
  let magic = Math.sin(radLat);
  magic = 1 - EE * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  const dLatFinal = (dLat * 180.0) / (((A * (1 - EE)) / (magic * sqrtMagic)) * Math.PI);
  const dLngFinal = (dLng * 180.0) / ((A / sqrtMagic) * Math.cos(radLat) * Math.PI);
  return { lng: lng - dLngFinal, lat: lat - dLatFinal };
}

// ── 类别常量 ──────────────────────────────────────────

export const ATTRACTION_TYPES = ["110000", "110100", "110200", "140000"];
export const FOOD_TYPES = ["050000", "050100", "050200", "050300"];
