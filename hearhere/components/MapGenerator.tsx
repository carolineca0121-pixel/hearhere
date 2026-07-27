'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Loader2, MapPin, Map as MapIcon, RefreshCw, Download } from 'lucide-react'

interface MapGeneratorProps {
  city?: string
  places?: string[]
  title?: string
}

interface MapInfo {
  name: string
  path: string
  createdAt: string
}

const sampleCities: Record<string, { poiFile: string, places: string[], title: string }> = {
  '青岛': {
    poiFile: 'qingdao-sample.json',
    places: ['栈桥落日观景台', '小麦岛公园', '老城文艺街区'],
    title: '青岛三日游导览图'
  },
  '北京': {
    poiFile: 'beijing-sample.json',
    places: ['故宫', '天安门', '颐和园'],
    title: '北京经典游导览图'
  },
  '上海': {
    poiFile: 'shanghai-sample.json',
    places: ['外滩', '东方明珠', '豫园'],
    title: '上海都市游导览图'
  }
}

export function MapGenerator({ city: defaultCity, places: defaultPlaces, title: defaultTitle }: MapGeneratorProps) {
  const defaultCityName = defaultCity || '青岛'
  const defaultData = sampleCities[defaultCityName] || sampleCities['青岛']

  const [city, setCity] = useState(defaultCityName)
  const [title, setTitle] = useState(defaultTitle || defaultData.title)
  const [placesInput, setPlacesInput] = useState(defaultPlaces?.join('\n') || defaultData.places.join('\n'))
  const [useSampleData, setUseSampleData] = useState(true)
  const [loading, setLoading] = useState(false)
  const [generatedMap, setGeneratedMap] = useState<string | null>(null)
  const [maps, setMaps] = useState<MapInfo[]>([])
  const [error, setError] = useState<string | null>(null)
  const [output, setOutput] = useState<string | null>(null)

  // 当城市改变时，更新默认值
  const handleCityChange = (newCity: string) => {
    setCity(newCity)
    const data = sampleCities[newCity]
    if (data) {
      setTitle(data.title)
      setPlacesInput(data.places.join('\n'))
      setUseSampleData(true)
    }
  }

  // 加载已生成的地图列表
  useEffect(() => {
    loadMaps()
  }, [])

  const loadMaps = async () => {
    try {
      const response = await fetch('/api/map')
      const data = await response.json()
      if (data.success) {
        setMaps(data.maps)
      }
    } catch (err) {
      console.error('加载地图列表失败:', err)
    }
  }

  const generateMap = async () => {
    setLoading(true)
    setError(null)
    setOutput(null)
    setGeneratedMap(null)

    try {
      const requestBody: any = { city, title }

      if (useSampleData && sampleCities[city]) {
        // 使用对应城市的示例 POI 数据
        requestBody.poiJson = `outputs/poi-sets/${sampleCities[city].poiFile}`
      } else {
        // 解析地点输入
        const placeList = placesInput.split('\n').map(p => p.trim()).filter(p => p)
        requestBody.places = placeList
      }

      const response = await fetch('/api/map', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      })

      const data = await response.json()

      if (data.success) {
        setOutput(data.output)
        if (data.outputFile) {
          setGeneratedMap('/' + data.outputFile)
        }
        await loadMaps()
      } else {
        setError(data.error || '生成地图失败')
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }

  const downloadMap = () => {
    if (!generatedMap) return
    const a = document.createElement('a')
    a.href = generatedMap
    a.download = generatedMap.split('/').pop() || 'map.png'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  return (
    <div className="space-y-6">
      {/* 生成地图卡片 */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-gray-100">
          <div className="flex items-center gap-2 text-xl font-semibold text-gray-900">
            <MapIcon className="h-5 w-5" />
            生成导览地图
          </div>
          <p className="text-gray-500 text-sm mt-1">
            基于你的行程规划,生成可视化的城市导览地图
          </p>
        </div>

        <div className="p-6 space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700 block">选择城市</label>
            <div className="flex gap-2 flex-wrap">
              {Object.keys(sampleCities).map((sampleCity) => (
                <button
                  key={sampleCity}
                  onClick={() => handleCityChange(sampleCity)}
                  className={`px-4 py-2 rounded-lg border transition-colors ${
                    city === sampleCity
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {sampleCity}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700 block">城市 (也可以手动输入)</label>
            <input
              type="text"
              value={city}
              onChange={(e) => handleCityChange(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="例如: 青岛"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700 block">地图标题</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="例如: 青岛三日游导览图"
            />
          </div>

          {sampleCities[city] && (
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="useSampleData"
                checked={useSampleData}
                onChange={(e) => setUseSampleData(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <label htmlFor="useSampleData" className="text-sm text-gray-600">
                使用{city}示例数据 (无需高德 API key)
              </label>
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700 block">地点列表 (每行一个)</label>
            <textarea
              value={placesInput}
              onChange={(e) => setPlacesInput(e.target.value)}
              disabled={useSampleData && !!sampleCities[city]}
              className="w-full px-3 py-2 border border-gray-300 rounded-md h-32 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:bg-gray-100 disabled:cursor-not-allowed"
              placeholder="栈桥落日观景台&#10;小麦岛公园&#10;老城文艺街区"
            />
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md text-red-600 text-sm">
              ⚠️ {error}
            </div>
          )}

          {output && (
            <div className="p-3 bg-gray-50 border border-gray-200 rounded-md text-sm font-mono whitespace-pre-wrap text-gray-700">
              {output}
            </div>
          )}
        </div>

        <div className="p-6 bg-gray-50 border-t border-gray-100 flex gap-2">
          <Button onClick={generateMap} disabled={loading} className="flex-1">
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                生成中...
              </>
            ) : (
              <>
                <MapPin className="h-4 w-4 mr-2" />
                生成地图
              </>
            )}
          </Button>
          <Button onClick={loadMaps} className="bg-gray-100 text-gray-700 hover:bg-gray-200">
            <RefreshCw className="h-4 w-4 mr-2" />
            刷新列表
          </Button>
        </div>
      </div>

      {/* 生成的地图展示 */}
      {generatedMap && (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-gray-100">
            <div className="flex items-center gap-2 text-xl font-semibold text-gray-900">
              <MapIcon className="h-5 w-5" />
              生成的地图
            </div>
          </div>

          <div className="p-6">
            <div className="rounded-lg overflow-hidden border border-gray-200 bg-gray-100">
              <img
                src={generatedMap}
                alt="生成的导览地图"
                className="w-full"
                onError={(e) => {
                  setError('地图图片加载失败,可能需要配置静态文件服务')
                }}
              />
            </div>
          </div>

          <div className="p-6 bg-gray-50 border-t border-gray-100">
            <Button onClick={downloadMap}>
              <Download className="h-4 w-4 mr-2" />
              下载地图
            </Button>
          </div>
        </div>
      )}

      {/* 历史地图 */}
      {maps.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-gray-100">
            <div className="text-xl font-semibold text-gray-900">历史地图</div>
            <p className="text-gray-500 text-sm mt-1">已生成的地图文件</p>
          </div>

          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {maps.map((map, index) => (
                <div key={index} className="group relative">
                  <div className="aspect-video rounded-lg overflow-hidden border border-gray-200 bg-gray-100">
                    <img
                      src={map.path}
                      alt={map.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <p className="text-sm text-gray-500 mt-1 truncate">{map.name}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
