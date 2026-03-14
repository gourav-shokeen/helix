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
    },
  }
}

export function fixSvgColors(svgEl: SVGElement) {
  const isLight = document.documentElement.dataset.theme === 'light'
  const textColor   = isLight ? '#111111' : '#e8e8ec'
  const mutedColor  = isLight ? '#333344' : '#9090a8'
  const taskText    = isLight ? '#ffffff'  : '#001a13'
  const outsideText = isLight ? '#111111'  : '#e8e8ec'

  svgEl.removeAttribute('width')
  svgEl.removeAttribute('height')
  svgEl.style.width = '100%'
  svgEl.style.minWidth = '800px'
  svgEl.style.height = 'auto'
  svgEl.style.display = 'block'

  svgEl.querySelector('style[data-helix]')?.remove()

  const styleEl = document.createElementNS('http://www.w3.org/2000/svg', 'style')
  styleEl.setAttribute('data-helix', 'true')
  styleEl.textContent = `
    text, tspan { fill: ${textColor} !important; }
    .titleText { fill: ${textColor} !important; font-weight: 600 !important; }
    .sectionTitle, .sectionLabel { fill: ${mutedColor} !important; }
    .tick text, .axis text { fill: ${mutedColor} !important; }
    .taskText { fill: ${taskText} !important; font-size: 12px !important; }
    .taskTextOutsideRight, .taskTextOutsideLeft { fill: ${outsideText} !important; font-size: 12px !important; }
    .label, .nodeLabel, .edgeLabel { fill: ${textColor} !important; color: ${textColor} !important; }
  `
  svgEl.insertBefore(styleEl, svgEl.firstChild)
}
