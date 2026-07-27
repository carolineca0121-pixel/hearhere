#!/usr/bin/env python3
"""简单测试脚本 - 直接使用渲染模块"""

import sys
from pathlib import Path

# 添加当前目录到路径
sys.path.insert(0, str(Path(__file__).parent.parent))

print("开始测试...")

try:
    # 尝试导入渲染模块
    from guide_maps.rendering.osm_context_map_template import (
        ContextMapSpec,
        ContextSpot,
        render_context_map,
    )
    print("✅ 导入渲染模块成功!")

    # 创建测试点
    spots = [
        ContextSpot("栈桥", "栈桥", 36.0671, 120.319, "景点", "青岛市市南区"),
        ContextSpot("小麦岛", "小麦岛公园", 36.0573, 120.425, "公园", "青岛市崂山区"),
        ContextSpot("大学路", "老城文艺街区", 36.0752, 120.329, "街区", "青岛市市南区"),
    ]
    print("✅ 创建测试点成功!")

    # 创建地图规格
    spec = ContextMapSpec(
        title="青岛导览图",
        subtitle="",
        output_name="qingdao_test_map",
        spots=spots,
        road_labels=[],
        area_labels=[],
        show_road_labels=True,
    )
    print("✅ 创建地图规格成功!")

    # 渲染地图
    print("🚀 开始渲染地图...(这可能需要一些时间下载 OSM 数据)")
    output = render_context_map(spec)

    print(f"\n✅ 成功!地图已生成: {output}")

except Exception as e:
    print(f"\n❌ 错误: {e}")
    import traceback
    traceback.print_exc()
