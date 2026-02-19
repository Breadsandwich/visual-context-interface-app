export interface FilterData {
  blur: number
  brightness: number
  contrast: number
  saturate: number
  hueRotate: number
}

export function createDefaultFilter(): FilterData {
  return { blur: 0, brightness: 100, contrast: 100, saturate: 100, hueRotate: 0 }
}

function parsePercentOrDecimal(match: RegExpMatchArray): number {
  const val = parseFloat(match[1])
  const hasPercent = match[2] === '%'
  return hasPercent ? val : val * 100
}

export function parseFilter(css: string): FilterData {
  const data = createDefaultFilter()
  if (!css || css === 'none') return data

  const blurMatch = css.match(/blur\((\d+(?:\.\d+)?)px\)/)
  if (blurMatch) data.blur = parseFloat(blurMatch[1])

  const brightnessMatch = css.match(/brightness\((\d+(?:\.\d+)?)(%)?\)/)
  if (brightnessMatch) data.brightness = parsePercentOrDecimal(brightnessMatch)

  const contrastMatch = css.match(/contrast\((\d+(?:\.\d+)?)(%)?\)/)
  if (contrastMatch) data.contrast = parsePercentOrDecimal(contrastMatch)

  const saturateMatch = css.match(/saturate\((\d+(?:\.\d+)?)(%)?\)/)
  if (saturateMatch) data.saturate = parsePercentOrDecimal(saturateMatch)

  const hueMatch = css.match(/hue-rotate\((\d+(?:\.\d+)?)deg\)/)
  if (hueMatch) data.hueRotate = parseFloat(hueMatch[1])

  return data
}

export function serializeFilter(data: FilterData): string {
  const parts: string[] = []

  if (data.blur > 0) parts.push(`blur(${data.blur}px)`)
  if (data.brightness !== 100) parts.push(`brightness(${data.brightness}%)`)
  if (data.contrast !== 100) parts.push(`contrast(${data.contrast}%)`)
  if (data.saturate !== 100) parts.push(`saturate(${data.saturate}%)`)
  if (data.hueRotate !== 0) parts.push(`hue-rotate(${data.hueRotate}deg)`)

  return parts.length > 0 ? parts.join(' ') : 'none'
}
