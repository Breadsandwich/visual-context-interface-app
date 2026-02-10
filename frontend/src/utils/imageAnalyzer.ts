import type { ImageCodemap } from '../types/inspector'

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

const SAMPLE_GRID = 10
const COLOR_DISTANCE_THRESHOLD = 50
const MAX_DOMINANT_COLORS = 5
const MAX_ANALYSIS_DIM = 200

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

function computeAspectRatio(w: number, h: number): string {
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b))

  const commonRatios: [number, number, string][] = [
    [16, 9, '16:9'],
    [4, 3, '4:3'],
    [3, 2, '3:2'],
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
  return `${w / d}:${h / d}`
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
    hasTransparency: false
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

        resolve({
          filename,
          dimensions: `${w}x${h}`,
          aspectRatio: computeAspectRatio(w, h),
          fileSize: formatFileSize(rawFileSize),
          dominantColors: computeDominantColors(samples),
          brightness: classifyBrightness(samples),
          hasTransparency: detectTransparency(samples)
        })
      } catch {
        resolve(createFallbackCodemap(filename, rawFileSize))
      }
    }
    img.onerror = () => resolve(createFallbackCodemap(filename, rawFileSize))
    img.src = dataUrl
  })
}
