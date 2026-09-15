const DEFAULT_NAV_FALLBACK: [number, number, number] = [255, 255, 255]
const DEFAULT_MAIN_FALLBACK: [number, number, number] = [255, 255, 255]

export const parseCssColor = (input?: string | null): { r: number, g: number, b: number, a: number } | null => {
  if (!input) return null
  const value = input.trim().toLowerCase()
  if (!value || value == 'none') return null
  if (value == 'transparent') return { r: 255, g: 255, b: 255, a: 0 }

  const rgb = value.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+%?))?\s*\)$/)
  if (rgb) {
    const a = rgb[4] == null
      ? 1
      : rgb[4].endsWith('%')
        ? parseFloat(rgb[4]) / 100
        : parseFloat(rgb[4])
    return { r: Number(rgb[1]), g: Number(rgb[2]), b: Number(rgb[3]), a }
  }

  const hex = value.match(/^#([0-9a-f]{3,8})$/)
  if (hex) {
    let h = hex[1]
    if (h.length == 3 || h.length == 4) h = h.split('').map(c => c + c).join('')
    if (h.length == 6) {
      const n = parseInt(h, 16)
      return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 }
    }
    if (h.length == 8) {
      const n = parseInt(h, 16)
      return { r: (n >> 24) & 255, g: (n >> 16) & 255, b: (n >> 8) & 255, a: (n & 255) / 255 }
    }
  }

  return null
}

export const alphaPercent = (color?: string | null) => {
  const parsed = parseCssColor(color)
  if (!parsed) return 100
  return Math.round(parsed.a * 100)
}

export const snapBlurPx = (px: number) => {
  const value = Math.round(clamp(px, 0, 20) * 2) / 2
  return Number(value.toFixed(1))
}

export const parseBlurPx = (filter?: string | null) => {
  const match = filter?.match(/blur\(\s*([\d.]+)px\s*\)/)
  if (!match) return 8
  return snapBlurPx(Number(match[1]))
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const pickFallbackRgb = (colors: Record<string, string>, fallback: [number, number, number]): [number, number, number] => {
  const candidates = [
    colors['--color-app-background'],
    colors['--color-main-background'],
    colors['--color-1000'],
  ]
  for (const color of candidates) {
    const parsed = parseCssColor(color)
    if (!parsed || parsed.a <= 0) continue
    const luma = (parsed.r * 299 + parsed.g * 587 + parsed.b * 114) / 1000
    return luma < 128 ? [18, 18, 20] : [255, 255, 255]
  }
  return fallback
}

const setColorAlpha = (color: string | undefined, alpha: number, fallback: [number, number, number]) => {
  const a = Number(clamp(alpha, 0, 1).toFixed(2))
  const parsed = parseCssColor(color)
  if (!parsed || parsed.a == 0) {
    if (a == 0) return 'transparent'
    return `rgba(${fallback[0]}, ${fallback[1]}, ${fallback[2]}, ${a})`
  }
  return `rgba(${Math.round(parsed.r)}, ${Math.round(parsed.g)}, ${Math.round(parsed.b)}, ${a})`
}

const setBlurPx = (filter: string | undefined, px: number) => {
  const value = snapBlurPx(px)
  if (!filter?.trim()) return `saturate(140%) blur(${value}px)`
  if (/blur\([^)]*\)/.test(filter)) return filter.replace(/blur\([^)]*\)/, `blur(${value}px)`)
  return `${filter} blur(${value}px)`
}

let lastRawThemeColors: Record<string, string> = {}

export const setLastRawThemeColors = (colors: Record<string, string>) => {
  lastRawThemeColors = colors
}

export const getLastRawThemeColors = () => lastRawThemeColors

export const applyThemeOpacityColors = (
  colors: Record<string, string>,
  setting: {
    navOpacity: number
    mainOpacity: number
    glassBlur: number
    navGlassBlur: number
    mainGlassBlur: number
  },
) => {
  const next = { ...colors }
  const navFallback = pickFallbackRgb(colors, DEFAULT_NAV_FALLBACK)
  const mainFallback = pickFallbackRgb(colors, DEFAULT_MAIN_FALLBACK)
  const navBlur = setting.navGlassBlur >= 0 ? setting.navGlassBlur : setting.glassBlur
  const mainBlur = setting.mainGlassBlur >= 0 ? setting.mainGlassBlur : setting.glassBlur

  if (setting.navOpacity >= 0) {
    next['--color-nav-background'] = setColorAlpha(colors['--color-nav-background'], setting.navOpacity / 100, navFallback)
  }
  if (setting.mainOpacity >= 0) {
    next['--color-main-background'] = setColorAlpha(colors['--color-main-background'], setting.mainOpacity / 100, mainFallback)
  }
  next['--blur-nav-glass'] = navBlur >= 0 ? setBlurPx(colors['--blur-glass'], navBlur) : (colors['--blur-glass'] ?? 'saturate(140%) blur(8px)')
  next['--blur-main-glass'] = mainBlur >= 0 ? setBlurPx(colors['--blur-glass'], mainBlur) : (colors['--blur-glass'] ?? 'saturate(140%) blur(8px)')
  if (mainBlur >= 0) next['--blur-glass'] = next['--blur-main-glass']
  return next
}
