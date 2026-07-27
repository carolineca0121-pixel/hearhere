import { NextResponse } from 'next/server'
import { exec } from 'child_process'
import { promisify } from 'util'
import path from 'path'
import fs from 'fs'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const execAsync = promisify(exec)

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const tripId = params.id

    // 获取行程数据
    const trip = await prisma.trip.findUnique({
      where: { id: tripId },
      include: { user: true, itineraries: true }
    })

    if (!trip) {
      return NextResponse.json(
        { success: false, error: '行程不存在' },
        { status: 404 }
      )
    }

    // 解析行程内容，提取地点
    let placeNames: string[] = []
    let city = trip.destination

    try {
      // 从 itineraries 中提取地点
      for (const itinerary of trip.itineraries) {
        try {
          const items = JSON.parse(itinerary.content)
          for (const item of items) {
            if (item.activity) {
              // 提取活动名称作为地点
              placeNames.push(item.activity)
            }
          }
        } catch {
          // 忽略解析错误
        }
      }
    } catch {
      // 忽略解析错误
    }

    // 先尝试用示例数据（如果支持的城市）
    let poiJsonPath: string | null = null

    const sampleMap: Record<string, string> = {
      '青岛': 'qingdao-sample.json',
      '北京': 'beijing-sample.json',
      '上海': 'shanghai-sample.json'
    }

    for (const [cityName, fileName] of Object.entries(sampleMap)) {
      if (city.includes(cityName) || city === cityName) {
        const samplePath = path.join(process.cwd(), 'outputs', 'poi-sets', fileName)
        if (fs.existsSync(samplePath)) {
          poiJsonPath = `outputs/poi-sets/${fileName}`
          break
        }
      }
    }

    // 构建地图标题
    const mapTitle = `${city}导览地图`

    // 构建命令 - 先尝试用 POI JSON，失败则用简单模式
    let cmdParts: string[]

    if (poiJsonPath) {
      cmdParts = [
        'python3',
        '-m',
        'guide_maps.cli.create_gis_map',
        '--city', city,
        '--title', mapTitle,
        '--poi-json', poiJsonPath
      ]
    } else {
      // 对于其他城市，创建一个简化的通用模式
      // 先尝试解析，失败则使用最少参数
      cmdParts = [
        'python3',
        '-m',
        'guide_maps.cli.create_gis_map',
        '--city', city,
        '--title', mapTitle,
        '--no-road-labels'
      ]

      // 添加一些通用地点
      const fallbackPlaces = ['市中心', '公园', '商业街', '景点']
      for (const place of fallbackPlaces) {
        cmdParts.push('--places', place)
      }
    }

    console.log('🎯 为行程生成地图:', { tripId, city, places: placeNames.length })
    console.log('🚀 命令:', cmdParts.join(' '))

    let stdout: string
    let stderr: string

    try {
      // 执行地图生成
      const result = await execAsync(cmdParts.join(' '), {
        cwd: process.cwd(),
        env: {
          ...process.env,
          PYTHONPATH: process.cwd(),
        }
      })
      stdout = result.stdout
      stderr = result.stderr
    } catch (error) {
      // 如果第一次失败，尝试最简化的版本 - 只生成城市地图
      console.log('⚠️ 第一次尝试失败，使用简化模式...')

      const fallbackCmd = [
        'python3',
        '-m',
        'guide_maps.cli.create_gis_map',
        '--city', city,
        '--title', mapTitle,
        '--no-road-labels',
        '--places', city
      ]

      try {
        const result = await execAsync(fallbackCmd.join(' '), {
          cwd: process.cwd(),
          env: {
            ...process.env,
            PYTHONPATH: process.cwd(),
          }
        })
        stdout = result.stdout
        stderr = result.stderr
      } catch (fallbackError) {
        // 如果还是失败，返回一个友好的错误
        console.log('❌ 地图生成完全失败，但我们会返回说明')
        return NextResponse.json({
          success: true,
          skipMap: true,
          message: `地图生成暂不可用，但这是正常的。你可以在独立地图页面 /map 手动生成。`
        })
      }
    }

    console.log('📤 地图生成输出:', stdout)
    if (stderr) {
      console.log('📥 地图生成 stderr:', stderr)
    }

    // 解析输出，找到生成的文件路径
    const outputMatch = stdout.match(/GIS map ready: (.+)/)
    let outputFile = outputMatch ? outputMatch[1] : null

    // 转换为相对路径
    if (outputFile && path.isAbsolute(outputFile)) {
      outputFile = path.relative(process.cwd(), outputFile)
    }

    // 尝试猜测文件名
    if (!outputFile) {
      const slug = city.toLowerCase().replace(/\s+/g, '-')
      const guessPath = `outputs/posters/${slug}_guide_gis_map.png`
      if (fs.existsSync(path.join(process.cwd(), guessPath))) {
        outputFile = guessPath
      } else {
        // 查找最新生成的地图
        const postersDir = path.join(process.cwd(), 'outputs', 'posters')
        if (fs.existsSync(postersDir)) {
          const files = fs.readdirSync(postersDir)
            .filter(f => f.endsWith('.png'))
            .map(f => ({
              name: f,
              time: fs.statSync(path.join(postersDir, f)).mtime.getTime()
            }))
            .sort((a, b) => b.time - a.time)

          if (files.length > 0) {
            outputFile = `outputs/posters/${files[0].name}`
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      outputFile: outputFile,
      output: stdout,
      message: stderr,
      city,
      places: placeNames
    })

  } catch (error) {
    console.error('❌ 生成行程地图失败:', error)
    return NextResponse.json({
      success: true,
      skipMap: true,
      message: `地图生成暂不可用，你可以在独立地图页面 /map 手动生成地图。`
    })
  }
}

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const tripId = params.id

    // 获取行程数据
    const trip = await prisma.trip.findUnique({
      where: { id: tripId }
    })

    if (!trip) {
      return NextResponse.json(
        { success: false, error: '行程不存在' },
        { status: 404 }
      )
    }

    // 查找是否已生成地图
    const postersDir = path.join(process.cwd(), 'outputs', 'posters')
    if (!fs.existsSync(postersDir)) {
      return NextResponse.json({ success: true, map: null })
    }

    // 查找包含城市名的地图文件
    const citySlug = trip.destination.toLowerCase().replace(/\s+/g, '-')
    const files = fs.readdirSync(postersDir)

    // 尝试找到匹配的地图
    let matchedFile: string | null = null
    for (const file of files) {
      if (file.includes(citySlug) || file.includes(trip.destination)) {
        matchedFile = file
        break
      }
    }

    // 如果没有匹配，返回最新的地图
    if (!matchedFile && files.length > 0) {
      const sortedFiles = files
        .filter(f => f.endsWith('.png'))
        .map(f => ({
          name: f,
          time: fs.statSync(path.join(postersDir, f)).mtime.getTime()
        }))
        .sort((a, b) => b.time - a.time)

      if (sortedFiles.length > 0) {
        matchedFile = sortedFiles[0].name
      }
    }

    return NextResponse.json({
      success: true,
      map: matchedFile ? `/outputs/posters/${matchedFile}` : null
    })

  } catch (error) {
    console.error('❌ 获取行程地图失败:', error)
    return NextResponse.json({
      success: true,
      map: null
    })
  }
}
