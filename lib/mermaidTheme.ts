export function getMermaidConfig() {
  const isLight = document.documentElement.dataset.theme === 'light'
  return {
    startOnLoad: false,
    theme: 'base' as const,
    fontFamily: 'JetBrains Mono, monospace',
    logLevel: 'fatal' as const,
    securityLevel: 'loose' as const,
    sequence: { useMaxWidth: false },
    gantt: { useWidth: 900, barHeight: 28, barGap: 8, topPadding: 50, fontSize: 11, axisFormat: '%d %b' },
    themeVariables: isLight ? {
      primaryColor: '#ddddd8', primaryTextColor: '#111111',
      primaryBorderColor: '#aaaaaa', lineColor: '#333344',
      secondaryColor: '#ededea', tertiaryColor: '#e5e5e0',
      background: '#f5f5f0', mainBkg: '#ddddd8', nodeBorder: '#aaaaaa',
      clusterBkg: '#e5e5e0', titleColor: '#111111', edgeLabelBackground: '#f5f5f0',
      sectionBkgColor: '#ddddd8', sectionBkgColor2: '#ededea',
      altSectionBkgColor: '#d0d0cc', gridColor: '#aaaaaa',
      taskBkgColor: '#00a67d', taskTextColor: '#ffffff',
      taskTextLightColor: '#111111', taskTextOutsideColor: '#111111',
      taskBorderColor: '#00a67d', activeTaskBkgColor: '#007a5a',
      activeTaskBorderColor: '#007a5a', doneTaskBkgColor: '#c8c8c4',
      doneTaskBorderColor: '#aaaaaa', critBkgColor: '#cc3333',
      critBorderColor: '#cc3333', critTextColor: '#ffffff',
      todayLineColor: '#aa7700', fontFamily: 'JetBrains Mono, monospace',
    } : {
      primaryColor: '#1c1c20', primaryTextColor: '#e8e8ec',
      primaryBorderColor: '#3a3a42', lineColor: '#9090a8',
      secondaryColor: '#141416', tertiaryColor: '#2a2a30',
      background: '#0e0e0f', mainBkg: '#1c1c20', nodeBorder: '#3a3a42',
      clusterBkg: '#141416', titleColor: '#e8e8ec', edgeLabelBackground: '#141416',
      sectionBkgColor: '#1c1c20', sectionBkgColor2: '#141416',
      altSectionBkgColor: '#242428', gridColor: '#3a3a42',
      taskBkgColor: '#00d4a1', taskTextColor: '#001a13',
      taskTextLightColor: '#e8e8ec', taskTextOutsideColor: '#e8e8ec',
      taskBorderColor: '#00d4a1', activeTaskBkgColor: '#00a67d',
      activeTaskBorderColor: '#00a67d', doneTaskBkgColor: '#2a2a30',
      doneTaskBorderColor: '#3a3a42', critBkgColor: '#f87171',
      critBorderColor: '#f87171', critTextColor: '#ffffff',
      todayLineColor: '#fbbf24', fontFamily: 'JetBrains Mono, monospace',
      attributeBackgroundColorEven: '#1a1a1e',
      attributeBackgroundColorOdd: '#141416',
    },
  }
}

// Pre-cleans SVG string before it hits the DOM — eliminates flash of light colors
export function fixSvgString(svgString: string): string {
  const isDark = typeof document !== 'undefined' && document.documentElement.dataset.theme !== 'light'
  if (!isDark) return svgString

  return svgString.replace(/fill="([^"]*)"/g, (match, fill) => {
    // Strip surrounding quotes Mermaid sometimes bakes in e.g. `"hsl(...)"`
    const c = fill.trim().replace(/^"|"$/g, '').toLowerCase()
    if (c === 'none' || c === 'transparent') return match
    const rgb = parseColorSimple(c)
    if (rgb && (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) > 140) {
      return 'fill="#1a1a1e"'
    }
    return match
  })
}

// Called after dangerouslySetInnerHTML — operates on real DOM elements
export function fixSvgColors(svgEl: SVGElement) {
  svgEl.removeAttribute('width')
  svgEl.removeAttribute('height')
  svgEl.style.width = '100%'
  svgEl.style.minWidth = '800px'
  svgEl.style.height = 'auto'
  svgEl.style.display = 'block'

  const isDark = document.documentElement.dataset.theme !== 'light'
  if (!isDark) return

  // Fix ER diagram: attribute rows render as HTML inside <foreignObject>
  // SVG stylesheet injection does NOT reach into foreignObject HTML namespace
  // Only direct DOM style manipulation works here
  svgEl.querySelectorAll('foreignObject').forEach(fo => {
    fo.querySelectorAll<HTMLElement>('*').forEach(el => {
      el.style.setProperty('background-color', '#1a1a1e', 'important')
      el.style.setProperty('color', '#e8e8ec', 'important')
      el.style.setProperty('border-color', '#3a3a42', 'important')
    })
  })

  // Fix any SVG shapes that are still light
  // Note: strip surrounding quotes Mermaid sometimes bakes into fill attributes e.g. `"hsl(...)"`
  svgEl.querySelectorAll('rect, path, polygon, circle, ellipse').forEach(el => {
    const fill = el.getAttribute('fill')
    if (!fill) return
    const c = fill.trim().replace(/^"|"$/g, '').toLowerCase()
    if (c === 'none' || c === 'transparent') return
    const rgb = parseColorSimple(c)
    if (rgb && (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) > 140) {
      el.setAttribute('fill', '#1a1a1e')
    }
  })

  // Fix dark SVG text
  svgEl.querySelectorAll('text, tspan').forEach(el => {
    const fill = el.getAttribute('fill')
    if (!fill) return
    const rgb = parseColorSimple(fill.trim().replace(/^"|"$/g, '').toLowerCase())
    if (rgb && (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) < 60) {
      el.setAttribute('fill', '#e8e8ec')
    }
  })
}

function parseColorSimple(c: string): [number, number, number] | null {
  if (c === 'white') return [255, 255, 255]
  if (c === 'black') return [0, 0, 0]
  const h6 = c.match(/^#([0-9a-f]{6})$/)
  if (h6) return [parseInt(h6[1].slice(0,2),16), parseInt(h6[1].slice(2,4),16), parseInt(h6[1].slice(4,6),16)]
  const h3 = c.match(/^#([0-9a-f]{3})$/)
  if (h3) return [parseInt(h3[1][0]+h3[1][0],16), parseInt(h3[1][1]+h3[1][1],16), parseInt(h3[1][2]+h3[1][2],16)]
  const rgb = c.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/)
  if (rgb) return [+rgb[1], +rgb[2], +rgb[3]]
  const rgba = c.match(/^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/)
  if (rgba) return [+rgba[1], +rgba[2], +rgba[3]]
  const hsl = c.match(/^hsl\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*\)$/)
  if (hsl) {
    const h = +hsl[1] / 360, s = +hsl[2] / 100, l = +hsl[3] / 100
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s
    const p = 2 * l - q
    const hue2rgb = (t: number) => {
      if (t < 0) t += 1; if (t > 1) t -= 1
      if (t < 1/6) return p + (q - p) * 6 * t
      if (t < 1/2) return q
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6
      return p
    }
    return [
      Math.round(hue2rgb(h + 1/3) * 255),
      Math.round(hue2rgb(h) * 255),
      Math.round(hue2rgb(h - 1/3) * 255),
    ]
  }
  return null
}