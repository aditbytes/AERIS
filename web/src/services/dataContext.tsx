/**
 * AERIS Data Context
 * Centralized React Context that:
 *  1. Loads all scientific data contracts on mount
 *  2. Memoizes derived metrics (exposed population, averted exposures, etaHours, avgAqi)
 *  3. Splits timeHorizon context to prevent tree-wide re-renders
 *  4. Acts as the single source of truth for the entire dashboard
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { getActions, getAqi, getCorridor, getRankedSites, getSources, getStaleFeeds, getWind, type Freshness } from './api'
import type { ActionsFile, AqiFile, CorridorGeoJSON, RankedSite, RankedSitesFile, SourcesFile, WindFile } from '@/types/schemas'

export type TimeHorizon = 0 | 2 | 4 | 8 | 24

export type InterventionScenario = 'none' | 'partial' | 'full'
export type BasemapMode = 'satellite' | 'globe' | 'dark' | 'topo'

export interface TimeContextState {
  timeHorizon: TimeHorizon
  setTimeHorizon: React.Dispatch<React.SetStateAction<TimeHorizon>>
}

export interface AerisState extends TimeContextState {
  // Data
  sources:      SourcesFile | null
  corridor:     CorridorGeoJSON | null
  rankedSites:  RankedSitesFile | null
  actions:      ActionsFile | null
  aqi:          AqiFile | null
  wind:         WindFile | null

  // UI State
  selectedSiteId:       string | null      // clicked site in Top Affected list
  showActionsModal:     boolean
  activeTab:            string
  searchTerm:           string
  flyToLocation:        { lon: number; lat: number; zoom?: number; name?: string } | null
  interventionScenario: InterventionScenario
  basemapMode:          BasemapMode
  setBasemapMode:       (mode: BasemapMode) => void

  // Status
  loading: boolean
  error:   string | null
  staleFeeds: Freshness[]   // feeds the API flagged stale (last real result shown)

  // Derived convenience
  exposedPopulation:       number | null
  activeExposedPopulation: number | null
  avertedExposures:        number | null
  etaHours:                number | null           // min ETA of highest-ranked source
  avgAqi:                  number | null           // mean AQI across live ground stations

  // Sidebar navigation state
  isSidebarCollapsed:   boolean
  toggleSidebar:        () => void
  setSidebarCollapsed:  (collapsed: boolean) => void

  // Actions
  setSelectedSiteId:       (id: string | null) => void
  setShowActionsModal:     (v: boolean) => void
  setActiveTab:            (tab: string) => void
  setSearchTerm:           (term: string) => void
  setFlyToLocation:        (loc: { lon: number; lat: number; zoom?: number; name?: string } | null) => void
  setInterventionScenario: (s: InterventionScenario) => void
  refreshData:             () => void
}

const AerisContext = createContext<AerisState | null>(null)
const TimeHorizonContext = createContext<TimeContextState | null>(null)

export function AerisProvider({ children }: { children: React.ReactNode }) {
  const [sources,     setSources]     = useState<SourcesFile | null>(null)
  const [corridor,    setCorridor]    = useState<CorridorGeoJSON | null>(null)
  const [rankedSites, setRankedSites] = useState<RankedSitesFile | null>(null)
  const [actions,     setActions]     = useState<ActionsFile | null>(null)
  const [aqi,         setAqi]         = useState<AqiFile | null>(null)
  const [wind,        setWind]        = useState<WindFile | null>(null)
  const [loading,     setLoading]     = useState(true)
  const [staleFeeds,  setStaleFeeds]  = useState<Freshness[]>([])
  const [error,       setError]       = useState<string | null>(null)

  const [timeHorizon,          setTimeHorizon]          = useState<TimeHorizon>(2)
  const [selectedSiteId,       setSelectedSiteId]       = useState<string | null>(null)
  const [showActionsModal,     setShowActionsModal]     = useState(false)
  const [activeTab,            setActiveTab]            = useState('dashboard')
  const [searchTerm,           setSearchTerm]           = useState('')
  const [flyToLocation,        setFlyToLocation]        = useState<{ lon: number; lat: number; zoom?: number; name?: string } | null>(null)
  const [interventionScenario, setInterventionScenario] = useState<InterventionScenario>('none')

  // Production Basemap Engine Mode with localStorage persistence (default: satellite)
  const [basemapMode, setBasemapModeState] = useState<BasemapMode>(() => {
    try {
      const saved = localStorage.getItem('aeris_basemap_mode')
      if (saved === 'satellite' || saved === 'globe' || saved === 'dark' || saved === 'topo') {
        return saved
      }
    } catch {
      // Ignore
    }
    return 'satellite'
  })

  const setBasemapMode = useCallback((mode: BasemapMode) => {
    setBasemapModeState(mode)
    try {
      localStorage.setItem('aeris_basemap_mode', mode)
    } catch {
      // Ignore
    }
  }, [])

  // Sidebar collapse state with localStorage persistence
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('aeris_sidebar_collapsed')
      if (saved !== null) return saved === 'true'
    } catch {
      // Ignore
    }
    return typeof window !== 'undefined' ? window.innerWidth < 1280 : false
  })

  const setSidebarCollapsed = useCallback((val: boolean) => {
    setIsSidebarCollapsed(val)
    try {
      localStorage.setItem('aeris_sidebar_collapsed', String(val))
    } catch {
      // Ignore
    }
    setTimeout(() => {
      window.dispatchEvent(new Event('resize'))
    }, 260)
  }, [])

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed(!isSidebarCollapsed)
  }, [isSidebarCollapsed, setSidebarCollapsed])

  // Global keyboard shortcut: Cmd+B / Ctrl+B to toggle sidebar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) {
        return
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault()
        toggleSidebar()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [toggleSidebar])

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [s, c, r, a, q, w] = await Promise.all([
        getSources(),
        getCorridor(),
        getRankedSites(),
        getActions(),
        getAqi(),
        getWind().catch(() => null),
      ])
      setSources(s)
      setCorridor(c)
      setRankedSites(r)
      setActions(a)
      setAqi(q)
      setWind(w)
      setStaleFeeds(getStaleFeeds())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error loading AERIS data.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  // Derived: baseline exposed population from ranked_sites (memoized)
  const exposedPopulation = useMemo(
    () => rankedSites?.exposed_population.estimate ?? null,
    [rankedSites]
  )

  // Derived: active simulated exposed population based on scenario (memoized)
  const activeExposedPopulation = useMemo(() => {
    if (exposedPopulation == null) return null
    const raw = exposedPopulation
    return interventionScenario === 'none'
      ? raw
      : interventionScenario === 'partial'
        ? Math.round(raw * 0.65)
        : Math.round(raw * 0.45)
  }, [exposedPopulation, interventionScenario])

  const avertedExposures = useMemo(() => {
    if (exposedPopulation == null || activeExposedPopulation == null) return null
    return exposedPopulation - activeExposedPopulation
  }, [exposedPopulation, activeExposedPopulation])

  // Derived: minimum ETA across top-3 ranked sites (memoized)
  const etaHours = useMemo(() => {
    if (!rankedSites || rankedSites.sites.length === 0) return null
    return Math.min(...rankedSites.sites.slice(0, 3).map((s: RankedSite) => s.eta_hours))
  }, [rankedSites])

  // Derived: mean observed AQI across reporting ground stations (memoized)
  const avgAqi = useMemo(() => {
    if (!aqi || aqi.stations.length === 0) return null
    const valid = aqi.stations
      .map(s => s.aqi)
      .filter((v): v is number => typeof v === 'number' && v > 0)
    return valid.length > 0
      ? Math.round(valid.reduce((acc, v) => acc + v, 0) / valid.length)
      : null
  }, [aqi])

  // Dedicated Time Context Value to isolate fast timeline updates
  const timeContextValue = useMemo<TimeContextState>(() => ({
    timeHorizon,
    setTimeHorizon,
  }), [timeHorizon])

  // Main context value memoized to prevent redundant renders
  const value: AerisState = useMemo(() => ({
    sources, corridor, rankedSites, actions, aqi, wind,
    timeHorizon, selectedSiteId, showActionsModal,
    activeTab, searchTerm, flyToLocation, interventionScenario,
    basemapMode, setBasemapMode,
    loading, error, staleFeeds,
    exposedPopulation, activeExposedPopulation, avertedExposures, etaHours, avgAqi,
    isSidebarCollapsed, toggleSidebar, setSidebarCollapsed,
    setTimeHorizon, setSelectedSiteId, setShowActionsModal,
    setActiveTab, setSearchTerm, setFlyToLocation, setInterventionScenario,
    refreshData: loadData,
  }), [
    sources, corridor, rankedSites, actions, aqi, wind,
    timeHorizon, selectedSiteId, showActionsModal,
    activeTab, searchTerm, flyToLocation, interventionScenario,
    basemapMode, setBasemapMode,
    loading, error, staleFeeds,
    exposedPopulation, activeExposedPopulation, avertedExposures, etaHours, avgAqi,
    isSidebarCollapsed, toggleSidebar, setSidebarCollapsed,
    setSelectedSiteId, setShowActionsModal,
    setActiveTab, setSearchTerm, setFlyToLocation, setInterventionScenario,
    loadData,
  ])

  return (
    <TimeHorizonContext.Provider value={timeContextValue}>
      <AerisContext.Provider value={value}>
        {children}
      </AerisContext.Provider>
    </TimeHorizonContext.Provider>
  )
}

export function useAeris(): AerisState {
  const ctx = useContext(AerisContext)
  if (!ctx) throw new Error('useAeris must be used inside <AerisProvider>')
  return ctx
}

export function useTimeHorizon(): TimeContextState {
  const ctx = useContext(TimeHorizonContext)
  if (!ctx) throw new Error('useTimeHorizon must be used inside <AerisProvider>')
  return ctx
}
