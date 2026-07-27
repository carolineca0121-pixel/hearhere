#!/usr/bin/env python3
"""
HearHere POI 搜索工具 — 封装高德地图 POI 搜索和解析。

用法:
  python3 scripts/poi_search.py --city 舟山 --keywords 寺庙,海滩,海鲜
  python3 scripts/poi_search.py --city 西安 --keywords 景点 --categories attraction
  python3 scripts/poi_search.py --city 厦门 --keywords 沙茶面,海蛎煎 --categories food

输出: JSON 到 stdout，格式为 { "pois": [...], "city": "..." }
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path
from typing import Any

# Ensure guide_maps is importable
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from guide_maps.geocoding.amap_client import AMapClient, AMapClientError
from guide_maps.geocoding.poi_resolver import POIResolver
from guide_maps.geocoding.coordinate_transform import amap_to_wgs84


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="搜索城市 POI（景点/餐饮/购物等）")
    parser.add_argument("--city", required=True, help="城市名，如 舟山、西安、厦门")
    parser.add_argument("--keywords", required=True, help="逗号分隔的搜索关键词，如 寺庙,海滩,海鲜")
    parser.add_argument("--categories", default="all", help="过滤类别: attraction, food, all")
    parser.add_argument("--limit", type=int, default=5, help="每个关键词返回几个结果")
    return parser.parse_args()


def search_pois(city: str, keywords: list[str], limit: int = 5) -> list[dict[str, Any]]:
    """搜索 POI 并返回统一格式的结果列表。"""
    try:
        client = AMapClient()
    except AMapClientError as e:
        print(json.dumps({"error": str(e), "pois": [], "city": city}, ensure_ascii=False))
        sys.exit(1)

    resolver = POIResolver(client)
    all_pois: list[dict[str, Any]] = []
    seen_names: set[str] = set()

    for keyword in keywords:
        keyword = keyword.strip()
        if not keyword:
            continue

        try:
            candidates = client.search_text(keyword, city=city)
        except AMapClientError as e:
            # Rate limit or other error — skip this keyword
            print(f"[WARN] Search failed for '{keyword}': {e}", file=sys.stderr)
            continue

        for candidate in candidates[:limit]:
            # Deduplicate by name
            name_key = candidate.name.strip()
            if name_key in seen_names:
                continue
            seen_names.add(name_key)

            # Convert GCJ-02 to WGS84
            try:
                lng_wgs84, lat_wgs84 = amap_to_wgs84(candidate.lng_gcj02, candidate.lat_gcj02)
            except Exception:
                lng_wgs84, lat_wgs84 = None, None

            all_pois.append({
                "name": candidate.name,
                "address": candidate.address or "",
                "city": candidate.city or city,
                "district": candidate.district or "",
                "type": candidate.type or "",
                "typecode": candidate.typecode or "",
                "lng_wgs84": round(lng_wgs84, 6) if lng_wgs84 else None,
                "lat_wgs84": round(lat_wgs84, 6) if lat_wgs84 else None,
                "searchKeyword": keyword,
            })

        # Rate-limit: 200ms between keyword searches (free key QPS limit)
        if len(keywords) > 1:
            time.sleep(0.25)

    return all_pois


def filter_by_category(pois: list[dict], categories: str) -> list[dict]:
    """根据类别过滤 POI。"""
    if categories == "all":
        return pois

    # Amap typecode categories
    ATTRACTION_TYPES = {"风景名胜", "公园广场", "寺庙道观", "纪念馆", "博物馆"}
    FOOD_TYPES = {"餐饮服务", "中餐厅", "酒楼", "小吃"}

    def is_attraction(poi: dict) -> bool:
        t = poi.get("type", "")
        return any(at in t for at in ATTRACTION_TYPES)

    def is_food(poi: dict) -> bool:
        t = poi.get("type", "")
        return any(ft in t for ft in FOOD_TYPES)

    if categories == "attraction":
        return [p for p in pois if is_attraction(p)]
    elif categories == "food":
        return [p for p in pois if is_food(p)]

    return pois


def main() -> int:
    args = parse_args()
    keywords = [k.strip() for k in args.keywords.split(",") if k.strip()]

    if not keywords:
        print(json.dumps({"error": "no keywords", "pois": [], "city": args.city}, ensure_ascii=False))
        return 1

    pois = search_pois(args.city, keywords, args.limit)
    pois = filter_by_category(pois, args.categories)

    result = {
        "city": args.city,
        "pois": pois,
        "count": len(pois),
    }

    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
