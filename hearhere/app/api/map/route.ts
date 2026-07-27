import { NextResponse } from 'next/server'
import { exec } from 'child_process'
import { promisify } from 'util'
import path from 'path'
import fs from 'fs'

const execAsync = promisify(exec)

// 确保输出目录存在
function ensureOutputDirs() {
  const baseDir = process.cwd()
  const dirs = [
    path.join(baseDir, 'outputs'),
    path.join(baseDir, 'outputs', 'posters'),
    path.join(baseDir, 'outputs', 'poi-sets'),
  ]
  dirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
  })
}

export async function POST(request: Request) {
  try {
    const { city, places, title, poiJson } = await request.json()

    if (!city) {
      return NextResponse.json(
        { success: false, error: '需要提供城市名称' },
        { status: 400 }
      )
    }

    ensureOutputDirs()

    // 构建命令行参数
    let cmdParts: string[]

    if (poiJson) {
      // 使用已有的 POI JSON
      cmdParts = [
        'python3',
        '-m',
        'guide_maps.cli.create_gis_map',
        '--city', city,
        '--title', title || `${city}导览图`,
        '--poi-json', poiJson,
        '--no-road-labels'
      ]
    } else if (places && places.length > 0) {
      // 使用提供的地点
      cmdParts = [
        'python3',
        '-m',
        'guide_maps.cli.create_gis_map',
        '--city', city,
        '--title', title || `${city}导览图`,
        '--no-road-labels'
      ]
      // 添加地点
      for (const place of places) {
        cmdParts.push('--places', place)
      }
    } else {
      // 如果什么都没有，至少用城市名
      cmdParts = [
        'python3',
        '-m',
        'guide_maps.cli.create_gis_map',
        '--city', city,
        '--title', title || `${city}导览图`,
        '--no-road-labels',
        '--places', city
      ]
    }

    console.log('🚀 生成地图命令:', cmdParts.join(' '))

    const { stdout, stderr } = await execAsync(cmdParts.join(' '), {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PYTHONPATH: process.cwd(),
      }
    })

    console.log('📤 地图生成输出:', stdout)
    if (stderr) {
      console.log('📥 地图生成 stderr:', stderr)
    }

    // 解析输出,找到生成的文件路径
    const outputMatch = stdout.match(/GIS map ready: (.+)/)
    let outputFile = outputMatch ? outputMatch[1] : null

    // 转换为相对于项目根目录的路径
    if (outputFile && path.isAbsolute(outputFile)) {
      outputFile = path.relative(process.cwd(), outputFile)
    }

    // 如果没有找到,尝试猜测文件名
    if (!outputFile) {
      const slug = city.toLowerCase().replace(/\s+/g, '-')
      const guessPath = `outputs/posters/${slug}_guide_gis_map.png`
      if (fs.existsSync(path.join(process.cwd(), guessPath))) {
        outputFile = guessPath
      } else {
        // 查找最新的地图文件
        const postersDir = path.join(process.cwd(), 'outputs', 'posters')
        if (fs.existsSync(postersDir)) {
          const files = fs.readdirSync(postersDir)
            .filter(file => file.endsWith('.png'))
            .map(file => ({
              name: file,
              time: fs.statSync(path.join(postersDir, file)).mtime.getTime()
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
      output: stdout,
      outputFile: outputFile,
      message: stderr
    })
  } catch (error) {
    console.error('❌ 生成地图失败:', error)
    return NextResponse.json(
      { success: true, skipMap: true, message: '地图生成暂时不可用，请稍后重试' }
    )
  }
}

// 获取生成的地图列表
export async function GET() {
  try {
    const postersDir = path.join(process.cwd(), 'outputs', 'posters')

    if (!fs.existsSync(postersDir)) {
      return NextResponse.json({ success: true, maps: [] })
    }

    const files = fs.readdirSync(postersDir)
      .filter(file => file.endsWith('.png'))
      .map(file => ({
        name: file,
        path: `/outputs/posters/${file}`,
        createdAt: fs.statSync(path.join(postersDir, file)).mtime
      }))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())

    return NextResponse.json({ success: true, maps: files })
  } catch (error) {
    console.error('❌ 获取地图列表失败:', error)
    return NextResponse.json({ success: true, maps: [] })
  }
}
