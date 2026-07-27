# Map Creator 集成指南

## 概述

map-creator skill 已集成到 Hear Here 项目中,用于生成城市导览地图。

## 目录结构

```
hearhere/
├── guide_maps/              # map-creator 核心代码
├── prompts/                 # 风格化提示词模板
├── outputs/                 # 生成的地图输出目录
│   ├── posters/            # GIS 地图草稿
│   ├── poi-sets/          # POI 数据缓存
│   └── stylized/          # 风格化地图
├── scripts/
│   └── generate-example-map.py  # 示例脚本
├── requirements.txt        # Python 依赖
└── config.example.json    # 配置示例
```

## 快速开始

### 1. 安装 Python 依赖

```bash
cd hearhere
pip install -r requirements.txt
```

### 2. 配置 API Key (可选)

如果需要使用高德地图解析地址或 GPT Image 风格化:

```bash
cd hearhere
cp config.example.json config.local.json
# 编辑 config.local.json,填入你的 API key
```

或者使用环境变量:
```bash
export AMAP_KEY="你的高德地图key"
export OPENAI_API_KEY="你的OpenAI key"
```

### 3. 运行示例

```bash
cd hearhere
python scripts/generate-example-map.py
```

## Next.js 集成方案

### 方案 A: Python 后端服务 (推荐)

创建一个简单的 FastAPI/Flask 服务来处理地图生成请求。

#### 1. 创建地图生成 API

`app/api/map/route.ts`:
```typescript
import { NextResponse } from 'next/server'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

export async function POST(request: Request) {
  const { city, places, title } = await request.json()

  try {
    // 调用 Python 脚本生成地图
    const cmd = [
      'python',
      '-m',
      'guide_maps.cli.create_gis_map',
      '--city', city,
      '--title', title || `${city}导览图`
    ]

    // 添加地点
    for (const place of places) {
      cmd.push('--places', place)
    }

    const { stdout, stderr } = await execAsync(cmd.join(' '), {
      cwd: process.cwd()
    })

    return NextResponse.json({ success: true, output: stdout })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    )
  }
}
```

### 方案 B: 直接集成 Python 脚本

在项目中创建一个 Python 脚本目录,通过 child_process 调用。

### 方案 C: 使用 POI JSON (无需 API Key)

如果你已经有地点的坐标数据,可以直接创建 POI JSON 文件:

```json
{
  "city": "青岛",
  "theme": "guide",
  "pois": [
    {
      "input_name": "栈桥落日观景台",
      "resolved_name": "栈桥",
      "address": "青岛市市南区太平路12号",
      "district": "市南区",
      "lng_wgs84": 120.3190,
      "lat_wgs84": 36.0671,
      "confidence": 0.9,
      "status": "ok"
    }
  ]
}
```

然后使用:
```bash
python -m guide_maps.cli.create_gis_map --city 青岛 --poi-json outputs/poi-sets/qingdao.json
```

## 在行程页面显示地图

### 创建地图显示组件

`components/MapView.tsx`:
```tsx
'use client'

import { useEffect, useState } from 'react'

interface MapViewProps {
  city: string
  places: string[]
}

export function MapView({ city, places }: MapViewProps) {
  const [mapUrl, setMapUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const generateMap = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/map', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ city, places, title: `${city}导览图` })
      })

      const data = await response.json()
      if (data.success) {
        // 假设生成的地图在 /outputs/posters/ 目录下
        setMapUrl('/outputs/posters/qingdao_guide_gis_map.png')
      }
    } catch (error) {
      console.error('生成地图失败:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <button
        onClick={generateMap}
        disabled={loading}
        className="px-4 py-2 bg-blue-500 text-white rounded-lg disabled:opacity-50"
      >
        {loading ? '生成中...' : '生成导览地图'}
      </button>
      {mapUrl && (
        <div className="rounded-lg overflow-hidden border border-gray-200">
          <img src={mapUrl} alt="导览地图" className="w-full" />
        </div>
      )}
    </div>
  )
}
```

## 工作流程

1. **用户规划行程** → 选择感兴趣的地点
2. **生成地图请求** → 前端调用 `/api/map`
3. **后端处理** → 调用 Python 脚本生成地图
4. **返回结果** → 把生成的地图图片 URL 返回给前端
5. **显示地图** → 在行程页面展示生成的地图

## 注意事项

1. **API Key**: 高德地图 API key 可选,如果没有可以使用预先准备好的 POI JSON
2. **OSM 数据**: 首次运行时需要下载 OpenStreetMap 数据,可能需要一些时间
3. **缓存**: 地图数据会缓存在本地,后续相同区域的地图生成会更快
4. **输出目录**: 确保 `outputs/` 目录有写入权限

## 示例数据

项目中已包含青岛的示例数据 (`data/mock-insights.json`),可以直接用来测试:

```bash
cd hearhere
python scripts/generate-example-map.py
```

## 下一步

- [ ] 创建 Next.js API 路由
- [ ] 创建地图显示组件
- [ ] 集成到行程页面
- [ ] 添加风格化地图选项 (GPT Image)
- [ ] 优化地图加载体验
