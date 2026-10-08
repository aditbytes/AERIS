/**
 * AERIS Precision Geospatial Thermal Sensor Reticle Engine
 * Replaces cartoon icons with NASA/Aerospace-grade infrared optical sensor reticles,
 * calibrated crosshairs, radar sonar pings, and monospace military telemetry readouts.
 */

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
    isPeak?: boolean
  }
): HTMLElement {
  const isTransboundary = src.territory === 'transboundary'
  const severity = getThermalSeverity(src.total_frp_mw)
  const isPeak = !!options?.isPeak

  // Calibrated optic dimensions
  const sizeMap = {
    severe: { width: 40, height: 40, opticSize: 26 },
    high: { width: 34, height: 34, opticSize: 22 },
    moderate: { width: 28, height: 28, opticSize: 18 },
  }
  const dims = sizeMap[severity]

  const el = document.createElement('div')
  el.className = `aeris-sensor-reticle severity-${severity} ${isTransboundary ? 'is-transboundary' : 'is-india'} ${options?.isSelected ? 'is-selected' : ''} ${isPeak ? 'is-peak-cluster' : ''}`
  el.dataset.sourceId = src.id
  el.dataset.territory = src.territory || 'india'

  const gradId = `reticle-grad-${src.id}`
  const strokeColor = isTransboundary ? '#F59E0B' : '#EF4444'
  const coreFill = isTransboundary ? '#FDE047' : '#FF453A'

  const ringCount = severity === 'severe' ? 3 : severity === 'high' ? 2 : 1
  let sonarRingsHtml = ''
  for (let i = 1; i <= ringCount; i++) {
    sonarRingsHtml += `<div class="sensor-sonar-ring ring-${i}"></div>`
  }

  const frpFormatted = src.total_frp_mw.toFixed(0)
  const territoryCode = isTransboundary ? '🌐 PK' : '🇮🇳 IN'

  el.innerHTML = `
    <div class="reticle-anchor" style="width: ${dims.width}px; height: ${dims.height}px;">
      ${sonarRingsHtml}
      <div class="reticle-core-optic">
        <svg viewBox="0 0 24 24" class="reticle-svg" width="${dims.opticSize}" height="${dims.opticSize}" fill="none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <radialGradient id="${gradId}" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stop-color="#FFFFFF" />
              <stop offset="35%" stop-color="${coreFill}" />
              <stop offset="75%" stop-color="${strokeColor}" stop-opacity="0.8" />
              <stop offset="100%" stop-color="${strokeColor}" stop-opacity="0.2" />
            </radialGradient>
          </defs>

          <!-- Outer Calibrated Optic Ring with Cardinal Crosshair Ticks -->
          <circle cx="12" cy="12" r="10.5" stroke="${strokeColor}" stroke-width="1.2" stroke-opacity="0.85" stroke-dasharray="${isTransboundary ? '3 2' : 'none'}" />
          <line x1="12" y1="0.5" x2="12" y2="3.5" stroke="${strokeColor}" stroke-width="1.5" />
          <line x1="12" y1="20.5" x2="12" y2="23.5" stroke="${strokeColor}" stroke-width="1.5" />
          <line x1="0.5" y1="12" x2="3.5" y2="12" stroke="${strokeColor}" stroke-width="1.5" />
          <line x1="20.5" y1="12" x2="23.5" y2="12" stroke="${strokeColor}" stroke-width="1.5" />

          <!-- Inner Precision Target Reticle -->
          <circle cx="12" cy="12" r="6.5" stroke="${strokeColor}" stroke-width="0.9" stroke-opacity="0.6" />

          <!-- Concentrated Thermal Infrared Plasma Core -->
          <circle cx="12" cy="12" r="4" fill="url(#${gradId})" />
          <circle cx="12" cy="12" r="1.8" fill="#FFFFFF" />
        </svg>
      </div>
    </div>
    <div class="reticle-telemetry-hud ${isTransboundary ? 'hud-transboundary' : 'hud-india'}">
      ${isPeak ? '<span class="hud-peak-tag">⚡ PEAK</span>' : ''}
      <span class="hud-territory-tag">${territoryCode}</span>
      <span class="hud-mw-val">${frpFormatted} MW</span>
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
    ? `<span class="t-badge transboundary">🌐 Transboundary Regional Influx</span>`
    : `<span class="t-badge india">🇮🇳 Domestic Actionable Hotspot</span>`

  const district = src.district || 'Unassigned Sector'
  const locationName = src.location_name || `${district}, ${src.state || 'Punjab'}`
  const airshedRole = src.airshed_role || 'Upwind thermal emission advecting downwind into Delhi NCR airshed.'

  return `
    <div class="aeris-sensor-popup-card">
      <div class="sensor-popup-head">
        <div class="sensor-meta-row">
          <span class="sensor-id-mono">VIIRS // ${src.id}</span>
          ${territoryBadge}
        </div>
        <div class="sensor-district-title">${district}</div>
        <div class="sensor-coords-sub">${src.lat.toFixed(4)}°N, ${src.lon.toFixed(4)}°E • ${locationName}</div>
      </div>

      <div class="sensor-telemetry-grid">
        <div class="telemetry-block">
          <span class="block-lbl">Fire Radiative Power</span>
          <span class="block-val highlight">${src.total_frp_mw.toFixed(1)} MW</span>
        </div>
        <div class="telemetry-block">
          <span class="block-lbl">Hotspots Count</span>
          <span class="block-val">${src.fire_count} VIIRS Pixels</span>
        </div>
        <div class="telemetry-block">
          <span class="block-lbl">Sensor Confidence</span>
          <span class="block-val">${(src.confidence * 100).toFixed(0)}% (NOAA-21)</span>
        </div>
        <div class="telemetry-block">
          <span class="block-lbl">Plume Emission Flux</span>
          <span class="block-val">${(src.emission_strength * 100).toFixed(0)}% Intensity</span>
        </div>
      </div>

      <div class="sensor-airshed-intel">
        <div class="intel-header">
          <span class="intel-dot"></span>
          <span class="intel-title">Atmospheric Airshed Impact</span>
        </div>
        <p class="intel-body">${airshedRole}</p>
      </div>
    </div>
  `
}
