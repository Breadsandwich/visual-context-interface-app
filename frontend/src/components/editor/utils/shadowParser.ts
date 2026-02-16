export interface ShadowData {
  inset: boolean
  x: number
  y: number
  blur: number
  spread: number
  color: string
}

const DEFAULT_SHADOW: ShadowData = {
  inset: false,
  x: 0,
  y: 4,
  blur: 6,
  spread: 0,
  color: 'rgba(0,0,0,0.1)',
}

export function createDefaultShadow(): ShadowData {
  return { ...DEFAULT_SHADOW }
}

export function parseShadows(css: string): ShadowData[] {
  if (!css || css === 'none') return []

  const shadows: ShadowData[] = []
  // Split on commas that are not inside parentheses
  const parts = splitShadows(css)

  for (const part of parts) {
    const trimmed = part.trim()
    if (!trimmed) continue

    const inset = trimmed.startsWith('inset')
    const withoutInset = inset ? trimmed.slice(5).trim() : trimmed

    // Extract color (rgb/rgba/hsl/hsla or hex)
    const colorMatch = withoutInset.match(/(rgba?\([^)]+\)|hsla?\([^)]+\)|#[0-9a-fA-F]{3,8})\s*$/)
    const color = colorMatch ? colorMatch[1] : 'rgba(0,0,0,0.1)'
    const withoutColor = colorMatch
      ? withoutInset.slice(0, colorMatch.index).trim()
      : withoutInset

    // Remaining should be px values: x y blur spread
    const nums = withoutColor.match(/-?\d+(\.\d+)?/g) ?? []
    shadows.push({
      inset,
      x: parseFloat(nums[0] ?? '0'),
      y: parseFloat(nums[1] ?? '0'),
      blur: parseFloat(nums[2] ?? '0'),
      spread: parseFloat(nums[3] ?? '0'),
      color,
    })
  }

  return shadows
}

export function serializeShadows(shadows: ShadowData[]): string {
  if (shadows.length === 0) return 'none'

  return shadows
    .map((s) => {
      const parts = [
        ...(s.inset ? ['inset'] : []),
        `${s.x}px`,
        `${s.y}px`,
        `${s.blur}px`,
        `${s.spread}px`,
        s.color,
      ]
      return parts.join(' ')
    })
    .join(', ')
}

function splitShadows(css: string): string[] {
  const result: string[] = []
  let depth = 0
  let current = ''

  for (const char of css) {
    if (char === '(') depth++
    else if (char === ')') depth--

    if (char === ',' && depth === 0) {
      result.push(current)
      current = ''
    } else {
      current += char
    }
  }

  if (current.trim()) result.push(current)
  return result
}
