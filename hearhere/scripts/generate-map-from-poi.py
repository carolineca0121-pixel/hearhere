#!/usr/bin/env python3
"""
使用预定义 POI JSON 生成地图 (无需高德地图 API key)
"""

import sys
import subprocess
from pathlib import Path

def main():
    # 使用预定义的 POI JSON
    poi_json = "outputs/poi-sets/qingdao-example.json"

    print("🎯 准备生成地图...")
    print(f"📍 使用 POI 数据: {poi_json}")
    print()

    # 确保输出目录存在
    outputs_dir = Path(__file__).parent.parent / "outputs" / "posters"
    outputs_dir.mkdir(parents=True, exist_ok=True)

    # 构建命令行参数
    cmd = [
        sys.executable, "-m", "guide_maps.cli.create_gis_map",
        "--city", "青岛",
        "--title", "青岛三日游导览图",
        "--poi-json", poi_json
    ]

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
            print()
            print("🌐 现在你可以:")
            print("   1. 运行 `npm run dev` 启动开发服务器")
            print("   2. 访问 http://localhost:3000/map 查看地图生成器")
            print("   3. 或者直接在浏览器中打开生成的 PNG 文件")
        else:
            print()
            print("⚠️  地图生成可能有问题,请检查输出")

    except Exception as e:
        print(f"❌ 执行时出错: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()
