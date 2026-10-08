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
    !isNaN(lat) &&
    !isNaN(lon) &&
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

  // Plume fill layer with clear discrete color ramp for 0-2h, 2-4h, 4-8h, 8-24h bands
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
        'fill-opacity': isDarkOrSat ? 0.72 : 0.62,
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
        'line-color': isDarkOrSat ? 'rgba(254, 226, 226, 0.75)' : '#991B1B',
        'line-width': 1.2,
        'line-opacity': 0.8,
      },
    })
  }

  // Plume centerline (dispersion trajectory vector)
  if (!map.getLayer('plume-centerline')) {
    map.addLayer({
      id: 'plume-centerline',
      type: 'line',
      source: 'corridor',
      filter: ['==', ['get', 'kind'], 'centerline'],
      paint: {
        'line-color': '#FFFFFF',
        'line-width': 2.2,
        'line-dasharray': [4, 2],
        'line-opacity': 0.95,
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

  if (!map.getLayer('corridor-eta-circles')) {
    map.addLayer({
      id: 'corridor-eta-circles',
      type: 'circle',
      source: 'corridor-eta',
      paint: {
        'circle-radius': 3.5,
        'circle-color': '#FFFFFF',
        'circle-stroke-width': 1.5,
        'circle-stroke-color': '#0F172A',
      },
    })
  }

  if (!map.getLayer('corridor-eta-labels')) {
    map.addLayer({
      id: 'corridor-eta-labels',
      type: 'symbol',
      source: 'corridor-eta',
      layout: {
        'text-field': ['get', 'label'],
        'text-size': 9.5,
        'text-offset': [0, 1.2],
        'text-anchor': 'top',
        'text-allow-overlap': true,
      },
      paint: {
        'text-color': '#FFFFFF',
        'text-halo-color': '#0F172A',
        'text-halo-width': 2,
      },
    })
  }
}

