import type { Source } from '../../types/schemas'

export function getThermalSeverity(frp: number): 'severe' | 'high' | 'moderate' {
  if (frp >= 200) return 'severe'
  if (frp >= 50) return 'high'
  return 'moderate'
}

export function createThermalMarkerElement(
  src: Source,
  options?: {
    onClick?: (e: MouseEvent) => void
    isSelected?: boolean
  }
): HTMLElement {
  const isTransboundary = src.territory === 'transboundary'
  const severity = getThermalSeverity(src.total_frp_mw)

  const sizeMap = {
    severe: { width: 36, height: 36, iconSize: 22 },
    high: { width: 30, height: 30, iconSize: 18 },
    moderate: { width: 24, height: 24, iconSize: 15 },
  }
  const dims = sizeMap[severity]

  const el = document.createElement('div')
  el.className = `thermal-fire-marker severity-${severity} ${isTransboundary ? 'is-transboundary' : 'is-india'} ${options?.isSelected ? 'is-selected' : ''}`
  el.dataset.sourceId = src.id
  el.dataset.territory = src.territory || 'india'

  const gradId = `therm-grad-${src.id}`
  const glowId = `therm-glow-${src.id}`

  const ringCount = severity === 'severe' ? 3 : severity === 'high' ? 2 : 1
  let ringsHtml = ''
  for (let i = 1; i <= ringCount; i++) {
    ringsHtml += `<div class="thermal-radiant-halo ring-${i}"></div>`
  }

  const frpFormatted = src.total_frp_mw.toFixed(0)
  const territoryIndicator = isTransboundary ? '🌐' : '🇮🇳'

  el.innerHTML = `
    <div class="thermal-anchor" style="width: ${dims.width}px; height: ${dims.height}px;">
      ${ringsHtml}
      <div class="thermal-core">
        <svg viewBox="0 0 24 24" class="thermal-svg" width="${dims.iconSize}" height="${dims.iconSize}" fill="none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <radialGradient id="${gradId}" cx="50%" cy="80%" r="75%">
              <stop offset="0%" stop-color="#FFFFFF" />
              <stop offset="25%" stop-color="#FDE047" />
              <stop offset="60%" stop-color="#EA580C" />
              <stop offset="100%" stop-color="#B91C1C" />
            </radialGradient>
            <filter id="${glowId}" x="-25%" y="-25%" width="150%" height="150%">
              <feDropShadow dx="0" dy="1" stdDeviation="1.5" flood-color="#DC2626" flood-opacity="0.65"/>
            </filter>
          </defs>
          <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" fill="url(#${gradId})" filter="url(#${glowId})" />
          <path d="M12 14c-.6 0-1 .4-1 1 0 1.1.9 2 2 2s2-.9 2-2c0-.6-.4-1-1-1s-1 .4-1 1" fill="#FEF08A" opacity="0.9" />
        </svg>
      </div>
    </div>
    <div class="thermal-frp-pill ${isTransboundary ? 'pill-transboundary' : 'pill-india'}">
      <span class="pill-flag">${territoryIndicator}</span>
      <span class="pill-mw">${frpFormatted} MW</span>
    </div>
  `

  if (options?.onClick) {
    el.addEventListener('click', (e) => {
      e.stopPropagation()
      options.onClick!(e)
    })
  }

  return el
}

export function createThermalPopupHtml(src: Source): string {
  const isTransboundary = src.territory === 'transboundary'
  const territoryBadge = isTransboundary
    ? `<span class="t-badge transboundary">🌐 Transboundary Airshed (Pakistan)</span>`
    : `<span class="t-badge india">🇮🇳 Domestic Stubble (India)</span>`

  const district = src.district || 'Unassigned District'
  const locationName = src.location_name || `${district}, ${src.state || 'Punjab'}`
  const airshedRole = src.airshed_role || 'Upwind agricultural biomass thermal emission affecting NCR airshed.'

  return `
    <div class="aeris-thermal-popup-card">
      <div class="popup-head">
        <div class="popup-badge-row">
          ${territoryBadge}
          <span class="popup-id">${src.id}</span>
        </div>
        <div class="popup-title">${district}</div>
        <div class="popup-sub">${locationName}</div>
      </div>
      <div class="popup-grid">
        <div class="popup-stat">
          <span class="stat-lbl">Fire Radiative Power</span>
          <span class="stat-val highlight">${src.total_frp_mw.toFixed(1)} MW</span>
        </div>
        <div class="popup-stat">
          <span class="stat-lbl">Hotspot Detections</span>
          <span class="stat-val">${src.fire_count} VIIRS fires</span>
        </div>
        <div class="popup-stat">
          <span class="stat-lbl">Detection Confidence</span>
          <span class="stat-val">${(src.confidence * 100).toFixed(0)}% (NOAA-21)</span>
        </div>
        <div class="popup-stat">
          <span class="stat-lbl">Corridor Plume Flux</span>
          <span class="stat-val">${(src.emission_strength * 100).toFixed(0)}% Intensity</span>
        </div>
      </div>
      <div class="popup-airshed-box">
        <div class="airshed-header">
          <span class="airshed-ico">💨</span>
          <span class="airshed-lbl">Airshed & Plume Trajectory</span>
        </div>
        <p class="airshed-desc">${airshedRole}</p>
      </div>
    </div>
  `
}
