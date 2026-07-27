import { MapGenerator } from '@/components/MapGenerator'

export default function MapPage() {
  return (
    <div className="container mx-auto py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">🗺️ 导览地图生成器</h1>
          <p className="text-gray-600">
            基于你的行程规划,生成可视化的城市导览地图。
            你可以输入城市名称和地点列表,系统会自动生成一张精美的导览地图。
          </p>
        </div>

        <MapGenerator />

        <div className="mt-8 p-6 bg-gray-50 rounded-lg">
          <h2 className="text-xl font-semibold mb-4">💡 使用提示</h2>
          <ul className="space-y-2 text-gray-600">
            <li>• 目前支持中国城市 (使用高德地图进行地理编码)</li>
            <li>• 首次运行时需要下载 OpenStreetMap 数据,可能需要一些时间</li>
            <li>• 地图数据会缓存在本地,后续生成相同区域会更快</li>
            <li>• 如果没有高德地图 API key,可以使用已有的 POI JSON 数据</li>
            <li>• 生成的地图会保存在 outputs/posters/ 目录下</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
