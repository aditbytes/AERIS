import { describe, expect, it, vi } from 'vitest'
import { createThermalMarkerElement, createThermalPopupHtml } from './thermalMarker'
import type { Source } from '../../types/schemas'

const source: Source = { id: 'test-only', type: 'unconfirmed', lat: 30, lon: 75, fire_count: 1, total_frp_mw: 0, radius_km: 1, first_seen: '2026-10-09T00:00:00Z', last_seen: '2026-10-09T01:00:00Z', confidence: 0, emission_strength: 0 }
describe('safe and honest source markers', () => {
  it('renders API strings as inert text, including malicious IDs and SVG attributes', () => {
    const unsafe = { ...source, id: '"><img src=x onerror=alert(1)>', district: '<script>alert(1)</script>', location_name: '<img src=x>', airshed_role: '<svg onload=alert(1)>' }
    const element = createThermalMarkerElement(unsafe)
    expect(element.querySelector('img')).toBeNull()
    expect(element.querySelector('radialGradient')!.id).toMatch(/^reticle-grad-\d+$/)
    const popup = document.createElement('div')
    popup.innerHTML = createThermalPopupHtml(unsafe)
    expect(popup.querySelector('img, script, svg')).toBeNull()
    expect(popup.textContent).toContain(unsafe.district)
    expect(popup.textContent).toContain(unsafe.id)
  })
  it('provides keyboard activation and avoids invented country, sensor, flux, or location claims', () => {
    const onClick = vi.fn()
    const marker = createThermalMarkerElement(source, { onClick })
    marker.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    expect(onClick).toHaveBeenCalledTimes(1)
    expect(marker.tabIndex).toBe(0)
    const html = createThermalPopupHtml(source)
    expect(html).toContain('uncalibrated')
    expect(html).not.toContain('NOAA-21')
    expect(html).not.toContain('Punjab')
    expect(html).not.toContain('Plume Emission Flux')
  })
})
