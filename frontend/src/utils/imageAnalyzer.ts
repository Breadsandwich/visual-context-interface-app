import type { ImageCodemap, ContentType, Complexity, VisualWeight, TextProminence, FontScale, FontWeight } from '../types/inspector'

interface RgbaSample {
  r: number
  g: number
  b: number
  a: number
}

interface ColorCluster {
  r: number
  g: number
  b: number
  count: number
}

interface EdgeMap {
  horizontal: Float32Array
  vertical: Float32Array
  magnitude: Float32Array
}

interface TextRegion {
  y: number
  height: number
  width: number
  hEnergy: number
  vEnergy: number
}

const SAMPLE_GRID = 10
const COLOR_DISTANCE_THRESHOLD = 50
const MAX_DOMINANT_COLORS = 5
const MAX_ANALYSIS_DIM = 300

function samplePixels(imageData: ImageData, width: number, height: number): RgbaSample[] {
  const samples: RgbaSample[] = []
  const stepX = Math.max(1, Math.floor(width / SAMPLE_GRID))
  const stepY = Math.max(1, Math.floor(height / SAMPLE_GRID))

  for (let y = 0; y < height; y += stepY) {
    for (let x = 0; x < width; x += stepX) {
      const i = (y * width + x) * 4
      samples.push({
        r: imageData.data[i],
        g: imageData.data[i + 1],
        b: imageData.data[i + 2],
        a: imageData.data[i + 3]
      })
    }
  }
  return samples
}

/**
 * Cluster sampled pixels into dominant colors using greedy nearest-neighbor grouping.
 *
 * Algorithm: For each sample, find the nearest existing cluster (Euclidean RGB distance).
 * If within COLOR_DISTANCE_THRESHOLD, merge into that cluster (running-average centroid).
 * Otherwise, create a new cluster. Returns top MAX_DOMINANT_COLORS sorted by frequency.
 *
 * Note: Running-average centroids can drift with sample order. Acceptable for ~100 samples.
 * Fully transparent images produce an empty array.
 */
function computeDominantColors(samples: RgbaSample[]): string[] {
  const clusters: ColorCluster[] = []

  for (const sample of samples) {
    if (sample.a < 128) continue

    let nearestIdx = -1
    let nearestDist = Infinity

    for (let i = 0; i < clusters.length; i++) {
      const c = clusters[i]
      const dist = Math.sqrt(
        (sample.r - c.r) ** 2 +
        (sample.g - c.g) ** 2 +
        (sample.b - c.b) ** 2
      )
      if (dist < nearestDist) {
        nearestDist = dist
        nearestIdx = i
      }
    }

    if (nearestIdx >= 0 && nearestDist < COLOR_DISTANCE_THRESHOLD) {
      const c = clusters[nearestIdx]
      const total = c.count + 1
      clusters[nearestIdx] = {
        r: Math.round((c.r * c.count + sample.r) / total),
        g: Math.round((c.g * c.count + sample.g) / total),
        b: Math.round((c.b * c.count + sample.b) / total),
        count: total
      }
    } else {
      clusters.push({ r: sample.r, g: sample.g, b: sample.b, count: 1 })
    }
  }

  return clusters
    .sort((a, b) => b.count - a.count)
    .slice(0, MAX_DOMINANT_COLORS)
    .map((c) => rgbToHex(c.r, c.g, c.b))
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => n.toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

function classifyBrightness(samples: RgbaSample[]): 'dark' | 'medium' | 'light' {
  if (samples.length === 0) return 'medium'

  let totalLuminance = 0
  let count = 0
  for (const s of samples) {
    if (s.a < 128) continue
    totalLuminance += 0.299 * s.r + 0.587 * s.g + 0.114 * s.b
    count++
  }

  if (count === 0) return 'medium'
  const avg = totalLuminance / count

  if (avg < 85) return 'dark'
  if (avg > 170) return 'light'
  return 'medium'
}

function detectTransparency(samples: RgbaSample[]): boolean {
  return samples.some((s) => s.a < 250)
}

function toGrayscale(imageData: ImageData, width: number, height: number): Float32Array {
  const gray = new Float32Array(width * height)
  const data = imageData.data
  for (let i = 0; i < width * height; i++) {
    const offset = i * 4
    gray[i] = 0.299 * data[offset] + 0.587 * data[offset + 1] + 0.114 * data[offset + 2]
  }
  return gray
}

function computeEdgeMap(gray: Float32Array, width: number, height: number): EdgeMap {
  const size = width * height
  const horizontal = new Float32Array(size)
  const vertical = new Float32Array(size)
  const magnitude = new Float32Array(size)

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const tl = gray[(y - 1) * width + (x - 1)]
      const tc = gray[(y - 1) * width + x]
      const tr = gray[(y - 1) * width + (x + 1)]
      const ml = gray[y * width + (x - 1)]
      const mr = gray[y * width + (x + 1)]
      const bl = gray[(y + 1) * width + (x - 1)]
      const bc = gray[(y + 1) * width + x]
      const br = gray[(y + 1) * width + (x + 1)]

      const gx = -tl + tr - 2 * ml + 2 * mr - bl + br
      const gy = -tl - 2 * tc - tr + bl + 2 * bc + br

      const idx = y * width + x
      horizontal[idx] = Math.abs(gy)
      vertical[idx] = Math.abs(gx)
      magnitude[idx] = Math.sqrt(gx * gx + gy * gy)
    }
  }

  return { horizontal, vertical, magnitude }
}

function detectTextRegions(
  edgeH: Float32Array,
  edgeV: Float32Array,
  width: number,
  height: number
): TextRegion[] {
  const stripHeight = Math.max(3, Math.round(height * 0.05))
  const candidates: TextRegion[] = []

  for (let y = 0; y < height - stripHeight; y += stripHeight) {
    let hEnergy = 0
    let vEnergy = 0

    for (let sy = y; sy < y + stripHeight && sy < height; sy++) {
      for (let x = 0; x < width; x++) {
        const idx = sy * width + x
        hEnergy += edgeH[idx]
        vEnergy += edgeV[idx]
      }
    }

    if (vEnergy > 0 && hEnergy / vEnergy > 2.0) {
      candidates.push({ y, height: stripHeight, width, hEnergy, vEnergy })
    }
  }

  const merged: TextRegion[] = []
  for (const candidate of candidates) {
    const last = merged[merged.length - 1]
    if (last && candidate.y <= last.y + last.height) {
      const newHeight = candidate.y + candidate.height - last.y
      merged[merged.length - 1] = {
        ...last,
        height: newHeight,
        hEnergy: last.hEnergy + candidate.hEnergy,
        vEnergy: last.vEnergy + candidate.vEnergy,
      }
    } else {
      merged.push({ ...candidate })
    }
  }

  return merged.filter((r) =>
    r.width / r.height > 3 || (r.vEnergy > 0 && r.hEnergy / r.vEnergy > 2.0 && r.height < height * 0.8)
  )
}

function classifyTextPresence(
  textRegions: TextRegion[],
  width: number,
  height: number
): { hasText: boolean; textProminence: TextProminence } {
  if (textRegions.length === 0) {
    return { hasText: false, textProminence: 'none' }
  }

  const imageArea = width * height
  const textArea = textRegions.reduce((sum, r) => sum + r.width * r.height, 0)
  const coverage = textArea / imageArea

  let textProminence: TextProminence = 'minimal'
  if (coverage > 0.40) textProminence = 'dominant'
  else if (coverage > 0.15) textProminence = 'moderate'

  return { hasText: true, textProminence }
}

function analyzeFontStyles(
  textRegions: TextRegion[],
  edgeMag: Float32Array,
  width: number,
  height: number
): { estimatedFontScale: FontScale; fontWeight: FontWeight } {
  if (textRegions.length === 0) {
    return { estimatedFontScale: 'medium', fontWeight: 'regular' }
  }

  const relativeHeights = textRegions.map((r) => r.height / height)
  const avgRelHeight = relativeHeights.reduce((a, b) => a + b, 0) / relativeHeights.length
  const heightVariance = relativeHeights.reduce(
    (sum, h) => sum + (h - avgRelHeight) ** 2,
    0
  ) / relativeHeights.length

  let estimatedFontScale: FontScale = 'medium'
  if (heightVariance > 0.002) {
    estimatedFontScale = 'mixed'
  } else if (avgRelHeight < 0.05) {
    estimatedFontScale = 'small'
  } else if (avgRelHeight > 0.12) {
    estimatedFontScale = 'large'
  }

  const strokeWidths: number[] = []
  for (const region of textRegions) {
    const midY = Math.min(height - 1, region.y + Math.floor(region.height / 2))
    let runLength = 0
    for (let x = 0; x < width; x++) {
      if (edgeMag[midY * width + x] > 30) {
        runLength++
      } else {
        if (runLength > 0) strokeWidths.push(runLength)
        runLength = 0
      }
    }
    if (runLength > 0) strokeWidths.push(runLength)
  }

  let fontWeight: FontWeight = 'regular'
  if (strokeWidths.length > 0) {
    const avgStroke = strokeWidths.reduce((a, b) => a + b, 0) / strokeWidths.length
    const strokeVariance = strokeWidths.reduce(
      (sum, s) => sum + (s - avgStroke) ** 2,
      0
    ) / strokeWidths.length

    if (strokeVariance > 4) {
      fontWeight = 'mixed'
    } else if (avgStroke < 2) {
      fontWeight = 'light'
    } else if (avgStroke > 4) {
      fontWeight = 'bold'
    }
  }

  return { estimatedFontScale, fontWeight }
}

function classifyComplexity(edgeMag: Float32Array, colorCount: number): Complexity {
  let totalEdge = 0
  for (let i = 0; i < edgeMag.length; i++) {
    totalEdge += edgeMag[i]
  }
  const avgEdge = totalEdge / edgeMag.length

  const edgeScore = Math.min(100, (avgEdge / 80) * 100)
  const colorScore = Math.min(100, (colorCount / MAX_DOMINANT_COLORS) * 100)
  const score = edgeScore * 0.5 + colorScore * 0.5

  if (score < 30) return 'minimal'
  if (score <= 60) return 'moderate'
  return 'complex'
}

function analyzeVisualWeight(edgeMag: Float32Array, width: number, height: number): VisualWeight {
  const regions = Array.from({ length: 9 }, () => 0)
  const regionCounts = Array.from({ length: 9 }, () => 0)
  const thirdW = width / 3
  const thirdH = height / 3

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const col = Math.min(2, Math.floor(x / thirdW))
      const row = Math.min(2, Math.floor(y / thirdH))
      const regionIdx = row * 3 + col
      regions[regionIdx] += edgeMag[y * width + x]
      regionCounts[regionIdx]++
    }
  }

  const regionAvgs = regions.map((sum, i) => regionCounts[i] > 0 ? sum / regionCounts[i] : 0)
  const totalAvg = regionAvgs.reduce((a, b) => a + b, 0) / 9
  const maxRegion = Math.max(...regionAvgs)

  if (totalAvg === 0 || maxRegion < totalAvg * 1.5) return 'balanced'

  let cx = 0
  let cy = 0
  let totalWeight = 0
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const w = regionAvgs[row * 3 + col]
      cx += (col + 0.5) / 3 * w
      cy += (row + 0.5) / 3 * w
      totalWeight += w
    }
  }

  if (totalWeight === 0) return 'balanced'
  cx /= totalWeight
  cy /= totalWeight

  if (cy < 0.4) return 'top'
  if (cy > 0.6) return 'bottom'
  if (cx < 0.4) return 'left'
  if (cx > 0.6) return 'right'
  return 'center'
}

interface ContentClassificationInput {
  originalWidth: number
  originalHeight: number
  hasTransparency: boolean
  textProminence: TextProminence
  hasText: boolean
  complexity: Complexity
  colorCount: number
  edgeMag: Float32Array
  width: number
  height: number
}

function classifyContentType(input: ContentClassificationInput): ContentType {
  const {
    originalWidth, originalHeight, hasTransparency, textProminence,
    hasText, complexity, colorCount, edgeMag, width, height,
  } = input

  if (originalWidth < 128 && originalHeight < 128 && hasTransparency) return 'icon'
  if (textProminence === 'dominant') return 'text-heavy'

  let sharpPixels = 0
  for (let i = 0; i < edgeMag.length; i++) {
    if (edgeMag[i] > 50) sharpPixels++
  }
  const sharpnessRatio = sharpPixels / edgeMag.length

  if (hasText && sharpnessRatio > 0.08) return 'screenshot'

  if (colorCount >= 4 && complexity === 'complex' && sharpnessRatio < 0.06) return 'photo'
  if (colorCount <= 3 && complexity === 'minimal') return 'illustration'

  const hasLongLines = detectGeometricPatterns(edgeMag, width, height)
  if (hasLongLines) return 'chart'

  return 'mixed'
}

function detectGeometricPatterns(
  edgeMag: Float32Array,
  width: number,
  height: number
): boolean {
  const threshold = 30
  const minRunH = Math.floor(width * 0.3)
  const minRunV = Math.floor(height * 0.3)

  for (let y = 1; y < height - 1; y += Math.max(1, Math.floor(height / 20))) {
    let run = 0
    for (let x = 0; x < width; x++) {
      if (edgeMag[y * width + x] > threshold) {
        run++
        if (run >= minRunH) return true
      } else {
        run = 0
      }
    }
  }

  for (let x = 1; x < width - 1; x += Math.max(1, Math.floor(width / 20))) {
    let run = 0
    for (let y = 0; y < height; y++) {
      if (edgeMag[y * width + x] > threshold) {
        run++
        if (run >= minRunV) return true
      } else {
        run = 0
      }
    }
  }

  return false
}

function computeAspectRatio(w: number, h: number): string {
  if (w <= 0 || h <= 0) return 'unknown'

  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b))

  const commonRatios: [number, number, string][] = [
    [16, 9, '16:9'],
    [4, 3, '4:3'],
    [3, 2, '3:2'],
    [3, 1, '3:1'],
    [5, 4, '5:4'],
    [1, 1, '1:1'],
    [21, 9, '21:9'],
    [9, 16, '9:16'],
    [3, 4, '3:4'],
    [2, 3, '2:3'],
  ]

  const ratio = w / h

  for (const [rw, rh, label] of commonRatios) {
    if (Math.abs(ratio - rw / rh) < 0.05) return label
  }

  const d = gcd(w, h)
  const rw = w / d
  const rh = h / d

  if (rw <= 20 && rh <= 20) return `${rw}:${rh}`

  let nearestLabel = 'unknown'
  let nearestDiff = Infinity
  for (const [cw, ch, label] of commonRatios) {
    const diff = Math.abs(ratio - cw / ch)
    if (diff < nearestDiff) {
      nearestDiff = diff
      nearestLabel = `~${label}`
    }
  }
  return nearestLabel
}

interface SummaryInput {
  filename: string
  dimensions: string
  aspectRatio: string
  brightness: string
  hasTransparency: boolean
  colorCount: number
  contentType?: ContentType
  complexity?: Complexity
  textProminence?: TextProminence
  estimatedFontScale?: FontScale
  fontWeight?: FontWeight
  visualWeight?: VisualWeight
}

function generateSummary(input: SummaryInput): string {
  const {
    filename, dimensions, aspectRatio, brightness, hasTransparency,
    colorCount, contentType, complexity, textProminence,
    estimatedFontScale, fontWeight, visualWeight,
  } = input

  const imageLabel = contentType ?? 'image'
  const parts: string[] = [`${dimensions} ${brightness} ${imageLabel}`]

  if (aspectRatio !== 'unknown') parts.push(`(${aspectRatio})`)
  if (complexity) parts.push(`${complexity} complexity`)

  if (textProminence && textProminence !== 'none') {
    let textPart = `${textProminence} text`
    if (estimatedFontScale && fontWeight) {
      textPart += ` with ${estimatedFontScale} ${fontWeight} font`
    }
    parts.push(textPart)
  }

  if (hasTransparency) parts.push('with transparency')
  if (colorCount > 0) parts.push(`${colorCount} dominant colors`)
  if (visualWeight && visualWeight !== 'balanced') {
    parts.push(`visually weighted ${visualWeight}`)
  }

  return `${filename}: ${parts.join(', ')}`
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function createFallbackCodemap(filename: string, rawFileSize: number): ImageCodemap {
  return {
    filename,
    dimensions: 'unknown',
    aspectRatio: 'unknown',
    fileSize: formatFileSize(rawFileSize),
    dominantColors: [],
    brightness: 'medium',
    hasTransparency: false,
    summary: generateSummary({
      filename, dimensions: 'unknown', aspectRatio: 'unknown',
      brightness: 'medium', hasTransparency: false, colorCount: 0,
    })
  }
}

export function analyzeImage(
  dataUrl: string,
  filename: string,
  rawFileSize: number
): Promise<ImageCodemap> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      try {
        const w = img.naturalWidth
        const h = img.naturalHeight
        const scale = Math.min(1, MAX_ANALYSIS_DIM / Math.max(w, h))
        const aw = Math.max(1, Math.round(w * scale))
        const ah = Math.max(1, Math.round(h * scale))

        const canvas = document.createElement('canvas')
        canvas.width = aw
        canvas.height = ah

        const ctx = canvas.getContext('2d')
        if (!ctx) {
          resolve(createFallbackCodemap(filename, rawFileSize))
          return
        }

        ctx.drawImage(img, 0, 0, aw, ah)
        const imageData = ctx.getImageData(0, 0, aw, ah)
        const samples = samplePixels(imageData, aw, ah)

        const dimensions = `${w}x${h}`
        const aspectRatio = computeAspectRatio(w, h)
        const dominantColors = computeDominantColors(samples)
        const brightness = classifyBrightness(samples)
        const hasTransparency = detectTransparency(samples)

        const gray = toGrayscale(imageData, aw, ah)
        const edgeMap = computeEdgeMap(gray, aw, ah)

        const complexity = classifyComplexity(edgeMap.magnitude, dominantColors.length)
        const visualWeight = analyzeVisualWeight(edgeMap.magnitude, aw, ah)

        const textRegions = detectTextRegions(edgeMap.horizontal, edgeMap.vertical, aw, ah)
        const { hasText, textProminence } = classifyTextPresence(textRegions, aw, ah)
        const fontStyles = hasText
          ? analyzeFontStyles(textRegions, edgeMap.magnitude, aw, ah)
          : undefined

        const contentType = classifyContentType({
          originalWidth: w,
          originalHeight: h,
          hasTransparency,
          textProminence,
          hasText,
          complexity,
          colorCount: dominantColors.length,
          edgeMag: edgeMap.magnitude,
          width: aw,
          height: ah,
        })

        resolve({
          filename,
          dimensions,
          aspectRatio,
          fileSize: formatFileSize(rawFileSize),
          dominantColors,
          brightness,
          hasTransparency,
          contentType,
          complexity,
          visualWeight,
          hasText,
          textProminence,
          estimatedFontScale: fontStyles?.estimatedFontScale,
          fontWeight: fontStyles?.fontWeight,
          summary: generateSummary({
            filename, dimensions, aspectRatio, brightness, hasTransparency,
            colorCount: dominantColors.length, contentType, complexity,
            textProminence, estimatedFontScale: fontStyles?.estimatedFontScale,
            fontWeight: fontStyles?.fontWeight, visualWeight,
          })
        })
      } catch {
        resolve(createFallbackCodemap(filename, rawFileSize))
      }
    }
    img.onerror = () => resolve(createFallbackCodemap(filename, rawFileSize))
    img.src = dataUrl
  })
}
