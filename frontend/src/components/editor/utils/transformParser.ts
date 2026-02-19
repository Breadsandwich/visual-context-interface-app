export interface TransformData {
  rotate: number
  scaleX: number
  scaleY: number
  translateX: number
  translateY: number
  skewX: number
  skewY: number
}

export function createDefaultTransform(): TransformData {
  return { rotate: 0, scaleX: 1, scaleY: 1, translateX: 0, translateY: 0, skewX: 0, skewY: 0 }
}

export function parseTransform(css: string): TransformData {
  const data = createDefaultTransform()
  if (!css || css === 'none') return data

  // matrix(a, b, c, d, tx, ty) — decompose into rotate/scale/translate/skew
  const matrixMatch = css.match(/matrix\(([^)]+)\)/)
  if (matrixMatch) {
    const parts = matrixMatch[1].split(',').map((s) => parseFloat(s.trim()))
    if (parts.length < 6 || parts.some(isNaN)) return data
    const [a, b, c, d, tx, ty] = parts
    data.translateX = Math.round(tx)
    data.translateY = Math.round(ty)
    data.scaleX = Math.round(Math.sqrt(a * a + b * b) * 100) / 100
    data.scaleY = Math.round(Math.sqrt(c * c + d * d) * 100) / 100
    data.rotate = Math.round(Math.atan2(b, a) * (180 / Math.PI))
    return data
  }

  const rotateMatch = css.match(/rotate\((-?\d+(?:\.\d+)?)deg\)/)
  if (rotateMatch) data.rotate = parseFloat(rotateMatch[1])

  const scaleMatch = css.match(/scale\((-?\d+(?:\.\d+)?),?\s*(-?\d+(?:\.\d+)?)?\)/)
  if (scaleMatch) {
    data.scaleX = parseFloat(scaleMatch[1])
    data.scaleY = parseFloat(scaleMatch[2] ?? scaleMatch[1])
  }

  const scaleXMatch = css.match(/scaleX\((-?\d+(?:\.\d+)?)\)/)
  if (scaleXMatch) data.scaleX = parseFloat(scaleXMatch[1])

  const scaleYMatch = css.match(/scaleY\((-?\d+(?:\.\d+)?)\)/)
  if (scaleYMatch) data.scaleY = parseFloat(scaleYMatch[1])

  const translateMatch = css.match(/translate\((-?\d+(?:\.\d+)?)px,?\s*(-?\d+(?:\.\d+)?)px\)/)
  if (translateMatch) {
    data.translateX = parseFloat(translateMatch[1])
    data.translateY = parseFloat(translateMatch[2])
  }

  const txMatch = css.match(/translateX\((-?\d+(?:\.\d+)?)px\)/)
  if (txMatch) data.translateX = parseFloat(txMatch[1])

  const tyMatch = css.match(/translateY\((-?\d+(?:\.\d+)?)px\)/)
  if (tyMatch) data.translateY = parseFloat(tyMatch[1])

  const skewXMatch = css.match(/skewX\((-?\d+(?:\.\d+)?)deg\)/)
  if (skewXMatch) data.skewX = parseFloat(skewXMatch[1])

  const skewYMatch = css.match(/skewY\((-?\d+(?:\.\d+)?)deg\)/)
  if (skewYMatch) data.skewY = parseFloat(skewYMatch[1])

  return data
}

export function serializeTransform(data: TransformData): string {
  const parts: string[] = []

  if (data.translateX !== 0 || data.translateY !== 0) {
    parts.push(`translate(${data.translateX}px, ${data.translateY}px)`)
  }
  if (data.rotate !== 0) parts.push(`rotate(${data.rotate}deg)`)
  if (data.scaleX !== 1 || data.scaleY !== 1) {
    parts.push(`scale(${data.scaleX}, ${data.scaleY})`)
  }
  if (data.skewX !== 0) parts.push(`skewX(${data.skewX}deg)`)
  if (data.skewY !== 0) parts.push(`skewY(${data.skewY}deg)`)

  return parts.length > 0 ? parts.join(' ') : 'none'
}

const ORIGIN_MAP: Record<string, string> = {
  'top left': '0% 0%',
  'top center': '50% 0%',
  'top right': '100% 0%',
  'center left': '0% 50%',
  'center center': '50% 50%',
  'center right': '100% 50%',
  'bottom left': '0% 100%',
  'bottom center': '50% 100%',
  'bottom right': '100% 100%',
}

export const ORIGIN_LABELS = [
  'top left', 'top center', 'top right',
  'center left', 'center center', 'center right',
  'bottom left', 'bottom center', 'bottom right',
] as const

export function originToPercent(label: string): string {
  return ORIGIN_MAP[label] ?? '50% 50%'
}

export function percentToOrigin(pct: string): string {
  const entry = Object.entries(ORIGIN_MAP).find(([, v]) => v === pct)
  return entry ? entry[0] : 'center center'
}
