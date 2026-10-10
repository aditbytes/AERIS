/**
 * Existing Esri satellite and CARTO basemaps with a Mercator camera.
 * The persisted 'globe' preference selects a tilted satellite view.
 */

import type { Map } from 'maplibre-gl'
import type { BasemapMode } from '@/services/dataContext'

export const SATELLITE_STYLE: any = {
  version: 8,
  glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
  sources: {
    'esri-satellite': {
      type: 'raster',
      tiles: [
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      ],
      tileSize: 256,
      maxzoom: 19,
      attribution: 'Esri, Maxar, Earthstar Geographics',
    },
    'esri-reference': {
      type: 'raster',
      tiles: [
        'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
      ],
      tileSize: 256,
      maxzoom: 19,
      attribution: 'Esri, OpenStreetMap',
    },
  },
  layers: [
    {
      id: 'satellite-tiles',
      type: 'raster',
      source: 'esri-satellite',
      minzoom: 0,
      maxzoom: 19,
    },
    {
      id: 'satellite-reference-labels',
      type: 'raster',
      source: 'esri-reference',
      minzoom: 0,
      maxzoom: 19,
      paint: {
        'raster-opacity': 0.60,
      },
    },
  ],
}

export const DARK_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'
export const TOPO_STYLE = 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json'

export function getStyleForMode(mode: BasemapMode): any {
  if (mode === 'satellite' || mode === 'globe') return SATELLITE_STYLE
  if (mode === 'dark') return DARK_STYLE
  return TOPO_STYLE
}

/**
 * Validates that coordinates fall squarely within the Indian subcontinent airshed.
 * Prevents invalid, null, or out-of-bounds coordinates (like 0,0) from marking in the ocean.
 */
export function isValidSubcontinentCoord(lat: number, lon: number): boolean {
  return (
    typeof lat === 'number' &&
    typeof lon === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    lat >= 6.0 &&
    lat <= 38.0 &&
    lon >= 65.0 &&
    lon <= 98.0
  )
}

/**
 * Configure Map camera pitch and bearing.
 * Uses Mercator projection consistently to guarantee DOM markers remain 100% geographically pinned
 * to their exact coordinates without spherical distortion drifting into the ocean.
 */
export function applyProjectionAndPitch(map: Map, mode: BasemapMode) {
  try {
    if (typeof (map as any).setProjection === 'function') {
      ;(map as any).setProjection({ type: 'mercator' })
    }
    if (mode === 'globe') {
      // Tactical 2.5D perspective
      map.easeTo({
        pitch: 32,
        bearing: -6,
        duration: 700,
      })
    } else {
      map.easeTo({
        pitch: 0,
        bearing: 0,
        duration: 500,
      })
    }
  } catch (err) {
    console.warn('[AERIS MapStyles] Projection note:', err)
  }
}

/**
 * Re-attach the repository's captured boundary and model corridor layers.
 * File presence does not establish authoritative boundary provenance.
 */
export function setupMapLayers(map: Map, mode: BasemapMode) {
  const isDarkOrSat = mode === 'satellite' || mode === 'globe' || mode === 'dark'

  // 1. Repository boundary overlay
  if (!map.getSource('india-boundary')) {
    map.addSource('india-boundary', {
      type: 'geojson',
      data: './data/india-boundary.geojson',
    })
  }

  // Outer border halo - elegant cartographic styling
  if (!map.getLayer('india-border-halo')) {
    map.addLayer({
      id: 'india-border-halo',
      type: 'line',
      source: 'india-boundary',
      paint: {
        'line-color': isDarkOrSat ? '#94A3B8' : '#64748B',
        'line-width': 3.0,
        'line-opacity': isDarkOrSat ? 0.20 : 0.15,
      },
    })
  }

  // Solid boundary line - understated reference border
  if (!map.getLayer('india-border-line')) {
    map.addLayer({
      id: 'india-border-line',
      type: 'line',
      source: 'india-boundary',
      paint: {
        'line-color': isDarkOrSat ? '#CBD5E1' : '#475569',
        'line-width': 1.2,
        'line-opacity': 0.65,
      },
    })
  }

  // 2. Corridor polygon source
  if (!map.getSource('corridor')) {
    map.addSource('corridor', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    })
  }

  // Plume fill layer with natural atmospheric diffusion opacity decay downwind
  if (!map.getLayer('plume-fill')) {
    map.addLayer({
      id: 'plume-fill',
      type: 'fill',
      source: 'corridor',
      filter: ['==', ['get', 'kind'], 'band'],
      paint: {
        'fill-color': [
          'match',
          ['get', 'hour_from'],
          0, '#DC2626',
          2, '#EA580C',
          4, '#D97706',
          8, '#CA8A04',
          '#DC2626',
        ],
        'fill-opacity': [
          'match',
          ['get', 'hour_from'],
          0, isDarkOrSat ? 0.52 : 0.44,
          2, isDarkOrSat ? 0.36 : 0.30,
          4, isDarkOrSat ? 0.24 : 0.20,
          8, isDarkOrSat ? 0.15 : 0.12,
          isDarkOrSat ? 0.32 : 0.25,
        ],
      },
    })
  }

  // Plume boundary outline - soft atmospheric envelope rather than harsh rubber bands
  if (!map.getLayer('plume-line')) {
    map.addLayer({
      id: 'plume-line',
      type: 'line',
      source: 'corridor',
      filter: ['==', ['get', 'kind'], 'band'],
      paint: {
        'line-color': isDarkOrSat ? 'rgba(255, 255, 255, 0.30)' : 'rgba(185, 28, 28, 0.35)',
        'line-width': 0.8,
        'line-opacity': 0.45,
      },
    })
  }

  // Plume centerline (dispersion trajectory vector) - sleek glowing airflow vector
  if (!map.getLayer('plume-centerline')) {
    map.addLayer({
      id: 'plume-centerline',
      type: 'line',
      source: 'corridor',
      filter: ['==', ['get', 'kind'], 'centerline'],
      paint: {
        'line-color': '#FFFFFF',
        'line-width': 1.6,
        'line-dasharray': [5, 3],
        'line-opacity': 0.75,
      },
    })
  }

  // Centerline ETA milestone ticks source & layer
  if (!map.getSource('corridor-eta')) {
    map.addSource('corridor-eta', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    })
  }

  // Waypoint pips along the dispersion corridor
  if (!map.getLayer('corridor-eta-circles')) {
    map.addLayer({
      id: 'corridor-eta-circles',
      type: 'circle',
      source: 'corridor-eta',
      paint: {
        'circle-radius': 2.8,
        'circle-color': '#38BDF8',
        'circle-stroke-width': 1.2,
        'circle-stroke-color': '#0F172A',
        'circle-opacity': 0.9,
      },
    })
  }

  // Collision-free ETA waypoint labels (+2h, +4h, etc. instead of cluttered raw IDs)
  if (!map.getLayer('corridor-eta-labels')) {
    map.addLayer({
      id: 'corridor-eta-labels',
      type: 'symbol',
      source: 'corridor-eta',
      layout: {
        'text-field': ['concat', '+', ['to-string', ['get', 'eta']], 'h'],
        'text-font': ['Open Sans Semibold'],
        'text-size': 9,
        'text-offset': [0, 1.1],
        'text-anchor': 'top',
        'text-allow-overlap': false,
        'text-ignore-placement': false,
        'text-padding': 8,
      },
      paint: {
        'text-color': '#F8FAFC',
        'text-halo-color': '#0F172A',
        'text-halo-width': 1.8,
      },
    })
  }
}

