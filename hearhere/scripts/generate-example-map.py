#!/usr/bin/env python3
"""
Hear Here 地图生成示例脚本
使用 mock-insights.json 中的数据生成青岛导览地图
"""

import sys
import os
import json
import subprocess
from pathlib import Path

# 添加当前目录到 Python 路径
sys.path.insert(0, str(Path(__file__).parent.parent))

def main():
    # 读取 mock-insights.json
    data_path = Path(__file__).parent.parent / "data" / "mock-insights.json"
    with open(data_path, "r", encoding="utf-8") as f:
        insights = json.load(f)

    # 提取地点名称
    places = [item["title"] for item in insights]

    print("🎯 准备生成地图...")
    print(f"📍 城市: 青岛")
    print(f"🗺️  地点: {places}")
    print()

    # 确保输出目录存在
    outputs_dir = Path(__file__).parent.parent / "outputs" / "posters"
    outputs_dir.mkdir(parents=True, exist_ok=True)

    poi_dir = Path(__file__).parent.parent / "outputs" / "poi-sets"
    poi_dir.mkdir(parents=True, exist_ok=True)

    # 构建命令行参数
    cmd = [
        sys.executable, "-m", "guide_maps.cli.create_gis_map",
        "--city", "青岛",
        "--title", "青岛三日游导览图",
        "--save-poi-json", "outputs/poi-sets/qingdao-trip.json"
    ]

    # 添加地点
    for place in places:
        cmd.extend(["--places", place])

    print("🚀 执行命令:", " ".join(cmd))
    print()

    try:
        # 切换到项目根目录并执行
        result = subprocess.run(
            cmd,
            cwd=str(Path(__file__).parent.parent),
            capture_output=True,
            text=True,
            encoding="utf-8"
        )

        print("📤 输出:")
        print(result.stdout)
        if result.stderr:
            print("📥 错误:")
            print(result.stderr)

        if result.returncode == 0:
            print()
            print("✅ 地图生成完成!")
            print("📁 查看 outputs/posters/ 目录获取生成的地图")
        else:
            print()
            print("⚠️  地图生成失败,但我们已准备好集成方案!")
            print("💡 提示: 需要配置高德地图 API key 才能解析地址")
            print("   或使用 --poi-json 直接传入已有坐标的 POI 数据")

    except Exception as e:
        print(f"❌ 执行时出错: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()
