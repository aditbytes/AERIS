/**
 * AERIS Geospatial Production Map Styles & 3D Globe Projection Engine
 * Supports ESRI Photorealistic World Imagery Satellite, Carto Dark Matter GIS, Topographic, and 3D Globe.
 */

import type { Map } from 'maplibre-gl'
import type { BasemapMode } from '@/services/dataContext'

export const SATELLITE_STYLE: any = {
  version: 8,
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
  },
  layers: [
    {
      id: 'satellite-tiles',
      type: 'raster',
      source: 'esri-satellite',
      minzoom: 0,
      maxzoom: 19,
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
 * Configure MapLibre projection (3D Globe vs Mercator) and camera pitch
 */
export function applyProjectionAndPitch(map: Map, mode: BasemapMode) {
  try {
    if (mode === 'globe') {
      // MapLibre v5+ Globe projection
      if (typeof (map as any).setProjection === 'function') {
        ;(map as any).setProjection({ type: 'globe' })
      }
      map.easeTo({
        pitch: 42,
        bearing: -8,
        duration: 900,
      })
    } else {
      if (typeof (map as any).setProjection === 'function') {
        ;(map as any).setProjection({ type: 'mercator' })
      }
      map.easeTo({
        pitch: 0,
        bearing: 0,
        duration: 600,
      })
    }
  } catch (err) {
    console.warn('[AERIS MapStyles] Projection switch note:', err)
  }
}

/**
 * Re-attach official Survey of India boundary layers & Smoke plume corridor.
 * Ensures sovereign territory lines (J&K, Ladakh, PoK) and dispersion corridors remain perfectly rendered.
 */
export function setupMapLayers(map: Map, mode: BasemapMode) {
  const isDarkOrSat = mode === 'satellite' || mode === 'globe' || mode === 'dark'

  // 1. Official Survey of India boundary layer
  if (!map.getSource('india-boundary')) {
    map.addSource('india-boundary', {
      type: 'geojson',
      data: './data/india-boundary.geojson',
    })
  }

  // Outer border halo
  if (!map.getLayer('india-border-halo')) {
    map.addLayer({
      id: 'india-border-halo',
      type: 'line',
      source: 'india-boundary',
      paint: {
        'line-color': isDarkOrSat ? '#10B981' : '#22734F',
        'line-width': isDarkOrSat ? 5.5 : 4.5,
        'line-opacity': isDarkOrSat ? 0.45 : 0.35,
      },
    })
  }

  // Solid official border line
  if (!map.getLayer('india-border-line')) {
    map.addLayer({
      id: 'india-border-line',
      type: 'line',
      source: 'india-boundary',
      paint: {
        'line-color': isDarkOrSat ? '#34D399' : '#164E35',
        'line-width': isDarkOrSat ? 2.8 : 2.4,
        'line-opacity': 0.98,
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

  // Plume fill layer
  if (!map.getLayer('plume-fill')) {
    map.addLayer({
      id: 'plume-fill',
      type: 'fill',
      source: 'corridor',
      filter: ['==', ['get', 'kind'], 'band'],
      paint: {
        'fill-color': [
          'interpolate', ['linear'], ['get', 'hour_from'],
          0, isDarkOrSat ? 'rgba(239, 68, 68, 0.82)' : 'rgba(201, 42, 42, 0.68)',
          2, isDarkOrSat ? 'rgba(249, 115, 22, 0.70)' : 'rgba(212, 98, 10, 0.58)',
          4, isDarkOrSat ? 'rgba(245, 158, 11, 0.52)' : 'rgba(245, 159, 0, 0.42)',
          8, isDarkOrSat ? 'rgba(234, 179, 8, 0.35)'  : 'rgba(245, 215, 0, 0.28)',
        ],
        'fill-opacity': isDarkOrSat ? 0.92 : 0.85,
      },
    })
  }

  // Plume boundary outline
  if (!map.getLayer('plume-line')) {
    map.addLayer({
      id: 'plume-line',
      type: 'line',
      source: 'corridor',
      filter: ['==', ['get', 'kind'], 'band'],
      paint: {
        'line-color': isDarkOrSat ? 'rgba(254, 202, 202, 0.7)' : 'rgba(180, 40, 40, 0.5)',
        'line-width': 1.2,
        'line-opacity': 0.8,
      },
    })
  }

  // Plume centerline (dispersion trajectory trajectory vector)
  if (!map.getLayer('plume-centerline')) {
    map.addLayer({
      id: 'plume-centerline',
      type: 'line',
      source: 'corridor',
      filter: ['==', ['get', 'kind'], 'centerline'],
      paint: {
        'line-color': '#FFFFFF',
        'line-width': 2.4,
        'line-dasharray': [4, 2],
        'line-opacity': 0.95,
      },
    })
  }
}

