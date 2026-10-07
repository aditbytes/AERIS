/**
 * AERIS Data Context
 * Centralized React Context that:
 *  1. Loads all four data files on mount
 *  2. Provides shared state: time filter, selected site, error/loading status
 *  3. Acts as the single source of truth for the entire dashboard
 */

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { getActions, getAqi, getCorridor, getRankedSites, getSources } from './api'
import type { ActionsFile, AqiFile, CorridorGeoJSON, RankedSite, RankedSitesFile, SourcesFile } from '@/types/schemas'

export type TimeHorizon = 0 | 1 | 2 | 3

interface AerisState {
  // Data
  sources:      SourcesFile | null
  corridor:     CorridorGeoJSON | null
  rankedSites:  RankedSitesFile | null
  actions:      ActionsFile | null
  aqi:          AqiFile | null

  // UI State
  timeHorizon:    TimeHorizon        // selected time filter in hours
  selectedSiteId: string | null      // clicked site in Top Affected list
  showActionsModal: boolean

  // Status
  loading: boolean
  error:   string | null

  // Derived convenience
  exposedPopulation: number | null
  etaHours: number | null           // min ETA of highest-ranked source
  avgAqi: number | null             // mean AQI across live ground stations

  // Actions
  setTimeHorizon:     (h: TimeHorizon) => void
  setSelectedSiteId:  (id: string | null) => void
  setShowActionsModal:(v: boolean) => void
  refreshData:        () => void
}

const AerisContext = createContext<AerisState | null>(null)

export function AerisProvider({ children }: { children: React.ReactNode }) {
  const [sources,     setSources]     = useState<SourcesFile | null>(null)
  const [corridor,    setCorridor]    = useState<CorridorGeoJSON | null>(null)
  const [rankedSites, setRankedSites] = useState<RankedSitesFile | null>(null)
  const [actions,     setActions]     = useState<ActionsFile | null>(null)
  const [aqi,         setAqi]         = useState<AqiFile | null>(null)
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState<string | null>(null)

  const [timeHorizon,      setTimeHorizon]      = useState<TimeHorizon>(1)
  const [selectedSiteId,   setSelectedSiteId]   = useState<string | null>(null)
  const [showActionsModal, setShowActionsModal] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [s, c, r, a, q] = await Promise.all([
        getSources(),
        getCorridor(),
        getRankedSites(),
        getActions(),
        getAqi(),
      ])
      setSources(s)
      setCorridor(c)
      setRankedSites(r)
      setActions(a)
      setAqi(q)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error loading AERIS data.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  // Derived: exposed population from ranked_sites
  const exposedPopulation = rankedSites?.exposed_population.estimate ?? null

  // Derived: minimum ETA across top-3 ranked sites
  const etaHours = rankedSites
    ? Math.min(...(rankedSites.sites.slice(0, 3).map((s: RankedSite) => s.eta_hours)))
    : null

  // Derived: mean observed AQI across reporting ground stations
  const avgAqi = aqi
    ? Math.round(
        aqi.stations
          .map(s => s.aqi)
          .filter((v): v is number => typeof v === 'number' && v > 0)
          .reduce((acc, v, _, arr) => acc + v / arr.length, 0)
      )
    : null

  const value: AerisState = {
    sources, corridor, rankedSites, actions, aqi,
    timeHorizon, selectedSiteId, showActionsModal,
    loading, error,
    exposedPopulation, etaHours, avgAqi,
    setTimeHorizon, setSelectedSiteId, setShowActionsModal,
    refreshData: loadData,
  }


  return (
    <AerisContext.Provider value={value}>
      {children}
    </AerisContext.Provider>
  )
}

export function useAeris(): AerisState {
  const ctx = useContext(AerisContext)
  if (!ctx) throw new Error('useAeris must be used inside <AerisProvider>')
  return ctx
}
