#!/usr/bin/env python3
"""
简单测试 map-creator 是否能正常工作
"""

import sys
import os
from pathlib import Path

# 添加当前目录到 Python 路径
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

print("=" * 60)
print("🧪 测试 map-creator 环境")
print("=" * 60)
print()

# 测试 1: 检查 Python 版本
print(f"1️⃣  Python 版本: {sys.version}")
if sys.version_info < (3, 8):
    print("⚠️  警告: Python 版本可能过旧")
else:
    print("✅ Python 版本 OK")
print()

# 测试 2: 检查关键依赖
print("2️⃣  检查依赖...")
dependencies = [
    ("numpy", "数值计算"),
    ("matplotlib", "绘图"),
    ("osmnx", "OpenStreetMap"),
    ("geopandas", "地理数据"),
    ("shapely", "几何操作"),
]

all_ok = True
for dep, desc in dependencies:
    try:
        __import__(dep)
        print(f"   ✅ {dep} ({desc})")
    except ImportError:
        print(f"   ❌ {dep} ({desc}) - 未安装")
        all_ok = False
print()

# 测试 3: 检查 guide_maps 模块
print("3️⃣  检查 guide_maps 模块...")
try:
    import guide_maps
    print(f"   ✅ guide_maps 已导入 (来自: {guide_maps.__file__})")

    # 检查子模块
    from guide_maps.cli import create_gis_map
    print("   ✅ guide_maps.cli.create_gis_map")

    from guide_maps.geocoding import poi_io
    print("   ✅ guide_maps.geocoding.poi_io")

except ImportError as e:
    print(f"   ❌ guide_maps 导入失败: {e}")
    all_ok = False
print()

# 测试 4: 检查文件结构
print("4️⃣  检查文件结构...")
check_paths = [
    ("guide_maps/", project_root / "guide_maps"),
    ("outputs/posters/", project_root / "outputs" / "posters"),
    ("outputs/poi-sets/", project_root / "outputs" / "poi-sets"),
    ("data/mock-insights.json", project_root / "data" / "mock-insights.json"),
]

for name, path in check_paths:
    if path.exists():
        print(f"   ✅ {name}")
    else:
        print(f"   ⚠️  {name} - 不存在 (可能需要创建)")
print()

# 测试 5: 尝试加载示例 POI 数据
print("5️⃣  测试 POI 数据加载...")
sample_poi_path = project_root / "outputs" / "poi-sets" / "qingdao-sample.json"
if sample_poi_path.exists():
    try:
        from guide_maps.geocoding.poi_io import load_poi_set
        poi_set = load_poi_set(sample_poi_path)
        print(f"   ✅ 成功加载 POI 数据: {len(poi_set.pois)} 个地点")
        for i, poi in enumerate(poi_set.pois[:3]):
            print(f"      - {poi.input_name}: ({poi.lng_wgs84}, {poi.lat_wgs84})")
        if len(poi_set.pois) > 3:
            print(f"      ... 还有 {len(poi_set.pois) - 3} 个")
    except Exception as e:
        print(f"   ❌ 加载 POI 数据失败: {e}")
else:
    print(f"   ⚠️  示例 POI 文件不存在: {sample_poi_path}")
print()

print("=" * 60)
if all_ok:
    print("🎉 所有基础测试通过!")
else:
    print("⚠️  部分测试失败,请检查依赖安装")
print("=" * 60)
print()
print("💡 下一步:")
print("   - 如果依赖缺失: pip install -r requirements.txt")
print("   - 运行完整测试: python3 scripts/generate-example-map.py")
print("   - 启动 Next.js: npm run dev")
