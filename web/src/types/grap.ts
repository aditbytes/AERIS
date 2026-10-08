/**
 * Commission for Air Quality Management in NCR & Adjoining Areas (CAQM)
 * Revised Graded Response Action Plan (GRAP) Thresholds
 * Source: CAQM revised GRAP notification (21 Nov 2025)
 *
 * Official GRAP stages are invoked by the CAQM Sub-Committee based on
 * the daily average AQI of Delhi issued by CPCB at 4:00 PM along with
 * meteorological and air quality forecasts from IMD / IITM.
 */

export interface GrapStage {
  stage: 'Stage I' | 'Stage II' | 'Stage III' | 'Stage IV'
  name: string
  minAqi: number
  maxAqi: number
  color: string
}

export const GRAP_STAGES: GrapStage[] = [
  {
    stage: 'Stage I',
    name: 'Poor',
    minAqi: 201,
    maxAqi: 300,
    color: '#D97706', // Amber / Orange
  },
  {
    stage: 'Stage II',
    name: 'Very Poor',
    minAqi: 301,
    maxAqi: 400,
    color: '#EA580C', // Deep Orange
  },
  {
    stage: 'Stage III',
    name: 'Severe',
    minAqi: 401,
    maxAqi: 450,
    color: '#DC2626', // Red
  },
  {
    stage: 'Stage IV',
    name: 'Severe+',
    minAqi: 451,
    maxAqi: 500,
    color: '#7F1D1D', // Dark Red / Maroon
  },
]

export interface NearestGrapTrigger {
  stage: string
  name: string
  triggerAqi: number
  pointsAway: number
  statusText: string
  isExceeded: boolean
}

/**
 * Derives the nearest upcoming or active GRAP threshold relative to current AQI.
 */
export function getNearestGrapTrigger(currentAqi: number): NearestGrapTrigger {
  if (currentAqi <= 200) {
    const pointsAway = 201 - currentAqi
    return {
      stage: 'Stage I',
      name: 'Poor',
      triggerAqi: 201,
      pointsAway,
      statusText: `Nearest GRAP trigger: Stage I at AQI 201 (Poor), ${pointsAway} points away`,
      isExceeded: false,
    }
  }

  if (currentAqi <= 300) {
    const pointsAway = 301 - currentAqi
    return {
      stage: 'Stage II',
      name: 'Very Poor',
      triggerAqi: 301,
      pointsAway,
      statusText: `Nearest GRAP trigger: Stage II at AQI 301 (Very Poor), ${pointsAway} points away`,
      isExceeded: false,
    }
  }

  if (currentAqi <= 400) {
    const pointsAway = 401 - currentAqi
    return {
      stage: 'Stage III',
      name: 'Severe',
      triggerAqi: 401,
      pointsAway,
      statusText: `Nearest GRAP trigger: Stage III at AQI 401 (Severe), ${pointsAway} points away`,
      isExceeded: false,
    }
  }

  if (currentAqi <= 450) {
    const pointsAway = 451 - currentAqi
    return {
      stage: 'Stage IV',
      name: 'Severe+',
      triggerAqi: 451,
      pointsAway,
      statusText: `Nearest GRAP trigger: Stage IV at AQI >450 (Severe+), ${pointsAway} points away`,
      isExceeded: false,
    }
  }

  return {
    stage: 'Stage IV',
    name: 'Severe+',
    triggerAqi: 451,
    pointsAway: 0,
    statusText: 'GRAP Stage IV Emergency protocols active (>450 AQI)',
    isExceeded: true,
  }
}
